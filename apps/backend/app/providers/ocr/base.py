"""OCR Provider 베이스 — 스캔 이미지·PDF에서 한국어 텍스트 추출."""
from __future__ import annotations

import abc

from pydantic import BaseModel, Field


class OcrPage(BaseModel):
    """한 페이지(또는 이미지 한 장)의 OCR 결과."""

    page_index: int = 0
    text: str = ""
    confidence: float = 0.0  # 평균 신뢰도 0.0~1.0
    warnings: list[str] = Field(default_factory=list)


class OcrResult(BaseModel):
    pages: list[OcrPage] = Field(default_factory=list)
    provider: str = ""
    total_chars: int = 0

    @property
    def text(self) -> str:
        return "\n\n".join(p.text for p in self.pages if p.text.strip())


class OcrUnavailable(Exception):
    """OCR provider 비가용 — 호출자는 다른 폴백을 시도."""


class OcrProvider(abc.ABC):
    name: str = "base"
    available: bool = False  # 환경에 따라 동적으로 결정

    @abc.abstractmethod
    async def ocr_pdf(self, content: bytes, *, lang: str = "kor+eng") -> OcrResult:
        """PDF 바이트를 받아 페이지별 OCR. 텍스트 추출이 가능한 PDF든 스캔이든 무관하게 전체 OCR."""

    @abc.abstractmethod
    async def ocr_image(self, content: bytes, *, lang: str = "kor+eng") -> OcrResult:
        """PNG/JPG 등 이미지 바이트 → 텍스트."""

    @classmethod
    @abc.abstractmethod
    def from_settings(cls, settings) -> "OcrProvider": ...
