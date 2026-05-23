"""문서 IR 인메모리 캐시.

변환 결과(DocumentIR)는 사용자가 매크로를 호출하거나 다운로드할 때까지 메모리에 살아있어야 한다.
운영 환경에서는 Redis로 교체 — 인터페이스만 유지하면 됨.
"""
from __future__ import annotations

import time
from collections import OrderedDict
from threading import Lock

from app.pipeline.ir import DocumentIR


class DocumentCache:
    """LRU + TTL. 단순한 인메모리 구현. 운영은 Redis."""

    def __init__(self, *, max_size: int = 500, ttl_s: float = 3600.0) -> None:
        self._max_size = max_size
        self._ttl_s = ttl_s
        self._store: OrderedDict[str, tuple[float, DocumentIR]] = OrderedDict()
        self._lock = Lock()

    def get(self, document_id: str) -> DocumentIR | None:
        with self._lock:
            entry = self._store.get(document_id)
            if not entry:
                return None
            ts, ir = entry
            if time.time() - ts > self._ttl_s:
                self._store.pop(document_id, None)
                return None
            self._store.move_to_end(document_id)
            return ir

    def set(self, ir: DocumentIR) -> None:
        with self._lock:
            self._store[ir.document_id] = (time.time(), ir)
            self._store.move_to_end(ir.document_id)
            while len(self._store) > self._max_size:
                self._store.popitem(last=False)

    def delete(self, document_id: str) -> None:
        with self._lock:
            self._store.pop(document_id, None)


_singleton = DocumentCache()


def get_document_cache() -> DocumentCache:
    return _singleton
