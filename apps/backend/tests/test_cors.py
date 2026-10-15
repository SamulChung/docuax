"""CORS 허용 목록 테스트 — 프로덕션 프론트 도메인은 env와 무관하게 항상 허용."""
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings


def test_guelzip_production_origin_always_allowed():
    """Railway CORS_ORIGINS env에 없어도 guelzip.vercel.app은 허용된다.

    배포 프론트(https://guelzip.vercel.app)에서 로그인 fetch가 CORS로
    차단되면 브라우저는 'Failed to fetch'만 보여준다 — 재발 방지.
    """
    s = Settings(cors_origins="http://localhost:3000")
    assert "https://guelzip.vercel.app" in s.cors_origins_list


def test_env_origins_preserved():
    """env로 지정한 origin도 그대로 유지된다."""
    s = Settings(cors_origins="http://localhost:3000,https://example.com")
    assert "http://localhost:3000" in s.cors_origins_list
    assert "https://example.com" in s.cors_origins_list


@pytest.mark.parametrize("origin,allowed", [
    ("https://guelzip.vercel.app", True),
    ("https://configured.example", True),
    ("https://untrusted.example", False),
])
async def test_real_cors_preflight(monkeypatch, origin, allowed):
    from app import main

    settings = Settings(_env_file=None, cors_origins="https://configured.example")
    monkeypatch.setattr(main, "get_settings", lambda: settings)
    app = main.create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.options("/api/v1/auth/register", headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,authorization,x-owner-id",
        })
        assert response.status_code == (200 if allowed else 400)
        assert response.headers.get("access-control-allow-origin") == (origin if allowed else None)
        if allowed:
            assert response.headers["access-control-allow-credentials"] == "true"
        actual = await client.get("/", headers={"Origin": origin})
        assert actual.headers.get("access-control-allow-origin") == (origin if allowed else None)
