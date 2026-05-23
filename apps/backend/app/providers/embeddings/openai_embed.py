"""OpenAI 임베딩 — text-embedding-3-small/large."""
from __future__ import annotations

import asyncio

from openai import APIConnectionError, APIError, AsyncOpenAI

from app.core.config import Settings
from app.providers.embeddings.base import EmbeddingProvider
from app.providers.llm.base import ProviderConfigError, ProviderUnavailable


class OpenAIEmbeddingProvider(EmbeddingProvider):
    name = "openai"

    def __init__(self, *, api_key: str, base_url: str, model: str = "text-embedding-3-small") -> None:
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model

    @property
    def model_id(self) -> str:
        return f"openai:{self._model}"

    @classmethod
    def from_settings(cls, settings: Settings) -> "OpenAIEmbeddingProvider":
        if settings.on_premise:
            raise ProviderConfigError("OpenAI 임베딩은 on-premise 모드에서 비활성")
        if not settings.openai_api_key:
            raise ProviderConfigError("OPENAI_API_KEY 미설정")
        return cls(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
            model=settings.embedding_model or "text-embedding-3-small",
        )

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        try:
            resp = await self._client.embeddings.create(model=self._model, input=texts)
            return [d.embedding for d in resp.data]
        except (APIConnectionError, asyncio.TimeoutError) as e:
            raise ProviderUnavailable(self.name, f"network: {e}") from e
        except APIError as e:
            raise ProviderUnavailable(self.name, f"api: {e}") from e
