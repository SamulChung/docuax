"""사용자 API 키 암호화 보관소.

원칙:
- Fernet (AES-128-CBC + HMAC SHA-256) — cryptography 표준
- 암호화 키는 settings.app_secret_key 에서 결정적으로 파생
  → APP_SECRET_KEY 가 바뀌면 기존 키 복호화 불가 (의도된 보안 동작)
- 평문 키는 메모리 안에서만 존재, 응답 직렬화 시 마스킹

운영 권장:
- APP_SECRET_KEY 를 32바이트 hex 로 충분히 길게 (`openssl rand -hex 32`)
- DB 백업 시 키 노출 위험 인식 — 백업 자체도 암호화
"""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)


def _fernet() -> Fernet:
    """APP_SECRET_KEY 에서 결정적으로 Fernet 키 파생.

    Fernet 은 32바이트 base64url 키를 요구 → SHA-256 으로 압축.
    """
    secret = get_settings().app_secret_key.encode("utf-8")
    digest = hashlib.sha256(secret).digest()  # 32 bytes
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt(plain: str) -> str:
    """평문 → Fernet 토큰 문자열."""
    f = _fernet()
    return f.encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt(token: str) -> str | None:
    """Fernet 토큰 → 평문. 실패 시 None (만료·키 변경 등).

    None 반환 시 호출자는 사용자에게 "키 재등록 필요" 안내.
    """
    f = _fernet()
    try:
        return f.decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        log.warning("API 키 복호화 실패 — APP_SECRET_KEY 변경 가능성")
        return None
    except Exception as e:  # noqa: BLE001
        log.exception("API 키 복호화 예외", error=str(e))
        return None


def mask(plain: str) -> str:
    """표시용 마스킹 — 'sk-ant-...xxxx' 형태로 마지막 4자리만."""
    if not plain:
        return ""
    if len(plain) <= 8:
        return "*" * len(plain)
    prefix = plain[:6]  # 예: 'sk-ant', 'sk-pro' 등
    last4 = plain[-4:]
    return f"{prefix}…{last4}"


def last_4(plain: str) -> str:
    """마지막 4자리 반환 — DB 저장용 last_4 필드."""
    return plain[-4:] if len(plain) >= 4 else plain
