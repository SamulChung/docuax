"""TenOS HF Inference Provider — Hugging Face Inference API로 TenOS 호출.

언제 쓰나:
- 개발 PC에 GPU 없음 (vLLM 못 띄움)
- 빠른 검증·데모 — 운영용은 자체 vLLM 권장
- 베타 사용자 확장 단계에서 vLLM 용량 부족 시 임시 폴백

`huggingface_hub`의 InferenceClient 또는 직접 HTTP 호출 모두 가능.
여기서는 httpx 직접 호출 — 추가 의존성 최소화.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

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


class TenOSHFProvider(ModelProvider):
    """HF Inference API 기반. TenOS-Ko-28B (또는 후속 모델) 호출.

    `HF_API_TOKEN` 또는 `HUGGINGFACE_HUB_TOKEN` 환경변수 필요.
    """

    name = "tenos_hf"

    def __init__(self, *, model: str, token: str, timeout: float = 120.0) -> None:
        self._model = model
        self._token = token
        self._timeout = timeout
        self._endpoint = f"https://api-inference.huggingface.co/models/{model}"
        self._headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    @property
    def model_id(self) -> str:
        return f"tenos_hf:{self._model}"

    @classmethod
    def from_settings(cls, settings: Settings) -> "TenOSHFProvider":
        if settings.on_premise:
            raise ProviderConfigError("HF Inference는 on-premise 모드에서 비활성")
        token = getattr(settings, "hf_api_token", "") or ""
        if not token:
            raise ProviderConfigError("HF_API_TOKEN 미설정")
        model = settings.tenos_model or "honey90/TenOS-Ko-28B"
        return cls(model=model, token=token, timeout=settings.tenos_timeout_s)

    async def _post(self, payload: dict[str, Any], *, retries: int = 2) -> dict[str, Any] | list[Any]:
        """HF Inference API 호출. 모델 콜드 스타트(503) 시 재시도."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            for attempt in range(retries + 1):
                try:
                    r = await client.post(self._endpoint, headers=self._headers, json=payload)
                except (httpx.ConnectError, httpx.TimeoutException) as e:
                    raise ProviderUnavailable(self.name, f"network: {e}") from e

                if r.status_code == 503:
                    # 모델 로딩 중 — 백오프 후 재시도
                    wait = min(20.0, 3.0 * (attempt + 1))
                    await asyncio.sleep(wait)
                    continue
                if r.status_code == 401:
                    raise ProviderConfigError("HF 토큰 인증 실패")
                if r.status_code == 429:
                    raise ProviderUnavailable(self.name, "rate-limit")
                if r.status_code >= 400:
                    raise ProviderUnavailable(self.name, f"http {r.status_code}: {r.text[:200]}")
                try:
                    return r.json()
                except ValueError as e:
                    raise ProviderUnavailable(self.name, f"json decode: {e}") from e
            raise ProviderUnavailable(self.name, "모델 로딩 지연 — 재시도 한도 초과")

    @staticmethod
    def _messages_to_prompt(messages: list[ChatMessage]) -> str:
        """간단한 chat → instruction 변환. 대부분의 HF 모델이 이 형식 수용."""
        parts: list[str] = []
        for m in messages:
            if m.role == "system":
                parts.append(f"<|system|>\n{m.content}")
            elif m.role == "user":
                parts.append(f"<|user|>\n{m.content}")
            else:
                parts.append(f"<|assistant|>\n{m.content}")
        parts.append("<|assistant|>\n")
        return "\n".join(parts)

    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        temperature: float = 0.2,
        max_tokens: int = 1024,
        json_schema: dict[str, Any] | None = None,
    ) -> str:
        prompt = self._messages_to_prompt(messages)
        payload = {
            "inputs": prompt,
            "parameters": {
                "temperature": max(0.01, temperature),
                "max_new_tokens": max_tokens,
                "return_full_text": False,
                "do_sample": temperature > 0.0,
            },
            "options": {"wait_for_model": True, "use_cache": False},
        }
        data = await self._post(payload)
        # HF text-generation 형식: [{"generated_text": "..."}]
        if isinstance(data, list) and data and isinstance(data[0], dict):
            return str(data[0].get("generated_text", "")).strip()
        if isinstance(data, dict):
            return str(data.get("generated_text", "")).strip()
        return ""

    async def classify_document(self, text: str) -> DocumentClassification:
        raw = await self.complete(
            [
                ChatMessage(role="system", content=CLASSIFY_SYSTEM),
                ChatMessage(role="user", content=f"문서 첫 부분:\n```\n{text[:2000]}\n```"),
            ],
            temperature=0.0,
            max_tokens=300,
            json_schema={},
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
            json_schema={},
        )
        data = _extract_json(raw) or {"tags": []}
        tags: list[ReviewTag] = []
        for t in data.get("tags", []):
            try:
                tags.append(ReviewTag(**t))
            except (TypeError, ValueError):
                continue
        # 노랑 보강 — LLM이 놓친 숫자·일자
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
        """토큰 인증 + 모델 접근성을 모두 확인.

        public 모델은 인증 없이도 모델 페이지를 볼 수 있어, 토큰 자체는 `whoami-v2`로 검증.
        """
        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # 1) 토큰 인증 검증 — whoami-v2는 유효 토큰만 200
                who = await client.get(
                    "https://huggingface.co/api/whoami-v2",
                    headers={"Authorization": f"Bearer {self._token}"},
                )
                if who.status_code != 200:
                    return HealthStatus(
                        available=False,
                        provider=self.name,
                        model=self._model,
                        latency_ms=(time.perf_counter() - start) * 1000,
                        error=f"HF 토큰 인증 실패 (HTTP {who.status_code})",
                    )

                # 2) 모델 접근성
                model_resp = await client.get(
                    f"https://huggingface.co/api/models/{self._model}",
                    headers={"Authorization": f"Bearer {self._token}"},
                )
                if model_resp.status_code >= 400:
                    return HealthStatus(
                        available=False,
                        provider=self.name,
                        model=self._model,
                        latency_ms=(time.perf_counter() - start) * 1000,
                        error=f"모델 접근 실패 (HTTP {model_resp.status_code}) — gated/private 모델일 수 있음",
                    )

                # 3) Serverless Inference 가용성 (실제 추론 가능 여부)
                infer = await client.post(
                    self._endpoint,
                    headers=self._headers,
                    json={
                        "inputs": "ping",
                        "parameters": {"max_new_tokens": 1, "return_full_text": False},
                    },
                )
                inference_ok = infer.status_code < 400
                error_note = None
                if not inference_ok:
                    if infer.status_code == 404:
                        error_note = (
                            "Serverless Inference 미배포 — 모델 페이지에서 Deploy → "
                            "Inference Endpoints로 전용 인스턴스 생성 후 'TenOS (vLLM)' provider 사용 권장"
                        )
                    else:
                        error_note = f"Inference HTTP {infer.status_code}"

            return HealthStatus(
                available=inference_ok,
                provider=self.name,
                model=self._model,
                latency_ms=(time.perf_counter() - start) * 1000,
                error=error_note,
            )
        except Exception as e:  # noqa: BLE001
            return HealthStatus(
                available=False,
                provider=self.name,
                model=self._model,
                error=str(e),
            )
