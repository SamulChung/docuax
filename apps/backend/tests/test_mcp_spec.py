"""MCP tool URLs must address the backend, never the frontend email-link URL."""
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.v1 import mcp
from app.core.config import Settings


@pytest.mark.parametrize("public_url,expected", [
    ("", "https://backend.example"),
    ("https://configured.example/", "https://configured.example"),
])
async def test_mcp_spec_uses_backend_url(monkeypatch, public_url, expected):
    settings = Settings(_env_file=None, public_url=public_url, frontend_url="http://localhost:3000")
    monkeypatch.setattr(mcp, "get_settings", lambda: settings)
    app = FastAPI()
    app.include_router(mcp.router, prefix="/api/v1")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://backend.example") as client:
        response = await client.get("/api/v1/mcp/spec")
    assert response.status_code == 200
    for tool in response.json()["tools"]:
        assert tool["endpoint"] == f"{expected}/api/v1/mcp/tools/{tool['name']}"
