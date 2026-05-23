"""7단계 변환 파이프라인 러너.

DocuAX의 PRD 3.2 변환 파이프라인을 코드로 정확히 구현:
  1. 입력 파싱   → markdown → DocumentIR
  2. TenOS 분석  → 문서 유형 분류
  3. 양식 매핑   → 한국 공문 4단계 글머리 등
  4. 검토 표시   → 빨강·파랑·노랑 자동 태깅
  5. 매크로 자동 → auto 매크로 일괄 적용
  6. 포맷 직렬화 → DOCX/HWPX/PDF (renderers 모듈)
  7. 미리보기    → 프론트엔드 JSON

목표 성능: 1~2페이지 P50 3초, P95 5초 (PRD 3.4)
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from app.core.logging import get_logger
from app.macros.registry import MacroRegistry, get_macro_registry
from app.pipeline.ir import DocumentIR, PersonaMode
from app.pipeline.stages import (
    analyze_document,
    apply_auto_macros,
    apply_form_mapping,
    apply_review_tags,
    build_preview_payload,
    parse_markdown,
)
from app.providers.llm import ModelProvider, get_llm_provider

log = get_logger(__name__)


@dataclass
class PipelineContext:
    """파이프라인 실행 컨텍스트."""

    source: str
    persona_mode: PersonaMode = PersonaMode.WORKER
    document_id: str | None = None
    title: str = ""
    organization_id: str | None = None
    # 단계별 활성화 (테스트·디버깅용)
    skip_analyze: bool = False
    skip_review: bool = False
    skip_auto_macro: bool = False


@dataclass
class PipelineResult:
    ir: DocumentIR
    preview: dict[str, Any]
    timings_ms: dict[str, float] = field(default_factory=dict)
    total_ms: float = 0.0


class ConversionPipeline:
    """단일 진입점 — `await pipeline.run(ctx)` 한 줄로 7단계 실행.

    의존성은 생성자 주입:
    - provider: 두뇌 (TenOS·OpenAI 등 무엇이든)
    - registry: 매크로 100종 레지스트리
    """

    def __init__(
        self,
        *,
        provider: ModelProvider | None = None,
        registry: MacroRegistry | None = None,
    ) -> None:
        self.provider = provider or get_llm_provider()
        self.registry = registry or get_macro_registry()

    async def run(self, ctx: PipelineContext) -> PipelineResult:
        timings: dict[str, float] = {}
        t_start = time.perf_counter()

        # ── 1 입력 파싱 ──
        t0 = time.perf_counter()
        ir = parse_markdown(
            ctx.source,
            document_id=ctx.document_id,
            title=ctx.title,
            persona_mode=ctx.persona_mode,
        )
        ir.organization_id = ctx.organization_id
        timings["1_parse"] = (time.perf_counter() - t0) * 1000

        # ── 2 TenOS 분석 ──
        if not ctx.skip_analyze:
            t0 = time.perf_counter()
            ir = await analyze_document(ir, self.provider)
            timings["2_analyze"] = (time.perf_counter() - t0) * 1000

        # ── 3 양식 매핑 ──
        t0 = time.perf_counter()
        ir = apply_form_mapping(ir)
        timings["3_map_form"] = (time.perf_counter() - t0) * 1000

        # ── 4 검토 태그 ──
        if not ctx.skip_review:
            t0 = time.perf_counter()
            ir = await apply_review_tags(ir, self.provider)
            timings["4_review_tag"] = (time.perf_counter() - t0) * 1000

        # ── 5 매크로 자동 적용 ──
        if not ctx.skip_auto_macro:
            t0 = time.perf_counter()
            ir = apply_auto_macros(ir, self.registry)
            timings["5_auto_macro"] = (time.perf_counter() - t0) * 1000

        # (단계 6 직렬화는 별도 엔드포인트에서 — 변환 결과를 본 후 다운로드 시)

        # latency를 preview 빌드 *전*에 확정 — preview payload에 정확한 값이 들어가도록
        total = (time.perf_counter() - t_start) * 1000
        ir.latency_ms = total

        # ── 7 미리보기 페이로드 ──
        t0 = time.perf_counter()
        preview = build_preview_payload(ir)
        timings["7_preview"] = (time.perf_counter() - t0) * 1000
        log.info(
            "변환 완료",
            document_id=ir.document_id,
            blocks=len(ir.blocks),
            review_tags=len(ir.review_tags),
            total_ms=round(total, 1),
            timings={k: round(v, 1) for k, v in timings.items()},
        )
        return PipelineResult(ir=ir, preview=preview, timings_ms=timings, total_ms=total)
