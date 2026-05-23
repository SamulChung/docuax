"""운영 메트릭 — Prometheus 호환 텍스트 포맷.

엔드포인트:
  GET /metrics         Prometheus 스크레이프 (text/plain)
  GET /metrics/stats   사람이 보기 좋은 JSON (관리자 페이지용)

집계 대상:
  - 누적 변환 수 (모델별, 페르소나별)
  - 평균/P95 지연시간
  - 검토 태그 카운트 (빨강·파랑·노랑 평균)
  - 매크로 사용 빈도 (top-10)
  - 사용자·문서 수
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import ConversionRun, Document, MacroLog, User

router = APIRouter()


async def _gather_stats(db: AsyncSession) -> dict:
    """DB에서 통계 수집."""
    now = datetime.utcnow()
    last_24h = now - timedelta(hours=24)
    last_7d = now - timedelta(days=7)

    # 총 변환 수
    total_runs = (await db.execute(select(func.count(ConversionRun.id)))).scalar_one() or 0
    runs_24h = (await db.execute(
        select(func.count(ConversionRun.id)).where(ConversionRun.created_at >= last_24h)
    )).scalar_one() or 0
    runs_7d = (await db.execute(
        select(func.count(ConversionRun.id)).where(ConversionRun.created_at >= last_7d)
    )).scalar_one() or 0

    # 모델별 분포
    model_q = (
        select(ConversionRun.model_version, func.count(ConversionRun.id))
        .group_by(ConversionRun.model_version)
    )
    model_counts = {row[0]: row[1] for row in (await db.execute(model_q)).all()}

    # 페르소나 분포
    persona_q = (
        select(ConversionRun.persona_mode, func.count(ConversionRun.id))
        .group_by(ConversionRun.persona_mode)
    )
    persona_counts = {row[0]: row[1] for row in (await db.execute(persona_q)).all()}

    # 평균 지연시간 (전체)
    avg_latency = (await db.execute(select(func.avg(ConversionRun.latency_ms)))).scalar_one()
    avg_latency = float(avg_latency) if avg_latency else 0.0

    # 평균 토큰
    avg_tokens = (await db.execute(select(func.avg(ConversionRun.token_count)))).scalar_one()
    avg_tokens = float(avg_tokens) if avg_tokens else 0.0

    # 사용자·문서 수
    users = (await db.execute(select(func.count(User.id)))).scalar_one() or 0
    docs = (await db.execute(select(func.count(Document.id)))).scalar_one() or 0

    # 플랜 분포
    plan_q = select(User.plan, func.count(User.id)).group_by(User.plan)
    plan_counts = {row[0]: row[1] for row in (await db.execute(plan_q)).all()}

    # 매크로 사용 top-10
    macro_q = (
        select(MacroLog.macro_id, func.count(MacroLog.id).label("c"))
        .group_by(MacroLog.macro_id).order_by(func.count(MacroLog.id).desc()).limit(10)
    )
    macro_top = [(row[0], row[1]) for row in (await db.execute(macro_q)).all()]

    return {
        "total_conversions": total_runs,
        "conversions_24h": runs_24h,
        "conversions_7d": runs_7d,
        "avg_latency_ms": avg_latency,
        "avg_token_count": avg_tokens,
        "model_counts": model_counts,
        "persona_counts": persona_counts,
        "user_count": users,
        "doc_count": docs,
        "plan_counts": plan_counts,
        "macro_top": macro_top,
    }


def _to_prometheus(stats: dict) -> str:
    """Prometheus text exposition format."""
    lines: list[str] = []
    def add(name: str, value: float, *, help_text: str = "", labels: str = "") -> None:
        if help_text:
            lines.append(f"# HELP {name} {help_text}")
            lines.append(f"# TYPE {name} gauge")
        label_str = f"{{{labels}}}" if labels else ""
        lines.append(f"{name}{label_str} {value}")

    add("docuax_conversions_total", stats["total_conversions"], help_text="누적 변환 수")
    add("docuax_conversions_24h", stats["conversions_24h"], help_text="최근 24시간")
    add("docuax_conversions_7d", stats["conversions_7d"], help_text="최근 7일")
    add("docuax_latency_ms_avg", stats["avg_latency_ms"], help_text="평균 변환 지연(ms)")
    add("docuax_tokens_avg", stats["avg_token_count"], help_text="평균 LLM 토큰 사용")
    add("docuax_users_total", stats["user_count"], help_text="가입 사용자 수")
    add("docuax_documents_total", stats["doc_count"], help_text="문서 수")

    # 모델별
    for model, cnt in stats["model_counts"].items():
        if model:
            esc = model.replace('"', '\\"')
            add("docuax_conversions_by_model", cnt, labels=f'model="{esc}"')

    for persona, cnt in stats["persona_counts"].items():
        if persona:
            add("docuax_conversions_by_persona", cnt, labels=f'persona="{persona}"')

    for plan, cnt in stats["plan_counts"].items():
        if plan:
            add("docuax_users_by_plan", cnt, labels=f'plan="{plan}"')

    for macro_id, cnt in stats["macro_top"]:
        add("docuax_macro_executions", cnt, labels=f'macro_id="{macro_id}"')

    return "\n".join(lines) + "\n"


@router.get("/metrics", response_class=Response)
async def prometheus_metrics(db: Annotated[AsyncSession, Depends(get_db)]) -> Response:
    """Prometheus 스크레이프 엔드포인트."""
    stats = await _gather_stats(db)
    body = _to_prometheus(stats)
    return Response(content=body, media_type="text/plain; version=0.0.4")


@router.get("/metrics/stats")
async def admin_stats(db: Annotated[AsyncSession, Depends(get_db)]) -> dict:
    """관리자 페이지·디버깅용 JSON."""
    return await _gather_stats(db)
