"""EmailService 단위 테스트."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.email import EmailService


@pytest.fixture
def email_svc_disabled():
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
def email_svc_enabled():
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
    """SMTP 오류는 예외를 올리지 않고 log.error를 호출한다."""
    with patch("app.services.email.aiosmtplib") as mock_smtp, \
         patch("app.services.email.log") as mock_log:
        mock_smtp.send = AsyncMock(side_effect=Exception("connection refused"))
        await email_svc_enabled.send_verification_email("user@example.com", "tok000")
        mock_log.error.assert_called_once()
