"""HWPX 렌더러 — 한컴 공문 표준 포맷.

우선순위:
1. python-hwpx 2.x (HwpxDocument.new) — 직접 HWPX 빌드. 가장 깔끔.
2. LibreOffice headless로 DOCX → HWPX 변환. python-hwpx 실패 시.
3. 텍스트 폴백 (.hwpx 확장자에 평문/마크다운 저장) — 최후 수단.

옵션 3은 한컴 한글에서 열 수는 있으나 양식 정보가 손실됨. 운영에서는 1·2가 동작해야 함.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from app.core.logging import get_logger
from app.pipeline.ir import BlockType, CoverData, DocumentIR, InlineRun, ListItem
from app.renderers.base import Renderer
from app.renderers.docx_renderer import DocxRenderer
from app.services.organization_profile import OrganizationProfile, profile_for_document
from app.services.visuals import (
    materialize_image,
    render_chart_to_png,
    render_diagram_to_png,
    render_equation_to_png,
)
from app.services.visuals.cache import resolve_image_to_path

log = get_logger(__name__)


def _runs_text(runs: list[InlineRun]) -> str:
    return "".join(r.text for r in runs)


def _list_prefix(li: ListItem) -> str:
    if li.ordered:
        return f"{li.index}{li.order_format.replace('1.', '.')} "
    return f"{li.bullet_marker} "


def _try_python_hwpx(ir: DocumentIR, out: Path, profile: OrganizationProfile | None = None) -> bool:
    """python-hwpx 2.x로 직접 HWPX 생성. 미설치/실패 시 False.

    한컴 시각 디자인 강화:
    - 헤딩 레벨별 styleIDRef 매핑 ("개요 1"~"개요 6")
    - 표 너비 페이지 폭 (A4 25mm 여백 = 약 16,000 HWPUNIT)
    - 표 헤더 행은 bold + 배경 (가능 시)
    - bold/italic은 ensure_run_style로 char style 확보
    - 조직 프로파일(profile) 이 있으면 브랜드 컬러·헤더/푸터 텍스트 반영
    """
    try:
        import hwpx  # type: ignore[import-not-found]
    except ImportError:
        return False

    try:
        doc = hwpx.HwpxDocument.new()

        # ── 기본 bold·italic char style ──
        try:
            bold_id = doc.ensure_run_style(bold=True)
        except Exception:
            bold_id = None
        try:
            italic_id = doc.ensure_run_style(italic=True)
        except Exception:
            italic_id = None
        try:
            bold_italic_id = doc.ensure_run_style(bold=True, italic=True)
        except Exception:
            bold_italic_id = bold_id

        # ── 헤딩 레벨별 큰 폰트 char style (header.ensure_char_property 직접 활용) ──
        # height 단위: 100=1pt. 기본 본문은 1000=10pt.
        HH_NS = "{http://www.hancom.co.kr/hwpml/2011/head}"
        # 조직 프로파일이 폰트 크기를 지정하면 그대로 사용 (pt → height: pt × 100)
        h1_h = int((profile.h1_font_size_pt if profile else 20) * 100)
        h2_h = int((profile.h2_font_size_pt if profile else 16) * 100)
        h3_h = int((profile.h3_font_size_pt if profile else 14) * 100)
        HEADING_HEIGHTS = {1: h1_h, 2: h2_h, 3: h3_h, 4: 1300, 5: 1200, 6: 1100}
        TITLE_HEIGHT = max(h1_h + 200, 2200)

        # 브랜드 색상 — 조직 프로파일 우선, 없으면 DocuAX 기본 네이비
        BRAND_NAVY = (profile.brand_color_hex if profile else "#1E2761")
        BRAND_ACCENT = (profile.accent_color_hex if profile else "#1F5BAF")
        TABLE_HEADER_BG = (profile.table_header_bg_hex if profile else "#F2F2F2")

        def _make_heading_char_pr(height: int, color: str = BRAND_NAVY) -> str | None:
            """header에 새 charPr XML 추가 — height·color·bold 모두 적용. ID 반환."""
            try:
                from lxml import etree
                header = doc.headers[0]
                def modifier(el):
                    el.set("height", str(height))
                    el.set("textColor", color)
                    if el.find(f"{HH_NS}bold") is None:
                        etree.SubElement(el, f"{HH_NS}bold")
                def predicate(el):
                    return (el.get("height") == str(height)
                            and el.get("textColor") == color
                            and el.find(f"{HH_NS}bold") is not None)
                el_new = header.ensure_char_property(
                    base_char_pr_id="0", modifier=modifier, predicate=predicate
                )
                return el_new.get("id")
            except Exception as e:
                log.warning("ensure_char_property 실패", height=height, error=str(e))
                return None

        heading_char_ids: dict[int, str | None] = {}
        for lvl, h in HEADING_HEIGHTS.items():
            color = BRAND_NAVY if lvl <= 2 else BRAND_ACCENT
            heading_char_ids[lvl] = _make_heading_char_pr(h, color) or bold_id
        title_char_id = _make_heading_char_pr(TITLE_HEIGHT, BRAND_NAVY) or bold_id

        # ── 표 헤더 회색 배경 borderFill ──
        def _make_header_border_fill() -> str | None:
            """header에 회색 배경 borderFill 추가. ID 반환. 이미 있으면 재사용."""
            try:
                from lxml import etree
                header = doc.headers[0]
                bfs = header.element.find(".//{%s}borderFills" % HH_NS[1:-1])
                if bfs is None:
                    return None
                # 이미 같은 배경이 있는지 검사
                for bf in bfs.findall(f"{HH_NS}borderFill"):
                    fb = bf.find(f"{HH_NS}fillBrush/{HH_NS}winBrush")
                    if fb is not None and fb.get("faceColor", "").upper() == TABLE_HEADER_BG.upper():
                        return bf.get("id")
                # 신규 ID — 기존 중 max+1
                ids = [int(bf.get("id", "0")) for bf in bfs.findall(f"{HH_NS}borderFill")]
                new_id = str((max(ids) if ids else 1) + 1)
                # 회색 배경 borderFill 생성
                bf_new = etree.SubElement(bfs, f"{HH_NS}borderFill")
                bf_new.set("id", new_id)
                bf_new.set("threeD", "0")
                bf_new.set("shadow", "0")
                bf_new.set("centerLine", "NONE")
                bf_new.set("breakCellSeparateLine", "0")
                etree.SubElement(bf_new, f"{HH_NS}slash", type="NONE", Crooked="0", isCounter="0")
                etree.SubElement(bf_new, f"{HH_NS}backSlash", type="NONE", Crooked="0", isCounter="0")
                for edge in ("leftBorder", "rightBorder", "topBorder", "bottomBorder"):
                    etree.SubElement(bf_new, f"{HH_NS}{edge}",
                                     type="SOLID", width="0.12mm", color="#666666")
                etree.SubElement(bf_new, f"{HH_NS}diagonal",
                                 type="SLASH", width="0.12mm", color="#666666")
                fb_el = etree.SubElement(bf_new, f"{HH_NS}fillBrush")
                etree.SubElement(fb_el, f"{HH_NS}winBrush",
                                 faceColor=TABLE_HEADER_BG, hatchColor="#000000",
                                 hatchStyle="NONE", alpha="0")
                # bfs의 attribute itemCnt가 있으면 갱신
                if bfs.get("itemCnt") is not None:
                    bfs.set("itemCnt", str(len(bfs)))
                return new_id
            except Exception as e:
                log.warning("borderFill 생성 실패", error=str(e))
                return None

        header_bg_id = _make_header_border_fill()

        # 헤딩 레벨 → styleIDRef 매핑 (한컴 기본 "개요 1~6")
        HEADING_STYLE_IDS = {1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6"}

        def add_styled(text: str, *, bold: bool = False, italic: bool = False,
                       style_id: str | None = None, char_id: str | None = None, **kw):
            """텍스트 단락 추가 — bold/italic char style + 선택적 style·char id."""
            if char_id is None:
                if bold and italic:
                    char_id = bold_italic_id
                elif bold:
                    char_id = bold_id
                elif italic:
                    char_id = italic_id
            if char_id is not None:
                kw["char_pr_id_ref"] = char_id
            if style_id is not None:
                kw["style_id_ref"] = style_id
            return doc.add_paragraph(text, **kw)

        def add_cell_text(tcell, text: str, *, bold: bool = False):
            char_id = bold_id if (bold and bold_id is not None) else None
            try:
                if hasattr(tcell, "add_paragraph"):
                    if char_id is not None:
                        try:
                            tcell.add_paragraph(text, char_pr_id_ref=char_id)
                            return
                        except TypeError:
                            pass
                    tcell.add_paragraph(text)
                elif hasattr(tcell, "set_text"):
                    tcell.set_text(text)
            except Exception:
                pass

        # ── 페이지 헤더/푸터 (HWPX 표준 — 매 페이지 상하단 표시) ──
        # set_header_text/set_footer_text 가 정식 API. 조직 프로파일 우선.
        if profile and profile.header_text:
            try:
                doc.set_header_text(profile.header_text, page_type="BOTH")
            except Exception as e:  # noqa: BLE001
                log.warning("HWPX header_text 실패, 본문 상단으로 폴백", error=str(e))
                try:
                    doc.add_paragraph(profile.header_text)
                except Exception:
                    pass
        if profile and profile.footer_text:
            try:
                doc.set_footer_text(profile.footer_text, page_type="BOTH")
            except Exception as e:  # noqa: BLE001
                log.warning("HWPX footer_text 실패", error=str(e))

        # ── 이미지 임베드 헬퍼 (HWPX) ──
        def try_embed_image(image_path: Path, caption: str = "") -> bool:
            """HWPX 이미지 임베드 — add_image 로 binary 등록 + 캡션 문단.

            python-hwpx 의 add_image 는 manifest 에 binary 등록만 합니다.
            본문 <hp:pic> 요소 직접 삽입은 한컴 한글이 깐깐하므로 안전한 캡션
            라인으로 우아하게 대체. 시각적으로 풍부한 그림이 필요하면 DOCX
            다운로드를 권장 (DocxRenderer 는 실제 이미지 임베드 지원).
            """
            try:
                # binary 등록 — 향후 한컴이 manifest 의 이미지를 활용 가능
                ext = image_path.suffix.lstrip(".").lower() or "png"
                if ext in ("jpg", "jpeg"):
                    ext = "jpg"
                try:
                    data = image_path.read_bytes()
                    doc.add_image(data, ext)
                except Exception:
                    pass

                # 본문에 시각적 캡션 라인 — 박스 형태로 강조
                cap = caption or image_path.name
                add_styled("─" * 30, italic=False)
                add_styled(f"  [그림] {cap}", bold=True, italic=True)
                add_styled(
                    f"  (이미지 파일이 첨부되었습니다 · DOCX 다운로드 시 그림으로 임베드됨)",
                    italic=True,
                )
                add_styled("─" * 30, italic=False)
                return True
            except Exception as e:  # noqa: BLE001
                log.warning("HWPX 이미지 캡션 라인 실패", error=str(e))
                add_styled(f"[이미지: {caption or image_path.name}]", italic=True)
                return False

        # ── 표지 5종 템플릿 (HWPX 텍스트 디자인) ──
        def write_cover_modern(cover: CoverData) -> None:
            """MODERN — 위쪽 가로 더블 라인 + 큰 제목 + 아래 라인."""
            doc.add_paragraph("")
            add_styled("━" * 40, bold=True)
            if cover.organization:
                add_styled(cover.organization, bold=True, style_id="1")
            if cover.department:
                add_styled(cover.department)
            add_styled("━" * 40, bold=True)
            if cover.classification:
                doc.add_paragraph("")
                add_styled(f"    [ {cover.classification} ]", bold=True)
            for _ in range(4):
                doc.add_paragraph("")
            if cover.title:
                add_styled(cover.title, bold=True, style_id="1", char_id=title_char_id)
            if cover.subtitle:
                add_styled(cover.subtitle)
            for _ in range(8):
                doc.add_paragraph("")
            for label, value in (("작 성 자", cover.author),
                                  ("부    서", cover.department),
                                  ("작성일자", cover.date),
                                  ("문서번호", cover.document_number)):
                if value:
                    add_styled(f"        {label} :  {value}")
            doc.add_paragraph("")
            add_styled("━" * 40, bold=True)

        def write_cover_classic(cover: CoverData) -> None:
            """CLASSIC — 중앙 정렬 + 짧은 구분선."""
            for _ in range(5):
                doc.add_paragraph("")
            if cover.organization:
                add_styled("                  " + cover.organization, bold=True, style_id="1")
            if cover.department:
                add_styled("                  " + cover.department)
            doc.add_paragraph("")
            add_styled("                ─── ◇ ───", bold=True)
            doc.add_paragraph("")
            if cover.classification:
                add_styled(f"           [ {cover.classification} ]", bold=True)
            for _ in range(2):
                doc.add_paragraph("")
            if cover.title:
                add_styled("           " + cover.title, bold=True, style_id="1", char_id=title_char_id)
            if cover.subtitle:
                add_styled("              " + cover.subtitle, italic=True)
            for _ in range(7):
                doc.add_paragraph("")
            for label, value in (("작 성 자", cover.author),
                                  ("작성일자", cover.date),
                                  ("문서번호", cover.document_number)):
                if value:
                    add_styled(f"              {label} :  {value}")

        def write_cover_gongmun(cover: CoverData) -> None:
            """GONGMUN — 한국 공문서 양식 표준."""
            doc.add_paragraph("")
            add_styled("═" * 50, bold=True)
            if cover.organization:
                add_styled(f"            {cover.organization}", bold=True, style_id="1")
            add_styled("═" * 50, bold=True)
            doc.add_paragraph("")
            if cover.document_number:
                add_styled(f"                              문서번호 : {cover.document_number}")
            if cover.classification:
                add_styled(f"                              [ {cover.classification} ]", bold=True)
            for _ in range(6):
                doc.add_paragraph("")
            add_styled("─" * 50, bold=True)
            if cover.title:
                add_styled(f"        {cover.title}", bold=True, style_id="1", char_id=title_char_id)
            add_styled("─" * 50, bold=True)
            if cover.subtitle:
                add_styled(f"             {cover.subtitle}", italic=True)
            for _ in range(8):
                doc.add_paragraph("")
            # 한국 공문 표 형태로 메타정보 — add_table 활용
            try:
                meta_rows: list[tuple[str, str]] = []
                if cover.department:      meta_rows.append(("부    서", cover.department))
                if cover.author:          meta_rows.append(("작 성 자", cover.author))
                if cover.date:            meta_rows.append(("작성일자", cover.date))
                if meta_rows:
                    meta_tbl = doc.add_table(rows=len(meta_rows), cols=2, width=30000)
                    for ri, (label, value) in enumerate(meta_rows):
                        try:
                            tc1 = meta_tbl.cell(ri, 0)
                            tc2 = meta_tbl.cell(ri, 1)
                            if header_bg_id and hasattr(tc1, "element"):
                                tc1.element.set("borderFillIDRef", header_bg_id)
                            add_cell_text(tc1, label, bold=True)
                            add_cell_text(tc2, value, bold=False)
                        except Exception:
                            continue
            except Exception as e:  # noqa: BLE001
                log.warning("gongmun 메타 표 실패", error=str(e))
            doc.add_paragraph("")
            add_styled("                                        ( 직   인 )", italic=True)

        def write_cover_proposal(cover: CoverData) -> None:
            """PROPOSAL — 좌측 강조 라벨 + 큰 제목."""
            doc.add_paragraph("")
            add_styled("█████", bold=True)
            if cover.organization:
                add_styled(f"  {cover.organization}", bold=True, style_id="1")
            if cover.department:
                add_styled(f"  {cover.department}", italic=True)
            add_styled("█████", bold=True)
            for _ in range(3):
                doc.add_paragraph("")
            if cover.classification:
                add_styled(f"   ▣ {cover.classification}", bold=True)
            doc.add_paragraph("")
            add_styled("    P R O P O S A L  ·  제 안 서", bold=True)
            doc.add_paragraph("")
            if cover.title:
                add_styled(cover.title, bold=True, style_id="1", char_id=title_char_id)
            if cover.subtitle:
                add_styled(f"   {cover.subtitle}", italic=True)
            for _ in range(7):
                doc.add_paragraph("")
            for label, value in (("작 성 자", cover.author),
                                  ("작성일자", cover.date),
                                  ("문서번호", cover.document_number)):
                if value:
                    add_styled(f"   ▶ {label} :  {value}", bold=True)

        def write_cover_research(cover: CoverData) -> None:
            """RESEARCH — 학술보고서 스타일."""
            if cover.document_number:
                add_styled(f"Document No. {cover.document_number}", italic=True)
                add_styled("─" * 50, italic=False)
            for _ in range(3):
                doc.add_paragraph("")
            add_styled("R E S E A R C H   R E P O R T", bold=True)
            doc.add_paragraph("")
            if cover.title:
                add_styled(cover.title, bold=True, style_id="1", char_id=title_char_id)
            if cover.subtitle:
                add_styled(cover.subtitle, italic=True)
            for _ in range(6):
                doc.add_paragraph("")
            add_styled("━" * 50, bold=True)
            for label, value in (("저       자", cover.author),
                                  ("소       속", cover.department),
                                  ("기       관", cover.organization),
                                  ("발  행  일", cover.date),
                                  ("분       류", cover.classification)):
                if value:
                    add_styled(f"  {label} :  {value}")
            add_styled("━" * 50, bold=True)
            for _ in range(8):
                doc.add_paragraph("")
            if cover.organization:
                add_styled(f"                {cover.organization}", italic=True)

        # ── 신규 5종 표지 (HWPX) ──
        def write_cover_executive(cover: CoverData) -> None:
            """EXECUTIVE — 임원 보고서, 고급 비즈니스."""
            add_styled("━" * 50, bold=True)
            doc.add_paragraph("")
            if cover.organization:
                add_styled(f"        {cover.organization.upper()}", bold=True)
            add_styled("        E X E C U T I V E   R E P O R T", bold=True)
            for _ in range(4):
                doc.add_paragraph("")
            if cover.classification:
                add_styled(f"                              [ {cover.classification} ]", bold=True)
                doc.add_paragraph("")
            if cover.title:
                add_styled(cover.title, bold=True, style_id="1", char_id=title_char_id)
            if cover.subtitle:
                add_styled(f"    {cover.subtitle}", italic=True)
            doc.add_paragraph("")
            add_styled("    ──────", bold=True)
            doc.add_paragraph("")
            for label, value in (("Author",   cover.author),
                                  ("Division", cover.department),
                                  ("Date",     cover.date),
                                  ("Ref. No.", cover.document_number)):
                if value:
                    add_styled(f"    {label:10s}  {value}")
            for _ in range(6):
                doc.add_paragraph("")
            add_styled("━" * 50, bold=True)

        def write_cover_annual(cover: CoverData) -> None:
            """ANNUAL_REPORT — 연차 보고서, 큰 표지."""
            # 연도 추출
            year = "".join(ch for ch in (cover.date or "") if ch.isdigit())[:4]
            doc.add_paragraph("")
            add_styled("██████████████████████████", bold=True)
            doc.add_paragraph("")
            add_styled(f"    A N N U A L  R E P O R T  {year}", bold=True)
            if cover.organization:
                add_styled(f"    {cover.organization}", bold=True, style_id="1")
            for _ in range(2):
                doc.add_paragraph("")
            if cover.title:
                add_styled(cover.title, bold=True, style_id="1", char_id=title_char_id)
            for _ in range(2):
                doc.add_paragraph("")
            add_styled("██████████████████████████", bold=True)
            for _ in range(3):
                doc.add_paragraph("")
            if cover.subtitle:
                add_styled(cover.subtitle, italic=True)
            for _ in range(5):
                doc.add_paragraph("")
            try:
                meta_rows: list[tuple[str, str]] = []
                if cover.author:          meta_rows.append(("발    행", cover.author))
                if cover.department:      meta_rows.append(("부    서", cover.department))
                if cover.date:            meta_rows.append(("발 행 일", cover.date))
                if cover.document_number: meta_rows.append(("문서번호", cover.document_number))
                if meta_rows:
                    tbl = doc.add_table(rows=len(meta_rows), cols=2, width=30000)
                    for ri, (lbl, val) in enumerate(meta_rows):
                        try:
                            c1 = tbl.cell(ri, 0); c2 = tbl.cell(ri, 1)
                            if header_bg_id and hasattr(c1, "element"):
                                c1.element.set("borderFillIDRef", header_bg_id)
                            add_cell_text(c1, lbl, bold=True)
                            add_cell_text(c2, val, bold=False)
                        except Exception:
                            continue
            except Exception:
                pass

        def write_cover_government(cover: CoverData) -> None:
            """GOVERNMENT — 정부 공문 표준 양식."""
            doc.add_paragraph("")
            add_styled("                          ◎", bold=True)
            add_styled("                       (기관 인)", italic=True)
            doc.add_paragraph("")
            if cover.organization:
                add_styled(f"                {cover.organization}", bold=True, style_id="1")
            if cover.department:
                add_styled(f"                  {cover.department}")
            for _ in range(3):
                doc.add_paragraph("")
            if cover.document_number:
                add_styled(f"  문서번호 : {cover.document_number}")
            if cover.classification:
                add_styled(f"                                        [ {cover.classification} ]", bold=True)
            doc.add_paragraph("")
            add_styled("═" * 50, bold=True)
            if cover.title:
                add_styled(f"          {cover.title}", bold=True, style_id="1", char_id=title_char_id)
            add_styled("═" * 50, bold=True)
            if cover.subtitle:
                add_styled(f"               {cover.subtitle}", italic=True)
            for _ in range(5):
                doc.add_paragraph("")
            try:
                meta_rows: list[tuple[str, str]] = []
                if cover.author:     meta_rows.append(("작 성 자", cover.author))
                if cover.date:       meta_rows.append(("작성일자", cover.date))
                if cover.department: meta_rows.append(("담당부서", cover.department))
                if meta_rows:
                    tbl = doc.add_table(rows=len(meta_rows), cols=2, width=30000)
                    for ri, (lbl, val) in enumerate(meta_rows):
                        try:
                            c1 = tbl.cell(ri, 0); c2 = tbl.cell(ri, 1)
                            if header_bg_id and hasattr(c1, "element"):
                                c1.element.set("borderFillIDRef", header_bg_id)
                            add_cell_text(c1, lbl, bold=True)
                            add_cell_text(c2, val, bold=False)
                        except Exception:
                            continue
            except Exception:
                pass
            for _ in range(3):
                doc.add_paragraph("")
            add_styled("            ( 담 당 )      ( 검 토 )      ( 결 재 )", italic=True)

        def write_cover_whitepaper(cover: CoverData) -> None:
            """WHITEPAPER — 백서."""
            doc.add_paragraph("")
            head = "W H I T E   P A P E R   ·   백  서"
            if cover.document_number:
                add_styled(f"  {head}                    {cover.document_number}", bold=True)
            else:
                add_styled(f"  {head}", bold=True)
            add_styled("─" * 50, bold=True)
            doc.add_paragraph("")
            add_styled("   기술·산업 분석 보고서", bold=True)
            doc.add_paragraph("")
            if cover.title:
                add_styled(cover.title, bold=True, style_id="1", char_id=title_char_id)
            if cover.subtitle:
                add_styled(f"   {cover.subtitle}", italic=True)
            doc.add_paragraph("")
            if cover.classification:
                kws = [k.strip() for k in cover.classification.split(",") if k.strip()]
                add_styled("   [ " + "  ·  ".join(kws) + " ]", italic=True)
            for _ in range(5):
                doc.add_paragraph("")
            add_styled("─" * 50, bold=True)
            for label, value in (("저       자", cover.author),
                                  ("연  구  팀", cover.department),
                                  ("발행기관", cover.organization),
                                  ("발  행  일", cover.date)):
                if value:
                    add_styled(f"   {label} :  {value}")
            for _ in range(6):
                doc.add_paragraph("")
            if cover.organization:
                add_styled(f"                          © {cover.organization}", italic=True)

        def write_cover_minimal(cover: CoverData) -> None:
            """MINIMAL — 제목만 강조한 미니멀."""
            for _ in range(8):
                doc.add_paragraph("")
            if cover.classification:
                add_styled(f"                                        [{cover.classification}]", italic=True)
            doc.add_paragraph("")
            add_styled("            ───", bold=True)
            doc.add_paragraph("")
            if cover.organization:
                add_styled(f"            {cover.organization.upper()}", italic=True)
            for _ in range(2):
                doc.add_paragraph("")
            if cover.title:
                add_styled(cover.title, bold=True, style_id="1", char_id=title_char_id)
            if cover.subtitle:
                add_styled(f"            {cover.subtitle}", italic=True)
            for _ in range(8):
                doc.add_paragraph("")
            for value in (cover.author, cover.date, cover.document_number):
                if value:
                    add_styled(f"            {value}")

        # ── 표지 (HWPX) — 10종 템플릿 디스패치 ──
        COVER_RENDERERS = {
            "modern":        write_cover_modern,
            "classic":       write_cover_classic,
            "gongmun":       write_cover_gongmun,
            "proposal":      write_cover_proposal,
            "research":      write_cover_research,
            "executive":     write_cover_executive,
            "annual_report": write_cover_annual,
            "government":    write_cover_government,
            "whitepaper":    write_cover_whitepaper,
            "minimal":       write_cover_minimal,
        }

        if ir.cover:
            try:
                renderer_fn = COVER_RENDERERS.get(ir.cover.template, write_cover_modern)
                renderer_fn(ir.cover)
                # 표지와 본문 사이 시각적 분리 (HWPX 는 명시 page break 불안정)
                for _ in range(6):
                    doc.add_paragraph("")
            except Exception as e:  # noqa: BLE001
                log.warning("HWPX 표지 렌더 실패", template=ir.cover.template, error=str(e))

        # 제목 — 22pt + 굵게 + 개요1 스타일 (표지 있고 표지에 제목이 있으면 생략)
        if ir.title and (not ir.cover or not ir.cover.title):
            add_styled(ir.title, bold=True, style_id="1", char_id=title_char_id)
            doc.add_paragraph("")

        for blk in ir.blocks:
            try:
                if blk.type == BlockType.HEADING:
                    # 헤딩 레벨별 styleIDRef + 큰 폰트 char_id
                    lvl = blk.heading_level
                    sid = HEADING_STYLE_IDS.get(lvl, "1")
                    cid = heading_char_ids.get(lvl, bold_id)
                    add_styled(_runs_text(blk.runs), bold=True, style_id=sid, char_id=cid)
                elif blk.type == BlockType.LIST_ITEM and blk.list_item:
                    indent = "  " * blk.list_item.depth  # depth당 2 spaces (이전 4)
                    has_bold = any(r.bold for r in blk.list_item.runs)
                    add_styled(
                        indent + _list_prefix(blk.list_item) + _runs_text(blk.list_item.runs),
                        bold=has_bold,
                    )
                elif blk.type == BlockType.QUOTE:
                    add_styled("    " + _runs_text(blk.runs), italic=True)
                elif blk.type == BlockType.CODE:
                    doc.add_paragraph("    " + _runs_text(blk.runs))
                elif blk.type == BlockType.TABLE and blk.table and blk.table.rows:
                    rows = len(blk.table.rows)
                    cols = max(len(r) for r in blk.table.rows)
                    try:
                        # 표 앞에 빈 단락 — 헤딩과 시각적 간격 확보
                        doc.add_paragraph("")
                        # A4 21cm - 좌우 25mm 여백 = 16cm. 1mm ≈ 283 HWPUNIT.
                        # 안전하게 15cm로 잡아 셀 너비 균등 배분.
                        page_width = 42500  # ~15cm
                        table = doc.add_table(rows=rows, cols=cols, width=page_width)
                        for ri, row in enumerate(blk.table.rows):
                            for ci, cell_data in enumerate(row):
                                if ci >= cols:
                                    break
                                if cell_data.colspan == 0 or cell_data.rowspan == 0:
                                    continue
                                text = _runs_text(cell_data.runs)
                                if not text:
                                    continue
                                if not hasattr(table, "cell"):
                                    continue
                                try:
                                    tcell = table.cell(ri, ci)
                                    is_header = (ri == 0 and blk.table.header_row)
                                    cell_bold = is_header or any(r.bold for r in cell_data.runs)
                                    # 헤더 행 셀에 회색 배경 borderFill 적용
                                    if is_header and header_bg_id and hasattr(tcell, "element"):
                                        try:
                                            tcell.element.set("borderFillIDRef", header_bg_id)
                                        except Exception:
                                            pass
                                    add_cell_text(tcell, text, bold=cell_bold)
                                except Exception:
                                    continue
                    except Exception as te:
                        log.warning("HWPX 표 생성 실패, 텍스트 그리드 대체", error=str(te))
                        for ri, row in enumerate(blk.table.rows):
                            line = " | ".join(_runs_text(c.runs) for c in row)
                            add_styled(line, bold=(ri == 0 and blk.table.header_row))
                    # 표 뒤 빈 단락 — 후속 본문과 시각적 간격
                    doc.add_paragraph("")
                elif blk.type == BlockType.BOX:
                    add_styled("[ " + _runs_text(blk.runs) + " ]", bold=True)
                elif blk.type == BlockType.THEMATIC_BREAK:
                    doc.add_paragraph("─" * 30)
                elif blk.type == BlockType.IMAGE and blk.image:
                    path = resolve_image_to_path(blk.image)
                    if path:
                        try_embed_image(path, blk.image.caption)
                    else:
                        add_styled(f"[이미지: {blk.image.alt or blk.image.src}]", italic=True)
                elif blk.type == BlockType.DIAGRAM and blk.diagram:
                    png = render_diagram_to_png(
                        engine=blk.diagram.engine, source=blk.diagram.source,
                    )
                    if png:
                        try_embed_image(png, blk.diagram.caption)
                    else:
                        add_styled(f"[다이어그램: {blk.diagram.engine}]", italic=True)
                elif blk.type == BlockType.CHART and blk.chart:
                    png = render_chart_to_png(blk.chart.spec)
                    if png:
                        try_embed_image(png, blk.chart.caption)
                    else:
                        add_styled("[차트 렌더 실패]", italic=True)
                elif blk.type == BlockType.EQUATION and blk.equation:
                    png = render_equation_to_png(
                        latex=blk.equation.latex, display=blk.equation.display,
                    )
                    if png:
                        try_embed_image(png, "")
                    else:
                        add_styled(blk.equation.latex, italic=True)
                else:
                    has_bold = any(r.bold for r in blk.runs)
                    has_italic = any(r.italic for r in blk.runs)
                    add_styled(_runs_text(blk.runs), bold=has_bold, italic=has_italic)
            except Exception as e:  # noqa: BLE001
                log.warning("HWPX 블록 변환 실패, 스킵", block_id=blk.id, error=str(e))
                continue

        # 푸터는 위에서 set_footer_text 로 페이지 푸터에 적용됨 (중복 추가 안 함)

        out.parent.mkdir(parents=True, exist_ok=True)
        doc.save(str(out))
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("python-hwpx 변환 실패, LibreOffice 폴백 시도", error=str(e))
        return False


def _docx_to_hwpx_via_libreoffice(docx_path: Path, hwpx_path: Path) -> bool:
    """LibreOffice headless로 docx → hwpx. soffice 미설치 시 False."""
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        return False
    with tempfile.TemporaryDirectory() as tmp:
        try:
            subprocess.run(
                [soffice, "--headless", "--convert-to", "hwpx", "--outdir", tmp, str(docx_path)],
                check=True,
                capture_output=True,
                timeout=120,
            )
            converted = Path(tmp) / (docx_path.stem + ".hwpx")
            if converted.exists():
                hwpx_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(converted, hwpx_path)
                return True
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            log.warning("LibreOffice HWPX 변환 실패", error=str(e))
    return False


class HwpxRenderer(Renderer):
    extension = ".hwpx"
    mime = "application/vnd.hancom.hwpx"

    def render(self, ir: DocumentIR, output_path: Path) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # 조직 프로파일 — convert 시 remember_for_document 로 미리 캐싱됨
        profile = profile_for_document(ir.document_id)
        if profile:
            log.info("HWPX 렌더링에 조직 프로파일 적용", profile=profile.slug, color=profile.brand_color_hex)

        # 1) python-hwpx 직접 변환 (권장)
        if _try_python_hwpx(ir, output_path, profile=profile):
            log.info("HWPX 생성 완료 (python-hwpx)", path=str(output_path))
            return output_path

        # 2) DOCX → HWPX (LibreOffice)
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp_docx:
            tmp_docx_path = Path(tmp_docx.name)
        try:
            DocxRenderer().render(ir, tmp_docx_path)
            if _docx_to_hwpx_via_libreoffice(tmp_docx_path, output_path):
                log.info("HWPX 생성 완료 (LibreOffice)", path=str(output_path))
                return output_path
        finally:
            tmp_docx_path.unlink(missing_ok=True)

        # 3) 최후 폴백 — 평문 저장 (한컴에서 텍스트 import 가능)
        log.error("HWPX 변환 모든 경로 실패, 텍스트 폴백")
        output_path.write_text(ir.source_markdown or ir.plain_text(), encoding="utf-8")
        return output_path
