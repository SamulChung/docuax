"""결제 API — Stripe 구독 + 웹훅.

엔드포인트:
  GET  /billing/plans               플랜 목록 + 가격
  POST /billing/checkout-session    구독 시작 (Stripe 페이지 URL 반환)
  POST /billing/webhook             Stripe → 우리 서버 알림 (서명 검증)
  GET  /billing/status              현재 사용자 플랜·한도·일일 사용량
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.logging import get_logger
from app.db import get_db
from app.models import User
from app.services.plan_enforcement import PLANS, count_daily_conversions, get_limits
from app.services.stripe_service import (
    StripeNotConfigured,
    create_checkout_session,
    is_enabled,
    plan_from_price_id,
    verify_webhook,
)

router = APIRouter()
log = get_logger(__name__)


class PlanInfo(BaseModel):
    id: str
    name: str
    price_krw_monthly: int | None
    daily_conversions: int
    max_uploaded_templates: int
    can_share_with_org: bool
    can_use_rag: bool
    can_use_on_premise: bool


PLAN_PRICES = {
    "free": (0, "Free"),
    "pro": (9900, "Pro"),
    "team": (49900, "Team"),
    "enterprise": (None, "Enterprise (별도 견적)"),
}


@router.get("/billing/plans", response_model=list[PlanInfo])
async def list_plans() -> list[PlanInfo]:
    out = []
    for pid, limits in PLANS.items():
        price, name = PLAN_PRICES.get(pid, (None, pid))
        out.append(PlanInfo(
            id=pid, name=name,
            price_krw_monthly=price,
            daily_conversions=limits.daily_conversions,
            max_uploaded_templates=limits.max_uploaded_templates,
            can_share_with_org=limits.can_share_with_org,
            can_use_rag=limits.can_use_rag,
            can_use_on_premise=limits.can_use_on_premise,
        ))
    return out


@router.get("/billing/status")
async def billing_status(
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> dict:
    limits = get_limits(user.plan)
    used_today = await count_daily_conversions(db, user.id)
    return {
        "plan": user.plan,
        "limits": {
            "daily_conversions": limits.daily_conversions,
            "max_uploaded_templates": limits.max_uploaded_templates,
            "can_share_with_org": limits.can_share_with_org,
            "can_use_rag": limits.can_use_rag,
            "can_use_on_premise": limits.can_use_on_premise,
        },
        "usage_today": used_today,
        "stripe_enabled": is_enabled(),
    }


class CheckoutRequest(BaseModel):
    plan: str  # "pro" | "team"


@router.post("/billing/checkout-session")
async def create_checkout(
    req: CheckoutRequest,
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    if req.plan not in ("pro", "team"):
        raise HTTPException(status_code=400, detail="플랜은 pro 또는 team만 가능")
    try:
        url = create_checkout_session(user_id=user.id, user_email=user.email, plan=req.plan)
    except StripeNotConfigured as e:
        raise HTTPException(
            status_code=503,
            detail=f"결제 시스템이 아직 구성되지 않았습니다 — Stripe 키·가격 설정 필요. ({e})",
        ) from e
    except Exception as e:  # noqa: BLE001
        log.exception("Stripe checkout 실패")
        raise HTTPException(status_code=500, detail=f"결제 세션 생성 실패: {e}") from e
    return {"checkout_url": url}


@router.post("/billing/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Annotated[str | None, Header(alias="Stripe-Signature")] = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Stripe webhook — 구독 생성·갱신·취소 처리."""
    payload = await request.body()
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Stripe-Signature 헤더 누락")
    try:
        event = verify_webhook(payload, stripe_signature)
    except StripeNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        log.warning("Stripe 웹훅 검증 실패", error=str(e))
        raise HTTPException(status_code=400, detail=f"검증 실패: {e}") from e

    etype = event.get("type", "")
    log.info("Stripe webhook", type=etype, id=event.get("id"))

    if etype in ("checkout.session.completed", "customer.subscription.updated"):
        data = event["data"]["object"]
        user_id = data.get("client_reference_id") or data.get("metadata", {}).get("user_id")
        # 가격 ID로 플랜 결정
        plan = None
        if "items" in data and data["items"]:
            line_items = data["items"].get("data", [])
            if line_items:
                price_id = line_items[0]["price"]["id"]
                plan = plan_from_price_id(price_id)
        if not plan:
            plan = data.get("metadata", {}).get("plan")

        if user_id and plan:
            res = await db.execute(select(User).where(User.id == user_id))
            user = res.scalar_one_or_none()
            if user:
                user.plan = plan
                await db.commit()
                log.info("플랜 업그레이드", user=user.email, plan=plan)
    elif etype == "customer.subscription.deleted":
        data = event["data"]["object"]
        user_id = data.get("metadata", {}).get("user_id")
        if user_id:
            res = await db.execute(select(User).where(User.id == user_id))
            user = res.scalar_one_or_none()
            if user:
                user.plan = "free"
                await db.commit()
                log.info("플랜 다운그레이드 → free", user=user.email)

    return {"received": True}
