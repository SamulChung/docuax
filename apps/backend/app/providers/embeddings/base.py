"""임베딩 추상화 — RAG의 두뇌도 LLM 두뇌와 분리해서 교체 가능."""
from __future__ import annotations

import abc


class EmbeddingProvider(abc.ABC):
    name: str = "base"
    dim: int = 0  # 벡터 차원

    @property
    @abc.abstractmethod
    def model_id(self) -> str: ...

    @abc.abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """문서·쿼리 임베딩. 입력 순서대로 반환."""
