"""IP·사용자별 rate limiting — 무차별 호출·brute-force 방지.

설계:
  - in-memory token bucket — 단일 노드 운영 가정. 다중 노드 운영 시 Redis 백엔드로 교체.
  - 키: (IP, scope) 튜플. scope 는 "default" / "auth" / "convert" 로 분리.
  - 분당 한도 초과 시 429 Too Many Requests + Retry-After 헤더.

운영 권장:
  - X-Forwarded-For 헤더가 신뢰 가능한 reverse proxy 뒤에서만 동작 (Cloudflare·nginx).
  - 클러스터링 환경에서는 RateLimiterRedis 등으로 교체.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock
from typing import Literal

from fastapi import HTTPException, Request, status

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)

Scope = Literal["default", "auth", "convert"]

# (key, scope) → deque of recent timestamps
_buckets: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_lock = Lock()
WINDOW_SECONDS = 60.0


def _client_ip(request: Request) -> str:
    """프록시 헤더 우선 — 운영에서는 X-Forwarded-For 가 신뢰 가능해야 함."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    if request.client:
        return request.client.host
    return "unknown"


def _limit_for_scope(scope: Scope) -> int:
    s = get_settings()
    return {
        "default": s.rate_limit_default_per_min,
        "auth": s.rate_limit_auth_per_min,
        "convert": s.rate_limit_convert_per_min,
    }.get(scope, s.rate_limit_default_per_min)


def check_rate_limit(request: Request, scope: Scope = "default") -> None:
    """요청 처리 전 호출. 한도 초과 시 HTTPException(429) raise.

    한도가 0 이하면 비활성.
    """
    limit = _limit_for_scope(scope)
    if limit <= 0:
        return
    ip = _client_ip(request)
    key = (ip, scope)
    now = time.time()
    cutoff = now - WINDOW_SECONDS
    with _lock:
        bucket = _buckets[key]
        # 만료된 항목 제거
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            # Retry-After = 가장 오래된 항목이 만료되기까지 남은 초
            retry_after = max(1, int(bucket[0] + WINDOW_SECONDS - now + 1))
            log.warning(
                "Rate limit 초과",
                ip=ip,
                scope=scope,
                count=len(bucket),
                limit=limit,
                path=str(request.url.path),
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"요청이 너무 많습니다. {retry_after}초 후 다시 시도하세요.",
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)


# ─── 의존성 함수 — FastAPI Depends() 로 사용 ───────────────────────────────

def rate_limit_default(request: Request) -> None:
    """일반 API 분당 IP별 기본 한도."""
    check_rate_limit(request, "default")


def rate_limit_auth(request: Request) -> None:
    """로그인·가입 — 무차별 공격 방지 (기본 10/분)."""
    check_rate_limit(request, "auth")


def rate_limit_convert(request: Request) -> None:
    """변환 — 무거운 작업이므로 별도 제한 (기본 30/분)."""
    check_rate_limit(request, "convert")
