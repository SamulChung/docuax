# Auth Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gmail SMTP 이메일 발송, Refresh Token 자동 갱신, 이메일 인증, Google OAuth 소셜 로그인, 프론트엔드 UX 고도화로 DocuAX 인증 시스템을 5개 태스크로 고도화한다.

**Architecture:** 백엔드 우선 순차 구현. Task 1(이메일 서비스)이 Task 3(이메일 인증) 및 Task 4(Google OAuth)의 기반이 된다. Task 2(Refresh Token)는 독립적으로 구현 후 login/register 엔드포인트에 통합한다.

**Tech Stack:**
- Backend: FastAPI, SQLAlchemy 2.0 async, aiosqlite, python-jose (JWT), bcrypt, aiosmtplib, Jinja2, httpx
- Frontend: Next.js 14, React, TypeScript, SWR

---

## File Map

| 파일 | 변경 | 설명 |
|------|------|------|
| `apps/backend/pyproject.toml` | 수정 | aiosmtplib 의존성 추가 |
| `apps/backend/app/core/config.py` | 수정 | SMTP + Google OAuth 설정 추가 |
| `apps/backend/app/services/email.py` | **신규** | Gmail SMTP EmailService |
| `apps/backend/app/templates/email/verify.html` | **신규** | 이메일 인증 HTML 템플릿 |
| `apps/backend/app/templates/email/reset_password.html` | **신규** | 비밀번호 재설정 HTML 템플릿 |
| `apps/backend/app/models/tables.py` | 수정 | RefreshToken 테이블, User.email_verified, User.google_id 컬럼 추가 |
| `apps/backend/app/models/__init__.py` | 수정 | RefreshToken export 추가 |
| `apps/backend/app/db/session.py` | 수정 | init_db에 RefreshToken 등록 |
| `apps/backend/app/services/auth.py` | 수정 | refresh token 생성/검증, verification token 생성/검증 |
| `apps/backend/app/api/v1/auth.py` | 수정 | /refresh, /verify-email, /resend-verification, /google, /google/callback 엔드포인트 |
| `apps/frontend/src/lib/api.ts` | 수정 | 401 인터셉터 + 자동 refresh, resendVerification 추가 |
| `apps/frontend/src/components/auth/VerifyBanner.tsx` | **신규** | 이메일 미인증 알림 배너 |
| `apps/frontend/src/components/auth/PasswordStrength.tsx` | **신규** | 비밀번호 강도 표시기 |
| `apps/frontend/src/components/auth/AuthModal.tsx` | 수정 | Google 버튼, 비밀번호 강도, 실시간 검사, 로딩 상태 |
| `apps/frontend/src/app/app/layout.tsx` | 수정 | VerifyBanner 삽입 |
| `apps/frontend/src/app/verify-email/page.tsx` | **신규** | 이메일 인증 처리 페이지 |
| `apps/backend/tests/test_email_service.py` | **신규** | EmailService 단위 테스트 |
| `apps/backend/tests/test_refresh_token.py` | **신규** | Refresh Token 단위 테스트 |
| `apps/backend/tests/test_email_verification.py` | **신규** | 이메일 인증 엔드포인트 테스트 |

---

## Task 1: Gmail SMTP Email Service

이메일 발송 기반 구축. `email_enabled=False`이면 로그에만 출력(개발), `True`이면 aiosmtplib STARTTLS 발송.

**Files:**
- Create: `apps/backend/app/services/email.py`
- Create: `apps/backend/app/templates/email/verify.html`
- Create: `apps/backend/app/templates/email/reset_password.html`
- Modify: `apps/backend/pyproject.toml`
- Modify: `apps/backend/app/core/config.py`
- Modify: `apps/backend/app/api/v1/auth.py` (비밀번호 재설정 실제 발송으로 교체)
- Test: `apps/backend/tests/test_email_service.py`

- [ ] **Step 1: pyproject.toml에 aiosmtplib 의존성 추가**

`apps/backend/pyproject.toml`의 `dependencies` 배열 안 적당한 위치에 추가:

```toml
    "aiosmtplib>=3.0.0",       # Gmail SMTP (STARTTLS)
```

전체 위치: `"bcrypt>=4.2.0",` 바로 아래 줄.

- [ ] **Step 2: config.py에 SMTP 설정 추가**

`apps/backend/app/core/config.py`의 `# ── Security ──` 블록 위에 아래를 추가:

```python
    # ── Email (SMTP) ──
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""          # Gmail 주소 (환경변수 SMTP_USER)
    smtp_password: str = ""      # Gmail 앱 비밀번호 (환경변수 SMTP_PASSWORD)
    smtp_from: str = ""          # 발신자 표시명+주소 (빈 값이면 smtp_user 사용)
    frontend_url: str = "http://localhost:3000"

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_user and self.smtp_password)
```

- [ ] **Step 3: 이메일 HTML 템플릿 디렉터리 생성 후 verify.html 작성**

```bash
mkdir -p apps/backend/app/templates/email
```

`apps/backend/app/templates/email/verify.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>DocuAX 이메일 인증</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto;color:#1e293b">
  <h2 style="color:#6366f1">DocuAX 이메일 인증</h2>
  <p>아래 버튼을 클릭해 이메일 주소를 인증해 주세요. 링크는 <strong>24시간</strong> 유효합니다.</p>
  <a href="{{ link }}"
     style="display:inline-block;margin:20px 0;padding:12px 28px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
    이메일 인증하기
  </a>
  <p style="font-size:12px;color:#64748b">버튼이 작동하지 않으면 아래 URL을 브라우저에 직접 입력하세요:<br>{{ link }}</p>
</body>
</html>
```

- [ ] **Step 4: reset_password.html 작성**

`apps/backend/app/templates/email/reset_password.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>DocuAX 비밀번호 재설정</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto;color:#1e293b">
  <h2 style="color:#6366f1">비밀번호 재설정</h2>
  <p>아래 버튼을 클릭해 새 비밀번호를 설정하세요. 링크는 <strong>30분</strong> 유효합니다.</p>
  <a href="{{ link }}"
     style="display:inline-block;margin:20px 0;padding:12px 28px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
    비밀번호 변경하기
  </a>
  <p style="font-size:12px;color:#64748b">이 메일을 요청하지 않았다면 무시하세요.<br>URL: {{ link }}</p>
</body>
</html>
```

- [ ] **Step 5: EmailService 작성 (`app/services/email.py`)**

```python
"""Gmail SMTP 이메일 서비스.

email_enabled=False(개발): logger.info 로만 출력.
email_enabled=True(운영): aiosmtplib STARTTLS로 발송.
"""
from __future__ import annotations

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import aiosmtplib
from jinja2 import Environment, FileSystemLoader

from app.core.config import get_settings

log = logging.getLogger(__name__)

_TEMPLATE_DIR = Path(__file__).parent.parent / "templates" / "email"


class EmailService:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._env = Environment(
            loader=FileSystemLoader(str(_TEMPLATE_DIR)),
            autoescape=True,
        )

    async def send_verification_email(self, user_email: str, token: str) -> None:
        s = self._settings
        link = f"{s.frontend_url}/verify-email?token={token}"
        html = self._env.get_template("verify.html").render(link=link)
        await self._send(user_email, "[DocuAX] 이메일 인증을 완료해 주세요", html)

    async def send_password_reset_email(self, user_email: str, token: str) -> None:
        s = self._settings
        link = f"{s.frontend_url}/reset-password?token={token}"
        html = self._env.get_template("reset_password.html").render(link=link)
        await self._send(user_email, "[DocuAX] 비밀번호 재설정 안내", html)

    async def _send(self, to: str, subject: str, html: str) -> None:
        s = self._settings
        if not s.email_enabled:
            log.info(
                "이메일 발송 (개발 모드 — 실제 발송 안 됨)",
                extra={"to": to, "subject": subject, "preview": html[:200]},
            )
            return

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = s.smtp_from or s.smtp_user
        msg["To"] = to
        msg.attach(MIMEText(html, "html", "utf-8"))

        try:
            await aiosmtplib.send(
                msg,
                hostname=s.smtp_host,
                port=s.smtp_port,
                username=s.smtp_user,
                password=s.smtp_password,
                start_tls=True,
            )
        except Exception as exc:
            log.error("이메일 발송 실패 (무시하고 계속)", extra={"to": to, "error": str(exc)})


def get_email_service() -> EmailService:
    return EmailService()
```

- [ ] **Step 6: auth.py — 비밀번호 재설정을 실제 이메일 발송으로 교체**

`apps/backend/app/api/v1/auth.py`의 `request_password_reset` 함수 내 `import logging` + `logging.getLogger` 블록을 아래로 교체:

```python
        from app.services.auth import create_password_reset_token
        from app.services.email import get_email_service
        token = create_password_reset_token(user.id)
        email_svc = get_email_service()
        await email_svc.send_password_reset_email(user.email, token)
```

기존 코드(3줄):
```python
        from app.services.auth import create_password_reset_token
        token = create_password_reset_token(user.id)
        # 운영에서는 메일 발송. 개발에서는 로그에만.
        import logging
        logging.getLogger(__name__).info(
            "비밀번호 재설정 토큰 발급",
            extra={"email": user.email, "token_prefix": token[:16] + "..."}
        )
```

- [ ] **Step 7: EmailService 테스트 작성**

`apps/backend/tests/test_email_service.py`:

```python
"""EmailService 단위 테스트."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.email import EmailService


@pytest.fixture
def email_svc_disabled(monkeypatch):
    """email_enabled=False (개발 모드)."""
    svc = EmailService.__new__(EmailService)
    settings = MagicMock()
    settings.email_enabled = False
    settings.frontend_url = "http://localhost:3000"
    svc._settings = settings
    from jinja2 import Environment, DictLoader
    svc._env = Environment(
        loader=DictLoader({
            "verify.html": "<a href='{{ link }}'>verify</a>",
            "reset_password.html": "<a href='{{ link }}'>reset</a>",
        })
    )
    return svc


@pytest.fixture
def email_svc_enabled(monkeypatch):
    """email_enabled=True (운영 모드)."""
    svc = EmailService.__new__(EmailService)
    settings = MagicMock()
    settings.email_enabled = True
    settings.frontend_url = "http://localhost:3000"
    settings.smtp_host = "smtp.gmail.com"
    settings.smtp_port = 587
    settings.smtp_user = "test@gmail.com"
    settings.smtp_password = "secret"
    settings.smtp_from = ""
    svc._settings = settings
    from jinja2 import Environment, DictLoader
    svc._env = Environment(
        loader=DictLoader({
            "verify.html": "<a href='{{ link }}'>verify</a>",
            "reset_password.html": "<a href='{{ link }}'>reset</a>",
        })
    )
    return svc


@pytest.mark.asyncio
async def test_send_verification_email_dev_mode(email_svc_disabled):
    """개발 모드에서는 aiosmtplib를 호출하지 않고 로그만 남긴다."""
    with patch("app.services.email.aiosmtplib") as mock_smtp:
        await email_svc_disabled.send_verification_email("user@example.com", "tok123")
        mock_smtp.send.assert_not_called()


@pytest.mark.asyncio
async def test_send_password_reset_email_dev_mode(email_svc_disabled):
    with patch("app.services.email.aiosmtplib") as mock_smtp:
        await email_svc_disabled.send_password_reset_email("user@example.com", "tok456")
        mock_smtp.send.assert_not_called()


@pytest.mark.asyncio
async def test_send_calls_aiosmtplib_in_prod(email_svc_enabled):
    """운영 모드에서는 aiosmtplib.send가 호출된다."""
    with patch("app.services.email.aiosmtplib") as mock_smtp:
        mock_smtp.send = AsyncMock()
        await email_svc_enabled.send_verification_email("user@example.com", "tok789")
        mock_smtp.send.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_smtp_error_is_logged_not_raised(email_svc_enabled):
    """SMTP 오류는 예외를 올리지 않고 로그만 남긴다."""
    with patch("app.services.email.aiosmtplib") as mock_smtp:
        mock_smtp.send = AsyncMock(side_effect=Exception("connection refused"))
        # 예외 없이 완료되어야 함
        await email_svc_enabled.send_verification_email("user@example.com", "tok000")
```

- [ ] **Step 8: 테스트 실행 확인**

```bash
cd apps/backend
pytest tests/test_email_service.py -v
```

Expected: 4 tests PASSED

- [ ] **Step 9: 커밋**

```bash
git add apps/backend/pyproject.toml \
        apps/backend/app/core/config.py \
        apps/backend/app/services/email.py \
        apps/backend/app/templates/email/verify.html \
        apps/backend/app/templates/email/reset_password.html \
        apps/backend/app/api/v1/auth.py \
        apps/backend/tests/test_email_service.py
git commit -m "feat: Gmail SMTP EmailService + 비밀번호 재설정 실제 발송"
```

---

## Task 2: Refresh Token

Access Token 15분 + Refresh Token 30일 rotation. Refresh Token은 SHA-256 해시로만 DB 저장. httpOnly 쿠키로 XSS 방어.

**Files:**
- Modify: `apps/backend/app/models/tables.py`
- Modify: `apps/backend/app/models/__init__.py`
- Modify: `apps/backend/app/db/session.py`
- Modify: `apps/backend/app/services/auth.py`
- Modify: `apps/backend/app/api/v1/auth.py`
- Modify: `apps/backend/app/core/config.py` (jwt_expires_min 기본값 15로 변경)
- Modify: `apps/frontend/src/lib/api.ts`
- Test: `apps/backend/tests/test_refresh_token.py`

- [ ] **Step 1: RefreshToken 모델 추가**

`apps/backend/app/models/tables.py`의 `class UserApiKey` 정의 바로 위에 추가:

```python
class RefreshToken(Base):
    """Refresh Token — SHA-256 해시만 저장 (평문 없음). rotation 방식."""
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # SHA-256 hex
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
```

- [ ] **Step 2: models/__init__.py에 RefreshToken export 추가**

`apps/backend/app/models/__init__.py` 전체 교체:

```python
"""SQLAlchemy 모델 — PRD 6.1 데이터 모델 그대로.

엔티티: User, Organization, Document, ConversionRun, MacroLog, MacroPreference, LearnedTemplate, Slide, RefreshToken
"""
from app.models.tables import (
    AuditLog,
    ConversionRun,
    Document,
    LearnedTemplate,
    MacroLog,
    MacroPreference,
    Organization,
    RefreshToken,
    Slide,
    User,
    UserApiKey,
)

__all__ = [
    "AuditLog",
    "ConversionRun",
    "Document",
    "LearnedTemplate",
    "MacroLog",
    "MacroPreference",
    "Organization",
    "RefreshToken",
    "Slide",
    "User",
    "UserApiKey",
]
```

- [ ] **Step 3: db/session.py init_db에 RefreshToken 등록**

`apps/backend/app/db/session.py`의 `init_db` 함수 내 import 목록에 `RefreshToken` 추가:

```python
    from app.models import (
        AuditLog,
        ConversionRun,
        Document,
        LearnedTemplate,
        MacroLog,
        MacroPreference,
        Organization,
        RefreshToken,
        Slide,
        User,
    )  # noqa: F401
```

- [ ] **Step 4: config.py — jwt_expires_min 기본값 15분으로 변경**

`apps/backend/app/core/config.py`에서:

```python
    jwt_expires_min: int = 1440
```
→
```python
    jwt_expires_min: int = 15  # Access Token 15분 (Refresh Token으로 자동 갱신)
```

- [ ] **Step 5: services/auth.py — refresh token 함수 추가**

`apps/backend/app/services/auth.py` 파일 끝에 추가:

```python
# ─── Refresh Token ───────────────────────────────────────────────────────────

import hashlib
import secrets
from datetime import timedelta

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
```

- [ ] **Step 6: api/v1/auth.py — login/register에 refresh token 발급 추가**

`auth.py` 상단 import에 추가:

```python
from fastapi import Cookie
from app.services.auth import (
    create_access_token, create_refresh_token, hash_password,
    verify_and_rotate_refresh_token, verify_password,
    revoke_all_user_refresh_tokens,
)
```

(기존 `from app.services.auth import create_access_token, hash_password, verify_password` 줄 교체)

`register` 함수에서 `token = create_access_token(...)` 이후, `response.set_cookie(...)` 이전에 추가:

```python
    refresh_raw = await create_refresh_token(db, user.id)
    await db.commit()
```

`register`의 기존 `response.set_cookie(key="docuax_token", ...)` 블록 뒤에 추가:

```python
    response.set_cookie(
        key="docuax_refresh",
        value=refresh_raw,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,
        secure=False,  # 개발환경. 운영은 Railway에서 HTTPS라 secure=True 필요시 env 분기
    )
```

동일하게 `login` 함수에도 refresh_raw 발급 + 쿠키 설정 추가. `user.last_login = datetime.utcnow()` 다음 줄에:

```python
    refresh_raw = await create_refresh_token(db, user.id)
    await db.commit()
```

그리고 기존 `response.set_cookie(key="docuax_token", ...)` 블록 뒤에:

```python
    response.set_cookie(
        key="docuax_refresh",
        value=refresh_raw,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,
        secure=False,
    )
```

`logout` 함수를 아래로 교체:

```python
@router.post("/auth/logout")
async def logout(
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
) -> dict:
    if user:
        await revoke_all_user_refresh_tokens(db, user.id)
        await db.commit()
    response.delete_cookie("docuax_token")
    response.delete_cookie("docuax_refresh")
    return {"ok": True}
```

(`get_current_user_optional`를 deps import에 추가해야 함 — 이미 `app.api.deps`에 있음)

기존 `from app.api.deps import get_current_user` → `from app.api.deps import get_current_user, get_current_user_optional` 로 변경.

`auth.py` 라우터에 `/auth/refresh` 엔드포인트 추가 (기존 엔드포인트들 끝에):

```python
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

    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
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
        secure=False,
    )
    return {"access_token": new_access, "token_type": "bearer"}
```

- [ ] **Step 7: Refresh Token 테스트 작성**

`apps/backend/tests/test_refresh_token.py`:

```python
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

    # scalar_one_or_none → None 반환하도록 설정
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
    mock_rt.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)  # 이미 만료
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
```

- [ ] **Step 8: 백엔드 테스트 실행**

```bash
cd apps/backend
pytest tests/test_refresh_token.py -v
```

Expected: 5 tests PASSED

- [ ] **Step 9: api.ts — 401 인터셉터 추가**

`apps/frontend/src/lib/api.ts`에서 `function getAuthToken(): string | null` 블록 위에 추가:

```typescript
// ─── Refresh Token 인터셉터 ──────────────────────────────────────────────────

let _isRefreshing = false;
let _refreshQueue: Array<(token: string | null) => void> = [];

async function _refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    const data: { access_token: string } = await res.json();
    setAuthToken(data.access_token);
    return data.access_token;
  } catch {
    return null;
  }
}
```

기존 `async function http<T>(path: string, opts: RequestInit = {}): Promise<T>` 함수를 아래로 교체 (401 인터셉터 추가):

```typescript
async function http<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined ?? {}),
  };
  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  let body = opts.body;
  if (typeof body === "string") {
    body = sanitizeString(body);
  }

  const doFetch = (overrideToken?: string) => {
    const h = overrideToken
      ? { ...headers, Authorization: `Bearer ${overrideToken}` }
      : headers;
    return fetch(`${BASE}${path}`, { ...opts, body, credentials: "include", headers: h });
  };

  const res = await doFetch();

  // 401 → refresh 시도 (로그인·refresh 엔드포인트 자체는 제외)
  if (
    res.status === 401 &&
    !path.startsWith("/auth/login") &&
    !path.startsWith("/auth/refresh")
  ) {
    if (_isRefreshing) {
      // 이미 갱신 중 → 완료 후 재시도
      return new Promise<T>((resolve, reject) => {
        _refreshQueue.push((newToken) => {
          if (!newToken) { reject(new Error("401: Unauthorized")); return; }
          doFetch(newToken)
            .then((r) =>
              r.ok ? r.json() : r.text().then((t) => Promise.reject(new Error(`${r.status}: ${t}`)))
            )
            .then(resolve)
            .catch(reject);
        });
      });
    }

    _isRefreshing = true;
    const newToken = await _refreshAccessToken();
    _isRefreshing = false;
    _refreshQueue.forEach((cb) => cb(newToken));
    _refreshQueue = [];

    if (!newToken) {
      setAuthToken(null);
      if (typeof window !== "undefined") window.location.href = "/";
      throw new Error("401: Unauthorized");
    }

    const retryRes = await doFetch(newToken);
    if (!retryRes.ok) throw new Error(`${retryRes.status}: ${await retryRes.text()}`);
    return retryRes.json() as T;
  }

  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as T;
}
```

- [ ] **Step 10: 전체 백엔드 테스트 통과 확인**

```bash
cd apps/backend
pytest tests/ -v --tb=short
```

Expected: 모든 기존 테스트 + test_refresh_token.py PASSED

- [ ] **Step 11: 커밋**

```bash
git add apps/backend/app/models/tables.py \
        apps/backend/app/models/__init__.py \
        apps/backend/app/db/session.py \
        apps/backend/app/core/config.py \
        apps/backend/app/services/auth.py \
        apps/backend/app/api/v1/auth.py \
        apps/frontend/src/lib/api.ts \
        apps/backend/tests/test_refresh_token.py
git commit -m "feat: Refresh Token rotation (Access 15분 + Refresh 30일)"
```

---

## Task 3: 이메일 인증

가입 시 인증 메일 발송. 미인증 사용자는 차단하지 않고 앱 상단에 배너만 표시. GET /auth/verify-email로 인증 완료.

**Files:**
- Modify: `apps/backend/app/models/tables.py`
- Modify: `apps/backend/app/services/auth.py`
- Modify: `apps/backend/app/api/v1/auth.py`
- Create: `apps/frontend/src/components/auth/VerifyBanner.tsx`
- Create: `apps/frontend/src/app/verify-email/page.tsx`
- Modify: `apps/frontend/src/app/app/layout.tsx`
- Modify: `apps/frontend/src/lib/api.ts`
- Test: `apps/backend/tests/test_email_verification.py`

- [ ] **Step 1: User 모델에 email_verified 컬럼 추가**

`apps/backend/app/models/tables.py`의 `User` 클래스 내 `last_login` 줄 바로 뒤에 추가:

```python
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
```

- [ ] **Step 2: auth.py services — verification token 함수 추가**

`apps/backend/app/services/auth.py`의 `# ─── 비밀번호 재설정` 블록 바로 위에 추가:

```python
# ─── 이메일 인증 토큰 ─────────────────────────────────────────────────────────

EMAIL_VERIFY_PURPOSE = "email_verify"


def create_verification_token(user_id: str, ttl_hours: int = 24) -> str:
    """이메일 인증용 단기 토큰. purpose='email_verify' 클레임으로 access_token과 분리."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "purpose": EMAIL_VERIFY_PURPOSE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=ttl_hours)).timestamp()),
    }
    return jwt.encode(payload, settings.app_secret_key, algorithm=settings.jwt_algorithm)


def decode_verification_token(token: str) -> str | None:
    """인증 토큰 검증 → user_id 또는 None.
    purpose != 'email_verify' 면 거부 (access_token 재사용 방지)."""
    payload = decode_token(token)
    if not payload:
        return None
    if payload.get("purpose") != EMAIL_VERIFY_PURPOSE:
        return None
    return payload.get("sub")
```

- [ ] **Step 3: auth.py API — register에 인증 메일 발송 추가**

`apps/backend/app/api/v1/auth.py`의 `register` 함수에서 `await audit_log(...)` 호출 바로 위에 추가:

```python
    # 이메일 인증 메일 발송 (실패해도 가입은 완료)
    from app.services.auth import create_verification_token
    from app.services.email import get_email_service
    verify_token = create_verification_token(user.id)
    try:
        await get_email_service().send_verification_email(user.email, verify_token)
    except Exception:
        pass  # 메일 발송 실패는 가입 실패로 이어지지 않음
```

- [ ] **Step 4: MeResponse와 _user_public에 email_verified 추가**

`auth.py`의 `MeResponse` 클래스에 필드 추가:

```python
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
```

`_user_public` 함수에 필드 추가:

```python
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
        "email_verified": u.email_verified,
    }
```

`me` 엔드포인트 반환에 `email_verified` 추가:

```python
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
        email_verified=user.email_verified,
    )
```

- [ ] **Step 5: /auth/verify-email, /auth/resend-verification 엔드포인트 추가**

`auth.py` 파일 끝에 추가:

```python
@router.get("/auth/verify-email")
async def verify_email(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """이메일 인증 토큰 검증 → email_verified=True 업데이트."""
    from app.services.auth import decode_verification_token
    user_id = decode_verification_token(token)
    if not user_id:
        raise HTTPException(status_code=400, detail="유효하지 않거나 만료된 인증 링크입니다.")
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자 없음")
    user.email_verified = True
    await db.commit()
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
    from app.services.auth import create_verification_token
    from app.services.email import get_email_service
    verify_token = create_verification_token(user.id)
    await get_email_service().send_verification_email(user.email, verify_token)
    return {"ok": True, "message": "인증 메일을 발송했습니다"}
```

- [ ] **Step 6: api.ts에 AuthUser 타입 업데이트 + resendVerification 추가**

`apps/frontend/src/lib/api.ts`의 `AuthUser` 인터페이스에 `email_verified` 필드 추가:

```typescript
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  plan: "free" | "pro" | "team" | "enterprise";
  persona_mode: string;
  organization_id: string | null;
  is_admin?: boolean;
  email_verified?: boolean;
}
```

`logout` 함수 뒤에 추가:

```typescript
export async function resendVerification() {
  return http<{ ok: boolean; message: string }>("/auth/resend-verification", {
    method: "POST",
  });
}
```

- [ ] **Step 7: VerifyBanner 컴포넌트 작성**

`apps/frontend/src/components/auth/VerifyBanner.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Mail, X } from "lucide-react";
import { resendVerification } from "@/lib/api";

interface Props {
  emailVerified: boolean | undefined;
}

export function VerifyBanner({ emailVerified }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // 인증 완료 또는 dismissed이면 표시 안 함
  if (emailVerified === true || emailVerified === undefined || dismissed) return null;

  const handleResend = async () => {
    setSending(true);
    try {
      await resendVerification();
      setSent(true);
    } catch {
      // 실패해도 UI는 정상 표시
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex items-center gap-3 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-b border-amber-200 dark:border-amber-800">
      <Mail size={14} className="shrink-0" />
      <span className="flex-1">
        이메일 인증을 완료해 주세요.{" "}
        {!sent ? (
          <button
            onClick={handleResend}
            disabled={sending}
            className="font-semibold underline hover:no-underline disabled:opacity-50"
          >
            {sending ? "발송 중…" : "인증 메일 재발송"}
          </button>
        ) : (
          <span className="font-semibold">발송했습니다. 메일함을 확인해 주세요.</span>
        )}
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900"
        aria-label="닫기"
      >
        <X size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 8: app/app/layout.tsx — VerifyBanner 삽입**

먼저 `apps/frontend/src/components/auth/VerifyBannerWrapper.tsx` 생성 (클라이언트 컴포넌트 래퍼):

```tsx
"use client";

import useSWR from "swr";
import { getMe } from "@/lib/api";
import { VerifyBanner } from "./VerifyBanner";

export default function VerifyBannerWrapper() {
  const { data: user } = useSWR("me", () => getMe().catch(() => null), {
    shouldRetryOnError: false,
  });
  return <VerifyBanner emailVerified={user?.email_verified} />;
}
```

그 다음 `apps/frontend/src/app/app/layout.tsx` 전체 교체:

```tsx
import VerifyBannerWrapper from "@/components/auth/VerifyBannerWrapper";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <VerifyBannerWrapper />
      {children}
    </>
  );
}
```

- [ ] **Step 9: /verify-email 페이지 작성**

`apps/frontend/src/app/verify-email/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

// BASE URL (api.ts에서 참조하는 것과 동일)
const _apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";
const BASE = _apiBase ? `${_apiBase}/api/v1` : "/api/v1";

type Status = "loading" | "success" | "error";

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("인증 토큰이 없습니다.");
      return;
    }
    fetch(`${BASE}/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setStatus("success");
          setMessage(data.message ?? "이메일 인증이 완료되었습니다.");
        } else {
          setStatus("error");
          setMessage(data.detail ?? "인증에 실패했습니다.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("서버 연결에 실패했습니다.");
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 text-center">
        {status === "loading" && (
          <>
            <Loader2 size={40} className="mx-auto mb-4 animate-spin text-brand" />
            <p className="text-sm text-neutral-600 dark:text-neutral-400">인증 처리 중…</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle size={40} className="mx-auto mb-4 text-green-500" />
            <h2 className="mb-2 text-base font-bold">인증 완료!</h2>
            <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">{message}</p>
            <button
              onClick={() => router.push("/app")}
              className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-soft"
            >
              앱으로 이동
            </button>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle size={40} className="mx-auto mb-4 text-red-500" />
            <h2 className="mb-2 text-base font-bold">인증 실패</h2>
            <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">{message}</p>
            <button
              onClick={() => router.push("/app")}
              className="rounded-md bg-neutral-200 px-6 py-2 text-sm font-semibold hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            >
              홈으로 이동
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 10: 이메일 인증 엔드포인트 테스트**

`apps/backend/tests/test_email_verification.py`:

```python
"""이메일 인증 서비스 단위 테스트."""
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

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
    from datetime import timedelta
    from jose import jwt
    settings = get_settings()
    now = datetime.now(timezone.utc)
    bad_token = jwt.encode(
        {
            "sub": "user-abc",
            "purpose": "pwreset",  # 잘못된 purpose
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
```

- [ ] **Step 11: 테스트 실행**

```bash
cd apps/backend
pytest tests/test_email_verification.py -v
```

Expected: 5 tests PASSED

- [ ] **Step 12: 커밋**

```bash
git add apps/backend/app/models/tables.py \
        apps/backend/app/services/auth.py \
        apps/backend/app/api/v1/auth.py \
        apps/frontend/src/lib/api.ts \
        apps/frontend/src/components/auth/VerifyBanner.tsx \
        apps/frontend/src/components/auth/VerifyBannerWrapper.tsx \
        apps/frontend/src/app/app/layout.tsx \
        apps/frontend/src/app/verify-email/page.tsx \
        apps/backend/tests/test_email_verification.py
git commit -m "feat: 이메일 인증 (가입 시 메일 발송 + 배너 + /verify-email 페이지)"
```

---

## Task 4: Google OAuth

Google 계정 원클릭 가입/로그인. 기존 이메일 계정 자동 연결. httpx로 직접 Google API 호출 (추가 의존성 없음 — httpx는 이미 pyproject.toml에 있음).

**Files:**
- Modify: `apps/backend/app/models/tables.py`
- Modify: `apps/backend/app/core/config.py`
- Modify: `apps/backend/app/api/v1/auth.py`
- Modify: `apps/frontend/src/components/auth/AuthModal.tsx`
- Create: `docs/GOOGLE_OAUTH_SETUP.md`

**Google OAuth 흐름:**
```
프론트 → window.location.href = "/api/v1/auth/google"
  → 백엔드가 Google 인증 URL로 302 redirect
  → 사용자 Google 로그인
  → Google → GET /api/v1/auth/google/callback?code=...&state=...
  → 백엔드가 code 교환 → userinfo 조회 → 계정 생성/연결 → 토큰 발급
  → /app?token=<access_token> 으로 302 redirect
  → 프론트엔드가 URL에서 token 추출 → setAuthToken()
```

- [ ] **Step 1: User 모델에 google_id 컬럼 추가**

`apps/backend/app/models/tables.py`의 `User` 클래스 내 `email_verified` 줄 바로 뒤에 추가:

```python
    google_id: Mapped[str | None] = mapped_column(String(120), nullable=True, unique=True, index=True)
```

- [ ] **Step 2: config.py에 Google OAuth 설정 추가**

`apps/backend/app/core/config.py`의 `# ── Email` 블록 바로 아래에 추가:

```python
    # ── Google OAuth ──
    google_client_id: str = ""      # 환경변수 GOOGLE_CLIENT_ID
    google_client_secret: str = ""  # 환경변수 GOOGLE_CLIENT_SECRET
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"
```

- [ ] **Step 3: Google OAuth 엔드포인트 추가 (auth.py)**

`auth.py` 상단 import에 추가:

```python
import secrets
from urllib.parse import urlencode

import httpx
from starlette.responses import RedirectResponse
```

파일 끝에 추가:

```python
# ─── Google OAuth ────────────────────────────────────────────────────────────

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

# 단일 인스턴스용 state 저장 (멀티 인스턴스 환경에서는 Redis 사용 권장)
_oauth_state_store: dict[str, bool] = {}


@router.get("/auth/google")
async def google_oauth_start() -> RedirectResponse:
    """Google OAuth 시작 — Google 인증 URL로 redirect."""
    from app.core.config import get_settings
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
    from app.core.config import get_settings
    settings = get_settings()
    frontend = settings.frontend_url

    if error:
        return RedirectResponse(f"{frontend}/?error=oauth_cancelled")

    # CSRF 검증
    if not state or state not in _oauth_state_store:
        return RedirectResponse(f"{frontend}/?error=oauth_state_mismatch")
    del _oauth_state_store[state]

    if not code:
        return RedirectResponse(f"{frontend}/?error=oauth_no_code")

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
            return RedirectResponse(f"{frontend}/?error=oauth_token_failed")
        google_access_token = token_res.json().get("access_token")
        if not google_access_token:
            return RedirectResponse(f"{frontend}/?error=oauth_token_missing")

        # Google access_token → userinfo
        user_res = await client.get(
            _GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {google_access_token}"},
        )
        if user_res.status_code != 200:
            return RedirectResponse(f"{frontend}/?error=oauth_userinfo_failed")
        userinfo = user_res.json()

    google_id: str = userinfo.get("sub", "")
    email: str = userinfo.get("email", "")
    name: str = userinfo.get("name", "") or (email.split("@")[0] if email else "사용자")

    if not google_id or not email:
        return RedirectResponse(f"{frontend}/?error=oauth_missing_info")

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
        secure=False,
    )
    return redirect
```

- [ ] **Step 4: AuthModal에 Google 버튼 추가**

`apps/frontend/src/components/auth/AuthModal.tsx`에서 기존 닫기 버튼 블록 끝 (`</div>` 바로 뒤, `<div className="space-y-3">` 위에) 추가:

```tsx
        {/* Google OAuth 버튼 */}
        <button
          type="button"
          onClick={() => {
            const base = process.env.NEXT_PUBLIC_API_BASE ?? "";
            window.location.href = `${base}/api/v1/auth/google`;
          }}
          className="mt-0 mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google로 계속하기
        </button>

        <div className="relative mb-3">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-200 dark:border-neutral-700" />
          </div>
          <div className="relative flex justify-center text-[10px]">
            <span className="bg-white px-2 text-neutral-500 dark:bg-neutral-900">또는 이메일로</span>
          </div>
        </div>
```

이 코드는 `<div className="space-y-3">` 바로 위에 삽입한다.

- [ ] **Step 5: /app 페이지에서 URL token 파라미터 처리**

`apps/frontend/src/app/app/page.tsx`의 초기화 부분에서 URL 파라미터에서 token을 추출해 저장하도록 추가. 해당 파일을 읽은 후, `useEffect` 또는 최상단 로직에서 아래 코드를 추가:

```typescript
// Google OAuth redirect 후 URL에서 token 추출
useEffect(() => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const token = url.searchParams.get("token");
  const oauthError = url.searchParams.get("error");
  if (token) {
    setAuthToken(token);
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.toString());
    // SWR 캐시 갱신 (TopBar의 me 데이터 새로고침)
    mutate("me");
  }
  if (oauthError) {
    // 에러 메시지 표시 (toast 또는 콘솔)
    console.warn("OAuth error:", oauthError);
    url.searchParams.delete("error");
    window.history.replaceState({}, "", url.toString());
  }
}, []);
```

> **참고:** `apps/frontend/src/app/app/page.tsx` 파일 내용을 읽어 import/useEffect 기존 패턴을 확인하고 `setAuthToken`과 `mutate`를 import해야 함. `setAuthToken`은 `@/lib/api`에서, `mutate`는 `swr`에서 가져옴.

- [ ] **Step 6: Google OAuth 설정 가이드 문서 작성**

`docs/GOOGLE_OAUTH_SETUP.md`:

```markdown
# Google OAuth 설정 가이드

## 1. Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 프로젝트 선택 또는 새 프로젝트 생성
3. **API 및 서비스 → 사용자 인증 정보** 클릭
4. **사용자 인증 정보 만들기 → OAuth 2.0 클라이언트 ID** 클릭
5. 애플리케이션 유형: **웹 애플리케이션**
6. 승인된 리디렉션 URI 추가:
   - 개발: `http://localhost:8000/api/v1/auth/google/callback`
   - 운영(Railway): `https://docuax-production.up.railway.app/api/v1/auth/google/callback`
7. 클라이언트 ID와 클라이언트 보안 비밀번호 복사

## 2. 환경변수 설정

### 로컬 개발 (.env)
```
GOOGLE_CLIENT_ID=<클라이언트 ID>
GOOGLE_CLIENT_SECRET=<클라이언트 보안 비밀번호>
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback
```

### Railway 배포
Railway 대시보드 → Variables에 추가:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI=https://docuax-production.up.railway.app/api/v1/auth/google/callback`

## 3. OAuth 동의 화면 설정

- 사용자 유형: 외부
- 앱 이름: DocuAX
- 범위(scopes): `email`, `profile`, `openid`
- 테스트 사용자 추가 (앱 게시 전)

## 4. 동작 확인

```bash
# 백엔드 실행 후
curl -L http://localhost:8000/api/v1/auth/google
# → Google 로그인 페이지로 redirect 되어야 함
```
```

- [ ] **Step 7: 커밋**

```bash
git add apps/backend/app/models/tables.py \
        apps/backend/app/core/config.py \
        apps/backend/app/api/v1/auth.py \
        apps/frontend/src/components/auth/AuthModal.tsx \
        apps/frontend/src/app/app/page.tsx \
        docs/GOOGLE_OAUTH_SETUP.md
git commit -m "feat: Google OAuth 소셜 로그인 (email 계정 자동 연결)"
```

---

## Task 5: Frontend UX 고도화

비밀번호 강도 표시기, 실시간 유효성 검사, 로딩 상태 개선.

**Files:**
- Create: `apps/frontend/src/components/auth/PasswordStrength.tsx`
- Modify: `apps/frontend/src/components/auth/AuthModal.tsx`

- [ ] **Step 1: PasswordStrength 컴포넌트 작성**

`apps/frontend/src/components/auth/PasswordStrength.tsx`:

```tsx
"use client";

interface Props {
  password: string;
}

interface Rule {
  label: string;
  test: (p: string) => boolean;
}

const RULES: Rule[] = [
  { label: "8자 이상", test: (p) => p.length >= 8 },
  { label: "대문자", test: (p) => /[A-Z]/.test(p) },
  { label: "숫자", test: (p) => /[0-9]/.test(p) },
  { label: "특수문자", test: (p) => /[!@#$%^&*(),.?":{}|<>_\-+=/\\[\]~`']/.test(p) },
];

const STRENGTH_TEXT = ["", "약함", "보통", "강함", "매우 강함"];
const STRENGTH_BAR_COLOR = [
  "",
  "bg-red-500",
  "bg-orange-400",
  "bg-yellow-400",
  "bg-green-500",
];
const STRENGTH_TEXT_COLOR = [
  "",
  "text-red-500",
  "text-orange-500",
  "text-yellow-600",
  "text-green-600",
];

export function PasswordStrength({ password }: Props) {
  if (!password) return null;

  const score = RULES.filter((r) => r.test(password)).length;

  return (
    <div className="mt-1.5 space-y-1">
      {/* 색상 바 */}
      <div className="flex gap-1">
        {RULES.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
              i < score ? STRENGTH_BAR_COLOR[score] : "bg-neutral-200 dark:bg-neutral-700"
            }`}
          />
        ))}
      </div>
      {/* 강도 텍스트 + 규칙 */}
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-semibold ${STRENGTH_TEXT_COLOR[score]}`}>
          {STRENGTH_TEXT[score]}
        </span>
        <div className="flex gap-2">
          {RULES.map((rule, i) => (
            <span
              key={i}
              className={`text-[10px] transition-colors ${
                rule.test(password)
                  ? "text-green-600 dark:text-green-400"
                  : "text-neutral-400"
              }`}
            >
              {rule.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: AuthModal 고도화**

`apps/frontend/src/components/auth/AuthModal.tsx` 전체 교체:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2, LogIn, UserPlus, X } from "lucide-react";

import { login, register } from "@/lib/api";
import { PasswordStrength } from "./PasswordStrength";

type Mode = "login" | "register";

interface Props {
  initialMode?: Mode;
  onClose: () => void;
  onSuccess?: () => void;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function AuthModal({ initialMode = "login", onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [name, setName] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 모드 전환 시 에러 초기화
  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setEmailError(null);
    setPassword("");
    setPasswordConfirm("");
  };

  const handleEmailBlur = () => {
    if (email && !EMAIL_RE.test(email)) {
      setEmailError("올바른 이메일 형식이 아닙니다");
    } else {
      setEmailError(null);
    }
  };

  const passwordMismatch =
    mode === "register" && passwordConfirm.length > 0 && password !== passwordConfirm;

  const canSubmit =
    !busy &&
    email.length > 0 &&
    !emailError &&
    password.length >= (mode === "register" ? 8 : 1) &&
    (mode === "login" || (password === passwordConfirm && agreeTerms && agreePrivacy));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
      onSuccess?.();
      onClose();
    } catch (e) {
      const m = (e as Error).message;
      if (m.includes("401")) setError("이메일 또는 비밀번호가 잘못되었습니다");
      else if (m.includes("409")) setError("이미 가입된 이메일입니다");
      else if (m.includes("422")) setError("비밀번호는 8자 이상이어야 합니다");
      else setError(m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-[400px] rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        {/* 헤더 */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold">
            {mode === "register" ? "회원가입" : "로그인"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={16} />
          </button>
        </div>

        {/* Google OAuth 버튼 */}
        <button
          type="button"
          onClick={() => {
            const base = process.env.NEXT_PUBLIC_API_BASE ?? "";
            window.location.href = `${base}/api/v1/auth/google`;
          }}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google로 계속하기
        </button>

        {/* 구분선 */}
        <div className="relative mb-3">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-200 dark:border-neutral-700" />
          </div>
          <div className="relative flex justify-center text-[10px]">
            <span className="bg-white px-2 text-neutral-500 dark:bg-neutral-900">또는 이메일로</span>
          </div>
        </div>

        {/* 폼 필드 */}
        <div className="space-y-3">
          {mode === "register" && (
            <div>
              <label className="mb-1 block text-[11px] text-neutral-600 dark:text-neutral-400">이름 (선택)</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[11px] text-neutral-600 dark:text-neutral-400">이메일</label>
            <input
              type="email"
              value={email}
              required
              autoComplete="email"
              onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
              onBlur={handleEmailBlur}
              placeholder="you@company.com"
              className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none dark:bg-neutral-950 ${
                emailError
                  ? "border-red-400 focus:border-red-500"
                  : "border-neutral-200 focus:border-brand dark:border-neutral-700"
              }`}
            />
            {emailError && (
              <p className="mt-0.5 text-[10px] text-red-500">{emailError}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-neutral-600 dark:text-neutral-400">
              비밀번호 {mode === "register" && "(8자 이상)"}
            </label>
            <input
              type="password"
              value={password}
              required
              minLength={mode === "register" ? 8 : 1}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
            />
            {mode === "register" && <PasswordStrength password={password} />}
          </div>
          {mode === "register" && (
            <div>
              <label className="mb-1 block text-[11px] text-neutral-600 dark:text-neutral-400">비밀번호 확인</label>
              <input
                type="password"
                value={passwordConfirm}
                required
                autoComplete="new-password"
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none dark:bg-neutral-950 ${
                  passwordMismatch
                    ? "border-red-400 focus:border-red-500"
                    : "border-neutral-200 focus:border-brand dark:border-neutral-700"
                }`}
              />
              {passwordMismatch && (
                <p className="mt-0.5 text-[10px] text-red-500">비밀번호가 일치하지 않습니다</p>
              )}
            </div>
          )}
        </div>

        {/* 약관 동의 */}
        {mode === "register" && (
          <div className="mt-3 space-y-1.5 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs dark:border-neutral-700 dark:bg-neutral-900">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <a href="/terms" target="_blank" rel="noopener" className="font-semibold text-brand hover:underline">
                  이용약관
                </a>
                에 동의합니다 <span className="text-rose-600">(필수)</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={agreePrivacy}
                onChange={(e) => setAgreePrivacy(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <a href="/privacy" target="_blank" rel="noopener" className="font-semibold text-brand hover:underline">
                  개인정보처리방침
                </a>
                에 동의합니다 <span className="text-rose-600">(필수)</span>
              </span>
            </label>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* 제출 버튼 */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-brand py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-soft disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {mode === "register" ? (
            <><UserPlus size={14} /> {busy ? "가입 중…" : "가입하기"}</>
          ) : (
            <><LogIn size={14} /> {busy ? "로그인 중…" : "로그인"}</>
          )}
        </button>

        {/* 모드 전환 링크 */}
        <div className="mt-3 text-center text-xs text-neutral-500">
          {mode === "register" ? (
            <>
              이미 계정이 있으신가요?{" "}
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="text-brand hover:underline"
              >
                로그인
              </button>
            </>
          ) : (
            <>
              <a
                href="/forgot-password"
                className="mb-2 block text-neutral-500 hover:text-brand"
              >
                비밀번호를 잊으셨나요?
              </a>
              계정이 없으신가요?{" "}
              <button
                type="button"
                onClick={() => switchMode("register")}
                className="text-brand hover:underline"
              >
                회원가입
              </button>
            </>
          )}
        </div>

        <div className="mt-3 text-center text-[10px] text-neutral-400">
          ⓘ 비밀번호는 bcrypt로 안전하게 해시되어 저장됩니다.
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: TypeScript 타입 체크 통과 확인**

```bash
cd apps/frontend
npm run typecheck
```

Expected: 오류 0개

- [ ] **Step 4: 커밋**

```bash
git add apps/frontend/src/components/auth/PasswordStrength.tsx \
        apps/frontend/src/components/auth/AuthModal.tsx
git commit -m "feat: 비밀번호 강도 표시기 + 실시간 유효성 검사 + 로딩 상태 개선"
```

---

## 최종 검증

- [ ] **전체 백엔드 테스트 통과**

```bash
cd apps/backend
pytest tests/ -v --tb=short
```

Expected: 모든 테스트 PASSED (기존 + 신규 test_email_service, test_refresh_token, test_email_verification)

- [ ] **프론트엔드 빌드 통과**

```bash
cd apps/frontend
NEXT_PUBLIC_API_BASE=http://localhost:8000 npm run build
```

Expected: Build 성공, TypeScript 오류 없음

- [ ] **전체 커밋 후 푸시**

```bash
git push
```

---

## 환경변수 설정 가이드 (운영 배포 시)

### Railway (backend)

| 변수 | 값 | 설명 |
|------|----|------|
| `SMTP_USER` | `your@gmail.com` | Gmail 주소 |
| `SMTP_PASSWORD` | `xxxx xxxx xxxx xxxx` | Gmail 앱 비밀번호 (2FA 필수) |
| `SMTP_FROM` | `DocuAX <your@gmail.com>` | 발신자 표시명 |
| `FRONTEND_URL` | `https://docuax-xxx.vercel.app` | 이메일 링크 base URL |
| `GOOGLE_CLIENT_ID` | (Google Cloud에서 발급) | |
| `GOOGLE_CLIENT_SECRET` | (Google Cloud에서 발급) | |
| `GOOGLE_REDIRECT_URI` | `https://docuax-production.up.railway.app/api/v1/auth/google/callback` | |

### Gmail 앱 비밀번호 발급
1. Google 계정 → 보안 → 2단계 인증 활성화
2. 앱 비밀번호 → 앱: 메일, 기기: 기타(DocuAX) → 생성
3. 생성된 16자리 비밀번호를 `SMTP_PASSWORD`에 입력
