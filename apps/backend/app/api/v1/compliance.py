"""ISMS-P 컴플라이언스 API.

엔드포인트:
  GET  /compliance/preferences        내 동의 상태 (학습·마케팅)
  POST /compliance/preferences        동의 변경
  GET  /compliance/audit-logs         내 감사 로그 (최근 90일)
  POST /compliance/audit-cleanup      관리자: 90일 초과 로그 삭제

옵트인 정책 (PRD 6.3):
- 학습 데이터 활용은 사용자 옵트인 시에만
- Enterprise 플랜은 옵트아웃 기본
- 변환 본문은 24시간 내 자동 삭제 옵션 (별도 cron)
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.db import get_db
from app.models import AuditLog, User
from app.services.audit import audit_log, cleanup_old_logs

router = APIRouter()


class Preferences(BaseModel):
    opt_in_training: bool
    opt_in_marketing: bool


class PreferencesUpdate(BaseModel):
    opt_in_training: bool | None = None
    opt_in_marketing: bool | None = None


@router.get("/compliance/preferences", response_model=Preferences)
async def get_preferences(user: Annotated[User, Depends(get_current_user)]) -> Preferences:
    return Preferences(
        opt_in_training=bool(user.opt_in_training),
        opt_in_marketing=bool(user.opt_in_marketing),
    )


@router.post("/compliance/preferences", response_model=Preferences)
async def update_preferences(
    update: PreferencesUpdate,
    user: Annotated[User, Depends(get_current_user)],
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Preferences:
    changes: dict[str, bool] = {}
    if update.opt_in_training is not None and user.opt_in_training != update.opt_in_training:
        changes["opt_in_training"] = update.opt_in_training
        user.opt_in_training = update.opt_in_training
    if update.opt_in_marketing is not None and user.opt_in_marketing != update.opt_in_marketing:
        changes["opt_in_marketing"] = update.opt_in_marketing
        user.opt_in_marketing = update.opt_in_marketing
    if changes:
        await db.commit()
        await audit_log(
            db, action="preferences.update",
            user=user, resource_type="user", resource_id=user.id,
            request=request, detail=changes,
        )
    return Preferences(
        opt_in_training=bool(user.opt_in_training),
        opt_in_marketing=bool(user.opt_in_marketing),
    )


class AuditEntry(BaseModel):
    id: str
    at: datetime
    action: str
    resource_type: str
    resource_id: str
    status: str
    ip: str
    detail: dict


@router.get("/compliance/audit-logs", response_model=list[AuditEntry])
async def my_audit_logs(
    user: Annotated[User, Depends(get_current_user)],
    days: int = 90,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
) -> list[AuditEntry]:
    """내 감사 로그 조회 (최근 N일)."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    q = (
        select(AuditLog)
        .where(AuditLog.user_id == user.id, AuditLog.at >= cutoff)
        .order_by(AuditLog.at.desc())
        .limit(min(limit, 1000))
    )
    res = await db.execute(q)
    return [
        AuditEntry(
            id=row.id, at=row.at, action=row.action,
            resource_type=row.resource_type, resource_id=row.resource_id,
            status=row.status, ip=row.ip, detail=row.detail or {},
        )
        for row in res.scalars()
    ]


@router.post("/compliance/audit-cleanup")
async def admin_cleanup(
    _user: Annotated[User, Depends(require_admin)],
    days: int = 90,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """90일 초과 감사 로그 정리. 관리자 전용 (is_admin_user)."""
    deleted = await cleanup_old_logs(db, days=days)
    return {"deleted": deleted, "retention_days": days}
