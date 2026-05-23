"""ChromaDB 기반 기관 양식 저장소."""
from __future__ import annotations

import hashlib
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.core.logging import get_logger
from app.providers.embeddings import EmbeddingProvider, get_embedding_provider

log = get_logger(__name__)


def _chunk_text(text: str, *, chunk_size: int = 600, overlap: int = 80) -> list[str]:
    """단순 슬라이딩 윈도우 청킹. 한국어 문서에 무난."""
    text = text.strip()
    if len(text) <= chunk_size:
        return [text] if text else []
    out: list[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + chunk_size)
        out.append(text[start:end])
        start += chunk_size - overlap
    return out


class OrgTemplateStore:
    """기관별 양식 청크 저장소.

    각 기관마다 별도 컬렉션. 컬렉션명: org-{organization_id}.
    """

    def __init__(self, *, persist_dir: Path, embedder: EmbeddingProvider) -> None:
        from chromadb import PersistentClient
        from chromadb.config import Settings as ChromaSettings

        persist_dir.mkdir(parents=True, exist_ok=True)
        self._client = PersistentClient(
            path=str(persist_dir),
            settings=ChromaSettings(anonymized_telemetry=False, allow_reset=False),
        )
        self._embedder = embedder

    def _collection(self, organization_id: str):
        return self._client.get_or_create_collection(
            name=f"org-{organization_id}",
            metadata={"hnsw:space": "cosine"},
        )

    async def index_document(
        self,
        *,
        organization_id: str,
        document_id: str,
        title: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> int:
        chunks = _chunk_text(content)
        if not chunks:
            return 0
        embeddings = await self._embedder.embed(chunks)
        col = self._collection(organization_id)
        ids = [
            hashlib.sha1(f"{document_id}-{i}".encode()).hexdigest()[:16]
            for i in range(len(chunks))
        ]
        col.add(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=[
                {
                    "document_id": document_id,
                    "title": title,
                    "chunk_index": i,
                    **(metadata or {}),
                }
                for i in range(len(chunks))
            ],
        )
        log.info("기관 양식 인덱싱", org=organization_id, document=document_id, chunks=len(chunks))
        return len(chunks)

    async def search(
        self, *, organization_id: str, query: str, top_k: int = 5
    ) -> list[dict[str, Any]]:
        col = self._collection(organization_id)
        if col.count() == 0:
            return []
        [emb] = await self._embedder.embed([query])
        res = col.query(query_embeddings=[emb], n_results=top_k)
        out: list[dict[str, Any]] = []
        docs = (res.get("documents") or [[]])[0]
        metas = (res.get("metadatas") or [[]])[0]
        dists = (res.get("distances") or [[]])[0]
        for d, m, dist in zip(docs, metas, dists, strict=False):
            out.append({"chunk": d, "metadata": m, "distance": dist})
        return out

    def count(self, organization_id: str) -> int:
        return self._collection(organization_id).count()


@lru_cache
def get_template_store() -> OrgTemplateStore:
    settings = get_settings()
    return OrgTemplateStore(
        persist_dir=settings.chroma_persist_dir,
        embedder=get_embedding_provider(),
    )
