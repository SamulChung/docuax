"""Refresh Token 단위 테스트."""
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.auth import (
    _hash_token,
    create_refresh_token,
    verify_and_rotate_refresh_token,
)


def make_mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.execute = AsyncMock()
    return db


def test_hash_token_deterministic():
    """같은 입력 → 같은 해시."""
    assert _hash_token("abc") == _hash_token("abc")
    assert _hash_token("abc") != _hash_token("xyz")


def test_hash_token_length():
    """SHA-256 hex는 64자."""
    assert len(_hash_token("test-token")) == 64


@pytest.mark.asyncio
async def test_create_refresh_token_returns_raw_string():
    """create_refresh_token은 평문 토큰(URL-safe 문자열)을 반환한다."""
    db = make_mock_db()
    raw = await create_refresh_token(db, "user-id-123")
    assert isinstance(raw, str)
    assert len(raw) > 20
    db.add.assert_called_once()
    db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_verify_refresh_token_invalid_hash():
    """DB에 없는 hash → None 반환."""
    db = make_mock_db()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    db.execute.return_value = mock_result

    result = await verify_and_rotate_refresh_token(db, "nonexistent-token")
    assert result is None


@pytest.mark.asyncio
async def test_verify_refresh_token_expired():
    """만료된 토큰 → None 반환 + revoked=True."""
    db = make_mock_db()

    mock_rt = MagicMock()
    mock_rt.revoked = False
    mock_rt.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
    mock_rt.user_id = "user-abc"

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_rt
    db.execute.return_value = mock_result

    result = await verify_and_rotate_refresh_token(db, "some-raw-token")
    assert result is None
    assert mock_rt.revoked is True
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_verify_refresh_token_valid():
    """유효한 토큰 → user_id 반환 + 기존 토큰 revoke."""
    db = make_mock_db()

    mock_rt = MagicMock()
    mock_rt.revoked = False
    mock_rt.expires_at = datetime.now(timezone.utc) + timedelta(days=29)
    mock_rt.user_id = "user-xyz"

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_rt
    db.execute.return_value = mock_result

    result = await verify_and_rotate_refresh_token(db, "valid-raw-token")
    assert result == "user-xyz"
    assert mock_rt.revoked is True
