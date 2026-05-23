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
