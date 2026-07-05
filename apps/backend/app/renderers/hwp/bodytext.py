"""HWP 5.0 BodyText/Section0 스트림 빌더.

문단 = PARA_HEADER(레벨 n) + PARA_TEXT/PARA_CHAR_SHAPE/PARA_LINE_SEG(레벨 n+1)
+ 컨트롤이 있으면 CTRL_HEADER(레벨 n+1)와 그 자식들.

첫 문단은 구역 정의(secd)·단 정의(cold) 확장 컨트롤을 반드시 포함한다.
표는 0x0B 앵커 문자 + 'tbl ' CTRL_HEADER + HWPTAG_TABLE + 셀별 LIST_HEADER로 직렬화.
레이아웃은 pyhwp binmodel(실파일 기준) 기준 — 상세는 docinfo.py 주석 참고.
"""
from __future__ import annotations

import re
import struct
from dataclasses import dataclass, field

from app.renderers.hwp.docinfo import DEFAULT_KEY, CharShapeKey, DocInfoBuilder
from app.renderers.hwp.records import (
    HWPTAG_CTRL_HEADER,
    HWPTAG_FOOTNOTE_SHAPE,
    HWPTAG_LIST_HEADER,
    HWPTAG_PAGE_BORDER_FILL,
    HWPTAG_PAGE_DEF,
    HWPTAG_PARA_CHAR_SHAPE,
    HWPTAG_PARA_HEADER,
    HWPTAG_PARA_LINE_SEG,
    HWPTAG_PARA_TEXT,
    HWPTAG_TABLE,
    record,
)

# A4 세로, HWPUNIT (1pt = 100)
PAGE_WIDTH = 59528
PAGE_HEIGHT = 84188
MARGIN_LR = 8504
MARGIN_TOP = 5668
MARGIN_BOTTOM = 4252
MARGIN_HEADER = 4252
MARGIN_FOOTER = 4252
TEXT_WIDTH = PAGE_WIDTH - 2 * MARGIN_LR  # 42520

_CTRL_PARA_BREAK = "\r"  # 0x0D — 문단 끝
_SANITIZE_RE = re.compile("[\x00-\x1f]")

Segment = tuple[str, CharShapeKey]  # (텍스트, 글자모양 키)


def sanitize(text: str) -> str:
    """제어 문자(0x00~0x1F)를 공백으로 — HWP 텍스트에서 특수 의미를 가지므로 제거."""
    return _SANITIZE_RE.sub(" ", text)


def _ext_ctrl_char(code: int, chid: str) -> bytes:
    """확장 컨트롤 문자 — 8 wchar: [code][chid 4B 역순][예약 8B][code]."""
    chid_bytes = chid.encode("ascii")[::-1]
    return struct.pack("<H", code) + chid_bytes + b"\x00" * 8 + struct.pack("<H", code)


def _chid_bytes(chid: str) -> bytes:
    return chid.encode("ascii")[::-1]


@dataclass
class _Para:
    segments: list[Segment] = field(default_factory=list)
    prefix_ctrl_text: bytes = b""  # 확장 컨트롤 문자들 (utf-16-le 단위)
    ctrl_records: list[bytes] = field(default_factory=list)  # 직렬화된 CTRL_HEADER+자식
    ctrl_mask: int = 0  # 문단 내 컨트롤 문자 비트마스크 (1<<코드)


class SectionBuilder:
    """블록을 문단으로 쌓고 build()에서 Section0 바이트를 조립."""

    def __init__(self, docinfo: DocInfoBuilder) -> None:
        self.docinfo = docinfo
        self._paras: list[_Para] = []
        self._instance_id = 0x0AD0_0000

    def _next_instance_id(self) -> int:
        self._instance_id += 1
        return self._instance_id

    # ── 공개 API ──────────────────────────────────────────────────────

    def add_paragraph(self, segments: list[Segment]) -> None:
        clean = [(sanitize(t), key) for t, key in segments if t]
        self._paras.append(_Para(segments=clean))

    def add_table(self, rows: list[list[list[Segment]]]) -> None:
        """rows[r][c] = 셀 문단 세그먼트 목록. 병합 없는 기본 표만."""
        n_rows = len(rows)
        n_cols = max(len(r) for r in rows)
        para = _Para(
            prefix_ctrl_text=_ext_ctrl_char(0x0B, "tbl "),
            ctrl_records=self._table_ctrl_records(rows, n_rows, n_cols),
            ctrl_mask=1 << 0x0B,
        )
        self._paras.append(para)

    def build(self) -> bytes:
        paras = self._paras or [_Para()]
        # 첫 문단에 구역·단 정의 컨트롤 주입
        first = paras[0]
        first.prefix_ctrl_text = (
            _ext_ctrl_char(0x02, "secd") + _ext_ctrl_char(0x02, "cold")
            + first.prefix_ctrl_text
        )
        first.ctrl_records = self._section_ctrl_records() + first.ctrl_records
        first.ctrl_mask |= 1 << 0x02

        return b"".join(self._emit_paragraph(p, level=0) for p in paras)

    # ── 문단 직렬화 ───────────────────────────────────────────────────

    def _emit_paragraph(self, para: _Para, level: int) -> bytes:
        segments = para.segments or [("", DEFAULT_KEY)]

        text = bytearray(para.prefix_ctrl_text)
        char_shapes: list[tuple[int, int]] = []
        pos = len(para.prefix_ctrl_text) // 2
        for i, (seg_text, key) in enumerate(segments):
            shape_id = self.docinfo.char_shape_id(key)
            # 첫 글자모양은 컨트롤 접두부까지 커버 — 항상 위치 0
            shape_pos = 0 if i == 0 else pos
            if not char_shapes or char_shapes[-1][1] != shape_id:
                char_shapes.append((shape_pos, shape_id))
            text.extend(seg_text.encode("utf-16-le"))
            pos += len(seg_text)
        text.extend(_CTRL_PARA_BREAK.encode("utf-16-le"))
        n_chars = len(text) // 2

        header = struct.pack(
            "<IIHBBHHHI",
            n_chars,
            para.ctrl_mask,
            0,                    # 문단 모양 ID
            0,                    # 스타일 ID
            0,                    # 단 나누기 종류
            len(char_shapes),
            0,                    # range tag 수
            1,                    # line seg 수
            self._next_instance_id(),
        )

        parts = [record(HWPTAG_PARA_HEADER, level, header)]
        parts.append(record(HWPTAG_PARA_TEXT, level + 1, bytes(text)))
        shape_payload = b"".join(struct.pack("<II", p, s) for p, s in char_shapes)
        parts.append(record(HWPTAG_PARA_CHAR_SHAPE, level + 1, shape_payload))
        parts.append(record(HWPTAG_PARA_LINE_SEG, level + 1, self._line_seg()))
        parts.extend(para.ctrl_records)
        return b"".join(parts)

    @staticmethod
    def _line_seg() -> bytes:
        # chpos, y, 높이, 텍스트 높이, 베이스라인, 아래 간격, x, 너비, 플래그
        return struct.pack(
            "<8iI",
            0, 0, 1000, 1000, 850, 600, 0, TEXT_WIDTH,
            0x00060000,  # 줄 시작(비트17)·줄 끝(비트18)
        )

    # ── 구역/단 정의 컨트롤 ───────────────────────────────────────────

    def _section_ctrl_records(self) -> list[bytes]:
        secd = _chid_bytes("secd") + struct.pack(
            "<I3HI5H2I",
            0,          # 속성
            1134,       # 단 간격
            0, 0,       # 세로·가로 격자
            8000,       # 기본 탭 간격
            0,          # 번호 문단 모양 ID
            0, 0, 0, 0,  # 시작 번호(쪽·그림·표·수식) — 0 = 이어짐
            0, 0,       # unknown (5.0.1.7+)
        )
        page_def = struct.pack(
            "<10I",
            PAGE_WIDTH, PAGE_HEIGHT,
            MARGIN_LR, MARGIN_LR, MARGIN_TOP, MARGIN_BOTTOM,
            MARGIN_HEADER, MARGIN_FOOTER, 0,
            0,  # 속성 — 세로(narrowly portrait)
        )
        footnote_shape = struct.pack(
            "<I4H5HBBI",
            0,                   # 속성
            0, 0, 0x002E,        # 사용자 기호·앞 장식·뒤 장식('.')
            1,                   # 시작 번호
            0, 0, 850, 567, 283,  # 구분선 길이·? ·위 여백·아래 여백·주석 간 간격
            1, 0,                # 구분선 종류(실선)·굵기
            0,                   # 구분선 색
        )
        page_border_fill = struct.pack(
            "<I4HH",
            1,                       # 속성 — 종이 기준
            1417, 1417, 1417, 1417,  # 여백
            1,                       # 테두리/배경 ID (1-기반)
        )
        cold = _chid_bytes("cold") + struct.pack(
            "<HHH", 0x1004, 0, 0  # 단 1개·같은 너비 | 간격 | attr2
        ) + struct.pack("<BBI", 0, 0, 0)  # 구분선 Border

        return [
            record(HWPTAG_CTRL_HEADER, 1, secd),
            record(HWPTAG_PAGE_DEF, 2, page_def),
            record(HWPTAG_FOOTNOTE_SHAPE, 2, footnote_shape),
            record(HWPTAG_FOOTNOTE_SHAPE, 2, footnote_shape),
            record(HWPTAG_PAGE_BORDER_FILL, 2, page_border_fill),
            record(HWPTAG_PAGE_BORDER_FILL, 2, page_border_fill),
            record(HWPTAG_PAGE_BORDER_FILL, 2, page_border_fill),
            record(HWPTAG_CTRL_HEADER, 1, cold),
        ]

    # ── 표 ────────────────────────────────────────────────────────────

    def _table_ctrl_records(
        self, rows: list[list[list[Segment]]], n_rows: int, n_cols: int
    ) -> list[bytes]:
        row_height = 1300
        cell_width = TEXT_WIDTH // n_cols
        table_height = row_height * n_rows

        # 개체 공통 속성 (표 64) — 글자처럼 취급, 절대 크기
        common = _chid_bytes("tbl ") + struct.pack(
            "<IiiIIhh4HIh",
            (1 << 0) | (4 << 15) | (2 << 18),  # 글자처럼 | 너비 절대 | 높이 절대
            0, 0,                              # y·x 오프셋
            TEXT_WIDTH, table_height,
            0, 0,                              # z-order·unknown
            0, 0, 0, 0,                        # 바깥 여백
            self._next_instance_id(),
            0,                                 # unknown2 (5.0.0.5+)
        ) + struct.pack("<H", 0)               # 설명문 BSTR(빈 문자열)

        # 표 개체 속성 (표 70)
        body = struct.pack(
            "<IHHH4H",
            1,             # 쪽 경계에서 셀 단위 나눔
            n_rows, n_cols,
            0,             # 셀 간격
            141, 141, 141, 141,  # 안쪽 여백
        )
        body += struct.pack(f"<{n_rows}H", *([n_cols] * n_rows))  # 행별 셀 수
        body += struct.pack("<H", 1)   # 테두리/배경 ID (1-기반)
        body += struct.pack("<H", 0)   # 영역 속성 수 (5.0.0.7+)

        parts = [
            record(HWPTAG_CTRL_HEADER, 1, common),
            record(HWPTAG_TABLE, 2, body),
        ]

        for r, row in enumerate(rows):
            for c in range(n_cols):
                cell_segments = row[c] if c < len(row) else []
                cell_paras: list[list[Segment]] = [cell_segments] if cell_segments else [[]]
                list_header = struct.pack(
                    "<HHI",
                    len(cell_paras),  # 문단 수
                    0,                # unknown
                    0x20,             # 세로 가운데 정렬
                ) + struct.pack(
                    "<4HiI4HHi",
                    c, r, 1, 1,                 # 주소·병합 없음
                    cell_width, row_height,
                    141, 141, 141, 141,         # 셀 안 여백
                    1,                          # 테두리/배경 ID (1-기반)
                    cell_width,
                )
                parts.append(record(HWPTAG_LIST_HEADER, 2, list_header))
                for cp in cell_paras:
                    clean = [(sanitize(t), key) for t, key in cp if t]
                    parts.append(self._emit_paragraph(_Para(segments=clean), level=3))
        return parts
