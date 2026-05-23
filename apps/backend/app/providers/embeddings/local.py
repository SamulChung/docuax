"""로컬 임베딩 — sentence-transformers. 한국어 모델 기본.

폐쇄망 배포에서도 외부 호출 0건. 모델은 컨테이너에 사전 다운로드.
"""
from __future__ import annotations

import asyncio
from functools import cached_property
from typing import Any

from app.core.config import Settings
from app.providers.embeddings.base import EmbeddingProvider


class LocalEmbeddingProvider(EmbeddingProvider):
    name = "local"

    def __init__(self, model_name: str = "jhgan/ko-sroberta-multitask") -> None:
        self._model_name = model_name
        self._model: Any = None  # lazy

    @cached_property
    def _loaded_model(self) -> Any:
        # 무거운 import는 사용 시점까지 지연
        from sentence_transformers import SentenceTransformer

        return SentenceTransformer(self._model_name)

    @property
    def model_id(self) -> str:
        return f"local:{self._model_name}"

    @classmethod
    def from_settings(cls, settings: Settings) -> "LocalEmbeddingProvider":
        return cls(model_name=settings.embedding_model)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        # sentence-transformers는 동기 — thread executor에서 실행
        loop = asyncio.get_running_loop()
        vectors = await loop.run_in_executor(
            None, lambda: self._loaded_model.encode(texts, normalize_embeddings=True)
        )
        return [v.tolist() for v in vectors]
