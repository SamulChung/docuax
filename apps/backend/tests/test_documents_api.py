"""문서 보관함 CRUD API 테스트 — 글집(GuelZip) 편집 경험 Phase 1.

검증 대상:
1. 문서 생성·조회
2. 목록 (내림차순 정렬, preview 필드, source_md 제외)
3. 수정
4. 삭제
5. 소유권 격리 (타인 문서는 404)
6. 미인증 요청 401
7. 2MB 초과 요청 413
"""
import os
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("LLM_PROVIDER", "mock")

from app.main import create_app


@pytest.fixture
async def client():
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with app.router.lifespan_context(app):
            yield ac


def _unique_email(prefix: str = "doc") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}@example.com"


async def _register(client: AsyncClient, prefix: str = "doc") -> str:
    """새 사용자를 가입시키고 access_token을 반환."""
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "email": _unique_email(prefix),
            "password": "test-password-1234",
            "name": prefix,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_create_and_get_document(client: AsyncClient):
    token = await _register(client)
    headers = _auth_headers(token)

    r = await client.post(
        "/api/v1/documents",
        json={"title": "첫 문서", "source_md": "# 제목\n\n본문 내용"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "id" in data
    doc_id = data["id"]

    r = await client.get(f"/api/v1/documents/{doc_id}", headers=headers)
    assert r.status_code == 200
    assert r.json()["source_md"] == "# 제목\n\n본문 내용"


async def test_list_documents(client: AsyncClient):
    token = await _register(client)
    headers = _auth_headers(token)

    r1 = await client.post(
        "/api/v1/documents",
        json={"title": "문서1", "source_md": "가" * 200},
        headers=headers,
    )
    assert r1.status_code == 200
    r2 = await client.post(
        "/api/v1/documents",
        json={"title": "문서2", "source_md": "나" * 200},
        headers=headers,
    )
    assert r2.status_code == 200

    r = await client.get("/api/v1/documents", headers=headers)
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 2
    # 내림차순 정렬 (가장 최근 갱신 문서가 먼저) — 문서2가 나중에 생성됨
    assert items[0]["updated_at"] >= items[1]["updated_at"]
    for item in items:
        assert "preview" in item
        assert len(item["preview"]) <= 120
        assert "source_md" not in item


async def test_update_document(client: AsyncClient):
    token = await _register(client)
    headers = _auth_headers(token)

    r = await client.post(
        "/api/v1/documents",
        json={"title": "원본", "source_md": "원본 내용"},
        headers=headers,
    )
    doc_id = r.json()["id"]

    r = await client.put(
        f"/api/v1/documents/{doc_id}",
        json={"source_md": "변경된 내용"},
        headers=headers,
    )
    assert r.status_code == 200, r.text

    r = await client.get(f"/api/v1/documents/{doc_id}", headers=headers)
    assert r.json()["source_md"] == "변경된 내용"


async def test_delete_document(client: AsyncClient):
    token = await _register(client)
    headers = _auth_headers(token)

    r = await client.post(
        "/api/v1/documents",
        json={"title": "삭제될 문서", "source_md": "내용"},
        headers=headers,
    )
    doc_id = r.json()["id"]

    r = await client.delete(f"/api/v1/documents/{doc_id}", headers=headers)
    assert r.status_code == 200
    assert r.json() == {"ok": True, "deleted_id": doc_id}

    r = await client.get(f"/api/v1/documents/{doc_id}", headers=headers)
    assert r.status_code == 404


async def test_ownership_isolation(client: AsyncClient):
    token_a = await _register(client, "usera")
    token_b = await _register(client, "userb")

    r = await client.post(
        "/api/v1/documents",
        json={"title": "A의 문서", "source_md": "비밀 내용"},
        headers=_auth_headers(token_a),
    )
    doc_id = r.json()["id"]

    headers_b = _auth_headers(token_b)
    r = await client.get(f"/api/v1/documents/{doc_id}", headers=headers_b)
    assert r.status_code == 404

    r = await client.put(
        f"/api/v1/documents/{doc_id}",
        json={"source_md": "침입 시도"},
        headers=headers_b,
    )
    assert r.status_code == 404

    r = await client.delete(f"/api/v1/documents/{doc_id}", headers=headers_b)
    assert r.status_code == 404


async def test_list_negative_offset_rejected(client: AsyncClient):
    token = await _register(client)
    r = await client.get(
        "/api/v1/documents", params={"offset": -1}, headers=_auth_headers(token)
    )
    assert r.status_code == 422


async def test_unauthenticated(client: AsyncClient):
    r = await client.get("/api/v1/documents")
    assert r.status_code == 401


async def test_size_limit(client: AsyncClient):
    token = await _register(client)
    headers = _auth_headers(token)

    huge = "가" * (1024 * 1024)  # UTF-8 3바이트 * 1,048,576자 = 3MB > 2MB
    r = await client.post(
        "/api/v1/documents",
        json={"title": "너무 큰 문서", "source_md": huge},
        headers=headers,
    )
    assert r.status_code == 413
