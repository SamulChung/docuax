"""파이프라인 7단계 통합 테스트 (Mock provider 사용)."""
import os

import pytest

os.environ.setdefault("LLM_PROVIDER", "mock")

from app.pipeline import ConversionPipeline, PersonaMode, PipelineContext


@pytest.mark.asyncio
async def test_basic_conversion():
    pipeline = ConversionPipeline()
    ctx = PipelineContext(
        source="# 보고서\n\n## 개요\n\n- 첫째 항목\n- 둘째 항목 1,000원 예산\n\n## 결론\n\n잘 진행될 것으로 보입니다.",
        title="주간 보고",
        persona_mode=PersonaMode.WORKER,
    )
    result = await pipeline.run(ctx)
    assert result.ir.title == "주간 보고"
    assert len(result.ir.blocks) > 0
    assert result.total_ms > 0


@pytest.mark.asyncio
async def test_yellow_tags_for_numbers():
    pipeline = ConversionPipeline()
    result = await pipeline.run(
        PipelineContext(source="예산은 1,000,000원이며, 50% 증가했습니다.")
    )
    yellow = [t for t in result.ir.review_tags if t.color == "yellow"]
    assert len(yellow) >= 1, "숫자에 노랑 태그가 붙어야 함"


@pytest.mark.asyncio
async def test_red_tags_for_hedging():
    pipeline = ConversionPipeline()
    result = await pipeline.run(
        PipelineContext(source="이는 약 30% 증가할 것으로 추정됩니다.")
    )
    red = [t for t in result.ir.review_tags if t.color == "red"]
    assert len(red) >= 1, "'추정' 표현에 빨강 태그가 붙어야 함"


@pytest.mark.asyncio
async def test_korean_bullet_mapping_gongmun():
    pipeline = ConversionPipeline()
    result = await pipeline.run(
        PipelineContext(source="# 수신: 행정안전부\n\n## 제목: 보고 안내\n\n- 첫째\n- 둘째")
    )
    # 공문 분류 시 헤딩이 □ 또는 ○ 글머리로 변환되어야 함
    bullets = [
        b.list_item.bullet_marker
        for b in result.ir.blocks
        if b.list_item is not None
    ]
    assert any(m in ("□", "○", "―", "※") for m in bullets), "공문 글머리 매핑 누락"
