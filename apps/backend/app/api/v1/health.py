from __future__ import annotations

from fastapi import APIRouter

from app import __version__
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
