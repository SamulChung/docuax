"""슬라이드 생성·편집·내보내기 API.

엔드포인트:
  POST /slides/generate         문서/역관목조분 → SlideSchema JSON
  POST /slides/extract-theme    .pptx 또는 이미지 → CustomTheme JSON
  GET  /slides/{id}             저장된 슬라이드 조회
  PUT  /slides/{id}             슬라이드 저장/업데이트
"""
from __future__ import annotations

import os
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_optional
from app.core.logging import get_logger
from app.db import get_db
from app.models import Slide, User
from app.services.slide_generator import generate_slides
from app.services.theme_extractor import extract_theme_from_image, extract_theme_from_pptx

router = APIRouter()
log = get_logger(__name__)

ALLOWED_PPTX = {".pptx"}
ALLOWED_IMAGES = {".png", ".jpg", ".jpeg", ".webp"}
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


# ── 요청/응답 스키마 ──────────────────────────────────────────────


class GenerateRequest(BaseModel):
    mode: Literal["document", "analysis"] = "document"
    document_text: str | None = Field(None, max_length=50000)
    instruction: str | None = Field(None, max_length=2000)
    analysis_text: str | None = Field(None, max_length=20000)
    theme: str = Field("minimal", pattern="^(gov|corp|minimal|gradient|custom)$")
    custom_theme: dict[str, Any] | None = None

    @model_validator(mode="after")
    def check_required_fields(self) -> "GenerateRequest":
        if self.mode == "document":
            if not self.document_text:
                raise ValueError("document 모드에서는 document_text 필수")
        elif self.mode == "analysis":
            if not self.analysis_text:
                raise ValueError("analysis 모드에서는 analysis_text 필수")
        return self


class SaveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    schema_data: dict[str, Any] = Field(alias="schema")
    title: str = Field("슬라이드", max_length=500)


class SlideResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    title: str
    schema_data: dict[str, Any] = Field(alias="schema", serialization_alias="schema")


# ── 엔드포인트 ────────────────────────────────────────────────────


@router.post("/slides/generate")
async def generate(
    body: GenerateRequest,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """문서+지시어 또는 역관목조분 텍스트로부터 SlideSchema를 생성한다."""
    schema = await generate_slides(
        mode=body.mode,
        document_text=body.document_text,
        instruction=body.instruction,
        theme=body.theme,
        custom_theme=body.custom_theme,
        analysis_text=body.analysis_text,
    )
    return schema


@router.post("/slides/extract-theme")
async def extract_theme(
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """업로드된 .pptx 또는 이미지 파일에서 테마를 추출한다."""
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="파일이 너무 큽니다 (최대 20MB)")

    ext = os.path.splitext(file.filename or "")[1].lower()

    if ext in ALLOWED_PPTX:
        return await extract_theme_from_pptx(content)
    elif ext in ALLOWED_IMAGES:
        mime = file.content_type or "image/png"
        return await extract_theme_from_image(content, mime)
    else:
        raise HTTPException(
            status_code=400,
            detail=f"지원하지 않는 파일 형식입니다. 허용: {ALLOWED_PPTX | ALLOWED_IMAGES}",
        )


@router.get("/slides/{slide_id}", response_model=SlideResponse)
async def get_slide(
    slide_id: str,
    db: AsyncSession = Depends(get_db),
) -> SlideResponse:
    """저장된 슬라이드를 조회한다."""
    res = await db.execute(select(Slide).where(Slide.id == slide_id))
    slide = res.scalar_one_or_none()
    if not slide:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="슬라이드를 찾을 수 없습니다")
    return SlideResponse(id=slide.id, title=slide.title, schema_data=slide.schema_json)


@router.put("/slides/{slide_id}", response_model=SlideResponse)
async def save_slide(
    slide_id: str,
    body: SaveRequest,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
) -> SlideResponse:
    """슬라이드를 저장하거나 업데이트한다."""
    res = await db.execute(select(Slide).where(Slide.id == slide_id))
    existing = res.scalar_one_or_none()

    if existing:
        existing.title = body.title
        existing.schema_json = body.schema_data
        await db.commit()
        return SlideResponse(id=existing.id, title=existing.title, schema_data=existing.schema_json)

    new_slide = Slide(
        id=slide_id,
        user_id=user.id if user else "anonymous",
        title=body.title,
        schema_json=body.schema_data,
    )
    db.add(new_slide)
    await db.commit()
    return SlideResponse(id=new_slide.id, title=new_slide.title, schema_data=new_slide.schema_json)
