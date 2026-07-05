"""HWP 5.0 레거시 바이너리(.hwp) 렌더러.

구조: OLE CFB 컨테이너(FileHeader·DocInfo·BodyText/Section0·PrvText)
+ zlib raw-deflate 압축 레코드 스트림. 어떤 파이썬 라이브러리도 .hwp 쓰기를
지원하지 않아 컨테이너·레코드를 직접 직렬화한다 (renderers/hwp/ 참고).

지원 범위 (설계문서 §3.5):
- 문단·헤딩(크기+굵게)·굵게/기울임/밑줄·글자 크기·리스트(마커 텍스트)·기본 표
- 이미지·차트·수식·다이어그램·병합 셀 표는 텍스트 강등 + self.warnings 경고
"""
from __future__ import annotations

import struct
import uuid
import zlib
from pathlib import Path

from app.core.logging import get_logger
from app.pipeline.ir import Block, BlockType, DocumentIR, InlineRun
from app.renderers.base import Renderer
from app.renderers.hwp.bodytext import SectionBuilder, Segment, sanitize
from app.renderers.hwp.cfb_writer import CfbWriter
from app.renderers.hwp.docinfo import DEFAULT_FONT_SIZE_PT, CharShapeKey, DocInfoBuilder

log = get_logger(__name__)

HWP_VERSION = 0x05000300  # 5.0.3.0
HEADING_SIZE_PT = {1: 16.0, 2: 14.0, 3: 12.0, 4: 11.0, 5: 10.5, 6: 10.0}

_DEGRADE_TYPES = {
    BlockType.IMAGE: "이미지",
    BlockType.DIAGRAM: "다이어그램",
    BlockType.CHART: "차트",
    BlockType.EQUATION: "수식",
}


def _run_key(run: InlineRun, *, force_bold: bool = False, size_pt: float | None = None) -> CharShapeKey:
    size = run.font_size or size_pt or DEFAULT_FONT_SIZE_PT
    return (run.bold or force_bold, run.italic, run.underline, float(size))


def _runs_to_segments(
    runs: list[InlineRun], *, force_bold: bool = False, size_pt: float | None = None
) -> list[Segment]:
    return [
        (run.text, _run_key(run, force_bold=force_bold, size_pt=size_pt))
        for run in runs
        if run.text
    ]


class HwpRenderer(Renderer):
    extension = ".hwp"
    mime = "application/x-hwp"

    def __init__(self) -> None:
        self.warnings: list[str] = []

    def render(self, ir: DocumentIR, output_path: Path) -> Path:
        docinfo_builder = DocInfoBuilder()
        section = SectionBuilder(docinfo_builder)

        # BodyText 먼저 — 사용된 글자 모양이 DocInfo에 등록된다
        for block in ir.blocks:
            self._add_block(section, block)
        body_bytes = section.build()
        docinfo_bytes = docinfo_builder.build(section_count=1)

        writer = CfbWriter()
        writer.add_stream("FileHeader", self._file_header())
        writer.add_stream("DocInfo", self._deflate(docinfo_bytes))
        writer.add_stream("BodyText/Section0", self._deflate(body_bytes))
        writer.add_stream("PrvText", self._preview_text(ir))
        writer.add_stream("\x05HwpSummaryInformation", self._summary_info(ir.title))

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(writer.build())
        if self.warnings:
            log.info("hwp_render_degraded", document_id=ir.document_id, warnings=self.warnings)
        return output_path

    # ── 블록 매핑 ─────────────────────────────────────────────────────

    def _add_block(self, section: SectionBuilder, block: Block) -> None:
        if block.type == BlockType.HEADING:
            size = HEADING_SIZE_PT.get(block.heading_level or 1, 12.0)
            section.add_paragraph(
                _runs_to_segments(block.runs, force_bold=True, size_pt=size)
            )
            return

        if block.type == BlockType.LIST_ITEM and block.list_item:
            li = block.list_item
            indent = "  " * max(li.depth, 0)
            marker = f"{li.index}{li.order_format.replace('1.', '.')}" if li.ordered else li.bullet_marker
            prefix: list[Segment] = [(f"{indent}{marker} ", _run_key(InlineRun(text=" ")))]
            section.add_paragraph(prefix + _runs_to_segments(li.runs))
            return

        if block.type == BlockType.TABLE and block.table:
            self._add_table(section, block)
            return

        if block.type in _DEGRADE_TYPES:
            label = _DEGRADE_TYPES[block.type]
            section.add_paragraph([(block.to_plain_text(), _run_key(InlineRun(text=" ")))])
            self.warnings.append(
                f"{label} 블록({block.id})은 HWP 바이너리에서 텍스트로 강등되었습니다. "
                "원본 유지가 필요하면 HWPX 출력을 사용하세요."
            )
            return

        if block.type == BlockType.THEMATIC_BREAK:
            section.add_paragraph([("─" * 24, _run_key(InlineRun(text=" ")))])
            return

        # PARAGRAPH·QUOTE·BOX·CODE·HTML·COVER 등 — 텍스트 문단으로
        segments = _runs_to_segments(block.runs)
        if not segments and block.to_plain_text():
            segments = [(block.to_plain_text(), _run_key(InlineRun(text=" ")))]
        # 줄바꿈은 문단 분리로 (0x0A는 HWP 제어 문자)
        for para_segments in _split_multiline(segments):
            section.add_paragraph(para_segments)

    def _add_table(self, section: SectionBuilder, block: Block) -> None:
        table = block.table
        assert table is not None
        has_merge = any(
            cell.colspan != 1 or cell.rowspan != 1 for row in table.rows for cell in row
        )
        if not table.rows:
            return
        if has_merge:
            # 병합 셀 표 — 탭 구분 텍스트로 강등 (구분자는 공백으로 안전화)
            for line in block.to_plain_text().split("\n"):
                section.add_paragraph(
                    [(sanitize(line.replace("\t", "    ")), _run_key(InlineRun(text=" ")))]
                )
            self.warnings.append(
                f"병합 셀 표({block.id})는 HWP 바이너리에서 텍스트로 강등되었습니다. "
                "병합 표가 필요하면 HWPX 출력을 사용하세요."
            )
            return

        rows: list[list[list[Segment]]] = [
            [_runs_to_segments(cell.runs) for cell in row] for row in table.rows
        ]
        section.add_table(rows)

    # ── 스트림 조립 ───────────────────────────────────────────────────

    @staticmethod
    def _file_header() -> bytes:
        header = bytearray(256)
        signature = b"HWP Document File"
        header[0:len(signature)] = signature
        struct.pack_into("<I", header, 32, HWP_VERSION)
        struct.pack_into("<I", header, 36, 0x1)  # bit0 = 본문 압축
        return bytes(header)

    @staticmethod
    def _deflate(data: bytes) -> bytes:
        compressor = zlib.compressobj(9, zlib.DEFLATED, -15)
        return compressor.compress(data) + compressor.flush()

    @staticmethod
    def _preview_text(ir: DocumentIR) -> bytes:
        preview = sanitize(ir.plain_text().replace("\n", " "))[:1000]
        return preview.encode("utf-16-le")

    @staticmethod
    def _summary_info(title: str) -> bytes:
        """최소 \\x05HwpSummaryInformation — MS-OLEPS 속성 집합 (제목 하나)."""
        fmtid = uuid.UUID("9fa2b660-1061-11d4-b4c6-006097c09d8c").bytes_le
        # 속성 2개: 사전(PID 0 — 빈 사전, 파서들이 존재를 기대),
        # 제목(PID 2, VT_LPWSTR — u32 타입, u32 글자 수(널 포함), utf-16-le + 널, 4B 정렬)
        dict_value = struct.pack("<I", 0)  # 항목 0개 (사전은 타입 필드 없음)
        text = (title or "문서").encode("utf-16-le") + b"\x00\x00"
        text += b"\x00" * (-len(text) % 4)
        title_value = struct.pack("<II", 0x1F, len(text) // 2) + text
        header_size = 8 + 2 * 8  # 크기·개수 + (PID, 오프셋)×2
        values = dict_value + title_value
        propset = struct.pack(
            "<IIIIII",
            header_size + len(values), 2,
            0x00, header_size,                    # 사전
            0x02, header_size + len(dict_value),  # 제목
        ) + values
        header = (
            struct.pack("<HHI", 0xFFFE, 0, 0x00020105)  # 바이트 순서·버전·시스템
            + b"\x00" * 16                              # CLSID
            + struct.pack("<I", 1)                      # 속성 집합 수
            + fmtid
            + struct.pack("<I", 48)                     # 첫 집합 오프셋
        )
        assert len(header) == 48
        return header + propset


def _split_multiline(segments: list[Segment]) -> list[list[Segment]]:
    """세그먼트 안의 개행을 문단 경계로 변환."""
    paras: list[list[Segment]] = [[]]
    for text, key in segments:
        pieces = text.split("\n")
        for i, piece in enumerate(pieces):
            if i > 0:
                paras.append([])
            if piece:
                paras[-1].append((piece, key))
    return [p for p in paras if p] or [[]]
