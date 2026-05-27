"""Google OAuth 단위 테스트."""
import hmac
import time

import pytest

from app.api.v1.auth import _create_oauth_state, _verify_oauth_state

SECRET = "test-secret-key"


def test_create_and_verify_state():
    """생성된 state는 즉시 검증 통과."""
    state = _create_oauth_state(SECRET)
    assert _verify_oauth_state(state, SECRET)


def test_state_wrong_secret():
    """잘못된 secret으로는 검증 실패."""
    state = _create_oauth_state(SECRET)
    assert not _verify_oauth_state(state, "wrong-secret")


def test_state_tampered():
    """변조된 state는 검증 실패."""
    state = _create_oauth_state(SECRET)
    tampered = state[:-4] + "xxxx"
    assert not _verify_oauth_state(tampered, SECRET)


def test_state_expired(monkeypatch):
    """만료된 state(6분 전)는 검증 실패."""
    old_time = time.time() - 360
    nonce = "testnonce"
    ts = str(int(old_time))
    sig = hmac.new(SECRET.encode(), f"{nonce}:{ts}".encode(), "sha256").hexdigest()
    old_state = f"{nonce}:{ts}:{sig}"
    assert not _verify_oauth_state(old_state, SECRET, max_age_s=300)


def test_state_garbage():
    """쓰레기 입력 → False."""
    assert not _verify_oauth_state("garbage", SECRET)
    assert not _verify_oauth_state("", SECRET)
    assert not _verify_oauth_state("a:b:c:d", SECRET)
