"""슬라이드 API 통합 테스트."""
import json
import os

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("LLM_PROVIDER", "mock")

_SAMPLE_SCHEMA = {
    "id": "abc123",
    "title": "테스트",
    "theme": "gov",
    "customTheme": None,
    "slides": [
        {
            "id": "slide-0",
            "background": "#ffffff",
            "elements": [
                {
                    "id": "el-0",
                    "type": "textbox",
                    "left": 80,
                    "top": 60,
                    "width": 1120,
                    "height": 80,
                    "text": "제목",
                    "fontSize": 32,
                    "fontWeight": "bold",
                    "fill": "#1e3a5f",
                    "src": None,
                }
            ],
        }
    ],
}


@pytest.fixture
async def client(mocker):
    # slide_generator를 목으로 교체
    mocker.patch(
        "app.api.v1.slides.generate_slides",
        return_value=_SAMPLE_SCHEMA,
    )
    from app.main import create_app
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with app.router.lifespan_context(app):
            yield ac


async def test_generate_returns_schema(client: AsyncClient):
    r = await client.post(
        "/api/v1/slides/generate",
        json={
            "mode": "document",
            "document_text": "보고서입니다.",
            "instruction": "3장으로 만들어줘",
            "theme": "gov",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "abc123"
    assert len(data["slides"]) == 1


async def test_generate_requires_document_text_for_document_mode(client: AsyncClient):
    r = await client.post(
        "/api/v1/slides/generate",
        json={"mode": "document", "theme": "gov"},
    )
    assert r.status_code == 422  # document_text missing


async def test_generate_requires_analysis_text_for_analysis_mode(client: AsyncClient):
    r = await client.post(
        "/api/v1/slides/generate",
        json={"mode": "analysis", "theme": "gov"},
    )
    assert r.status_code == 422


async def test_save_and_get_slide(client: AsyncClient):
    # generate
    gen = await client.post(
        "/api/v1/slides/generate",
        json={
            "mode": "document",
            "document_text": "내용",
            "instruction": "슬라이드",
            "theme": "minimal",
        },
    )
    slide_id = gen.json()["id"]

    # save
    save_r = await client.put(
        f"/api/v1/slides/{slide_id}",
        json={"schema": gen.json(), "title": "저장된 슬라이드"},
    )
    assert save_r.status_code == 200

    # get
    get_r = await client.get(f"/api/v1/slides/{slide_id}")
    assert get_r.status_code == 200
    assert get_r.json()["title"] == "저장된 슬라이드"
