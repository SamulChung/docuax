"""사용자 개인 API 키 관리 — BYOK (Bring Your Own Key).

엔드포인트:
  GET    /me/api-keys                내 등록 키 목록 (마스킹된 표시)
  PUT    /me/api-keys/{provider}     등록·교체 (provider: openai | anthropic)
  DELETE /me/api-keys/{provider}     삭제

원칙:
- 로그인 사용자 본인의 키만 조회·등록·삭제 가능
- 응답에는 마스킹된 값만 (마지막 4자리)
- 키는 Fernet 으로 암호화 저장
- 같은 사용자·provider 조합은 PUT 으로 덮어쓰기
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.logging import get_logger
from app.core.rate_limit import rate_limit_auth
from app.db import get_db
from app.models import User, UserApiKey
from app.services.key_vault import encrypt, last_4, mask

router = APIRouter()
log = get_logger(__name__)

SUPPORTED_PROVIDERS = {"openai", "anthropic"}


class KeyEntry(BaseModel):
    provider: str
    masked: str  # 'sk-ant…xxxx'
    last_4: str
    created_at: datetime
    updated_at: datetime
    last_used_at: datetime | None = None


class KeySetRequest(BaseModel):
    """본인 키 등록·교체.

    api_key 형식 가이드:
      - openai:    sk-proj-... 또는 sk-...
      - anthropic: sk-ant-...
    """
    api_key: str = Field(..., min_length=20, max_length=300)


@router.get("/me/api-keys", response_model=list[KeyEntry])
async def list_my_keys(
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> list[KeyEntry]:
    """내가 등록한 키 목록 — 마스킹된 표시."""
    res = await db.execute(select(UserApiKey).where(UserApiKey.user_id == user.id))
    rows = res.scalars().all()
    return [
        KeyEntry(
            provider=r.provider,
            masked=f"…{r.last_4}",
            last_4=r.last_4,
            created_at=r.created_at,
            updated_at=r.updated_at,
            last_used_at=r.last_used_at,
        )
        for r in rows
    ]


@router.put("/me/api-keys/{provider}", response_model=KeyEntry)
async def set_my_key(
    provider: Literal["openai", "anthropic"],
    body: KeySetRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_auth),
) -> KeyEntry:
    """본인 키 등록·교체."""
    key = body.api_key.strip()
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 provider: {provider}")

    # 형식 가벼운 검증 — 정밀 검증은 첫 호출 시 LLM 응답으로
    if provider == "anthropic" and not key.startswith("sk-ant-"):
        raise HTTPException(
            status_code=400,
            detail="Anthropic 키는 sk-ant- 로 시작해야 합니다.",
        )
    if provider == "openai" and not (key.startswith("sk-") or key.startswith("sess-")):
        raise HTTPException(
            status_code=400,
            detail="OpenAI 키는 sk- 또는 sess- 로 시작해야 합니다.",
        )

    # 기존 행 조회 → 있으면 업데이트, 없으면 신규
    res = await db.execute(
        select(UserApiKey).where(
            UserApiKey.user_id == user.id, UserApiKey.provider == provider,
        )
    )
    existing = res.scalar_one_or_none()
    encrypted = encrypt(key)
    last4 = last_4(key)

    if existing:
        existing.encrypted_key = encrypted
        existing.last_4 = last4
    else:
        existing = UserApiKey(
            user_id=user.id,
            provider=provider,
            encrypted_key=encrypted,
            last_4=last4,
        )
        db.add(existing)
    await db.commit()
    await db.refresh(existing)
    log.info("사용자 API 키 등록", user=user.email, provider=provider, last_4=last4)

    return KeyEntry(
        provider=existing.provider,
        masked=mask(key),
        last_4=existing.last_4,
        created_at=existing.created_at,
        updated_at=existing.updated_at,
        last_used_at=existing.last_used_at,
    )


@router.delete("/me/api-keys/{provider}")
async def delete_my_key(
    provider: Literal["openai", "anthropic"],
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> dict:
    """본인 키 삭제."""
    res = await db.execute(
        select(UserApiKey).where(
            UserApiKey.user_id == user.id, UserApiKey.provider == provider,
        )
    )
    existing = res.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="등록된 키 없음")
    await db.delete(existing)
    await db.commit()
    log.info("사용자 API 키 삭제", user=user.email, provider=provider)
    return {"ok": True, "deleted_provider": provider}
