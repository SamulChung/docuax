"""TenOS·OpenAI 공통 베이스 — vLLM이 OpenAI 호환 API를 내보내므로 동일 클라이언트로 처리.

TenOSProvider와 OpenAIProvider는 endpoint·모델 ID·API key만 다르고 호출 로직이 같다.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any

import httpx
from openai import APIConnectionError, APIError, APITimeoutError, AsyncOpenAI, RateLimitError

from app.providers.llm.base import (
    ChatMessage,
    DocumentClass,
    DocumentClassification,
    HealthStatus,
    ModelProvider,
    ProviderUnavailable,
    ReviewTag,
    ReviewTags,
    TemplateMatchScore,
)

# ─────────────────────────────────────────────────────────────────────────────
# 프롬프트 템플릿 — 한국어 공문 도메인 특화
# ─────────────────────────────────────────────────────────────────────────────

CLASSIFY_SYSTEM = """당신은 한국 회사·공공기관 문서 분류 전문가입니다. 입력 문서 첫 부분을 보고 유형을 판별하세요.

분류 기준:
- 공문(GONGMUN): 수신·발신·결재·기안 표기, 정부·공공기관 형식, 「~알림」「~안내」「~협조 요청」 제목
- 보고서: "보고드립니다" / "결과 보고" / 주간·월간 보고, 연구 보고
- 제안서: 사업 제안·기획 제안, 입찰 제안, 가격·일정·범위 명시
- 메모: 짧은 내부 메모·전언, 5단락 이하
- 회의록: 일시·참석자·안건·결의사항 구조
- 일반: 위에 해당하지 않거나 판별 불가

예시:
입력: "수신: 행정안전부 / 제목: 2026년 예산편성 협조 요청"
출력: {"document_class":"공문","confidence":0.95,"rationale":"수신·제목 형식이 공공기관 공문"}

입력: "# 주간 보고 ## 이번 주 진행사항 ..."
출력: {"document_class":"보고서","confidence":0.92,"rationale":"주간 보고 헤더와 진행사항 섹션"}

규칙:
1. 반드시 단일 JSON 객체만 출력 — 다른 텍스트·코드펜스 금지
2. document_class는 정확히 위 6개 중 하나
3. confidence는 0.0~1.0 실수
4. rationale은 한 문장 한국어"""

REVIEW_SYSTEM = """당신은 한국어 문서의 검토 표시 전문가입니다. 문서에서 3색 태깅을 수행합니다.

색상 정의:
- red: 사실 확인이 필요한 주장, 환각 의심, 논리 모순, "~것으로 추정/예상/판단됩니다" 같은 hedging이면서 근거 없는 표현
- blue: 결론·핵심 키워드, **강조** 표시된 단어, 「」 또는 ""로 묶인 핵심어
- yellow: 모든 숫자(예산 1,000,000원, 30%, 5건), 일자(2026.05.18, 2026년 5월 등), 통계값

좌표 규칙:
- span_start, span_end는 입력 문서 전체에서의 0-base 문자 위치 (Python text[s:e]와 동일)
- 절대로 추측하지 말고, 실제로 해당 텍스트가 그 위치에 있는지 확인 후 반환

예시 입력: "예산은 1,500,000원이며, 약 30% 증가할 것으로 추정됩니다."
예시 출력: {"tags":[
  {"span_start":4,"span_end":13,"color":"yellow","reason":"예산 금액","confidence":0.98},
  {"span_start":21,"span_end":24,"color":"yellow","reason":"증가율","confidence":0.97},
  {"span_start":27,"span_end":40,"color":"red","reason":"근거 없는 추정 표현","confidence":0.7}
]}

규칙:
1. 반드시 단일 JSON 객체 {"tags":[...]} 만 출력
2. 노랑은 LLM이 일부만 표시해도 됨 — 시스템이 정규식으로 보강함
3. tags가 비어있어도 빈 배열 반환: {"tags":[]}"""

TEMPLATE_MATCH_SYSTEM = """당신은 한국 공문·기관 양식 일치도 평가 전문가입니다. 참고 양식과 검토 문서를 비교해 0.0~1.0 점수와 개선점을 산출하세요.

평가 항목 (breakdown 키):
- header: 수신·제목·발신 등 머리 부분 형식
- structure: 본문 구조(글머리 □ ○ ― ※ 4단계, 번호 매기기)
- tone: 격식체 유지 ("~합니다/~드립니다")
- numbers: 숫자·금액·일자 표기 형식
- closing: 끝맺음(끝, 붙임 등)

예시 출력:
{"score":0.78,"breakdown":{"header":0.9,"structure":0.7,"tone":0.95,"numbers":0.6,"closing":0.8},
 "suggestions":["□ 글머리를 1단계로 통일하세요","금액은 천 단위 콤마 표시 필요"]}

규칙:
1. 반드시 단일 JSON 객체
2. score = breakdown 평균과 ±0.1 범위로 합치
3. suggestions는 최대 5개, 구체적이고 적용 가능한 문장"""


# ─────────────────────────────────────────────────────────────────────────────
# 공통 베이스 클래스 — TenOS·OpenAI provider가 상속
# ─────────────────────────────────────────────────────────────────────────────

class OpenAICompatibleProvider(ModelProvider):
    """OpenAI 호환 endpoint (vLLM/TenOS, 공식 OpenAI 모두)."""

    def __init__(self, *, base_url: str, api_key: str, model: str, timeout: float = 60.0) -> None:
        self._base_url = base_url
        self._api_key = api_key
        self._model = model
        self._timeout = timeout
        self._client = AsyncOpenAI(
            base_url=base_url,
            api_key=api_key or "no-auth",
            timeout=timeout,
        )
        # 누적 토큰 사용량 (마지막 호출 기준 — 운영에서는 OpenTelemetry로 export 권장)
        self._last_usage: dict[str, int] = {}

    @property
    def model_id(self) -> str:
        return f"{self.name}:{self._model}"

    @property
    def last_usage(self) -> dict[str, int]:
        """가장 최근 complete() 호출의 토큰 사용량 — {prompt, completion, total}"""
        return dict(self._last_usage)

    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        temperature: float = 0.2,
        max_tokens: int = 1024,
        json_schema: dict[str, Any] | None = None,
    ) -> str:
        try:
            kwargs: dict[str, Any] = {
                "model": self._model,
                "messages": [m.model_dump() for m in messages],
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            if json_schema is not None:
                # OpenAI: response_format. vLLM도 최근 버전 지원.
                kwargs["response_format"] = {"type": "json_object"}

            resp = await self._client.chat.completions.create(**kwargs)
            # 토큰 사용량 기록
            if getattr(resp, "usage", None):
                self._last_usage = {
                    "prompt": resp.usage.prompt_tokens,
                    "completion": resp.usage.completion_tokens,
                    "total": resp.usage.total_tokens,
                }
            return resp.choices[0].message.content or ""
        except (APIConnectionError, APITimeoutError) as e:
            raise ProviderUnavailable(self.name, f"network: {e}") from e
        except RateLimitError as e:
            raise ProviderUnavailable(self.name, f"rate-limit: {e}") from e
        except APIError as e:
            raise ProviderUnavailable(self.name, f"api: {e}") from e

    async def _complete_json(
        self,
        messages: list[ChatMessage],
        *,
        max_tokens: int = 1024,
        retries: int = 1,
    ) -> dict[str, Any] | None:
        """JSON 응답을 받고 파싱. 실패하면 보정 프롬프트로 1회 재시도."""
        last_raw = ""
        for attempt in range(retries + 1):
            raw = await self.complete(
                messages,
                temperature=0.0 if attempt == 0 else 0.0,
                max_tokens=max_tokens,
                json_schema={},
            )
            last_raw = raw
            data = _extract_json(raw)
            if data is not None:
                return data
            # 재시도: 모델에게 직전 응답이 JSON이 아니었음을 알리고 다시 요청
            if attempt < retries:
                messages = messages + [
                    ChatMessage(role="assistant", content=last_raw[:500]),
                    ChatMessage(
                        role="user",
                        content="이전 응답이 유효한 JSON이 아닙니다. 코드 펜스(```)·설명 없이 JSON 객체 하나만 다시 출력하세요.",
                    ),
                ]
        return None

    async def classify_document(self, text: str) -> DocumentClassification:
        data = await self._complete_json(
            [
                ChatMessage(role="system", content=CLASSIFY_SYSTEM),
                ChatMessage(role="user", content=f"문서 첫 부분:\n```\n{text[:2000]}\n```"),
            ],
            max_tokens=300,
        )
        if not data:
            return DocumentClassification(
                document_class=DocumentClass.GENERAL,
                confidence=0.0,
                rationale="JSON 파싱 실패",
            )
        try:
            return DocumentClassification(
                document_class=DocumentClass(data.get("document_class", "일반")),
                confidence=float(data.get("confidence", 0.5)),
                rationale=str(data.get("rationale", "")),
            )
        except (ValueError, TypeError):
            return DocumentClassification(
                document_class=DocumentClass.GENERAL,
                confidence=0.0,
                rationale="스키마 불일치",
            )

    async def review_tag(self, text: str) -> ReviewTags:
        data = await self._complete_json(
            [
                ChatMessage(role="system", content=REVIEW_SYSTEM),
                ChatMessage(role="user", content=f"문서:\n```\n{text}\n```"),
            ],
            max_tokens=2048,
        ) or {"tags": []}
        tags: list[ReviewTag] = []
        for t in data.get("tags", []):
            try:
                # LLM이 잘못된 좌표를 반환할 수 있음 — 실제 텍스트 확인
                tag = ReviewTag(**t)
                if 0 <= tag.span_start < tag.span_end <= len(text):
                    tags.append(tag)
            except (TypeError, ValueError):
                continue
        # 노랑 보강 — 숫자·일자 정규식 (놓친 항목 자동 보완)
        tags.extend(_regex_yellow_tags(text, existing=tags))
        return ReviewTags(tags=tags, model_version=self.model_id)

    async def score_template_match(
        self, doc_text: str, reference_chunks: list[str]
    ) -> TemplateMatchScore:
        refs = "\n---\n".join(reference_chunks[:5]) or "(참고 양식 없음 — 일반 공문 기준으로 평가)"
        data = await self._complete_json(
            [
                ChatMessage(role="system", content=TEMPLATE_MATCH_SYSTEM),
                ChatMessage(
                    role="user",
                    content=f"참고 양식:\n```\n{refs}\n```\n\n검토 문서:\n```\n{doc_text[:3000]}\n```",
                ),
            ],
            max_tokens=600,
        )
        if not data:
            return TemplateMatchScore(score=0.0, suggestions=["JSON 파싱 실패"])
        try:
            score = float(data.get("score", 0.0))
        except (TypeError, ValueError):
            score = 0.0
        return TemplateMatchScore(
            score=max(0.0, min(1.0, score)),
            breakdown={k: float(v) for k, v in data.get("breakdown", {}).items() if isinstance(v, (int, float))},
            suggestions=list(data.get("suggestions", []))[:5],
        )

    async def health_check(self) -> HealthStatus:
        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # /models 엔드포인트는 OpenAI 호환 표준
                r = await client.get(
                    f"{self._base_url.rstrip('/')}/models",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
            ok = r.status_code < 500
            return HealthStatus(
                available=ok,
                provider=self.name,
                model=self._model,
                latency_ms=(time.perf_counter() - start) * 1000,
                error=None if ok else f"HTTP {r.status_code}",
            )
        except Exception as e:  # noqa: BLE001
            return HealthStatus(
                available=False,
                provider=self.name,
                model=self._model,
                latency_ms=None,
                error=str(e),
            )


# ─────────────────────────────────────────────────────────────────────────────
# 유틸 — JSON 추출, 노랑 정규식 보강
# ─────────────────────────────────────────────────────────────────────────────

_JSON_BLOCK = re.compile(r"\{[\s\S]*\}|\[[\s\S]*\]")


def _extract_json(raw: str) -> dict[str, Any] | None:
    raw = raw.strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    # ``` 코드 펜스 안에 있을 수 있음
    m = _JSON_BLOCK.search(raw)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


_NUMBER_RE = re.compile(
    r"\b(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:원|만원|억|%|건|명|개|일|월|년|시간|분|초)?\b"
)
_DATE_RE = re.compile(
    r"\d{4}[.\-/년]\s*\d{1,2}[.\-/월]\s*\d{1,2}[일]?|\d{4}[.\-]\d{2}[.\-]\d{2}"
)


def _regex_yellow_tags(text: str, *, existing: list[ReviewTag]) -> list[ReviewTag]:
    """LLM이 놓친 숫자·일자를 정규식으로 보강. 기존 태그와 겹치면 제외."""
    occupied = {(t.span_start, t.span_end) for t in existing if t.color == "yellow"}
    out: list[ReviewTag] = []
    for pattern, reason in [(_DATE_RE, "일자"), (_NUMBER_RE, "숫자")]:
        for m in pattern.finditer(text):
            span = (m.start(), m.end())
            if span in occupied:
                continue
            occupied.add(span)
            out.append(
                ReviewTag(
                    span_start=span[0],
                    span_end=span[1],
                    color="yellow",
                    reason=reason,
                    confidence=0.95,
                )
            )
    return out
