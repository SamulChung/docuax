"""관리자 전용 API — /admin/* 페이지를 위한 집계·관리 엔드포인트.

모든 엔드포인트는 require_admin 의존성으로 가드된다.

엔드포인트:
  GET  /admin/dashboard          핵심 지표 (사용자·MRR·변환·매크로)
  GET  /admin/users              사용자 목록 (관리자 전용)
  PATCH /admin/users/{user_id}   사용자 플랜·상태 변경
  GET  /admin/audit-logs         최근 감사 로그 (compliance API의 관리자 버전)
  GET  /admin/conversions        변환 통계 (일·플랜·매크로별)
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.logging import get_logger
from app.db import get_db
from app.models import AuditLog, ConversionRun, MacroLog, User
from app.services.organization_profile import list_profiles
from app.services.prompt_library import list_prompts
from app.services.template_library import list_uploads

router = APIRouter()
log = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard
# ─────────────────────────────────────────────────────────────────────────────

class DashboardMetric(BaseModel):
    label: str
    value: int | float
    delta_pct: float | None = None  # 전 기간 대비 변화율
    unit: str = ""  # "명", "원", "건" 등


class DashboardResponse(BaseModel):
    generated_at: datetime
    # 사용자
    users_total: int
    users_active_7d: int
    users_new_7d: int
    users_by_plan: dict[str, int]
    # 변환·매크로
    conversions_total: int
    conversions_7d: int
    conversions_today: int
    macro_executions_7d: int
    # 자산
    org_profiles_count: int
    prompts_count: int
    templates_count: int
    # 매출 추정 (MRR — 플랜별 가격 × 인원)
    estimated_mrr_krw: int
    # 신규 가입 시계열 (최근 14일)
    signups_timeseries: list[dict]  # [{"date": "2026-05-01", "count": 3}, ...]


# 플랜별 가격 (KRW/월) — MRR 추정용
PLAN_PRICE_KRW: dict[str, int] = {
    "free": 0,
    "pro": 39_000,
    "team": 290_000,
    "enterprise": 4_000_000,  # 평균
}


@router.get("/admin/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    user: Annotated[User, Depends(require_admin)],
    db: AsyncSession = Depends(get_db),
) -> DashboardResponse:
    """관리자 대시보드 — 핵심 지표 한번에."""
    now = datetime.utcnow()
    seven_days_ago = now - timedelta(days=7)
    today_start = datetime(now.year, now.month, now.day)

    # 사용자
    users_total = (await db.execute(select(func.count(User.id)))).scalar() or 0
    users_active_7d = (await db.execute(
        select(func.count(User.id)).where(User.last_login >= seven_days_ago)
    )).scalar() or 0
    users_new_7d = (await db.execute(
        select(func.count(User.id)).where(User.created_at >= seven_days_ago)
    )).scalar() or 0
    plan_rows = (await db.execute(
        select(User.plan, func.count(User.id)).group_by(User.plan)
    )).all()
    users_by_plan = {plan or "free": count for plan, count in plan_rows}

    # 변환
    conversions_total = (await db.execute(select(func.count(ConversionRun.id)))).scalar() or 0
    conversions_7d = (await db.execute(
        select(func.count(ConversionRun.id)).where(ConversionRun.created_at >= seven_days_ago)
    )).scalar() or 0
    conversions_today = (await db.execute(
        select(func.count(ConversionRun.id)).where(ConversionRun.created_at >= today_start)
    )).scalar() or 0

    # 매크로
    macro_executions_7d = (await db.execute(
        select(func.count(MacroLog.id)).where(MacroLog.executed_at >= seven_days_ago)
    )).scalar() or 0

    # 자산
    org_profiles_count = len(list_profiles(include_private=True))
    prompts_count = len(list_prompts(scope="all"))
    templates_count = len(list_uploads(scope="all"))

    # MRR (플랜별 가격 × 인원수, free 제외)
    mrr = 0
    for plan, count in users_by_plan.items():
        mrr += PLAN_PRICE_KRW.get(plan, 0) * count

    # 신규 가입 시계열 (최근 14일)
    signups: list[dict] = []
    for i in range(13, -1, -1):
        day_start = today_start - timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        count = (await db.execute(
            select(func.count(User.id)).where(
                (User.created_at >= day_start) & (User.created_at < day_end)
            )
        )).scalar() or 0
        signups.append({"date": day_start.strftime("%Y-%m-%d"), "count": count})

    return DashboardResponse(
        generated_at=now,
        users_total=users_total,
        users_active_7d=users_active_7d,
        users_new_7d=users_new_7d,
        users_by_plan=users_by_plan,
        conversions_total=conversions_total,
        conversions_7d=conversions_7d,
        conversions_today=conversions_today,
        macro_executions_7d=macro_executions_7d,
        org_profiles_count=org_profiles_count,
        prompts_count=prompts_count,
        templates_count=templates_count,
        estimated_mrr_krw=mrr,
        signups_timeseries=signups,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Users
# ─────────────────────────────────────────────────────────────────────────────

class AdminUserOut(BaseModel):
    id: str
    email: str
    name: str
    plan: str
    persona_mode: str
    organization_id: str | None
    opt_in_training: bool
    created_at: datetime
    last_login: datetime | None
    conversion_count: int = 0  # 누적 변환 횟수


class UsersListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[AdminUserOut]


@router.get("/admin/users", response_model=UsersListResponse)
async def list_users(
    user: Annotated[User, Depends(require_admin)],
    db: AsyncSession = Depends(get_db),
    q: str = Query("", description="이메일·이름 부분검색"),
    plan: str = Query("", description="플랜 필터"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> UsersListResponse:
    """사용자 목록 — 검색·플랜 필터 + 페이지네이션."""
    base = select(User)
    if q:
        like = f"%{q}%"
        base = base.where((User.email.ilike(like)) | (User.name.ilike(like)))
    if plan:
        base = base.where(User.plan == plan)

    # 총 개수
    total = (await db.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar() or 0

    # 페이지
    rows = (await db.execute(
        base.order_by(User.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
    )).scalars().all()

    items: list[AdminUserOut] = []
    for u in rows:
        # 사용자별 변환 누적
        try:
            conv_count = (await db.execute(
                select(func.count(ConversionRun.id))
                .join(ConversionRun.document)
                .where(ConversionRun.document.has(user_id=u.id))
            )).scalar() or 0
        except Exception:
            conv_count = 0
        items.append(AdminUserOut(
            id=u.id,
            email=u.email,
            name=u.name,
            plan=u.plan,
            persona_mode=u.persona_mode,
            organization_id=u.organization_id,
            opt_in_training=u.opt_in_training,
            created_at=u.created_at,
            last_login=u.last_login,
            conversion_count=conv_count,
        ))

    return UsersListResponse(total=total, page=page, page_size=page_size, items=items)


class UserUpdate(BaseModel):
    plan: Literal["free", "pro", "team", "enterprise"] | None = None
    organization_id: str | None = None
    opt_in_training: bool | None = None


@router.patch("/admin/users/{user_id}", response_model=AdminUserOut)
async def update_user(
    user_id: str,
    body: UserUpdate,
    admin_user: Annotated[User, Depends(require_admin)],
    db: AsyncSession = Depends(get_db),
) -> AdminUserOut:
    """사용자 플랜·조직·옵트인 변경."""
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="사용자 없음")
    changes = body.model_dump(exclude_none=True)
    for k, v in changes.items():
        setattr(target, k, v)
    await db.commit()
    await db.refresh(target)
    log.info("관리자 사용자 변경", admin=admin_user.email, target=target.email, changes=changes)
    return AdminUserOut(
        id=target.id, email=target.email, name=target.name, plan=target.plan,
        persona_mode=target.persona_mode, organization_id=target.organization_id,
        opt_in_training=target.opt_in_training, created_at=target.created_at,
        last_login=target.last_login,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Audit Logs (admin view — 모든 사용자, 필터 가능)
# ─────────────────────────────────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    id: str
    at: datetime
    user_id: str | None
    user_email: str
    action: str
    resource_type: str
    resource_id: str
    status: str
    ip: str


@router.get("/admin/audit-logs", response_model=list[AuditLogOut])
async def admin_audit_logs(
    user: Annotated[User, Depends(require_admin)],
    db: AsyncSession = Depends(get_db),
    action: str = Query("", description="action 필터 (예: auth.login)"),
    status_filter: str = Query("", alias="status", description="status 필터"),
    limit: int = Query(100, ge=1, le=500),
) -> list[AuditLogOut]:
    """감사 로그 — 관리자는 모든 사용자 조회 가능."""
    stmt = select(AuditLog).order_by(AuditLog.at.desc()).limit(limit)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if status_filter:
        stmt = stmt.where(AuditLog.status == status_filter)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        AuditLogOut(
            id=r.id, at=r.at, user_id=r.user_id, user_email=r.user_email,
            action=r.action, resource_type=r.resource_type, resource_id=r.resource_id,
            status=r.status, ip=r.ip,
        )
        for r in rows
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Conversions (관리자 통계)
# ─────────────────────────────────────────────────────────────────────────────

class MacroUsageRow(BaseModel):
    macro_id: str
    usage_count: int


class ConversionStatsResponse(BaseModel):
    last_n_days: int
    conversions_by_day: list[dict]  # [{"date": "...", "count": N}]
    top_macros: list[MacroUsageRow]


@router.get("/admin/conversions/stats", response_model=ConversionStatsResponse)
async def conversion_stats(
    user: Annotated[User, Depends(require_admin)],
    db: AsyncSession = Depends(get_db),
    days: int = Query(14, ge=1, le=90),
) -> ConversionStatsResponse:
    """일별 변환 횟수 + 매크로 사용 TOP10."""
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)

    series: list[dict] = []
    for i in range(days - 1, -1, -1):
        day_start = today_start - timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        count = (await db.execute(
            select(func.count(ConversionRun.id)).where(
                (ConversionRun.created_at >= day_start)
                & (ConversionRun.created_at < day_end)
            )
        )).scalar() or 0
        series.append({"date": day_start.strftime("%Y-%m-%d"), "count": count})

    # 매크로 TOP10
    macro_rows = (await db.execute(
        select(MacroLog.macro_id, func.count(MacroLog.id).label("c"))
        .where(MacroLog.executed_at >= today_start - timedelta(days=days))
        .group_by(MacroLog.macro_id)
        .order_by(func.count(MacroLog.id).desc())
        .limit(10)
    )).all()

    return ConversionStatsResponse(
        last_n_days=days,
        conversions_by_day=series,
        top_macros=[MacroUsageRow(macro_id=m, usage_count=c) for m, c in macro_rows],
    )
