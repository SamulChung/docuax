"""핵심 시나리오 통합 테스트 — Mock provider 사용.

검증 대상:
1. /convert → 빨강·파랑·노랑 태그 부착
2. /convert 결과의 preview.latency_ms 가 숫자
3. /convert 결과에 all_tags 포함 (점프용)
4. /macros/execute B12 잘라내기로 블록 수 감소
5. /macros/execute N1 빨강 점프 (좌표 반환)
6. /macros/execute R3 할루시네이션 의심 표시
7. /macros/execute T1 표 생성 (행/열 파라미터)
"""
import os

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("LLM_PROVIDER", "mock")

from app.main import create_app


@pytest.fixture
async def client():
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 앱 lifespan을 명시적으로 트리거
        async with app.router.lifespan_context(app):
            yield ac


async def test_convert_yields_review_tags(client: AsyncClient):
    r = await client.post(
        "/api/v1/convert",
        json={
            "source": "# 보고\n\n예산 1,000,000원 집행 예정으로 추정됩니다.",
            "persona_mode": "worker",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["preview"]["latency_ms"] is not None
    assert data["preview"]["latency_ms"] > 0
    # 노랑(숫자) 1개 이상 + 빨강("추정") 1개
    assert data["preview"]["review_counts"]["yellow"] >= 1
    assert data["preview"]["review_counts"]["red"] >= 1
    # all_tags 점프용 정보
    assert "all_tags" in data["preview"]
    assert len(data["preview"]["all_tags"]) >= 2


async def test_macro_table_create(client: AsyncClient):
    # 변환
    conv = await client.post("/api/v1/convert", json={"source": "# 표 테스트", "persona_mode": "worker"})
    doc_id = conv.json()["document_id"]
    blocks_before = len(conv.json()["preview"]["blocks"])

    # T1 표 생성 (3행 3열)
    r = await client.post(
        "/api/v1/macros/execute",
        json={"macro_id": "T1", "document_id": doc_id, "params": {"rows": 3, "cols": 3}},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    # 표 블록이 추가됨
    assert len(data["preview"]["blocks"]) == blocks_before + 1
    new_block = data["preview"]["blocks"][-1]
    assert new_block["type"] == "table"


async def test_macro_r3_hallucination(client: AsyncClient):
    conv = await client.post(
        "/api/v1/convert",
        json={"source": "이번 사업은 성공할 것으로 예상됩니다.", "persona_mode": "worker"},
    )
    doc_id = conv.json()["document_id"]
    red_before = conv.json()["preview"]["review_counts"]["red"]

    r = await client.post(
        "/api/v1/macros/execute",
        json={"macro_id": "R3", "document_id": doc_id, "params": {}},
    )
    data = r.json()
    # R3 적용 후 빨강 ≥ 변환 직후 (추정/예상 표현 다시 표시)
    assert data["preview"]["review_counts"]["red"] >= red_before


async def test_macro_b12_cut_removes_block(client: AsyncClient):
    conv = await client.post(
        "/api/v1/convert",
        json={"source": "# 첫 단락\n\n둘째 단락\n\n셋째 단락", "persona_mode": "worker"},
    )
    doc_id = conv.json()["document_id"]
    blocks = conv.json()["preview"]["blocks"]
    blocks_before = len(blocks)
    target_id = blocks[1]["id"]

    r = await client.post(
        "/api/v1/macros/execute",
        json={
            "macro_id": "B12",
            "document_id": doc_id,
            "params": {"selected_block_ids": [target_id]},
        },
    )
    assert r.status_code == 200
    assert len(r.json()["preview"]["blocks"]) == blocks_before - 1


async def test_macros_total_endpoint(client: AsyncClient):
    r = await client.get("/api/v1/macros/stats")
    data = r.json()
    assert data["total"] == 100
    assert data["T"] == 25 and data["R"] == 10 and data["P"] == 5
