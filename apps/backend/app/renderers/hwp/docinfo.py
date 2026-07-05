"""HWP 5.0 DocInfo 스트림 빌더.

레코드 레이아웃은 한컴 공개 스펙 + pyhwp binmodel(실파일 기준 정정, DIFFSPEC 반영)을 따른다:
- CharShape는 68바이트 — 스펙의 borderFillId/strikeoutColor는 실파일에 없음 (DIFFSPEC)
- ParaShape는 flags2까지 46바이트 — 스펙의 flags3/lineSpacing u32도 실파일에 없음
- TabDef의 탭 개수는 u32 (N_ARRAY)
- ID_MAPPINGS는 5.0.1.7+ 기준 16개 카운트 (memoshapes 포함, 변경추적 2종 제외)
"""
from __future__ import annotations

import struct

from app.renderers.hwp.records import (
    HWPTAG_BORDER_FILL,
    HWPTAG_CHAR_SHAPE,
    HWPTAG_DOCUMENT_PROPERTIES,
    HWPTAG_FACE_NAME,
    HWPTAG_ID_MAPPINGS,
    HWPTAG_PARA_SHAPE,
    HWPTAG_STYLE,
    HWPTAG_TAB_DEF,
    record,
)

DEFAULT_FONT = "함초롬바탕"
DEFAULT_FONT_SIZE_PT = 10.0
N_LANGS = 7  # 한글·영어·한자·일어·기타·기호·사용자

# (bold, italic, underline, size_pt)
CharShapeKey = tuple[bool, bool, bool, float]
DEFAULT_KEY: CharShapeKey = (False, False, False, DEFAULT_FONT_SIZE_PT)


def _bstr(text: str) -> bytes:
    """u16 글자 수 + utf-16-le 본문 (HWP BSTR)."""
    encoded = text.encode("utf-16-le")
    return struct.pack("<H", len(encoded) // 2) + encoded


class DocInfoBuilder:
    """사용된 글자 모양을 수집하고 DocInfo 스트림 바이트를 조립한다."""

    def __init__(self) -> None:
        self._char_shapes: dict[CharShapeKey, int] = {DEFAULT_KEY: 0}
        self._built = False

    def char_shape_id(self, key: CharShapeKey) -> int:
        # 빌드 순서 계약: BodyText 먼저(글자 모양 등록), 그다음 DocInfo.build().
        # build() 후 새 모양이 등록되면 ID_MAPPINGS 카운트와 어긋나 파일이 깨진다.
        if self._built:
            raise RuntimeError(
                "DocInfoBuilder.build() 이후에는 char_shape_id()를 호출할 수 없음 "
                "— BodyText를 먼저 조립하세요"
            )
        cid = self._char_shapes.get(key)
        if cid is None:
            cid = len(self._char_shapes)
            self._char_shapes[key] = cid
        return cid

    @property
    def char_shape_count(self) -> int:
        return len(self._char_shapes)

    # ── 레코드 페이로드 ────────────────────────────────────────────────

    @staticmethod
    def _document_properties(section_count: int) -> bytes:
        # u16 구역 수, u16×6 시작 번호(쪽·각주·미주·그림·표·수식), u32×3 캐럿 위치
        return struct.pack("<7H3I", section_count, 1, 1, 1, 1, 1, 1, 0, 0, 0)

    def _id_mappings(self) -> bytes:
        counts = [
            0,                          # 바이너리 데이터
            *([1] * N_LANGS),           # 언어별 글꼴 (각 1종)
            1,                          # 테두리/배경
            self.char_shape_count,      # 글자 모양
            1,                          # 탭 정의
            0,                          # 문단 번호
            0,                          # 글머리표
            1,                          # 문단 모양
            1,                          # 스타일
            0,                          # 메모 모양 (5.0.1.7+)
        ]
        return struct.pack(f"<{len(counts)}I", *counts)

    @staticmethod
    def _face_name() -> bytes:
        # 속성 u8 (0 = 대체글꼴/유형정보/기본글꼴 없음) + BSTR 이름
        return struct.pack("<B", 0) + _bstr(DEFAULT_FONT)

    @staticmethod
    def _border_fill() -> bytes:
        # u16 속성 + 테두리 5개(좌·우·상·하·대각 — 각 u8 종류, u8 굵기, u32 색) + u32 채우기(0=없음)
        border = struct.pack("<BBI", 0, 0, 0)
        return struct.pack("<H", 0) + border * 5 + struct.pack("<I", 0)

    @staticmethod
    def _char_shape(key: CharShapeKey) -> bytes:
        bold, italic, underline, size_pt = key
        attr = (1 if italic else 0) | ((1 if bold else 0) << 1)
        if underline:
            attr |= 1 << 2  # 밑줄 종류 = 글자 아래
        return b"".join([
            struct.pack(f"<{N_LANGS}H", *([0] * N_LANGS)),      # 언어별 글꼴 ID
            struct.pack(f"<{N_LANGS}B", *([100] * N_LANGS)),    # 장평 %
            struct.pack(f"<{N_LANGS}b", *([0] * N_LANGS)),      # 자간 %
            struct.pack(f"<{N_LANGS}b", *([100] * N_LANGS)),    # 상대 크기 %
            struct.pack(f"<{N_LANGS}b", *([0] * N_LANGS)),      # 글자 위치 %
            struct.pack("<i", int(round(size_pt * 100))),       # 기준 크기 (pt×100)
            struct.pack("<I", attr),                            # 속성
            struct.pack("<bb", 10, 10),                         # 그림자 간격 x·y
            struct.pack("<I", 0x000000),                        # 글자 색
            struct.pack("<I", 0x000000),                        # 밑줄 색
            struct.pack("<I", 0xFFFFFFFF),                      # 음영 색 (없음)
            struct.pack("<I", 0xB2B2B2),                        # 그림자 색
        ])

    @staticmethod
    def _tab_def() -> bytes:
        # u32 속성 + u32 탭 개수(0)
        return struct.pack("<II", 0, 0)

    @staticmethod
    def _para_shape() -> bytes:
        # 속성1 + 여백(좌·우·들여쓰기·위·아래) + 줄간격 + 탭/번호/테두리 ID
        # + 테두리 간격 4개 + 속성2 (5.0.1.7+)
        return struct.pack(
            "<I5iiHHH4HI",
            0,            # 속성1 — 줄간격 비율·양쪽 정렬
            0, 0, 0, 0, 0,  # 여백·들여쓰기
            160,          # 줄간격 160%
            0,            # 탭 정의 ID
            0,            # 번호/글머리 ID
            0,            # 테두리/배경 ID (0 = 없음)
            0, 0, 0, 0,   # 테두리 간격
            0,            # 속성2
        )

    @staticmethod
    def _style() -> bytes:
        return b"".join([
            _bstr("바탕글"),
            _bstr("Normal"),
            struct.pack("<BB", 0, 0),   # 종류(문단)·다음 스타일 ID
            struct.pack("<h", 0x0412),  # 언어 (한국어)
            struct.pack("<HH", 0, 0),   # 문단 모양 ID·글자 모양 ID
            struct.pack("<H", 0),       # unknown (실파일 존재 필드)
        ])

    # ── 조립 ──────────────────────────────────────────────────────────

    def build(self, section_count: int = 1) -> bytes:
        self._built = True
        parts = [
            record(HWPTAG_DOCUMENT_PROPERTIES, 0, self._document_properties(section_count)),
            record(HWPTAG_ID_MAPPINGS, 0, self._id_mappings()),
        ]
        for _ in range(N_LANGS):
            parts.append(record(HWPTAG_FACE_NAME, 1, self._face_name()))
        parts.append(record(HWPTAG_BORDER_FILL, 1, self._border_fill()))
        for key, _cid in sorted(self._char_shapes.items(), key=lambda kv: kv[1]):
            parts.append(record(HWPTAG_CHAR_SHAPE, 1, self._char_shape(key)))
        parts.append(record(HWPTAG_TAB_DEF, 1, self._tab_def()))
        parts.append(record(HWPTAG_PARA_SHAPE, 1, self._para_shape()))
        parts.append(record(HWPTAG_STYLE, 1, self._style()))
        return b"".join(parts)
