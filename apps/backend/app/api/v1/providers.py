"""LLM Provider 가용성·구성 정보 API.

엔드포인트:
  GET /providers   — 4개 provider 별 (configured / available / reason / model_id)

프론트엔드는 이 정보로 토글 메뉴를 동적 정렬한다:
  - configured=True 인 외부 provider (Claude/GPT) 가 키 미설정 provider 보다 앞
  - 자체 LLM (TenOS) 는 항상 표시 (운영 기본값)
  - Mock 은 항상 가용 (개발용)
"""
from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_optional
from app.core.config import get_settings
from app.db import get_db
from app.models import User, UserApiKey

router = APIRouter()


class ProviderStatus(BaseModel):
    id: Literal["tenos", "tenos_hf", "openai", "anthropic", "mock", "chain"]
    name: str
    tagline: str
    emoji: str
    # configured=True 면 시스템 키·설정이 있어 호출 가능
    configured: bool
    # 본인(BYOK) 키 등록 여부 — 로그인 사용자에 한해 True 가능
    own_configured: bool = False
    own_last_4: str = ""  # 본인 키의 마지막 4자리 (UI 표시용)
    # configured=False 일 때 사용자에게 보일 안내 (예: "OpenAI 키 미설정")
    reason: str = ""
    # 모델 ID (configured 일 때만 의미 있음)
    model_id: str = ""


class ProvidersResponse(BaseModel):
    """프론트엔드 토글 메뉴용 — `default` 가 현재 활성, `available` 가 키 설정된 것 순."""

    default: str  # 현재 활성 provider (settings.LLM_PROVIDER)
    items: list[ProviderStatus]


@router.get("/providers", response_model=ProvidersResponse)
async def list_providers(
    user: Annotated[User | None, Depends(get_current_user_optional)] = None,
    db: AsyncSession = Depends(get_db),
) -> ProvidersResponse:
    s = get_settings()
    # 로그인 사용자라면 본인 BYOK 키 목록 가져오기
    own_keys: dict[str, str] = {}  # provider → last_4
    if user is not None:
        rows = (await db.execute(
            select(UserApiKey).where(UserApiKey.user_id == user.id)
        )).scalars().all()
        for r in rows:
            own_keys[r.provider] = r.last_4

    def make(
        pid: str,
        name: str,
        tagline: str,
        emoji: str,
        configured: bool,
        reason: str,
        model_id: str,
    ) -> ProviderStatus:
        own_last4 = own_keys.get(pid, "")
        own_ok = bool(own_last4)
        return ProviderStatus(
            id=pid,  # type: ignore[arg-type]
            name=name,
            tagline=tagline,
            emoji=emoji,
            configured=configured or own_ok,  # 본인 키 있으면 사용 가능 표시
            own_configured=own_ok,
            own_last_4=own_last4,
            reason=reason,
            model_id=model_id,
        )

    items: list[ProviderStatus] = []

    # TenOS — 자체 LLM (vLLM 서빙)
    tenos_ok = bool(s.tenos_base_url and s.tenos_model)
    items.append(make(
        pid="tenos",
        name="TenOS-Ko",
        tagline="자체 LLM (한국어 특화)",
        emoji="🚀",
        configured=tenos_ok,
        reason="" if tenos_ok else "TENOS_BASE_URL·TENOS_MODEL 미설정",
        model_id=s.tenos_model if tenos_ok else "",
    ))

    # Anthropic — Claude API
    anthropic_ok = bool(s.anthropic_api_key)
    items.append(make(
        pid="anthropic",
        name="Claude",
        tagline="Anthropic API",
        emoji="🧠",
        configured=anthropic_ok,
        reason="" if anthropic_ok else "ANTHROPIC_API_KEY 미설정 — 관리자 콘솔 → LLM 설정",
        model_id=s.anthropic_model if anthropic_ok else "",
    ))

    # OpenAI — ChatGPT API
    openai_ok = bool(s.openai_api_key)
    items.append(make(
        pid="openai",
        name="ChatGPT",
        tagline="OpenAI API",
        emoji="🤖",
        configured=openai_ok,
        reason="" if openai_ok else "OPENAI_API_KEY 미설정 — 관리자 콘솔 → LLM 설정",
        model_id=s.openai_model if openai_ok else "",
    ))

    # Mock — 개발·테스트용 (항상 가용)
    items.append(make(
        pid="mock",
        name="Mock",
        tagline="개발·테스트용",
        emoji="🧪",
        configured=True,
        reason="",
        model_id="mock:deterministic-v1",
    ))

    return ProvidersResponse(default=s.llm_provider, items=items)
