"""DocuAX FastAPI 진입점."""
from __future__ import annotations

from contextlib import asynccontextmanager

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.db import init_db
from app.macros.registry import get_macro_registry
from app.providers.llm import get_llm_provider


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    configure_logging()
    log = get_logger(__name__)
    # runtime overlay를 환경변수에 주입 → 다음 get_settings() 호출에 반영
    from app.services.runtime_settings import apply_overlay_to_env
    apply_overlay_to_env()
    settings = get_settings()
    log.info(
        "DocuAX 시작",
        version=__version__,
        env=settings.app_env,
        on_premise=settings.on_premise,
        llm_provider=settings.llm_provider,
    )
    # 운영 환경 안전 점검 — 위험 설정에 명확한 경고
    if settings.app_env == "production":
        warnings: list[str] = []
        if settings.app_secret_key in ("change-me", "change-me-in-production-please", ""):
            warnings.append("APP_SECRET_KEY가 기본값 — JWT 위조 위험. openssl rand -hex 32 로 교체 필수")
        if settings.app_debug:
            warnings.append("APP_DEBUG=true — 운영에서는 false 권장 (에러 메시지 노출)")
        if "localhost" in settings.cors_origins or "*" in settings.cors_origins:
            warnings.append(f"CORS_ORIGINS={settings.cors_origins} — 운영 도메인으로 제한 필요")
        if settings.database_url.startswith("sqlite"):
            warnings.append("운영에서 SQLite — PostgreSQL 권장 (동시성·백업)")
        for w in warnings:
            log.warning("운영 환경 안전 점검", warning=w)
    # provider + 매크로 사전 초기화 (콜드 스타트 단축)
    provider = get_llm_provider()
    log.info("LLM provider 준비", provider=provider.name, model_id=provider.model_id)
    macro_stats = get_macro_registry().stats()
    log.info("매크로 레지스트리 준비", **macro_stats)
    await init_db()
    yield
    log.info("DocuAX 종료")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="DocuAX API",
        description="마크다운을 한 번에 한국 회사 문서로 — TenOS-Ko-28B 기반 변환 엔진",
        version=__version__,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix="/api")

    # 정적 파일 — 이미지 업로드 / 시각 요소 캐시 결과를 외부에서 조회
    uploads_dir = Path("var/uploads")
    uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(uploads_dir)), name="static")

    # 시각 요소 캐시 — 차트·다이어그램·수식 PNG (미리보기에서 직접 <img> 로 표시)
    visuals_dir = Path("var/visuals")
    visuals_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/visuals", StaticFiles(directory=str(visuals_dir)), name="visuals")

    @app.get("/")
    async def root() -> dict[str, str]:
        return {
            "name": "DocuAX",
            "version": __version__,
            "docs": "/docs",
            "api": "/api/v1",
        }

    return app


app = create_app()
