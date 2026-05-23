"""Tesseract OCR provider — 로컬 바이너리.

요구 사항:
- 시스템에 Tesseract 5.x 설치 (Windows: https://github.com/UB-Mannheim/tesseract/wiki)
- Korean 언어 데이터 (kor.traineddata) 설치
- Python: pip install pytesseract pdf2image
- pdf2image는 poppler 바이너리 필요 (Windows: poppler-windows)

`OCR_TESSERACT_CMD` 환경변수로 tesseract.exe 경로 직접 지정 가능.
"""
from __future__ import annotations

import asyncio
import shutil
from io import BytesIO

from app.core.logging import get_logger
from app.providers.ocr.base import OcrPage, OcrProvider, OcrResult, OcrUnavailable

log = get_logger(__name__)


class TesseractOcrProvider(OcrProvider):
    name = "tesseract"

    def __init__(self, *, cmd: str | None = None) -> None:
        self._cmd = cmd
        self._check_available()

    def _check_available(self) -> None:
        try:
            import pytesseract  # noqa: F401
        except ImportError:
            self.available = False
            return
        cmd = self._cmd or shutil.which("tesseract")
        if not cmd:
            self.available = False
            return
        try:
            import pytesseract
            pytesseract.pytesseract.tesseract_cmd = cmd
            # 버전 호출이 성공해야 가용
            pytesseract.get_tesseract_version()
            self.available = True
        except Exception as e:  # noqa: BLE001
            log.warning("Tesseract 가용성 확인 실패", error=str(e))
            self.available = False

    @classmethod
    def from_settings(cls, settings) -> "TesseractOcrProvider":
        cmd = getattr(settings, "ocr_tesseract_cmd", "") or None
        return cls(cmd=cmd)

    def _ensure(self) -> None:
        if not self.available:
            raise OcrUnavailable("Tesseract 미설치 또는 한국어 언어팩 누락")

    async def ocr_pdf(self, content: bytes, *, lang: str = "kor+eng") -> OcrResult:
        self._ensure()
        return await asyncio.to_thread(self._ocr_pdf_sync, content, lang)

    async def ocr_image(self, content: bytes, *, lang: str = "kor+eng") -> OcrResult:
        self._ensure()
        return await asyncio.to_thread(self._ocr_image_sync, content, lang)

    # ── 동기 구현 ──

    def _ocr_pdf_sync(self, content: bytes, lang: str) -> OcrResult:
        try:
            from pdf2image import convert_from_bytes
        except ImportError as e:
            raise OcrUnavailable(f"pdf2image 미설치: {e}") from e

        try:
            images = convert_from_bytes(content, dpi=200)
        except Exception as e:  # noqa: BLE001
            # poppler 미설치 등
            raise OcrUnavailable(f"PDF → 이미지 변환 실패 (poppler 미설치 가능): {e}") from e

        import pytesseract

        pages: list[OcrPage] = []
        for i, img in enumerate(images):
            try:
                text = pytesseract.image_to_string(img, lang=lang)
                pages.append(OcrPage(page_index=i, text=text.strip(), confidence=0.85))
            except Exception as e:  # noqa: BLE001
                pages.append(
                    OcrPage(
                        page_index=i, text="", confidence=0.0,
                        warnings=[f"{i + 1}쪽 OCR 실패: {e}"],
                    )
                )
        return OcrResult(
            pages=pages, provider=self.name,
            total_chars=sum(len(p.text) for p in pages),
        )

    def _ocr_image_sync(self, content: bytes, lang: str) -> OcrResult:
        from PIL import Image
        import pytesseract

        img = Image.open(BytesIO(content))
        text = pytesseract.image_to_string(img, lang=lang)
        page = OcrPage(page_index=0, text=text.strip(), confidence=0.85)
        return OcrResult(pages=[page], provider=self.name, total_chars=len(text))
