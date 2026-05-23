"""구조화 로깅 — structlog. 운영 환경에서는 JSON, 개발에서는 컬러 텍스트."""
from __future__ import annotations

import logging
import sys

import structlog

from app.core.config import get_settings


def _force_utf8_stdio() -> None:
    """Windows cp949 콘솔에서 한국어·특수문자 로그 인코딩 오류 방지.

    Python 3.7+ TextIOWrapper.reconfigure 사용. 이미 UTF-8이면 no-op.
    POSIX·Mac은 보통 UTF-8이라 영향 없음.
    """
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except (AttributeError, ValueError):
            pass


def configure_logging() -> None:
    _force_utf8_stdio()
    settings = get_settings()
    level = logging.DEBUG if settings.app_debug else logging.INFO

    processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=False),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if settings.app_env == "development":
        processors.append(structlog.dev.ConsoleRenderer(colors=True))
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = __name__) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
