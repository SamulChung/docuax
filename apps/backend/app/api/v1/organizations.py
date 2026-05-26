"""회사·기관별 문서 양식 프로파일 API.

엔드포인트:
  GET    /organizations               목록 (비로그인도 공개 프로파일은 조회 가능)
  POST   /organizations               신규 (관리자)
  GET    /organizations/{id}          상세
  PATCH  /organizations/{id}          수정 (관리자)
  DELETE /organizations/{id}          삭제 (관리자)

B2B 운영: 한 번 등록해두면 그 기관의 모든 변환이 이 프로파일을 적용.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.deps import get_current_user_optional, is_admin_user
from app.core.logging import get_logger
from app.models import User
from app.services.organization_profile import (
    OrganizationProfile,
    create_profile,
    delete_profile,
    get_profile,
    list_profiles,
    update_profile,
)

router = APIRouter()
log = get_logger(__name__)


def _require_admin(user: User | None) -> User:
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="관리자만 조직 프로파일을 관리할 수 있습니다")
    return user  # type: ignore[return-value]


class ProfileCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str | None = None

    brand_color_hex: str = "#1E2761"
    accent_color_hex: str = "#1F5BAF"
    table_header_bg_hex: str = "#F2F2F2"

    font_korean: str = "함초롬바탕"
    font_korean_heading: str = "함초롬돋움"
    body_font_size_pt: float = 10.0
    h1_font_size_pt: float = 20.0
    h2_font_size_pt: float = 16.0
    h3_font_size_pt: float = 14.0

    page_size: str = "A4"
    margin_top_mm: float = 25.0
    margin_bottom_mm: float = 25.0
    margin_left_mm: float = 25.0
    margin_right_mm: float = 25.0

    header_text: str = ""
    footer_text: str = ""
    logo_data_url: str = ""

    prompt_label: str = ""
    default_template_id: str | None = None
    db_organization_id: str | None = None

    ai_persona_name: str = ""
    ai_system_prompt: str = ""

    is_public: bool = False
    notes: str = ""


class ProfileUpdate(BaseModel):
    name: str | None = None
    brand_color_hex: str | None = None
    accent_color_hex: str | None = None
    table_header_bg_hex: str | None = None
    font_korean: str | None = None
    font_korean_heading: str | None = None
    body_font_size_pt: float | None = None
    h1_font_size_pt: float | None = None
    h2_font_size_pt: float | None = None
    h3_font_size_pt: float | None = None
    page_size: str | None = None
    margin_top_mm: float | None = None
    margin_bottom_mm: float | None = None
    margin_left_mm: float | None = None
    margin_right_mm: float | None = None
    header_text: str | None = None
    footer_text: str | None = None
    logo_data_url: str | None = None
    prompt_label: str | None = None
    default_template_id: str | None = None
    db_organization_id: str | None = None
    ai_persona_name: str | None = None
    ai_system_prompt: str | None = None

    is_public: bool | None = None
    notes: str | None = None


@router.get("/organizations", response_model=list[OrganizationProfile])
async def list_orgs(
    public_only: bool = Query(False),
    user: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> list[OrganizationProfile]:
    # 비로그인·일반 사용자: 공개 프로파일만
    if user is None or not is_admin_user(user):
        return list_profiles(include_private=False)
    if public_only:
        return list_profiles(include_private=False)
    return list_profiles(include_private=True)


@router.post("/organizations", response_model=OrganizationProfile)
async def create_org(
    body: ProfileCreate,
    user: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> OrganizationProfile:
    admin = _require_admin(user)
    data = body.model_dump(exclude_unset=True, exclude={"name", "slug"})
    return create_profile(
        name=body.name,
        slug=body.slug,
        created_by=admin.email,
        **data,
    )


@router.get("/organizations/{org_id}", response_model=OrganizationProfile)
async def get_org(
    org_id: str,
    user: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> OrganizationProfile:
    p = get_profile(org_id)
    if not p:
        raise HTTPException(status_code=404, detail="조직 프로파일 없음")
    if not p.is_public and not is_admin_user(user):
        raise HTTPException(status_code=403, detail="비공개 프로파일")
    return p


@router.patch("/organizations/{org_id}", response_model=OrganizationProfile)
async def patch_org(
    org_id: str,
    body: ProfileUpdate,
    user: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> OrganizationProfile:
    _require_admin(user)
    updated = update_profile(org_id, **body.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(status_code=404, detail="조직 프로파일 없음")
    return updated


@router.delete("/organizations/{org_id}")
async def delete_org(
    org_id: str,
    user: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> dict:
    _require_admin(user)
    ok = delete_profile(org_id)
    if not ok:
        raise HTTPException(status_code=404, detail="조직 프로파일 없음")
    return {"ok": True, "deleted_id": org_id}
