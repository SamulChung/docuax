from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app import __version__
from app.core.config import get_settings
from app.db import get_db
from app.macros.registry import get_macro_registry
from app.providers.llm import get_llm_provider
from app.schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    provider = get_llm_provider()
    llm_health = await provider.health_check()
    stats = get_macro_registry().stats()
    return HealthResponse(
        status="ok" if llm_health.available else "degraded",
        version=__version__,
        llm=llm_health.model_dump(),
        macros=stats,
    )


@router.get("/health/db")
async def health_db(db: AsyncSession = Depends(get_db)) -> dict:
    """DB 연결 상태 + 테이블 존재 여부 진단."""
    settings = get_settings()
    import re
    url_masked = re.sub(r":([^:@]+)@", ":***@", settings.database_url)

    result: dict = {"db_url_masked": url_masked}

    # 1) 기본 연결 확인
    try:
        r = await db.execute(text("SELECT 1"))
        result["ping"] = r.scalar()
    except Exception as e:
        result["ping_error"] = str(e)
        return result

    # 2) users 테이블 존재 여부 (PostgreSQL)
    try:
        r2 = await db.execute(text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_name = 'users'"
        ))
        result["users_table_exists"] = (r2.scalar() or 0) > 0
    except Exception as e:
        result["users_table_error"] = str(e)

    # 3) users 테이블 row count
    try:
        r3 = await db.execute(text("SELECT COUNT(*) FROM users"))
        result["users_count"] = r3.scalar()
    except Exception as e:
        result["users_count_error"] = str(e)

    # 4) 직접 User 모델 쿼리 테스트
    from sqlalchemy import select
    from app.models import User
    try:
        r4 = await db.execute(select(User).limit(1))
        row = r4.scalar_one_or_none()
        result["user_query_ok"] = True
        result["sample_user_email"] = row.email if row else None
    except Exception as e:
        result["user_query_error"] = str(e)
        result["user_query_error_type"] = type(e).__name__

    return result
