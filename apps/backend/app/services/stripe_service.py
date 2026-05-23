"""Stripe 결제 통합 (선택).

활성화 조건: STRIPE_SECRET_KEY 환경변수 설정.
미설정 시 모든 함수는 명시적 에러를 던지지만 모듈 import는 안전.

플로우:
1. POST /billing/checkout-session — 사용자가 Pro/Team 구독 시작
2. Stripe Checkout 페이지로 redirect (frontend가 URL 받아 window.location)
3. 결제 완료 → success_url로 복귀 + webhook 도착
4. POST /billing/webhook — Stripe → 우리 서버. 사용자 plan 업그레이드

실 운영 전 필요한 일:
- Stripe Dashboard에서 Price 객체 생성 (월 9,900원 Pro / 월 49,900원 Team)
- 환경변수 설정 + 웹훅 endpoint를 Stripe에 등록 + whsec_ 받기
"""
from __future__ import annotations

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)


class StripeNotConfigured(Exception):
    pass


def get_client():
    """Stripe Python SDK 클라이언트. 키 없으면 StripeNotConfigured."""
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise StripeNotConfigured("STRIPE_SECRET_KEY 미설정 — 결제 기능 비활성")
    try:
        import stripe
    except ImportError as e:
        raise StripeNotConfigured("stripe 패키지 미설치. pip install stripe") from e
    stripe.api_key = settings.stripe_secret_key
    return stripe


def is_enabled() -> bool:
    s = get_settings()
    if not s.stripe_secret_key:
        return False
    try:
        import stripe  # noqa: F401
        return True
    except ImportError:
        return False


def create_checkout_session(*, user_id: str, user_email: str, plan: str) -> str:
    """결제 페이지 URL 반환."""
    stripe = get_client()
    settings = get_settings()
    price_id = {
        "pro": settings.stripe_price_pro,
        "team": settings.stripe_price_team,
    }.get(plan)
    if not price_id:
        raise ValueError(f"price_id 미설정: {plan}")

    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=settings.stripe_success_url + "?session_id={CHECKOUT_SESSION_ID}",
        cancel_url=settings.stripe_cancel_url,
        customer_email=user_email,
        client_reference_id=user_id,
        metadata={"user_id": user_id, "plan": plan},
    )
    return session.url


def verify_webhook(payload: bytes, sig_header: str) -> dict:
    """Stripe 웹훅 서명 검증 + 이벤트 반환."""
    stripe = get_client()
    settings = get_settings()
    if not settings.stripe_webhook_secret:
        raise StripeNotConfigured("STRIPE_WEBHOOK_SECRET 미설정")
    return stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)


PLAN_FROM_PRICE: dict[str, str] = {}


def plan_from_price_id(price_id: str) -> str | None:
    """가격 ID로 플랜 매핑 — settings의 stripe_price_pro/team과 비교."""
    s = get_settings()
    if price_id == s.stripe_price_pro:
        return "pro"
    if price_id == s.stripe_price_team:
        return "team"
    return None
