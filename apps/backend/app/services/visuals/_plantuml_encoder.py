"""PlantUML 텍스트 인코더 — DEFLATE → 64자 알파벳 변환.

PlantUML 서버 URL 에 넣을 수 있는 형식. https://plantuml.com/text-encoding 참고.
온라인 fallback 전용 — 로컬 plantuml CLI 가 우선.
"""
from __future__ import annotations

import zlib


_PLANTUML_ALPHABET = (
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_"
)


def encode_plantuml(text: str) -> str:
    """PlantUML 텍스트 → URL-safe 인코딩."""
    compressed = zlib.compress(text.encode("utf-8"), 9)[2:-4]  # raw deflate (zlib header/checksum 제거)
    return _encode64(compressed)


def _encode64(data: bytes) -> str:
    """3바이트씩 → 4문자 (custom alphabet)."""
    result = []
    i = 0
    while i < len(data):
        b1 = data[i]
        b2 = data[i + 1] if i + 1 < len(data) else 0
        b3 = data[i + 2] if i + 2 < len(data) else 0
        result.append(_PLANTUML_ALPHABET[(b1 >> 2) & 0x3F])
        result.append(_PLANTUML_ALPHABET[((b1 & 0x3) << 4) | ((b2 >> 4) & 0xF)])
        result.append(_PLANTUML_ALPHABET[((b2 & 0xF) << 2) | ((b3 >> 6) & 0x3)])
        result.append(_PLANTUML_ALPHABET[b3 & 0x3F])
        i += 3
    return "".join(result)
