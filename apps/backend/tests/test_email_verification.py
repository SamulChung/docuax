"""이메일 인증 서비스 단위 테스트."""
import pytest
from datetime import datetime, timezone, timedelta

from app.services.auth import (
    create_verification_token,
    decode_verification_token,
    EMAIL_VERIFY_PURPOSE,
)
from app.core.config import get_settings


def test_create_verification_token_returns_string():
    token = create_verification_token("user-id-001")
    assert isinstance(token, str)
    assert len(token) > 20


def test_decode_verification_token_valid():
    """유효한 토큰 → user_id 반환."""
    token = create_verification_token("user-xyz")
    result = decode_verification_token(token)
    assert result == "user-xyz"


def test_decode_verification_token_wrong_purpose():
    """purpose가 email_verify가 아닌 토큰은 거부."""
    from jose import jwt
    settings = get_settings()
    now = datetime.now(timezone.utc)
    bad_token = jwt.encode(
        {
            "sub": "user-abc",
            "purpose": "pwreset",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(hours=1)).timestamp()),
        },
        settings.app_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    assert decode_verification_token(bad_token) is None


def test_decode_verification_token_invalid():
    """쓰레기 토큰 → None."""
    assert decode_verification_token("garbage-token") is None


def test_verification_token_purpose_constant():
    """EMAIL_VERIFY_PURPOSE 상수 값 확인."""
    assert EMAIL_VERIFY_PURPOSE == "email_verify"
