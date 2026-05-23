"""No-op OCR provider — 기본값. OCR 비활성."""
from __future__ import annotations

from app.providers.ocr.base import OcrProvider, OcrResult


class NoneOcrProvider(OcrProvider):
    name = "none"
    available = True

    async def ocr_pdf(self, content: bytes, *, lang: str = "kor+eng") -> OcrResult:  # noqa: ARG002
        return OcrResult(provider="none")

    async def ocr_image(self, content: bytes, *, lang: str = "kor+eng") -> OcrResult:  # noqa: ARG002
        return OcrResult(provider="none")

    @classmethod
    def from_settings(cls, settings) -> "NoneOcrProvider":  # noqa: ARG003
        return cls()
