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
    """DB 연결 상태 진단 — 실제 쿼리 실행 후 결과 반환."""
    settings = get_settings()
    url_masked = settings.database_url
    # 비밀번호 마스킹
    import re
    url_masked = re.sub(r":([^:@]+)@", ":***@", url_masked)

    try:
        result = await db.execute(text("SELECT 1"))
        row = result.scalar()
        return {
            "db_ok": True,
            "db_url_masked": url_masked,
            "query_result": row,
        }
    except Exception as e:
        return {
            "db_ok": False,
            "db_url_masked": url_masked,
            "error": str(e),
            "error_type": type(e).__name__,
        }
