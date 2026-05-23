"""Anthropic provider — Claude. 백업용. ON_PREMISE=true 시 비활성."""
from __future__ import annotations

import time
from typing import Any

from anthropic import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AsyncAnthropic,
    RateLimitError,
)

from app.core.config import Settings
from app.providers.llm._openai_compat import (
    CLASSIFY_SYSTEM,
    REVIEW_SYSTEM,
    TEMPLATE_MATCH_SYSTEM,
    _extract_json,
    _regex_yellow_tags,
)
from app.providers.llm.base import (
    ChatMessage,
    DocumentClass,
    DocumentClassification,
    HealthStatus,
    ModelProvider,
    ProviderConfigError,
    ProviderUnavailable,
    ReviewTag,
    ReviewTags,
    TemplateMatchScore,
)


class AnthropicProvider(ModelProvider):
    name = "anthropic"

    def __init__(self, *, api_key: str, model: str, timeout: float = 60.0) -> None:
        self._model = model
        self._client = AsyncAnthropic(api_key=api_key, timeout=timeout)

    @property
    def model_id(self) -> str:
        return f"anthropic:{self._model}"

    @classmethod
    def from_settings(cls, settings: Settings) -> "AnthropicProvider":
        if settings.on_premise:
            raise ProviderConfigError("Anthropic provider는 on-premise 모드에서 비활성")
        if not settings.anthropic_api_key:
            raise ProviderConfigError("ANTHROPIC_API_KEY 미설정")
        return cls(api_key=settings.anthropic_api_key, model=settings.anthropic_model)

    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        temperature: float = 0.2,
        max_tokens: int = 1024,
        json_schema: dict[str, Any] | None = None,
    ) -> str:
        # Anthropic은 system을 별도 파라미터로 받음
        system_parts = [m.content for m in messages if m.role == "system"]
        chat = [m for m in messages if m.role != "system"]
        try:
            resp = await self._client.messages.create(
                model=self._model,
                system="\n\n".join(system_parts) if system_parts else "",
                messages=[{"role": m.role, "content": m.content} for m in chat],
                max_tokens=max_tokens,
                temperature=temperature,
            )
            # content는 [TextBlock, ...] — 첫 텍스트 블록 추출
            for block in resp.content:
                if getattr(block, "type", "") == "text":
                    return block.text
            return ""
        except (APIConnectionError, APITimeoutError) as e:
            raise ProviderUnavailable(self.name, f"network: {e}") from e
        except RateLimitError as e:
            raise ProviderUnavailable(self.name, f"rate-limit: {e}") from e
        except APIError as e:
            raise ProviderUnavailable(self.name, f"api: {e}") from e

    async def classify_document(self, text: str) -> DocumentClassification:
        raw = await self.complete(
            [
                ChatMessage(role="system", content=CLASSIFY_SYSTEM),
                ChatMessage(role="user", content=f"문서 첫 부분:\n```\n{text[:2000]}\n```"),
            ],
            temperature=0.0,
            max_tokens=200,
        )
        data = _extract_json(raw)
        if not data:
            return DocumentClassification(
                document_class=DocumentClass.GENERAL, confidence=0.0, rationale="JSON 파싱 실패"
            )
        try:
            return DocumentClassification(
                document_class=DocumentClass(data.get("document_class", "일반")),
                confidence=float(data.get("confidence", 0.5)),
                rationale=str(data.get("rationale", "")),
            )
        except (ValueError, TypeError):
            return DocumentClassification(
                document_class=DocumentClass.GENERAL, confidence=0.0, rationale="스키마 불일치"
            )

    async def review_tag(self, text: str) -> ReviewTags:
        raw = await self.complete(
            [
                ChatMessage(role="system", content=REVIEW_SYSTEM),
                ChatMessage(role="user", content=f"문서:\n```\n{text}\n```"),
            ],
            temperature=0.1,
            max_tokens=2048,
        )
        data = _extract_json(raw) or {"tags": []}
        tags: list[ReviewTag] = []
        for t in data.get("tags", []):
            try:
                tags.append(ReviewTag(**t))
            except (TypeError, ValueError):
                continue
        tags.extend(_regex_yellow_tags(text, existing=tags))
        return ReviewTags(tags=tags, model_version=self.model_id)

    async def score_template_match(
        self, doc_text: str, reference_chunks: list[str]
    ) -> TemplateMatchScore:
        refs = "\n---\n".join(reference_chunks[:5])
        raw = await self.complete(
            [
                ChatMessage(role="system", content=TEMPLATE_MATCH_SYSTEM),
                ChatMessage(
                    role="user",
                    content=f"참고 양식:\n```\n{refs}\n```\n\n검토 문서:\n```\n{doc_text[:3000]}\n```",
                ),
            ],
            temperature=0.0,
            max_tokens=400,
        )
        data = _extract_json(raw)
        if not data:
            return TemplateMatchScore(score=0.0, suggestions=["JSON 파싱 실패"])
        return TemplateMatchScore(
            score=float(data.get("score", 0.0)),
            breakdown={k: float(v) for k, v in data.get("breakdown", {}).items()},
            suggestions=list(data.get("suggestions", [])),
        )

    async def health_check(self) -> HealthStatus:
        start = time.perf_counter()
        try:
            # 최소 토큰 1회 호출로 ping
            await self._client.messages.create(
                model=self._model,
                max_tokens=1,
                messages=[{"role": "user", "content": "ping"}],
            )
            return HealthStatus(
                available=True,
                provider=self.name,
                model=self._model,
                latency_ms=(time.perf_counter() - start) * 1000,
            )
        except Exception as e:  # noqa: BLE001
            return HealthStatus(
                available=False, provider=self.name, model=self._model, error=str(e)
            )
