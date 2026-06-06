"""DB 세션 — SQLAlchemy 2.0 async."""
from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)


class Base(DeclarativeBase):
    pass


def _make_async_url(url: str) -> str:
    """DATABASE_URL을 SQLAlchemy 비동기 드라이버 형식으로 변환.

    Railway/Heroku 제공 URL 패턴:
      postgres://...   → postgresql+asyncpg://...
      postgresql://... → postgresql+asyncpg://...
    SQLite (로컬 개발):
      sqlite:///...    → sqlite+aiosqlite:///...
    이미 올바른 형식이면 그대로 반환.

    주의: asyncpg는 URL의 sslmode 파라미터를 지원하지 않으므로 제거한다.
    Railway 내부 네트워크는 SSL 없이도 안전하게 연결된다.
    """
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("sqlite:///") and "+aiosqlite" not in url:
        return url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)

    # asyncpg는 sslmode URL 파라미터를 인식하지 못해 에러 발생
    # Railway 내부망은 SSL 불필요 → sslmode 파라미터 제거
    if "sslmode=" in url:
        import re
        url = re.sub(r"[?&]sslmode=[^&]*", "", url)
        # 파라미터 제거 후 '?' 없이 '&'만 남으면 정리
        url = re.sub(r"\?&", "?", url)
        url = url.rstrip("?")

    return url


_settings = get_settings()
_db_url = _make_async_url(_settings.database_url)

# PostgreSQL 연결 풀 설정
_engine_kwargs: dict = {"echo": False, "future": True}
if _db_url.startswith("postgresql"):
    _engine_kwargs["pool_pre_ping"] = True   # 연결 상태 사전 확인
    _engine_kwargs["pool_size"] = 5
    _engine_kwargs["max_overflow"] = 10
    _engine_kwargs["connect_args"] = {"ssl": False}  # Railway 내부망 SSL 불필요

engine = create_async_engine(_db_url, **_engine_kwargs)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def init_db() -> None:
    """앱 시작 시 호출. 운영에서는 Alembic 마이그레이션 사용 권장."""
    # 모델 import — 메타데이터에 등록되도록
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

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    log.info("DB 초기화 완료", url=_settings.database_url)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
