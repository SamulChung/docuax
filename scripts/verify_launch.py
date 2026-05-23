"""DocuAX 종단 검증 — 라이브 서버 + 파일 시스템 일관성."""
from __future__ import annotations

import io
import json
import sys
import urllib.error
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

OK = "OK"
NO = "FAIL"
results: list[tuple[str, bool, str]] = []


def add(label: str, ok: bool, note: str = "") -> None:
    results.append((label, ok, note))


def fetch(url: str, headers: dict | None = None) -> tuple[int | None, str]:
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return None, str(e)


def fetch_json(url: str, headers: dict | None = None):
    s, t = fetch(url, headers)
    if s != 200:
        return s, None
    try:
        return s, json.loads(t)
    except Exception:
        return s, None


def post_json(url: str, body: dict):
    req = urllib.request.Request(
        url,
        method="POST",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return None, str(e)


# ──────────────────────────────────────────────────────────────────────────────
print("=== 1. 서버 상태 ===")
s, _ = fetch("http://127.0.0.1:8000/api/v1/health")
add("백엔드 (8000) /health", s == 200, f"HTTP {s}")
s, _ = fetch("http://127.0.0.1:3000")
add("프론트엔드 (3000) GET /", s == 200, f"HTTP {s}")

# ──────────────────────────────────────────────────────────────────────────────
print("=== 2. TenAI 사업자 정보 노출 검증 ===")

TENAI_KEYWORDS = [
    ("주식회사 텐에이아이", "법인명"),
    ("정원훈", "대표/CPO"),
    ("801-81-03734", "사업자번호"),
    ("110111-0952128", "법인등록번호"),
    ("서초구 효령로 335", "본사 주소"),
    ("02-588-9881", "대표전화"),
    ("www.tenai.kr", "TenAI 도메인"),
    ("www.docuax.com", "제품 도메인"),
]

# 약관·개인정보 — 운영자 정보 박스에 풀 정보 필수 (법인명·법인번호 포함)
for path in ("/terms", "/privacy"):
    s, html = fetch(f"http://127.0.0.1:3000{path}")
    if s != 200 or not html:
        add(f"  {path} 응답", False, f"HTTP {s}")
        continue
    for kw, desc in TENAI_KEYWORDS:
        add(f"  {path} '{kw}' ({desc})", kw in html)
    if path == "/privacy":
        add(f"  {path} 'CPO' 표기", "CPO" in html)
        add(f"  {path} '제31조' (개인정보 보호법)", "제31조" in html)

# /pricing — Footer 에는 약식 표기 (전자상거래법 의무 항목만)
# 사업자번호·주소·전화·약식 상호·tenai.kr 만 검증 (법인번호·풀 법인명·제품 자체 도메인은 Footer 약식에 미포함)
s, html = fetch("http://127.0.0.1:3000/pricing")
if s == 200 and html:
    for kw, desc in [
        ("(주)텐에이아이", "약식 상호"),
        ("정원훈", "대표"),
        ("801-81-03734", "사업자번호 (필수)"),
        ("서초구 효령로 335", "본사 주소 (필수)"),
        ("02-588-9881", "대표전화 (필수)"),
        ("www.tenai.kr", "회사 사이트"),
    ]:
        add(f"  /pricing Footer '{kw}' ({desc})", kw in html)

# ──────────────────────────────────────────────────────────────────────────────
print("=== 3. 결정 19/20/21 ===")
s, plans = fetch_json("http://127.0.0.1:8000/api/v1/billing/plans")
if plans:
    pro = next((p for p in plans if p["id"] == "pro"), None)
    team = next((p for p in plans if p["id"] == "team"), None)
    add(
        "Pro 가격 9,900원",
        bool(pro and pro["price_krw_monthly"] == 9900),
        f"실제 {pro['price_krw_monthly'] if pro else '?'}",
    )
    add(
        "Team 가격 49,900원",
        bool(team and team["price_krw_monthly"] == 49900),
        f"실제 {team['price_krw_monthly'] if team else '?'}",
    )
else:
    add("/billing/plans API", False, f"HTTP {s}")

# 약관 시행일 = 출시일
s, html = fetch("http://127.0.0.1:3000/terms")
add("약관 시행일 2026년 7월 1일", "2026년 7월 1일" in (html or ""))

# ──────────────────────────────────────────────────────────────────────────────
print("=== 4. P0 작업 (보안 구멍 수정) ===")
# GET 으로 비인증 차단 검증되는 엔드포인트들
for path in (
    "/api/v1/settings/llm",
    "/api/v1/admin/dashboard",
    "/api/v1/admin/users",
    "/api/v1/billing/status",
):
    s, _ = fetch(f"http://127.0.0.1:8000{path}")
    add(f"비인증 차단 {path}", s in (401, 403), f"HTTP {s}")

# POST-only 엔드포인트는 POST 로 호출해야 차단 검증 가능
s, _ = post_json("http://127.0.0.1:8000/api/v1/compliance/audit-cleanup", {})
add("비인증 차단 POST /compliance/audit-cleanup", s in (401, 403), f"HTTP {s}")

# 정적 페이지
for path in (
    "/terms",
    "/privacy",
    "/pricing",
    "/forgot-password",
    "/reset-password",
    "/billing/success",
    "/billing/cancel",
):
    s, _ = fetch(f"http://127.0.0.1:3000{path}")
    add(f"정적 페이지 {path}", s == 200, f"HTTP {s}")

# ──────────────────────────────────────────────────────────────────────────────
print("=== 5. P1 작업 ===")
# 비밀번호 재설정 — 계정 탐색 방지 (없는 이메일도 200)
s, body = post_json(
    "http://127.0.0.1:8000/api/v1/auth/password/request-reset",
    {"email": "nonexistent@test.com"},
)
add("비밀번호 재설정 요청 (없는 이메일도 200)", s == 200)

s, body = post_json(
    "http://127.0.0.1:8000/api/v1/auth/password/reset",
    {"token": "invalid", "new_password": "newpw12345678"},
)
add("잘못된 토큰 거부 (400)", s == 400)

# ──────────────────────────────────────────────────────────────────────────────
print("=== 6. 관리자 콘솔 ===")
s, _ = fetch("http://127.0.0.1:3000/admin")
add("/admin 페이지 응답", s == 200, f"HTTP {s}")

# ──────────────────────────────────────────────────────────────────────────────
print("=== 7. 샘플 16개 + 강의 제거 ===")
s, samples = fetch_json("http://127.0.0.1:8000/api/v1/samples")
if samples:
    add(f"샘플 16개 노출", len(samples) == 16, f"{len(samples)}개")
    add(
        "lecture-handbook 제거",
        not any(s["id"] == "lecture-handbook" for s in samples),
    )
    add(
        "사업계획서 등록",
        any(s["id"] == "business-plan" for s in samples),
    )
    # 강의 카테고리 없음
    cats = sorted({s["category"] for s in samples})
    add(
        f"카테고리 '강의' 제거",
        "강의" not in cats,
        f"실제 카테고리: {cats}",
    )

# ──────────────────────────────────────────────────────────────────────────────
print("=== 8. /pricing Footer 의 회사 정보 일관성 ===")
s, html = fetch("http://127.0.0.1:3000/pricing")
if html:
    add("Footer 에 (주)텐에이아이", "(주)텐에이아이" in html)
    add("Footer 에 대표 정원훈", "정원훈" in html)
    add("Footer 에 사업자번호", "801-81-03734" in html)
    add("Footer 에 본사 주소", "서초구 효령로 335" in html)
    add("Footer 에 대표전화", "02-588-9881" in html)
    add("Footer 에 www.tenai.kr", "www.tenai.kr" in html)

# ──────────────────────────────────────────────────────────────────────────────
# 결과 출력
# ──────────────────────────────────────────────────────────────────────────────
print()
print("====== 종단 검증 결과 ======")
ok_count = sum(1 for _, ok, _ in results if ok)
total = len(results)
fails: list[str] = []
for label, ok, note in results:
    mark = OK if ok else NO
    suffix = f"  ({note})" if note and not ok else ""
    line = f"  [{mark}] {label}{suffix}"
    if not ok:
        fails.append(line)
    print(line)
print()
print(f"합계: {ok_count} / {total} 통과 ({ok_count * 100 // total}%)")
if fails:
    print()
    print("실패 항목 정리:")
    for f in fails:
        print(f)
