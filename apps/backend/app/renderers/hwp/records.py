"""HWP 5.0 레코드 인코딩.

레코드 헤더는 u32 하나: tag(비트 0~9) | level(비트 10~19) | size(비트 20~31).
size가 0xFFF이면 바로 뒤에 확장 u32 크기가 따라온다.
"""
from __future__ import annotations

import struct
from collections.abc import Iterator

HWPTAG_BEGIN = 0x10

# ── DocInfo 레코드 ────────────────────────────────────────────────────
HWPTAG_DOCUMENT_PROPERTIES = HWPTAG_BEGIN + 0
HWPTAG_ID_MAPPINGS = HWPTAG_BEGIN + 1
HWPTAG_BIN_DATA = HWPTAG_BEGIN + 2
HWPTAG_FACE_NAME = HWPTAG_BEGIN + 3
HWPTAG_BORDER_FILL = HWPTAG_BEGIN + 4
HWPTAG_CHAR_SHAPE = HWPTAG_BEGIN + 5
HWPTAG_TAB_DEF = HWPTAG_BEGIN + 6
HWPTAG_NUMBERING = HWPTAG_BEGIN + 7
HWPTAG_BULLET = HWPTAG_BEGIN + 8
HWPTAG_PARA_SHAPE = HWPTAG_BEGIN + 9
HWPTAG_STYLE = HWPTAG_BEGIN + 10

# ── BodyText 레코드 ───────────────────────────────────────────────────
HWPTAG_PARA_HEADER = HWPTAG_BEGIN + 50
HWPTAG_PARA_TEXT = HWPTAG_BEGIN + 51
HWPTAG_PARA_CHAR_SHAPE = HWPTAG_BEGIN + 52
HWPTAG_PARA_LINE_SEG = HWPTAG_BEGIN + 53
HWPTAG_PARA_RANGE_TAG = HWPTAG_BEGIN + 54
HWPTAG_CTRL_HEADER = HWPTAG_BEGIN + 55
HWPTAG_LIST_HEADER = HWPTAG_BEGIN + 56
HWPTAG_PAGE_DEF = HWPTAG_BEGIN + 57
HWPTAG_FOOTNOTE_SHAPE = HWPTAG_BEGIN + 58
HWPTAG_PAGE_BORDER_FILL = HWPTAG_BEGIN + 59
HWPTAG_SHAPE_COMPONENT = HWPTAG_BEGIN + 60
HWPTAG_TABLE = HWPTAG_BEGIN + 61

_MAX_INLINE_SIZE = 0xFFF


def record(tag: int, level: int, payload: bytes) -> bytes:
    """레코드 헤더 + 페이로드를 직렬화."""
    size = len(payload)
    if size < _MAX_INLINE_SIZE:
        header = struct.pack("<I", (tag & 0x3FF) | ((level & 0x3FF) << 10) | (size << 20))
        return header + payload
    header = struct.pack(
        "<II", (tag & 0x3FF) | ((level & 0x3FF) << 10) | (_MAX_INLINE_SIZE << 20), size
    )
    return header + payload


def iter_records(data: bytes) -> Iterator[tuple[int, int, bytes]]:
    """(tag, level, payload) 시퀀스로 파싱. 잘린 레코드는 ValueError."""
    off = 0
    total = len(data)
    while off < total:
        if off + 4 > total:
            raise ValueError(f"레코드 헤더 잘림 (offset {off})")
        (header,) = struct.unpack_from("<I", data, off)
        off += 4
        tag = header & 0x3FF
        level = (header >> 10) & 0x3FF
        size = (header >> 20) & 0xFFF
        if size == _MAX_INLINE_SIZE:
            if off + 4 > total:
                raise ValueError(f"확장 크기 잘림 (offset {off})")
            (size,) = struct.unpack_from("<I", data, off)
            off += 4
        if off + size > total:
            raise ValueError(f"레코드 페이로드 잘림 (tag {tag:#x}, offset {off})")
        yield tag, level, data[off:off + size]
        off += size
