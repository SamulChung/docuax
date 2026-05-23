"""ISMS-P 감사 로깅.

설계:
- 모든 민감 작업(로그인·변환·다운로드·업로드·플랜 변경)을 AuditLog에 기록
- 90일 retention — 정기 cleanup으로 삭제
- 운영에서는 SIEM(Splunk·Elasticsearch)으로 stream 권장. 현재는 DB에 저장.

사용:
  await audit_log(db, action="convert", resource_id=doc_id, user=user, request=request)
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import Request
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models import AuditLog, User

log = get_logger(__name__)

RETENTION_DAYS = 90


def _request_meta(request: Request | None) -> dict[str, str]:
    if not request:
        return {"ip": "", "user_agent": ""}
    # 프록시 X-Forwarded-For 우선
    fwd = request.headers.get("X-Forwarded-For", "")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "")
    return {
        "ip": ip[:64],
        "user_agent": request.headers.get("User-Agent", "")[:500],
    }


async def audit_log(
    db: AsyncSession,
    *,
    action: str,
    user: User | None = None,
    resource_type: str = "",
    resource_id: str = "",
    status: str = "ok",
    request: Request | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    """감사 로그 1건 기록. 실패해도 호출자 흐름은 막지 않음."""
    try:
        meta = _request_meta(request)
        entry = AuditLog(
            user_id=user.id if user else None,
            user_email=user.email if user else "",
            action=action[:64],
            resource_type=resource_type[:48],
            resource_id=str(resource_id)[:64],
            status=status[:16],
            ip=meta["ip"],
            user_agent=meta["user_agent"],
            detail=detail or {},
        )
        db.add(entry)
        await db.commit()
    except Exception as e:  # noqa: BLE001
        log.warning("audit_log 기록 실패", action=action, error=str(e))
        try:
            await db.rollback()
        except Exception:
            pass


async def cleanup_old_logs(db: AsyncSession, *, days: int = RETENTION_DAYS) -> int:
    """RETENTION_DAYS 보다 오래된 로그 삭제. 반환: 삭제된 행 수."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    res = await db.execute(delete(AuditLog).where(AuditLog.at < cutoff))
    await db.commit()
    return res.rowcount or 0
