"""Stripe 종단 흐름 검증 — Test 모드.

전제: stripe_setup.py로 Pro/Team Price 생성 완료 + .env에 키·Price 설정

수행:
1. DocuAX 회원가입 (테스트 계정)
2. /billing/plans GET — 4개 플랜 노출
3. /billing/status GET — Free 한도·사용량
4. /billing/checkout-session POST → Stripe URL 받기
5. (수동 또는 stripe CLI) 결제 완료 시뮬레이션
6. Webhook 도착 → 사용자 plan=pro 업그레이드 검증

실행:
  STRIPE_SECRET_KEY=sk_test_... python scripts/stripe_e2e_verify.py

stripe CLI 로컬 테스트:
  stripe listen --forward-to http://localhost:8000/api/v1/billing/webhook
  stripe trigger checkout.session.completed
"""
from __future__ import annotations

import os
import sys
import time

import httpx

BASE = os.environ.get("DOCUAX_BASE", "http://127.0.0.1:8000/api/v1")
TEST_EMAIL = f"stripe-test-{int(time.time())}@example.com"
TEST_PW = "secret12345"


def main() -> None:
    # 0) Stripe 키 확인
    if not os.environ.get("STRIPE_SECRET_KEY"):
        print("WARN: STRIPE_SECRET_KEY 미설정 — 백엔드 .env에 있어야 checkout 동작")

    with httpx.Client(timeout=30.0) as c:
        # 1) 회원가입
        print("=== 1. 회원가입 ===")
        r = c.post(f"{BASE}/auth/register", json={
            "email": TEST_EMAIL, "password": TEST_PW, "name": "Stripe Test",
        })
        if r.status_code != 200:
            print(f"  ✗ HTTP {r.status_code}: {r.text[:200]}")
            sys.exit(1)
        token = r.json()["access_token"]
        print(f"  ✓ {TEST_EMAIL} (plan={r.json()['user']['plan']})")
        auth = {"Authorization": f"Bearer {token}"}

        # 2) 플랜 목록
        print("\n=== 2. /billing/plans ===")
        r = c.get(f"{BASE}/billing/plans")
        plans = r.json()
        for p in plans:
            price = p.get("price_krw_monthly")
            print(f"  {p['id']:<11} {p['name']:<25} ₩{price:>7,}/month  daily={p['daily_conversions']}")

        # 3) 현재 상태
        print("\n=== 3. /billing/status (Free) ===")
        r = c.get(f"{BASE}/billing/status", headers=auth)
        st = r.json()
        print(f"  plan={st['plan']}  사용량={st['usage_today']}/{st['limits']['daily_conversions']}")
        print(f"  stripe_enabled={st['stripe_enabled']}")

        # 4) Pro 구독 체크아웃
        print("\n=== 4. /billing/checkout-session (Pro) ===")
        r = c.post(f"{BASE}/billing/checkout-session",
                   json={"plan": "pro"}, headers=auth)
        if r.status_code == 503:
            print(f"  ⚠ {r.json().get('detail')}")
            print("  → STRIPE_SECRET_KEY + STRIPE_PRICE_PRO 설정 후 재시도")
            return
        if r.status_code != 200:
            print(f"  ✗ HTTP {r.status_code}: {r.text[:200]}")
            return
        url = r.json()["checkout_url"]
        print(f"  ✓ 결제 페이지 URL 생성")
        print(f"    {url}")

        # 5) 수동 단계 안내
        print("\n=== 5. 결제 완료 시뮬레이션 ===")
        print("  웹훅을 받으려면 다음 중 하나:")
        print("  A) 브라우저로 위 URL 열기 → 테스트 카드(4242 4242 4242 4242) 입력")
        print("  B) stripe CLI:")
        print("     stripe listen --forward-to http://localhost:8000/api/v1/billing/webhook")
        print("     stripe trigger checkout.session.completed")
        print()
        print("  결제 완료 후 /billing/status 다시 호출 → plan='pro' 확인")
        print()
        print(f"  $ curl -H 'Authorization: Bearer {token[:20]}...' {BASE}/billing/status")


if __name__ == "__main__":
    main()
