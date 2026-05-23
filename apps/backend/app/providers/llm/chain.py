"""ChainProvider — 폴백 체인.

`LLM_PROVIDER=chain` 일 때 사용. `LLM_CHAIN=tenos,openai,mock` 처럼 우선순위 정의.
앞 provider가 ProviderUnavailable을 던지면 다음으로 자동 폴백.

운영 패턴:
- 단일 운영: `LLM_PROVIDER=tenos` (폴백 없음 — 결과 일관성 우선)
- 가용성 중시: `LLM_PROVIDER=chain`, `LLM_CHAIN=tenos,openai` (TenOS 다운 시 OpenAI로)
- shadow 비교: 별도 라우팅 미들웨어에서 처리 (체인 X)
- 폐쇄망: `LLM_PROVIDER=tenos` 단일 (외부 의존 0건)
"""
from __future__ import annotations

from typing import Any

from app.core.logging import get_logger
from app.providers.llm.base import (
    ChatMessage,
    DocumentClassification,
    HealthStatus,
    ModelProvider,
    ProviderUnavailable,
    ReviewTags,
    TemplateMatchScore,
)

log = get_logger(__name__)


class ChainProvider(ModelProvider):
    name = "chain"

    def __init__(self, providers: list[ModelProvider]) -> None:
        if not providers:
            raise ValueError("ChainProvider에는 최소 1개의 provider가 필요")
        self._providers = providers

    @property
    def model_id(self) -> str:
        return "chain:" + ",".join(p.model_id for p in self._providers)

    async def _run(self, method: str, *args: Any, **kwargs: Any) -> Any:
        last_err: Exception | None = None
        for p in self._providers:
            try:
                return await getattr(p, method)(*args, **kwargs)
            except ProviderUnavailable as e:
                last_err = e
                log.warning("provider 폴백", provider=p.name, method=method, error=str(e))
                continue
        # 모든 provider 실패
        raise ProviderUnavailable("chain", f"모든 provider 실패. 마지막: {last_err}")

    async def complete(self, messages: list[ChatMessage], **opts: Any) -> str:
        return await self._run("complete", messages, **opts)

    async def classify_document(self, text: str) -> DocumentClassification:
        return await self._run("classify_document", text)

    async def review_tag(self, text: str) -> ReviewTags:
        return await self._run("review_tag", text)

    async def score_template_match(
        self, doc_text: str, reference_chunks: list[str]
    ) -> TemplateMatchScore:
        return await self._run("score_template_match", doc_text, reference_chunks)

    async def health_check(self) -> HealthStatus:
        for p in self._providers:
            h = await p.health_check()
            if h.available:
                return HealthStatus(
                    available=True,
                    provider=f"chain[{p.name}]",
                    model=h.model,
                    latency_ms=h.latency_ms,
                )
        return HealthStatus(
            available=False, provider="chain", model="-", error="모든 provider 다운"
        )
