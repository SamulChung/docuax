"""플랜별 사용 한도 enforcement.

MVP 한도 (PRD 0.2의 4단계 플랜):
  free:       하루 20건 변환, 5개 양식 업로드
  pro:        하루 500건, 무제한 양식
  team:       하루 무제한, 무제한 양식, 조직 공유
  enterprise: 무제한 + On-premise

ConversionRun 테이블의 created_at 카운트로 일일 사용량 측정.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ConversionRun, Document


@dataclass
class PlanLimits:
    daily_conversions: int  # -1 = 무제한
    max_uploaded_templates: int  # -1 = 무제한
    can_share_with_org: bool
    can_use_on_premise: bool
    can_use_rag: bool


PLANS: dict[str, PlanLimits] = {
    "free":       PlanLimits(daily_conversions=20,  max_uploaded_templates=5,   can_share_with_org=False, can_use_on_premise=False, can_use_rag=False),
    "pro":        PlanLimits(daily_conversions=500, max_uploaded_templates=-1,  can_share_with_org=False, can_use_on_premise=False, can_use_rag=True),
    "team":       PlanLimits(daily_conversions=-1,  max_uploaded_templates=-1,  can_share_with_org=True,  can_use_on_premise=False, can_use_rag=True),
    "enterprise": PlanLimits(daily_conversions=-1,  max_uploaded_templates=-1,  can_share_with_org=True,  can_use_on_premise=True,  can_use_rag=True),
}


def get_limits(plan: str) -> PlanLimits:
    return PLANS.get(plan, PLANS["free"])


async def count_daily_conversions(db: AsyncSession, user_id: str) -> int:
    """오늘(UTC) 변환 횟수 — ConversionRun.document → Document.user_id 조인."""
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    q = (
        select(func.count(ConversionRun.id))
        .join(Document, ConversionRun.document_id == Document.id)
        .where(Document.user_id == user_id, ConversionRun.created_at >= today_start)
    )
    res = await db.execute(q)
    return res.scalar_one() or 0


class QuotaExceeded(Exception):
    def __init__(self, message: str, *, current: int, limit: int) -> None:
        super().__init__(message)
        self.current = current
        self.limit = limit
