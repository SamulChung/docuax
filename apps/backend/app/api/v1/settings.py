"""런타임 설정 API — LLM provider·키를 UI에서 안전하게 관리.

엔드포인트:
  GET  /settings/llm           현재 설정 조회 (시크릿 마스킹)
  POST /settings/llm           설정 업데이트 + provider 캐시 무효화
  POST /settings/llm/test      현재(또는 후보) 설정으로 health_check 수행
  POST /settings/llm/reset     overlay 삭제 → .env 기본값으로 복귀

보안:
- POST body의 토큰은 평문이지만 HTTPS 전제 (운영) / localhost (개발)
- GET 응답은 마스킹된 값만 — 입력 후 평문 회수 불가
- 빈 문자열 전송 시 해당 필드는 .env 기본값으로 복귀 (overlay 삭제)
"""
from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import require_admin
from app.core.config import reset_settings_cache
from app.core.logging import get_logger
from app.models import User
from app.providers.embeddings.registry import get_embedding_provider
from app.providers.llm import get_llm_provider
from app.providers.llm.registry import reset_provider_cache
from app.providers.ocr.registry import reset_ocr_provider_cache
from app.services.runtime_settings import (
    ALLOWED_FIELDS,
    apply_overlay_to_env,
    public_view,
    reset_overlay,
    save_overlay,
)

router = APIRouter()
log = get_logger(__name__)


class LLMSettingsUpdate(BaseModel):
    """업데이트 가능한 필드 — 모두 선택. 빈 문자열은 해당 필드 삭제(.env 기본값으로 복귀)."""

    llm_provider: Literal["tenos", "tenos_hf", "openai", "anthropic", "mock", "chain"] | None = None
    llm_chain: str | None = None
    tenos_base_url: str | None = None
    tenos_model: str | None = None
    tenos_api_key: str | None = None
    tenos_timeout_s: float | None = None
    hf_api_token: str | None = None
    openai_api_key: str | None = None
    openai_model: str | None = None
    openai_base_url: str | None = None
    anthropic_api_key: str | None = None
    anthropic_model: str | None = None
    # OCR
    ocr_provider: Literal["none", "tesseract", "clova"] | None = None
    ocr_tesseract_cmd: str | None = None
    ocr_default_lang: str | None = None
    clova_ocr_url: str | None = None
    clova_ocr_secret: str | None = None


class TestRequest(BaseModel):
    """일시적으로 후보 설정으로 health_check만 수행 — 저장 X."""

    overrides: LLMSettingsUpdate = Field(default_factory=LLMSettingsUpdate)


@router.get("/settings/llm")
async def get_llm_settings(
    _user: Annotated[User, Depends(require_admin)],
) -> dict[str, Any]:
    """현재 LLM 설정 — 시크릿은 마스킹. 관리자만 조회 가능."""
    provider = get_llm_provider()
    return {
        "current": {
            "provider": provider.name,
            "model_id": provider.model_id,
        },
        "fields": public_view(),
        "allowed_fields": sorted(ALLOWED_FIELDS),
    }


@router.post("/settings/llm")
async def update_llm_settings(
    update: LLMSettingsUpdate,
    _user: Annotated[User, Depends(require_admin)],
) -> dict[str, Any]:
    """설정 업데이트 + provider 즉시 교체. 관리자 전용."""
    # None은 변경 안 함, "" 는 삭제 신호
    updates = {k: v for k, v in update.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="변경할 필드 없음")

    save_overlay(updates)
    apply_overlay_to_env()
    reset_settings_cache()
    reset_provider_cache()
    reset_ocr_provider_cache()
    # 임베딩 provider도 영향받을 수 있음 — 잠시 무효화
    try:
        get_embedding_provider.cache_clear()  # type: ignore[attr-defined]
    except AttributeError:
        pass

    new_provider = get_llm_provider()
    log.info("LLM 설정 업데이트", changed=list(updates.keys()), new_provider=new_provider.name)
    return {
        "ok": True,
        "current": {"provider": new_provider.name, "model_id": new_provider.model_id},
        "fields": public_view(),
    }


@router.post("/settings/llm/test")
async def test_llm_settings(
    req: TestRequest,
    _user: Annotated[User, Depends(require_admin)],
) -> dict[str, Any]:
    """후보 설정으로 health_check만 수행 — 저장하지 않음. 관리자 전용.

    프론트엔드 '연결 테스트' 버튼이 호출.
    overrides가 비어있으면 현재 활성 provider를 그대로 테스트.
    """
    import os

    # 임시 환경변수 백업
    backup: dict[str, str | None] = {}
    apply = {k: v for k, v in req.overrides.model_dump().items() if v is not None}
    try:
        if apply:
            for k, v in apply.items():
                ek = k.upper()
                backup[ek] = os.environ.get(ek)
                if v == "":
                    os.environ.pop(ek, None)
                else:
                    os.environ[ek] = str(v)
            reset_settings_cache()
            reset_provider_cache()

        provider = get_llm_provider()
        health = await provider.health_check()
        return {
            "ok": health.available,
            "provider": provider.name,
            "model_id": provider.model_id,
            "health": health.model_dump(),
        }
    finally:
        # 환경변수 복원
        if apply:
            for ek, v in backup.items():
                if v is None:
                    os.environ.pop(ek, None)
                else:
                    os.environ[ek] = v
            apply_overlay_to_env()
            reset_settings_cache()
            reset_provider_cache()


@router.get("/settings/ocr/status")
async def get_ocr_status() -> dict[str, Any]:
    """현재 OCR provider 가용성 확인."""
    from app.providers.ocr.registry import get_ocr_provider
    p = get_ocr_provider()
    return {
        "provider": p.name,
        "available": p.available,
    }


@router.post("/settings/llm/reset")
async def reset_llm_settings(
    _user: Annotated[User, Depends(require_admin)],
) -> dict[str, Any]:
    """overlay 전체 삭제 → .env 기본값 복귀. 관리자 전용."""
    reset_overlay()
    apply_overlay_to_env()
    reset_settings_cache()
    reset_provider_cache()
    reset_ocr_provider_cache()
    provider = get_llm_provider()
    return {"ok": True, "current": {"provider": provider.name, "model_id": provider.model_id}}
