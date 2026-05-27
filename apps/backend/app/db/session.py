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


_settings = get_settings()
engine = create_async_engine(_settings.database_url, echo=False, future=True)
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
