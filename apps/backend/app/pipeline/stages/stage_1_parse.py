"""단계 1 — 입력 파싱.

마크다운(또는 자유 텍스트)을 DocumentIR.blocks 로 변환.
markdown-it-py로 정확한 AST를 얻고, 우리의 IR로 변환.

시각 요소(이미지·차트·다이어그램·수식) 처리:
- `![alt](url)`               → BlockType.IMAGE (단독 단락이면 블록, 인라인이면 inline run)
- ```mermaid / ```plantuml    → BlockType.DIAGRAM
- ```chart {JSON}             → BlockType.CHART
- $$...$$ 또는 ``` math       → BlockType.EQUATION (display)
- $...$                       → inline 텍스트 그대로 (렌더러가 알아서)
- frontmatter (--- ... ---)   → DocumentIR.cover
"""
from __future__ import annotations

import json
import re
import uuid

from markdown_it import MarkdownIt
from markdown_it.token import Token


# fence info attribute 파서:  key="value" 또는 key=value
_FENCE_ATTR_RE = re.compile(
    r'(?P<key>[A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(?:"(?P<qv>[^"]*)"|(?P<v>[^\s]+))'
)


def _parse_fence_attrs(attr_str: str) -> dict[str, str]:
    """fence info 의 attribute 추출: `title="A" align=center` → {title:"A", align:"center"}."""
    if not attr_str:
        return {}
    out: dict[str, str] = {}
    for m in _FENCE_ATTR_RE.finditer(attr_str):
        out[m.group("key").lower()] = m.group("qv") if m.group("qv") is not None else m.group("v")
    return out


# mermaid frontmatter (--- title: X ---) 추출 — mermaid 9.4+ 표준
_MERMAID_FM_RE = re.compile(
    r"^\s*---\s*\n(?P<body>.*?)\n---\s*\n",
    re.DOTALL,
)


def _split_alt_attrs(alt_raw: str) -> tuple[str, dict[str, str]]:
    """`![캡션|width=60% align=center](url)` alt 안의 속성 분리.

    반환: (clean_alt, attrs)
    """
    if "|" not in alt_raw:
        return alt_raw, {}
    alt_clean, _, attr_part = alt_raw.partition("|")
    return alt_clean.strip(), _parse_fence_attrs(attr_part)


def _extract_mermaid_title(source: str) -> str:
    """mermaid source 상단의 `--- title: ... ---` frontmatter 에서 title 추출."""
    m = _MERMAID_FM_RE.match(source)
    if not m:
        return ""
    for line in m.group("body").splitlines():
        line = line.strip()
        if line.lower().startswith("title:"):
            val = line.split(":", 1)[1].strip()
            if (val.startswith('"') and val.endswith('"')) or (
                val.startswith("'") and val.endswith("'")
            ):
                val = val[1:-1]
            return val
    return ""

from app.pipeline.ir import (
    Block,
    BlockType,
    ChartData,
    DiagramData,
    DocumentIR,
    EquationData,
    ImageData,
    InlineRun,
    ListItem,
    PersonaMode,
    Table,
    TableCell,
)
from app.services.visuals.cover import cover_from_frontmatter, extract_frontmatter


# breaks: True — 한 단락 안의 줄바꿈을 hardbreak 로 보존.
#   CommonMark 표준은 줄바꿈을 공백으로 처리하지만, 한국 공문서·보고서는
#   "문서번호: ..." "작성일자: ..." 같은 메타 4~5줄을 빈 줄 없이 나열하는 경우가
#   많아 직관에 맞도록 활성화. (검토 태그 char-offset 오차도 함께 해결됨)
_md = (
    MarkdownIt("commonmark", {"breaks": True, "html": False})
    .enable("table")
    .enable("strikethrough")
    .enable("image")
)


def _next_id(counter: list[int]) -> str:
    counter[0] += 1
    return f"blk-{counter[0]:04d}"


def _runs_from_inline(token: Token) -> list[InlineRun]:
    """inline 토큰의 children을 InlineRun 리스트로 변환."""
    runs: list[InlineRun] = []
    stack_bold = 0
    stack_italic = 0
    stack_strike = 0
    stack_underline = 0
    link_target: str | None = None

    for c in token.children or []:
        t = c.type
        if t == "strong_open":
            stack_bold += 1
        elif t == "strong_close":
            stack_bold = max(0, stack_bold - 1)
        elif t == "em_open":
            stack_italic += 1
        elif t == "em_close":
            stack_italic = max(0, stack_italic - 1)
        elif t == "s_open":
            stack_strike += 1
        elif t == "s_close":
            stack_strike = max(0, stack_strike - 1)
        elif t == "link_open":
            link_target = c.attrGet("href")
        elif t == "link_close":
            link_target = None
        elif t == "text":
            runs.append(
                InlineRun(
                    text=c.content,
                    bold=stack_bold > 0,
                    italic=stack_italic > 0,
                    strikethrough=stack_strike > 0,
                    underline=stack_underline > 0,
                    link=link_target,
                )
            )
        elif t == "code_inline":
            runs.append(InlineRun(text=c.content, code=True))
        elif t == "softbreak":
            # breaks=True 모드에서는 줄바꿈 보존 (CommonMark 기본은 공백 처리지만,
            # 한국 공문서·보고서의 메타정보 4~5줄 나열을 자연스럽게 표시하기 위함)
            runs.append(InlineRun(text="\n"))
        elif t == "hardbreak":
            runs.append(InlineRun(text="\n"))
        elif t == "image":
            # 인라인 이미지 — alt + src 만 텍스트로 보존 (실제 이미지는 블록 단위에서만 임베드)
            src = c.attrGet("src") or ""
            alt = c.content or ""
            runs.append(InlineRun(text=f"[이미지: {alt or src}]"))
    return runs


def _extract_image_token(inline_token: Token) -> Token | None:
    """inline 토큰의 child가 이미지 단 1개(텍스트는 공백 허용)면 그 토큰 반환.

    `![alt](url)` 단독 단락 검출용. 본문 텍스트가 섞이면 None.
    """
    children = inline_token.children or []
    images: list[Token] = []
    for c in children:
        if c.type == "image":
            images.append(c)
        elif c.type == "text" and c.content.strip() == "":
            continue
        elif c.type in ("softbreak", "hardbreak"):
            continue
        else:
            return None  # 텍스트가 섞임
    return images[0] if len(images) == 1 else None


def _parse_table(tokens: list[Token], start: int) -> tuple[Table, int]:
    """`table_open` 위치에서 시작 — 표를 파싱해서 닫는 위치 반환."""
    i = start + 1
    rows: list[list[TableCell]] = []
    cur_row: list[TableCell] = []
    in_header = False
    has_header = False

    while i < len(tokens) and tokens[i].type != "table_close":
        t = tokens[i]
        if t.type == "thead_open":
            in_header = True
            has_header = True
        elif t.type == "thead_close":
            in_header = False  # noqa: F841
        elif t.type == "tr_open":
            cur_row = []
        elif t.type == "tr_close":
            rows.append(cur_row)
        elif t.type in ("th_open", "td_open"):
            align_attr = t.attrGet("style") or ""
            align: str = "left"
            if "text-align:center" in align_attr:
                align = "center"
            elif "text-align:right" in align_attr:
                align = "right"
            # 다음 inline 토큰을 셀 내용으로
            if i + 1 < len(tokens) and tokens[i + 1].type == "inline":
                runs = _runs_from_inline(tokens[i + 1])
            else:
                runs = []
            cur_row.append(TableCell(runs=runs, align=align))  # type: ignore[arg-type]
        i += 1
    return Table(rows=rows, header_row=has_header), i


def _markdown_to_blocks(source: str) -> list[Block]:
    tokens = _md.parse(source)
    blocks: list[Block] = []
    counter = [0]
    list_depth = -1
    list_ordered_stack: list[bool] = []
    list_index_stack: list[int] = []

    i = 0
    while i < len(tokens):
        t = tokens[i]

        if t.type == "heading_open":
            level = int(t.tag[1:])  # h1 -> 1
            inline = tokens[i + 1]
            runs = _runs_from_inline(inline)
            blocks.append(
                Block(
                    id=_next_id(counter),
                    type=BlockType.HEADING,
                    heading_level=level,
                    runs=runs,
                )
            )
            i += 3  # heading_open, inline, heading_close
            continue

        if t.type == "paragraph_open":
            inline = tokens[i + 1]
            # 단독 이미지(`![](url)`) 검출 → IMAGE 블록
            img_token = _extract_image_token(inline) if list_depth < 0 else None
            if img_token is not None:
                src = img_token.attrGet("src") or ""
                alt_raw = img_token.content or ""
                title = img_token.attrGet("title") or ""
                # alt 안의 `|width=60% align=center` 같은 속성 파싱
                alt, alt_attrs = _split_alt_attrs(alt_raw)
                img = ImageData(
                    src=src,
                    url=src if src.startswith(("http://", "https://")) else "",
                    local_path=src if (src and not src.startswith(("http://", "https://", "data:"))) else "",
                    data_b64=src if src.startswith("data:") else "",
                    alt=alt,
                    caption=title or alt,
                    width=alt_attrs.get("width", ""),
                    height=alt_attrs.get("height", ""),
                    align=alt_attrs.get("align", "center"),  # type: ignore[arg-type]
                )
                blocks.append(
                    Block(
                        id=_next_id(counter),
                        type=BlockType.IMAGE,
                        image=img,
                    )
                )
                i += 3
                continue

            runs = _runs_from_inline(inline)
            # 리스트 안의 단락은 list_item로 처리
            if list_depth >= 0:
                bullet = ["□", "○", "―", "※", "*"][min(list_depth, 4)]
                ordered = bool(list_ordered_stack[-1]) if list_ordered_stack else False
                idx = 0
                if ordered:
                    list_index_stack[-1] += 1
                    idx = list_index_stack[-1]
                blocks.append(
                    Block(
                        id=_next_id(counter),
                        type=BlockType.LIST_ITEM,
                        list_item=ListItem(
                            runs=runs,
                            depth=list_depth,
                            bullet_marker=bullet,
                            ordered=ordered,
                            index=idx,
                        ),
                    )
                )
            else:
                blocks.append(Block(id=_next_id(counter), type=BlockType.PARAGRAPH, runs=runs))
            i += 3
            continue

        if t.type in ("bullet_list_open", "ordered_list_open"):
            list_depth += 1
            list_ordered_stack.append(t.type == "ordered_list_open")
            list_index_stack.append(0)
            i += 1
            continue

        if t.type in ("bullet_list_close", "ordered_list_close"):
            list_depth -= 1
            if list_ordered_stack:
                list_ordered_stack.pop()
                list_index_stack.pop()
            i += 1
            continue

        if t.type in ("list_item_open", "list_item_close"):
            i += 1
            continue

        if t.type == "blockquote_open":
            # 인용 — 안의 paragraph 콘텐츠를 모아서 quote 블록 1개로
            j = i + 1
            collected: list[InlineRun] = []
            while j < len(tokens) and tokens[j].type != "blockquote_close":
                if tokens[j].type == "inline":
                    collected.extend(_runs_from_inline(tokens[j]))
                    collected.append(InlineRun(text="\n"))
                j += 1
            blocks.append(Block(id=_next_id(counter), type=BlockType.QUOTE, runs=collected))
            i = j + 1
            continue

        if t.type == "fence" or t.type == "code_block":
            raw_info = (t.info or "").strip()
            # fence info 의 첫 토큰 = 언어, 나머지는 attribute (예: mermaid title="흐름도")
            info_parts = raw_info.split(None, 1)
            lang = info_parts[0].lower() if info_parts else ""
            info_attrs = _parse_fence_attrs(info_parts[1]) if len(info_parts) > 1 else {}
            content = t.content or ""

            # fence 공통 속성 — 크기·정렬
            common_width = info_attrs.get("width", "")
            common_height = info_attrs.get("height", "")
            common_align = info_attrs.get("align", "center")
            if common_align not in ("left", "center", "right"):
                common_align = "center"

            # mermaid · plantuml → DIAGRAM
            if lang in ("mermaid", "plantuml"):
                # 캡션 우선순위:
                #   1) fence info: title="..." 또는 caption="..."
                #   2) mermaid frontmatter: --- title: ... ---
                #   3) 비어 있음
                caption = info_attrs.get("title", "") or info_attrs.get("caption", "")
                if not caption:
                    caption = _extract_mermaid_title(content)
                blocks.append(
                    Block(
                        id=_next_id(counter),
                        type=BlockType.DIAGRAM,
                        diagram=DiagramData(
                            engine=lang, source=content, caption=caption,
                            width=common_width, height=common_height, align=common_align,  # type: ignore[arg-type]
                        ),
                    )
                )
                i += 1
                continue

            # chart {JSON} → CHART
            if lang in ("chart", "chartjs"):
                try:
                    spec = json.loads(content)
                except json.JSONDecodeError:
                    spec = {}
                if spec:
                    caption = (
                        info_attrs.get("title", "")
                        or info_attrs.get("caption", "")
                        or spec.get("title", "")
                    )
                    blocks.append(
                        Block(
                            id=_next_id(counter),
                            type=BlockType.CHART,
                            chart=ChartData(
                                spec=spec, caption=caption,
                                width=common_width, height=common_height, align=common_align,  # type: ignore[arg-type]
                            ),
                        )
                    )
                    i += 1
                    continue
                # 파싱 실패 시 코드 블록으로 폴백

            # math · latex → EQUATION (display)
            if lang in ("math", "latex", "tex"):
                blocks.append(
                    Block(
                        id=_next_id(counter),
                        type=BlockType.EQUATION,
                        equation=EquationData(
                            latex=content.strip(), display=True,
                            width=common_width, align=common_align,  # type: ignore[arg-type]
                        ),
                    )
                )
                i += 1
                continue

            # image fence — ```image width=60% caption="..." 안에 URL 또는 경로 한 줄
            if lang == "image":
                src = content.strip().splitlines()[0] if content.strip() else ""
                caption = info_attrs.get("caption", "") or info_attrs.get("title", "")
                alt = info_attrs.get("alt", "") or caption
                img = ImageData(
                    src=src,
                    url=src if src.startswith(("http://", "https://")) else "",
                    local_path=src if src and not src.startswith(("http://", "https://", "data:")) else "",
                    data_b64=src if src.startswith("data:") else "",
                    alt=alt,
                    caption=caption,
                    width=common_width,
                    height=common_height,
                    align=common_align,  # type: ignore[arg-type]
                )
                blocks.append(Block(id=_next_id(counter), type=BlockType.IMAGE, image=img))
                i += 1
                continue

            blocks.append(
                Block(
                    id=_next_id(counter),
                    type=BlockType.CODE,
                    code_lang=t.info or "",
                    runs=[InlineRun(text=content, code=True)],
                )
            )
            i += 1
            continue

        if t.type == "hr":
            blocks.append(Block(id=_next_id(counter), type=BlockType.THEMATIC_BREAK))
            i += 1
            continue

        if t.type == "table_open":
            table, end = _parse_table(tokens, i)
            blocks.append(Block(id=_next_id(counter), type=BlockType.TABLE, table=table))
            i = end + 1
            continue

        # 알려지지 않은 토큰은 스킵
        i += 1

    return blocks


def parse_markdown(
    source: str,
    *,
    document_id: str | None = None,
    title: str = "",
    persona_mode: PersonaMode = PersonaMode.WORKER,
) -> DocumentIR:
    """파이프라인 단계 1 — 마크다운 → DocumentIR."""
    # frontmatter 추출 (선택) — cover 생성용
    meta, body = extract_frontmatter(source)

    # title 우선순위: 명시 인자 > frontmatter > 첫 H1
    if not title:
        title = meta.get("title", "").strip()

    blocks = _markdown_to_blocks(body)

    # 제목이 비어있고 첫 블록이 H1이면 제목으로 승격 + 본문에서는 제거 (중복 방지)
    if not title and blocks and blocks[0].type == BlockType.HEADING and blocks[0].heading_level == 1:
        title = "".join(r.text for r in blocks[0].runs)
        blocks = blocks[1:]
    # 명시 title이 첫 H1과 동일하면 첫 H1 제거
    elif title and blocks and blocks[0].type == BlockType.HEADING and blocks[0].heading_level == 1:
        first_h1_text = "".join(r.text for r in blocks[0].runs).strip()
        if first_h1_text == title.strip():
            blocks = blocks[1:]

    cover = cover_from_frontmatter(meta, default_title=title) if meta else None

    return DocumentIR(
        document_id=document_id or uuid.uuid4().hex[:12],
        title=title,
        persona_mode=persona_mode,
        cover=cover,
        source_markdown=source,
        blocks=blocks,
    )
