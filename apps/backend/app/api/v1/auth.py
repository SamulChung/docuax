"""인증 API — 가입·로그인·내 정보·로그아웃.

엔드포인트:
  POST /auth/register        이메일+비밀번호 가입
  POST /auth/login           로그인 → JWT 토큰 반환
  GET  /auth/me              현재 사용자 정보
  POST /auth/logout          쿠키 삭제 (토큰 자체는 stateless라 무효화는 클라이언트가)
"""
from __future__ import annotations

import re
import secrets
from datetime import datetime
from typing import Annotated
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import RedirectResponse

from app.api.deps import get_current_user, get_current_user_optional, is_admin_user
from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.rate_limit import rate_limit_auth
from app.db import get_db
from app.models import User
from app.services.audit import audit_log
from app.services.auth import (
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    create_verification_token,
    decode_password_reset_token,
    decode_verification_token,
    hash_password,
    revoke_all_user_refresh_tokens,
    verify_and_rotate_refresh_token,
    verify_password,
)
from app.services.email import get_email_service

log = get_logger(__name__)

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
    email_verified: bool = False


def _user_public(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "plan": u.plan,
        "persona_mode": u.persona_mode,
        "organization_id": u.organization_id,
        "is_admin": is_admin_user(u),
        "email_verified": u.email_verified,
    }


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


async def _get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    """user_id로 User를 조회하는 공통 헬퍼."""
    res = await db.execute(select(User).where(User.id == user_id))
    return res.scalar_one_or_none()


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
    refresh_raw = await create_refresh_token(db, user.id)
    await db.commit()
    response.set_cookie(
        key="docuax_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=60 * 15,
        secure=get_settings().app_env == "production",
    )
    response.set_cookie(
        key="docuax_refresh",
        value=refresh_raw,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,
        secure=get_settings().app_env == "production",
    )
    # 이메일 인증 메일 발송 (실패해도 가입은 완료)
    verify_token = create_verification_token(user.id)
    try:
        await get_email_service().send_verification_email(user.email, verify_token)
    except Exception:
        log.exception("verification email send failed", user_id=user.id)
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
    refresh_raw = await create_refresh_token(db, user.id)
    await db.commit()

    token = create_access_token(user_id=user.id, plan=user.plan)
    response.set_cookie(
        key="docuax_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=60 * 15,
        secure=get_settings().app_env == "production",
    )
    response.set_cookie(
        key="docuax_refresh",
        value=refresh_raw,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,
        secure=get_settings().app_env == "production",
    )
    await audit_log(db, action="auth.login", user=user, request=request)
    return AuthResponse(access_token=token, user=_user_public(user))


@router.post("/auth/logout")
async def logout(
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
    docuax_refresh: str | None = Cookie(default=None),
) -> dict:
    if user:
        await revoke_all_user_refresh_tokens(db, user.id)
        await db.commit()
    elif docuax_refresh:
        # Access token이 만료됐지만 refresh token이 있으면 — 해시로 직접 revoke
        user_id = await verify_and_rotate_refresh_token(db, docuax_refresh)
        if user_id:
            await revoke_all_user_refresh_tokens(db, user_id)
            await db.commit()
    response.delete_cookie("docuax_token")
    response.delete_cookie("docuax_refresh")
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
    user_id = decode_password_reset_token(body.token)
    if not user_id:
        raise HTTPException(status_code=400, detail="유효하지 않거나 만료된 재설정 링크입니다.")
    user = await _get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자 없음")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    await audit_log(db, action="auth.password_reset", user=user, request=request)
    return {"ok": True, "message": "비밀번호가 변경되었습니다. 다시 로그인하세요."}


@router.get("/auth/me", response_model=MeResponse)
async def me(user: Annotated[User, Depends(get_current_user)]) -> MeResponse:
    return MeResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        plan=user.plan,
        persona_mode=user.persona_mode,
        organization_id=user.organization_id,
        created_at=user.created_at,
        is_admin=is_admin_user(user),
        email_verified=user.email_verified,
    )


@router.get("/auth/verify-email")
async def verify_email(
    token: str,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_auth),
) -> dict:
    """이메일 인증 토큰 검증 → email_verified=True 업데이트."""
    user_id = decode_verification_token(token)
    if not user_id:
        raise HTTPException(status_code=400, detail="유효하지 않거나 만료된 인증 링크입니다.")
    user = await _get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자 없음")
    if user.email_verified:
        return {"ok": True, "message": "이메일 인증 완료"}
    user.email_verified = True
    await db.commit()
    await audit_log(db, action="auth.verify_email", user=user)
    return {"ok": True, "message": "이메일 인증 완료"}


@router.post("/auth/resend-verification")
async def resend_verification(
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_auth),
) -> dict:
    """인증 메일 재발송 (이미 인증된 계정이면 즉시 성공 반환)."""
    if user.email_verified:
        return {"ok": True, "message": "이미 인증된 계정입니다"}
    verify_token = create_verification_token(user.id)
    await get_email_service().send_verification_email(user.email, verify_token)
    await audit_log(db, action="auth.resend_verification", user=user)
    return {"ok": True, "message": "인증 메일을 발송했습니다"}


@router.post("/auth/refresh")
async def refresh_token(
    response: Response,
    db: AsyncSession = Depends(get_db),
    docuax_refresh: str | None = Cookie(default=None),
) -> dict:
    """Refresh Token으로 새 Access Token + 새 Refresh Token 발급 (rotation)."""
    if not docuax_refresh:
        raise HTTPException(status_code=401, detail="refresh token 없음")

    user_id = await verify_and_rotate_refresh_token(db, docuax_refresh)
    if not user_id:
        response.delete_cookie("docuax_refresh")
        raise HTTPException(status_code=401, detail="refresh token 만료 또는 무효")

    user = await _get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="사용자 없음")

    new_access = create_access_token(user_id=user.id, plan=user.plan)
    new_refresh_raw = await create_refresh_token(db, user.id)
    await db.commit()

    response.set_cookie(
        key="docuax_refresh",
        value=new_refresh_raw,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,
        secure=get_settings().app_env == "production",
    )
    return {"access_token": new_access, "token_type": "bearer"}


# ─── Google OAuth ────────────────────────────────────────────────────────────

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

# 단일 인스턴스용 state 저장 (멀티 인스턴스 환경에서는 Redis 사용 권장)
_oauth_state_store: dict[str, bool] = {}


@router.get("/auth/google")
async def google_oauth_start() -> RedirectResponse:
    """Google OAuth 시작 — Google 인증 URL로 redirect."""
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(400, "Google OAuth가 설정되지 않았습니다. GOOGLE_CLIENT_ID 환경변수를 확인하세요.")
    state = secrets.token_urlsafe(16)
    _oauth_state_store[state] = True
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    }
    return RedirectResponse(f"{_GOOGLE_AUTH_URL}?{urlencode(params)}")


@router.get("/auth/google/callback")
async def google_oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Google OAuth callback — 사용자 계정 생성/연결 + 토큰 발급."""
    settings = get_settings()
    frontend = settings.frontend_url

    if error:
        return RedirectResponse(f"{frontend}/app?error=oauth_cancelled")

    # CSRF 검증
    if not state or state not in _oauth_state_store:
        return RedirectResponse(f"{frontend}/app?error=oauth_state_mismatch")
    del _oauth_state_store[state]

    if not code:
        return RedirectResponse(f"{frontend}/app?error=oauth_no_code")

    # code → access_token (Google)
    async with httpx.AsyncClient(timeout=10.0) as client:
        token_res = await client.post(
            _GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_res.status_code != 200:
            return RedirectResponse(f"{frontend}/app?error=oauth_token_failed")
        google_access_token = token_res.json().get("access_token")
        if not google_access_token:
            return RedirectResponse(f"{frontend}/app?error=oauth_token_missing")

        # Google access_token → userinfo
        user_res = await client.get(
            _GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {google_access_token}"},
        )
        if user_res.status_code != 200:
            return RedirectResponse(f"{frontend}/app?error=oauth_userinfo_failed")
        userinfo = user_res.json()

    google_id: str = userinfo.get("sub", "")
    email: str = userinfo.get("email", "")
    name: str = userinfo.get("name", "") or (email.split("@")[0] if email else "사용자")

    if not google_id or not email:
        return RedirectResponse(f"{frontend}/app?error=oauth_missing_info")

    # 기존 계정 조회 (google_id 우선, 이메일 차선)
    res = await db.execute(select(User).where(User.google_id == google_id))
    user = res.scalar_one_or_none()

    if not user:
        res2 = await db.execute(select(User).where(User.email == email))
        user = res2.scalar_one_or_none()
        if user:
            # 기존 이메일 계정에 google_id 연결
            user.google_id = google_id
        else:
            # 신규 계정 생성 (비밀번호 없음, email_verified=True)
            user = User(
                email=email,
                name=name,
                google_id=google_id,
                email_verified=True,
                plan="free",
            )
            db.add(user)

    user.last_login = datetime.utcnow()
    await db.flush()

    # DocuAX 토큰 발급
    access_token = create_access_token(user_id=user.id, plan=user.plan)
    refresh_raw = await create_refresh_token(db, user.id)
    await db.commit()
    await db.refresh(user)

    # 프론트엔드로 redirect (access_token은 URL 파라미터, refresh는 쿠키)
    redirect = RedirectResponse(f"{frontend}/app?token={access_token}")
    redirect.set_cookie(
        key="docuax_refresh",
        value=refresh_raw,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,
        secure=get_settings().app_env == "production",
    )
    return redirect
