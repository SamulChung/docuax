"""임베딩 provider 레지스트리. LLM과 동일한 패턴."""
from __future__ import annotations

from functools import lru_cache

from app.core.config import get_settings
from app.core.logging import get_logger
from app.providers.embeddings.base import EmbeddingProvider
from app.providers.embeddings.local import LocalEmbeddingProvider
from app.providers.embeddings.openai_embed import OpenAIEmbeddingProvider
from app.providers.llm.base import ProviderConfigError

log = get_logger(__name__)


@lru_cache
def get_embedding_provider() -> EmbeddingProvider:
    settings = get_settings()
    choice = settings.embedding_provider

    try:
        if choice == "openai":
            return OpenAIEmbeddingProvider.from_settings(settings)
        # tenos·local 모두 로컬 SentenceTransformer 기본
        return LocalEmbeddingProvider.from_settings(settings)
    except ProviderConfigError as e:
        log.warning("임베딩 provider 폴백 → local", reason=str(e))
        return LocalEmbeddingProvider()
