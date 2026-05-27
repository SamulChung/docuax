"""인증 서비스 — bcrypt 비밀번호 + JWT 토큰.

설계:
- 이메일 + 비밀번호 단순 인증 (MVP)
- JWT는 stateless. user_id·plan·exp 클레임만 담음
- bcrypt 비용 12 — 안전·성능 균형

운영에서는 Auth0/Clerk으로 교체하기 쉽도록 의존성 함수 패턴 사용.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings


# bcrypt는 72바이트 한도. 긴 비밀번호는 SHA-256으로 미리 압축 (Argon2 패턴과 유사)
def _prepare(plain: str) -> bytes:
    raw = plain.encode("utf-8")
    if len(raw) > 72:
        import hashlib
        # base64로 인코딩 → 길이 안전 + 정보 손실 없음
        import base64
        raw = base64.b64encode(hashlib.sha256(raw).digest())
    return raw


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_prepare(plain), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    if not plain or not hashed:
        return False
    try:
        return bcrypt.checkpw(_prepare(plain), hashed.encode("ascii"))
    except Exception:
        return False


def create_access_token(*, user_id: str, plan: str = "free", extras: dict[str, Any] | None = None) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": user_id,
        "plan": plan,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_expires_min)).timestamp()),
    }
    if extras:
        payload.update(extras)
    return jwt.encode(payload, settings.app_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any] | None:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.app_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


# ─── 비밀번호 재설정 — 단기(30분) 토큰 ──────────────────────────────────────

PASSWORD_RESET_PURPOSE = "pwreset"


def create_password_reset_token(user_id: str, ttl_minutes: int = 30) -> str:
    """비밀번호 재설정용 단기 토큰. purpose 클레임으로 일반 access_token 과 분리."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "purpose": PASSWORD_RESET_PURPOSE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ttl_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.app_secret_key, algorithm=settings.jwt_algorithm)


def decode_password_reset_token(token: str) -> str | None:
    """재설정 토큰 검증 → 유효 시 user_id, 무효 시 None.
    purpose 가 'pwreset' 가 아니면 거부 (access_token 의 재사용 방지)."""
    payload = decode_token(token)
    if not payload:
        return None
    if payload.get("purpose") != PASSWORD_RESET_PURPOSE:
        return None
    return payload.get("sub")


# ─── Refresh Token ───────────────────────────────────────────────────────────

import hashlib
import secrets

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

REFRESH_TOKEN_TTL_DAYS = 30


def _hash_token(raw: str) -> str:
    """평문 토큰을 SHA-256 hex로 변환 (DB 저장용)."""
    return hashlib.sha256(raw.encode()).hexdigest()


async def create_refresh_token(db: AsyncSession, user_id: str) -> str:
    """새 refresh token 생성 → DB 저장 → 평문 반환.
    호출자가 db.commit() 해야 함."""
    from app.models import RefreshToken

    raw = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_TTL_DAYS)
    rt = RefreshToken(
        user_id=user_id,
        token_hash=_hash_token(raw),
        expires_at=expires_at,
    )
    db.add(rt)
    await db.flush()
    return raw


async def verify_and_rotate_refresh_token(
    db: AsyncSession, raw: str
) -> str | None:
    """Refresh token 검증 + rotation.

    1. hash로 DB 조회
    2. 만료/revoke 확인
    3. 기존 token revoke
    4. user_id 반환 (새 token 발급은 호출자 담당)
    반환값: user_id 또는 None(무효)
    """
    from app.models import RefreshToken

    token_hash = _hash_token(raw)
    res = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked.is_(False),
        )
    )
    rt = res.scalar_one_or_none()
    if not rt:
        return None

    now = datetime.now(timezone.utc)
    expires = rt.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < now:
        rt.revoked = True
        await db.commit()
        return None

    rt.revoked = True
    await db.flush()
    return rt.user_id


async def revoke_all_user_refresh_tokens(db: AsyncSession, user_id: str) -> None:
    """사용자의 모든 refresh token revoke (로그아웃 시)."""
    from app.models import RefreshToken

    await db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked.is_(False),
        )
        .values(revoked=True)
    )
