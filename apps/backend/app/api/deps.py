"""FastAPI 의존성 — 현재 사용자·플랜 추출.

API 라우터는 `current_user: User = Depends(get_current_user)` 식으로 사용.
운영에서 Auth0/Clerk으로 교체 시 이 모듈만 변경.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import User
from app.services.auth import decode_token

_bearer = HTTPBearer(auto_error=False)


async def get_current_user_optional(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """토큰이 있으면 user 반환, 없으면 None. 익명 허용 API용."""
    # Authorization 헤더 또는 쿠키 (둘 다 허용)
    token = None
    if credentials and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    if not token:
        token = request.cookies.get("docuax_token")
    if not token:
        return None

    payload = decode_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None

    res = await db.execute(select(User).where(User.id == user_id))
    return res.scalar_one_or_none()


async def get_current_user(
    user: Annotated[User | None, Depends(get_current_user_optional)],
) -> User:
    """필수 인증 — 미인증 시 401."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증이 필요합니다",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def is_admin_user(user: User | None) -> bool:
    """User → admin 여부. config의 allowlist 또는 plan=enterprise 면 admin."""
    if user is None:
        return False
    from app.core.config import get_settings
    if get_settings().is_admin_email(user.email):
        return True
    # enterprise 플랜은 자동 admin (조직 관리자 가정)
    if (user.plan or "").lower() == "enterprise":
        return True
    return False


async def require_admin(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    """관리자 전용 엔드포인트에 사용."""
    if not is_admin_user(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다",
        )
    return user
