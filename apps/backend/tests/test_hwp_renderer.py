"""HWP 5.0 바이너리 렌더러 테스트.

검증 레이어:
1. 레코드 헤더 인코딩/디코딩 왕복
2. FileHeader/DocInfo/BodyText 스트림 구조 (olefile + zlib)
3. 본문 텍스트·서식·표·강등 동작
4. pyhwp(hwp5) 설치 시 — 독립 파서로 전체 레코드 파싱 왕복
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

import olefile
import pytest

from app.pipeline.ir import (
    Block,
    BlockType,
    DocumentIR,
    EquationData,
    InlineRun,
    ListItem,
    Table,
    TableCell,
)
from app.renderers import get_renderer
from app.renderers.hwp.records import (
    HWPTAG_CHAR_SHAPE,
    HWPTAG_PARA_TEXT,
    iter_records,
    record,
)
from app.renderers.hwp_renderer import HwpRenderer

# ── 헬퍼 ──────────────────────────────────────────────────────────────


def _ir(blocks: list[Block], title: str = "테스트 문서") -> DocumentIR:
    return DocumentIR(document_id="doc-test", title=title, blocks=blocks)


def _para(text: str, **run_kw) -> Block:
    return Block(id="blk-0001", type=BlockType.PARAGRAPH, runs=[InlineRun(text=text, **run_kw)])


def _render(tmp_path: Path, ir: DocumentIR) -> tuple[HwpRenderer, Path]:
    r = HwpRenderer()
    out = r.render(ir, tmp_path / "out.hwp")
    return r, out


def _stream(path: Path, name: str) -> bytes:
    with olefile.OleFileIO(str(path)) as ole:
        return ole.openstream(name).read()


def _decompressed(path: Path, name: str) -> bytes:
    return zlib.decompress(_stream(path, name), -15)


# ── 1. 레코드 헤더 ────────────────────────────────────────────────────


def test_record_header_roundtrip_small():
    payload = b"\x01\x02\x03"
    data = record(HWPTAG_PARA_TEXT, 1, payload)
    assert len(data) == 4 + 3
    [(tag, level, got)] = list(iter_records(data))
    assert (tag, level, got) == (HWPTAG_PARA_TEXT, 1, payload)


def test_record_header_roundtrip_extended_size():
    payload = b"\xab" * 0x1234  # > 0xFFF → 확장 u32 크기
    data = record(HWPTAG_CHAR_SHAPE, 2, payload)
    assert len(data) == 8 + len(payload)
    [(tag, level, got)] = list(iter_records(data))
    assert (tag, level, got) == (HWPTAG_CHAR_SHAPE, 2, payload)


def test_iter_records_consumes_exactly():
    blob = record(1, 0, b"a") + record(2, 1, b"bb") + record(3, 0, b"")
    assert [(t, lv, p) for t, lv, p in iter_records(blob)] == [
        (1, 0, b"a"), (2, 1, b"bb"), (3, 0, b""),
    ]


# ── 2. 컨테이너 구조 ──────────────────────────────────────────────────


def test_fileheader_stream(tmp_path):
    _, out = _render(tmp_path, _ir([_para("안녕하세요")]))
    fh = _stream(out, "FileHeader")
    assert len(fh) == 256
    assert fh.startswith(b"HWP Document File")
    (version,) = struct.unpack_from("<I", fh, 32)
    assert version == 0x05000300  # 5.0.3.0
    (flags,) = struct.unpack_from("<I", fh, 36)
    assert flags & 0x1  # bit0 = 압축


def test_docinfo_and_bodytext_decompress(tmp_path):
    _, out = _render(tmp_path, _ir([_para("본문 텍스트")]))
    docinfo = _decompressed(out, "DocInfo")
    body = _decompressed(out, "BodyText/Section0")
    assert len(docinfo) > 0
    assert len(body) > 0


def test_all_records_parse_exactly(tmp_path):
    """자체 검증 — 모든 레코드가 파싱되고 바이트가 정확히 소비되는가."""
    ir = _ir([
        _para("문단 하나"),
        Block(id="blk-0002", type=BlockType.HEADING, heading_level=1,
              runs=[InlineRun(text="제목")]),
        Block(id="blk-0003", type=BlockType.TABLE, table=Table(rows=[
            [TableCell(runs=[InlineRun(text="a")]), TableCell(runs=[InlineRun(text="b")])],
            [TableCell(runs=[InlineRun(text="c")]), TableCell(runs=[InlineRun(text="d")])],
        ])),
    ])
    _, out = _render(tmp_path, ir)
    for name in ("DocInfo", "BodyText/Section0"):
        blob = _decompressed(out, name)
        consumed = 0
        n = 0
        for tag, _level, payload in iter_records(blob):
            hdr = 4 if len(payload) < 0xFFF else 8
            consumed += hdr + len(payload)
            n += 1
            assert 0x10 <= tag < 0x80, f"{name}: 이상한 태그 {tag:#x}"
        assert consumed == len(blob), f"{name}: 잔여 바이트"
        assert n > 0


# ── 3. 본문 내용 ──────────────────────────────────────────────────────


def test_paragraph_text_in_bodytext(tmp_path):
    _, out = _render(tmp_path, _ir([_para("독특한문장XYZ")]))
    body = _decompressed(out, "BodyText/Section0")
    assert "독특한문장XYZ".encode("utf-16-le") in body


def test_bold_run_creates_second_char_shape(tmp_path):
    plain_ir = _ir([_para("보통")])
    bold_ir = _ir([_para("굵게", bold=True)])

    def _char_shape_count(ir):
        r = HwpRenderer()
        out_dir = plain_ir.document_id + ("-b" if ir is bold_ir else "-p")
        out = r.render(ir, tmp_path / f"{out_dir}.hwp")
        docinfo = _decompressed(out, "DocInfo")
        return sum(1 for tag, _, _ in iter_records(docinfo) if tag == HWPTAG_CHAR_SHAPE)

    assert _char_shape_count(bold_ir) == _char_shape_count(plain_ir) + 1


def test_unsupported_block_degrades_with_warning(tmp_path):
    ir = _ir([
        _para("앞 문단"),
        Block(id="blk-0002", type=BlockType.EQUATION,
              equation=EquationData(latex="E=mc^2")),
    ])
    renderer, out = _render(tmp_path, ir)
    body = _decompressed(out, "BodyText/Section0")
    assert "[수식: E=mc^2]".encode("utf-16-le") in body
    assert len(renderer.warnings) >= 1


def test_list_item_marker_as_text(tmp_path):
    ir = _ir([Block(
        id="blk-0001", type=BlockType.LIST_ITEM,
        list_item=ListItem(runs=[InlineRun(text="항목입니다")], bullet_marker="○", depth=1),
    )])
    _, out = _render(tmp_path, ir)
    body = _decompressed(out, "BodyText/Section0")
    assert "○ 항목입니다".encode("utf-16-le") in body


def test_basic_table_renders(tmp_path):
    ir = _ir([Block(id="blk-0001", type=BlockType.TABLE, table=Table(rows=[
        [TableCell(runs=[InlineRun(text="셀일일")]), TableCell(runs=[InlineRun(text="셀일이")])],
        [TableCell(runs=[InlineRun(text="셀이일")]), TableCell(runs=[InlineRun(text="셀이이")])],
    ]))])
    _, out = _render(tmp_path, ir)
    body = _decompressed(out, "BodyText/Section0")
    for cell_text in ("셀일일", "셀일이", "셀이일", "셀이이"):
        assert cell_text.encode("utf-16-le") in body


def test_merged_cell_table_degrades(tmp_path):
    ir = _ir([Block(id="blk-0001", type=BlockType.TABLE, table=Table(rows=[
        [TableCell(runs=[InlineRun(text="병합")], colspan=2)],
        [TableCell(runs=[InlineRun(text="좌")]), TableCell(runs=[InlineRun(text="우")])],
    ]))])
    renderer, out = _render(tmp_path, ir)
    body = _decompressed(out, "BodyText/Section0")
    assert "병합".encode("utf-16-le") in body  # 텍스트 강등이라도 내용은 보존
    assert len(renderer.warnings) >= 1


# ── 4. 레지스트리 ─────────────────────────────────────────────────────


def test_registry_returns_hwp_renderer():
    r = get_renderer("hwp")
    assert isinstance(r, HwpRenderer)
    assert r.extension == ".hwp"
    assert r.mime == "application/x-hwp"


# ── 5. pyhwp 독립 파서 왕복 (설치 시) ─────────────────────────────────
# importorskip은 각 테스트 안에서만 — 모듈 수준이면 pyhwp 미설치 시
# 이 파일의 다른 테스트까지 전부 건너뛰게 된다.


def test_pyhwp_parses_generated_file(tmp_path):
    pytest.importorskip("hwp5", reason="pyhwp 미설치 — 독립 파서 검증 생략")
    from hwp5.binmodel import Hwp5File

    ir = _ir([
        Block(id="blk-0001", type=BlockType.HEADING, heading_level=1,
              runs=[InlineRun(text="큰제목")]),
        _para("본문이며 파서검증용 문장입니다"),
        Block(id="blk-0002", type=BlockType.PARAGRAPH,
              runs=[InlineRun(text="굵은글", bold=True), InlineRun(text="보통글")]),
        Block(id="blk-0003", type=BlockType.TABLE, table=Table(rows=[
            [TableCell(runs=[InlineRun(text="가나")]), TableCell(runs=[InlineRun(text="다라")])],
            [TableCell(runs=[InlineRun(text="마바")]), TableCell(runs=[InlineRun(text="사아")])],
        ])),
    ])
    _, out = _render(tmp_path, ir)

    doc = Hwp5File(str(out))
    try:
        # DocInfo·BodyText 전체를 타입 모델로 파싱 — 레이아웃이 어긋나면 예외
        docinfo = list(doc.docinfo.models())
        section = list(doc.bodytext.section(0).models())
    finally:
        doc.close()

    docinfo_models = [m["type"].__name__ for m in docinfo]
    section_models = [m["type"].__name__ for m in section]
    # 모든 레코드가 잔여 바이트 없이 정확히 소비되어야 함
    for m in docinfo + section:
        assert "unparsed" not in m, f"{m['type'].__name__}: 잔여 {len(m['unparsed'])}바이트"

    assert "CharShape" in docinfo_models
    assert "Style" in docinfo_models
    assert "SectionDef" in section_models
    assert "TableControl" in section_models
    assert "TableBody" in section_models
    assert "TableCell" in section_models
    assert "UnknownModel" not in docinfo_models
    assert "UnknownModel" not in section_models


def test_pyhwp_xml_transform_roundtrip(tmp_path):
    """xmlmodel 변환은 컨트롤 문자 스캔·레코드 트리 전체를 검증한다."""
    import io

    pytest.importorskip("hwp5", reason="pyhwp 미설치 — 독립 파서 검증 생략")
    from hwp5.xmlmodel import Hwp5File

    ir = _ir([
        _para("변환기왕복검증문장"),
        Block(id="blk-0002", type=BlockType.TABLE, table=Table(rows=[
            [TableCell(runs=[InlineRun(text="셀에이")]), TableCell(runs=[InlineRun(text="셀비")])],
        ])),
    ])
    _, out = _render(tmp_path, ir)

    doc = Hwp5File(str(out))
    try:
        buf = io.BytesIO()
        doc.xmlevents().dump(buf)
        xml = buf.getvalue().decode("utf-8", "replace")
    finally:
        doc.close()
    assert "변환기왕복검증문장" in xml
    assert "셀에이" in xml and "셀비" in xml


# ── 6. 다운로드 API — 강등 경고 헤더 (설계문서 §3.5) ──────────────────


async def test_render_download_exposes_degrade_warnings_header():
    import json
    import os
    import urllib.parse

    from httpx import ASGITransport, AsyncClient

    os.environ.setdefault("LLM_PROVIDER", "mock")
    from app.main import create_app
    from app.services.document_cache import get_document_cache

    cache = get_document_cache()
    degraded_ir = DocumentIR(
        document_id="doc-hwp-warn-test",
        title="경고헤더검증",
        blocks=[
            Block(id="blk-0001", type=BlockType.PARAGRAPH, runs=[InlineRun(text="본문")]),
            Block(id="blk-0002", type=BlockType.EQUATION,
                  equation=EquationData(latex="E=mc^2")),
        ],
    )
    clean_ir = DocumentIR(
        document_id="doc-hwp-clean-test",
        title="경고없음검증",
        blocks=[Block(id="blk-0001", type=BlockType.PARAGRAPH, runs=[InlineRun(text="본문")])],
    )
    cache.set(degraded_ir)
    cache.set(clean_ir)

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with app.router.lifespan_context(app):
            r = await client.get("/api/v1/render/doc-hwp-warn-test/hwp")
            assert r.status_code == 200
            raw = r.headers.get("x-docuax-warnings")
            assert raw, "강등 발생 시 X-Docuax-Warnings 헤더가 있어야 함"
            warnings = json.loads(urllib.parse.unquote(raw))
            assert isinstance(warnings, list) and warnings
            assert any("수식" in w for w in warnings)

            r2 = await client.get("/api/v1/render/doc-hwp-clean-test/hwp")
            assert r2.status_code == 200
            assert "x-docuax-warnings" not in r2.headers
