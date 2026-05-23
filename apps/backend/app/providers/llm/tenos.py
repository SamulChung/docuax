"""TenOS provider — 자체 LLM, vLLM(OpenAI 호환) 서빙."""
from __future__ import annotations

from app.core.config import Settings
from app.providers.llm._openai_compat import OpenAICompatibleProvider


class TenOSProvider(OpenAICompatibleProvider):
    """TenOS-Ko-28B (또는 후속 버전) — AI Hub K-AI 리더보드 8위.

    vLLM이 OpenAI 호환 endpoint를 제공하므로 OpenAICompatibleProvider를 상속.
    TenOS 모델이 v5, v6으로 올라가도 이 클래스를 그대로 사용 (모델 ID만 .env에서 변경).
    """

    name = "tenos"

    @classmethod
    def from_settings(cls, settings: Settings) -> "TenOSProvider":
        return cls(
            base_url=settings.tenos_base_url,
            api_key=settings.tenos_api_key,
            model=settings.tenos_model,
            timeout=settings.tenos_timeout_s,
        )
