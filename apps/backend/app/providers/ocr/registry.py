"""OCR provider 레지스트리 — LLM 패턴과 동일."""
from __future__ import annotations

from functools import lru_cache

from app.core.config import get_settings
from app.core.logging import get_logger
from app.providers.ocr.base import OcrProvider, OcrUnavailable
from app.providers.ocr.clova import ClovaOcrProvider
from app.providers.ocr.none import NoneOcrProvider
from app.providers.ocr.tesseract import TesseractOcrProvider

log = get_logger(__name__)


@lru_cache
def get_ocr_provider() -> OcrProvider:
    settings = get_settings()
    choice = getattr(settings, "ocr_provider", "none")
    try:
        if choice == "tesseract":
            p = TesseractOcrProvider.from_settings(settings)
            if not p.available:
                log.warning("Tesseract 미가용 → OCR 비활성")
                return NoneOcrProvider()
            return p
        if choice == "clova":
            return ClovaOcrProvider.from_settings(settings)
    except OcrUnavailable as e:
        log.warning("OCR provider 폴백 → none", choice=choice, error=str(e))
        return NoneOcrProvider()
    return NoneOcrProvider()


def reset_ocr_provider_cache() -> None:
    get_ocr_provider.cache_clear()
