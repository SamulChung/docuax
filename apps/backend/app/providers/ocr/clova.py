"""NAVER CLOVA OCR provider — 한국어 정확도 최상.

요구 사항:
- NAVER Cloud Platform에서 CLOVA OCR Domain 생성
- Invoke URL + Secret Key 발급
- 환경변수: CLOVA_OCR_URL, CLOVA_OCR_SECRET

참고: https://api.ncloud-docs.com/docs/ai-application-service-ocr-ocr
"""
from __future__ import annotations

import asyncio
import base64
import json
import time
import uuid
from io import BytesIO

import httpx

from app.core.logging import get_logger
from app.providers.ocr.base import OcrPage, OcrProvider, OcrResult, OcrUnavailable

log = get_logger(__name__)


class ClovaOcrProvider(OcrProvider):
    name = "clova"

    def __init__(self, *, url: str, secret: str, timeout: float = 60.0) -> None:
        self._url = url.rstrip("/")
        self._secret = secret
        self._timeout = timeout
        self.available = bool(url and secret)

    @classmethod
    def from_settings(cls, settings) -> "ClovaOcrProvider":
        url = getattr(settings, "clova_ocr_url", "") or ""
        secret = getattr(settings, "clova_ocr_secret", "") or ""
        if not url or not secret:
            raise OcrUnavailable("CLOVA_OCR_URL / CLOVA_OCR_SECRET 미설정")
        return cls(url=url, secret=secret, timeout=settings.tenos_timeout_s)

    def _build_message(self, *, image_b64: str, fmt: str) -> dict:
        return {
            "version": "V2",
            "requestId": uuid.uuid4().hex,
            "timestamp": int(time.time() * 1000),
            "images": [
                {
                    "format": fmt,  # "jpg", "png", "pdf"
                    "name": "doc",
                    "data": image_b64,
                }
            ],
        }

    async def _call(self, image_b64: str, fmt: str) -> dict:
        msg = self._build_message(image_b64=image_b64, fmt=fmt)
        headers = {
            "X-OCR-SECRET": self._secret,
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                r = await client.post(self._url, headers=headers, content=json.dumps(msg))
            if r.status_code >= 400:
                raise OcrUnavailable(f"CLOVA OCR HTTP {r.status_code}: {r.text[:200]}")
            return r.json()
        except httpx.HTTPError as e:
            raise OcrUnavailable(f"CLOVA OCR 네트워크: {e}") from e

    @staticmethod
    def _parse(resp: dict) -> OcrResult:
        pages: list[OcrPage] = []
        images = resp.get("images", [])
        for i, img in enumerate(images):
            fields = img.get("fields", [])
            text_parts: list[str] = []
            confidences: list[float] = []
            for f in fields:
                text_parts.append(f.get("inferText", ""))
                conf = f.get("inferConfidence")
                if isinstance(conf, (int, float)):
                    confidences.append(float(conf))
                if f.get("lineBreak"):
                    text_parts.append("\n")
                else:
                    text_parts.append(" ")
            full = "".join(text_parts).strip()
            pages.append(
                OcrPage(
                    page_index=i,
                    text=full,
                    confidence=(sum(confidences) / len(confidences)) if confidences else 0.0,
                )
            )
        return OcrResult(
            pages=pages, provider="clova",
            total_chars=sum(len(p.text) for p in pages),
        )

    async def ocr_pdf(self, content: bytes, *, lang: str = "kor+eng") -> OcrResult:  # noqa: ARG002
        # CLOVA는 PDF 직접 업로드 지원 (format='pdf')
        b64 = base64.b64encode(content).decode("ascii")
        resp = await self._call(b64, "pdf")
        return self._parse(resp)

    async def ocr_image(self, content: bytes, *, lang: str = "kor+eng") -> OcrResult:  # noqa: ARG002
        # 포맷 자동 감지 (PNG/JPG)
        fmt = "png" if content[:8].startswith(b"\x89PNG") else "jpg"
        b64 = base64.b64encode(content).decode("ascii")
        resp = await self._call(b64, fmt)
        return self._parse(resp)
