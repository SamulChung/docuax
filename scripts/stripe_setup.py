"""Stripe Price 자동 생성 + 웹훅 설정 가이드.

실행:
  STRIPE_SECRET_KEY=sk_test_... python scripts/stripe_setup.py

수행:
1. Product 2종 생성 (DocuAX Pro · DocuAX Team)
2. 각각 월간 Price (Pro 9,900원, Team 49,900원) 생성
3. .env에 추가할 환경변수 출력
4. 웹훅 endpoint URL 안내

운영 키(sk_live_...)로 실행하면 실제 결제 상품 생성. 신중히.
"""
from __future__ import annotations

import os
import sys


def main() -> None:
    key = os.environ.get("STRIPE_SECRET_KEY", "")
    if not key:
        print("ERROR: STRIPE_SECRET_KEY 환경변수 필요")
        sys.exit(1)
    if not (key.startswith("sk_test_") or key.startswith("sk_live_")):
        print("ERROR: 잘못된 키 형식. sk_test_... 또는 sk_live_...")
        sys.exit(1)
    mode = "TEST" if key.startswith("sk_test_") else "LIVE"
    print(f"=== Stripe {mode} 모드 ===\n")

    try:
        import stripe
    except ImportError:
        print("ERROR: pip install stripe 후 재실행")
        sys.exit(1)

    stripe.api_key = key

    plans = [
        {
            "name": "DocuAX Pro",
            "description": "개인 유료 — 일 500건 변환 · 무제한 양식 · RAG 학습",
            "amount": 9900,
            "lookup_key": "docuax_pro_monthly_krw",
        },
        {
            "name": "DocuAX Team",
            "description": "팀 — 무제한 변환 · 조직 공유 · 우선 지원",
            "amount": 49900,
            "lookup_key": "docuax_team_monthly_krw",
        },
    ]

    env_lines: list[str] = []
    for plan in plans:
        print(f"━ {plan['name']} ━")
        # 기존 lookup_key로 찾기
        existing = stripe.Price.list(lookup_keys=[plan["lookup_key"]], limit=1)
        if existing.data:
            price = existing.data[0]
            print(f"  이미 존재 — price_id={price.id}")
        else:
            product = stripe.Product.create(
                name=plan["name"],
                description=plan["description"],
            )
            price = stripe.Price.create(
                product=product.id,
                unit_amount=plan["amount"],
                currency="krw",
                recurring={"interval": "month"},
                lookup_key=plan["lookup_key"],
            )
            print(f"  생성 완료 — product={product.id} price={price.id}")
        env_key = "STRIPE_PRICE_PRO" if "Pro" in plan["name"] else "STRIPE_PRICE_TEAM"
        env_lines.append(f"{env_key}={price.id}")

    print("\n━ .env에 추가 ━")
    print(f"STRIPE_SECRET_KEY={key}")
    for line in env_lines:
        print(line)

    print("\n━ 웹훅 설정 ━")
    print("  Stripe Dashboard → Developers → Webhooks → Add endpoint")
    print("  URL: https://<your-domain>/api/v1/billing/webhook")
    print("  이벤트:")
    for evt in (
        "checkout.session.completed",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        print(f"    • {evt}")
    print("  발급된 whsec_... 을 STRIPE_WEBHOOK_SECRET 에 저장")
    print()
    print("로컬 테스트: stripe listen --forward-to localhost:8000/api/v1/billing/webhook")


if __name__ == "__main__":
    main()
