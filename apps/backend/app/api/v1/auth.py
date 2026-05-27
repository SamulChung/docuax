"""인증 API — 가입·로그인·내 정보·로그아웃.

엔드포인트:
  POST /auth/register        이메일+비밀번호 가입
  POST /auth/login           로그인 → JWT 토큰 반환
  GET  /auth/me              현재 사용자 정보
  POST /auth/logout          쿠키 삭제 (토큰 자체는 stateless라 무효화는 클라이언트가)
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import Request

from app.api.deps import get_current_user
from app.core.rate_limit import rate_limit_auth
from app.db import get_db
from app.models import User
from app.services.audit import audit_log
from app.services.auth import create_access_token, hash_password, verify_password

router = APIRouter()


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=200)
    password: str = Field(..., min_length=8, max_length=200)
    name: str = Field("", max_length=120)


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class MeResponse(BaseModel):
    id: str
    email: str
    name: str
    plan: str
    persona_mode: str
    organization_id: str | None
    created_at: datetime
    is_admin: bool = False


def _user_public(u: User) -> dict:
    from app.api.deps import is_admin_user
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "plan": u.plan,
        "persona_mode": u.persona_mode,
        "organization_id": u.organization_id,
        "is_admin": is_admin_user(u),
    }


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@router.post("/auth/register", response_model=AuthResponse)
async def register(
    req: RegisterRequest, response: Response, request: Request,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_auth),
) -> AuthResponse:
    if not _EMAIL_RE.match(req.email):
        raise HTTPException(status_code=400, detail="잘못된 이메일 형식")

    # 중복 확인
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 가입된 이메일입니다")

    user = User(
        email=req.email,
        name=req.name or req.email.split("@")[0],
        password_hash=hash_password(req.password),
        plan="free",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user_id=user.id, plan=user.plan)
    response.set_cookie(
        key="docuax_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24,
    )
    await audit_log(db, action="auth.register", user=user, request=request)
    return AuthResponse(access_token=token, user=_user_public(user))


@router.post("/auth/login", response_model=AuthResponse)
async def login(
    req: LoginRequest, response: Response, request: Request,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_auth),
) -> AuthResponse:
    res = await db.execute(select(User).where(User.email == req.email))
    user = res.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        # 실패도 기록 — 무차별 공격 추적용
        await audit_log(
            db, action="auth.login", user=None, status="denied",
            request=request, detail={"email": req.email[:100]},
        )
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 잘못되었습니다")

    user.last_login = datetime.utcnow()
    await db.commit()

    token = create_access_token(user_id=user.id, plan=user.plan)
    response.set_cookie(
        key="docuax_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24,
    )
    await audit_log(db, action="auth.login", user=user, request=request)
    return AuthResponse(access_token=token, user=_user_public(user))


@router.post("/auth/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie("docuax_token")
    return {"ok": True}


class PasswordResetRequest(BaseModel):
    email: str


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=200)


@router.post("/auth/password/request-reset")
async def request_password_reset(
    body: PasswordResetRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_auth),
) -> dict:
    """비밀번호 재설정 토큰 발급.

    보안 원칙: 이메일이 존재하든 안 하든 동일한 응답 (계정 탐색 방지).
    실제 전송은 운영의 메일 게이트웨이(SES/SendGrid)에 위탁.
    """
    res = await db.execute(select(User).where(User.email == body.email))
    user = res.scalar_one_or_none()
    if user:
        # 30분 만료 토큰 생성
        from app.services.auth import create_password_reset_token
        from app.services.email import get_email_service
        token = create_password_reset_token(user.id)
        email_svc = get_email_service()
        await email_svc.send_password_reset_email(user.email, token)
        await audit_log(
            db, action="auth.password_reset_request", user=user,
            request=request, status="ok",
        )
    # 보안: 항상 동일 응답
    return {"ok": True, "message": "재설정 안내를 이메일로 발송했습니다. 메일이 도착하지 않으면 스팸함을 확인하세요."}


@router.post("/auth/password/reset")
async def confirm_password_reset(
    body: PasswordResetConfirm,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_auth),
) -> dict:
    """재설정 토큰으로 비밀번호 변경."""
    from app.services.auth import decode_password_reset_token
    user_id = decode_password_reset_token(body.token)
    if not user_id:
        raise HTTPException(status_code=400, detail="유효하지 않거나 만료된 재설정 링크입니다.")
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자 없음")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    await audit_log(db, action="auth.password_reset", user=user, request=request)
    return {"ok": True, "message": "비밀번호가 변경되었습니다. 다시 로그인하세요."}


@router.get("/auth/me", response_model=MeResponse)
async def me(user: Annotated[User, Depends(get_current_user)]) -> MeResponse:
    from app.api.deps import is_admin_user
    return MeResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        plan=user.plan,
        persona_mode=user.persona_mode,
        organization_id=user.organization_id,
        created_at=user.created_at,
        is_admin=is_admin_user(user),
    )
