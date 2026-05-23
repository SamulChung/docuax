"""OCR provider 어댑터 — LLM과 동일 패턴.

설정으로 교체 가능: `OCR_PROVIDER` 환경변수
  - none      OCR 비활성 (기본)
  - tesseract 로컬 Tesseract 바이너리 (`tesseract.exe` PATH 필요)
  - clova     NAVER CLOVA OCR API (URL + SECRET 필요)
"""
from app.providers.ocr.base import OcrPage, OcrProvider, OcrResult
from app.providers.ocr.registry import get_ocr_provider

__all__ = ["OcrPage", "OcrProvider", "OcrResult", "get_ocr_provider"]
