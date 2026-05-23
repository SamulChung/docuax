"""ModelProvider 추상 베이스 — DocuAX의 두뇌 인터페이스.

DocuAX 파이프라인은 LLM을 직접 호출하지 않는다. 모든 LLM 호출은 이 인터페이스를 통과한다.
TenOS·OpenAI·Anthropic 등 어떤 모델이 와도 DocuAX 코드는 변하지 않는다.

설계 원칙:
1. 입력·출력 타입을 Pydantic으로 고정 — 모델이 바뀌어도 팔이 받는 형태는 동일.
2. 비동기 우선 — 변환 파이프라인은 streaming 사용 가능.
3. 메서드는 "두뇌에게 시키는 일" 단위 — 일반 chat이 아닌 도메인 동사.
4. 예외는 `ProviderUnavailable` 로 정규화 — ChainProvider가 폴백 가능.
"""
from __future__ import annotations

import abc
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────────────────
# 공통 스키마
# ─────────────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class DocumentClass(StrEnum):
    """문서 유형 — 양식 매핑의 분기 기준."""

    GONGMUN = "공문"
    REPORT = "보고서"
    PROPOSAL = "제안서"
    MEMO = "메모"
    MINUTES = "회의록"
    GENERAL = "일반"


class DocumentClassification(BaseModel):
    """파이프라인 3단계 — 양식 매핑의 입력."""

    document_class: DocumentClass
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str = ""


class ReviewTag(BaseModel):
    """검토 표시 — 빨강·파랑·노랑.

    빨강(red): 신뢰도 낮은 주장·환각 의심
    파랑(blue): 핵심 키워드·강조 대상
    노랑(yellow): 모든 숫자·예산·통계·일자
    """

    span_start: int
    span_end: int
    color: Literal["red", "blue", "yellow"]
    reason: str
    confidence: float = Field(ge=0.0, le=1.0, default=0.8)


class ReviewTags(BaseModel):
    """파이프라인 4단계 결과."""

    tags: list[ReviewTag] = Field(default_factory=list)
    model_version: str = ""

    def by_color(self, color: Literal["red", "blue", "yellow"]) -> list[ReviewTag]:
        return [t for t in self.tags if t.color == color]


class TemplateMatchScore(BaseModel):
    """매크로 R9 — 기관 양식 일치도."""

    score: float = Field(ge=0.0, le=1.0)
    breakdown: dict[str, float] = Field(default_factory=dict)
    suggestions: list[str] = Field(default_factory=list)


class HealthStatus(BaseModel):
    available: bool
    provider: str
    model: str
    latency_ms: float | None = None
    error: str | None = None


# ─────────────────────────────────────────────────────────────────────────────
# 예외
# ─────────────────────────────────────────────────────────────────────────────

class ProviderUnavailable(Exception):
    """이 provider 호출 실패 — ChainProvider가 다음으로 폴백할 수 있는 신호."""

    def __init__(self, provider: str, reason: str, *, recoverable: bool = True) -> None:
        super().__init__(f"[{provider}] {reason}")
        self.provider = provider
        self.reason = reason
        self.recoverable = recoverable


class ProviderConfigError(Exception):
    """provider 설정 자체가 잘못됨 (키 없음 등). 폴백 대상."""


# ─────────────────────────────────────────────────────────────────────────────
# 추상 베이스
# ─────────────────────────────────────────────────────────────────────────────

class ModelProvider(abc.ABC):
    """DocuAX가 두뇌에게 시키는 일의 전체 집합.

    구현 가이드:
    - 각 메서드는 결정된 결과 타입을 반환. 파싱 실패는 ProviderUnavailable.
    - 외부 네트워크 오류·rate-limit은 ProviderUnavailable(recoverable=True).
    - 인증·설정 오류는 ProviderConfigError.
    """

    # provider 식별자 — 로그·DB에 기록됨. e.g. "tenos", "openai".
    name: str = "base"

    @property
    @abc.abstractmethod
    def model_id(self) -> str:
        """모델 식별자 — 로그·DB의 `model_version` 필드에 사용."""

    @abc.abstractmethod
    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        temperature: float = 0.2,
        max_tokens: int = 1024,
        json_schema: dict[str, Any] | None = None,
    ) -> str:
        """범용 텍스트 생성. R7 맞춤법·요약 등에 사용.

        json_schema가 주어지면 구조화 출력(엄격 JSON)을 시도. provider가 미지원이면
        프롬프트로 JSON 강제 후 파싱.
        """

    @abc.abstractmethod
    async def classify_document(self, text: str) -> DocumentClassification:
        """파이프라인 단계 2 — 문서 유형 판별."""

    @abc.abstractmethod
    async def review_tag(self, text: str) -> ReviewTags:
        """파이프라인 단계 4 — 빨강·파랑·노랑 자동 태깅.

        - 노랑은 정규식 기반 후처리로 보강 가능 (숫자·일자).
        - 빨강은 신뢰도 0.5 이하 주장 위주.
        """

    @abc.abstractmethod
    async def score_template_match(
        self, doc_text: str, reference_chunks: list[str]
    ) -> TemplateMatchScore:
        """매크로 R9 — 기관 양식 일치도 점수.

        reference_chunks는 RAG에서 검색된 해당 기관 과거 문서 조각.
        """

    @abc.abstractmethod
    async def health_check(self) -> HealthStatus:
        """운영 모니터링용. 가벼운 ping."""

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} model={self.model_id}>"
