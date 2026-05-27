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
