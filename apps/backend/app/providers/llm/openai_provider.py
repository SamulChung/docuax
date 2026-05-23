"""OpenAI provider — 백업·개발용. ON_PREMISE=true 환경에서는 자동 비활성."""
from __future__ import annotations

from app.core.config import Settings
from app.providers.llm._openai_compat import OpenAICompatibleProvider
from app.providers.llm.base import ProviderConfigError


class OpenAIProvider(OpenAICompatibleProvider):
    name = "openai"

    @classmethod
    def from_settings(cls, settings: Settings) -> "OpenAIProvider":
        if settings.on_premise:
            raise ProviderConfigError(
                "OpenAI provider는 on-premise 모드에서 비활성. LLM_PROVIDER=tenos 사용 권장"
            )
        if not settings.openai_api_key:
            raise ProviderConfigError("OPENAI_API_KEY 미설정")
        return cls(
            base_url=settings.openai_base_url,
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            timeout=60.0,
        )
