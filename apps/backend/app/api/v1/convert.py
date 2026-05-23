from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_optional
from app.core.logging import get_logger
from app.core.rate_limit import rate_limit_convert
from app.db import get_db
from app.models import ConversionRun, User
from app.pipeline import ConversionPipeline, PipelineContext, PersonaMode
from app.providers.llm import get_llm_provider
from app.schemas import ConvertRequest, ConvertResponse
from app.services.document_cache import get_document_cache
from app.services.organization_profile import remember_for_document, resolve_profile
from app.services.plan_enforcement import count_daily_conversions, get_limits

router = APIRouter()
log = get_logger(__name__)


@router.post("/convert", response_model=ConvertResponse)
async def convert(
    req: ConvertRequest,
    db: AsyncSession = Depends(get_db),
    user: Annotated[User | None, Depends(get_current_user_optional)] = None,
    _rl: None = Depends(rate_limit_convert),
) -> ConvertResponse:
    if not req.source.strip():
        raise HTTPException(status_code=400, detail="source is empty")

    # 플랜 enforcement — 로그인 사용자만 적용 (익명은 호출 시 별도 경로 권장)
    if user is not None:
        limits = get_limits(user.plan)
        if limits.daily_conversions > 0:
            used = await count_daily_conversions(db, user.id)
            if used >= limits.daily_conversions:
                raise HTTPException(
                    status_code=429,
                    detail=f"오늘 변환 한도 초과 ({used}/{limits.daily_conversions}). {user.plan} 플랜의 일일 한도입니다. 업그레이드: /pricing",
                )

    pipeline = ConversionPipeline()
    ctx = PipelineContext(
        source=req.source,
        title=req.title,
        persona_mode=PersonaMode(req.persona_mode),
        organization_id=req.organization_id,
        document_id=req.document_id,
        skip_analyze=req.skip_analyze,
        skip_review=req.skip_review,
    )
    result = await pipeline.run(ctx)

    # 캐시에 보관 — 후속 매크로·렌더링 호출이 같은 IR을 사용
    get_document_cache().set(result.ir)

    # 조직 프로파일 해소 — 렌더러가 같은 문서를 출력할 때 적용
    profile = resolve_profile(organization_id=req.organization_id)
    remember_for_document(result.ir.document_id, profile)
    if profile:
        log.info("조직 프로파일 적용 예약", document_id=result.ir.document_id, profile=profile.slug)

    # ConversionRun DB 기록 — 모델 추적·A/B 비교의 기반
    try:
        provider = get_llm_provider()
        token_count = 0
        if hasattr(provider, "last_usage"):
            token_count = int(provider.last_usage.get("total", 0) or 0)
        run = ConversionRun(
            document_id=result.ir.document_id,
            model_version=result.ir.model_version or provider.model_id,
            latency_ms=result.total_ms,
            token_count=token_count,
            persona_mode=req.persona_mode,
            review_tags={
                "red": result.preview["review_counts"]["red"],
                "blue": result.preview["review_counts"]["blue"],
                "yellow": result.preview["review_counts"]["yellow"],
            },
            timings_ms=result.timings_ms,
        )
        db.add(run)
        # Document FK가 없어도 무방하도록 commit 실패 시 무시 (운영에서는 Document 먼저 생성)
        try:
            await db.commit()
        except Exception as e:  # noqa: BLE001
            await db.rollback()
            log.warning("ConversionRun 기록 실패 (Document 미존재 등) — 무시", error=str(e))
    except Exception as e:  # noqa: BLE001
        log.warning("ConversionRun 기록 단계 예외 — 변환 결과는 정상 반환", error=str(e))

    return ConvertResponse(
        document_id=result.ir.document_id,
        preview=result.preview,
        timings_ms=result.timings_ms,
        total_ms=result.total_ms,
        model_version=result.ir.model_version,
    )
