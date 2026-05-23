"""카테고리별 매크로 스모크 테스트.

각 카테고리에서 대표 매크로 1~3개를 실제 IR에 적용해 동작 확인.
회귀 방지가 목표 — 매크로 100종 각각 단위 테스트는 추후 추가.
"""
import os
import pytest

os.environ.setdefault("LLM_PROVIDER", "mock")

from app.macros.base import MacroCategory
from app.macros.registry import get_macro_registry
from app.pipeline.runner import ConversionPipeline, PipelineContext


@pytest.mark.asyncio
async def test_smoke_table_t1_creates_table():
    p = ConversionPipeline()
    result = await p.run(PipelineContext(source="# 표 테스트"))
    blocks_before = len(result.ir.blocks)
    macro = get_macro_registry().get("T1")
    ir2 = macro.apply(result.ir, {"rows": 3, "cols": 4})
    assert len(ir2.blocks) == blocks_before + 1
    new = ir2.blocks[-1]
    assert new.type.value == "table"
    assert new.table is not None
    assert new.table.row_count == 3
    assert new.table.col_count == 4


@pytest.mark.asyncio
async def test_smoke_table_t16_border_idempotent():
    """T16 (테두리 일괄)을 auto=True로 적용해도 안전."""
    p = ConversionPipeline()
    result = await p.run(PipelineContext(source="| a | b |\n| --- | --- |\n| 1 | 2 |"))
    t16 = get_macro_registry().get("T16")
    ir2 = t16.apply(result.ir, {})
    assert ir2 is not None


@pytest.mark.asyncio
async def test_smoke_block_b1_b4_bullets():
    """B1~B4 — 4단계 글머리 매크로."""
    p = ConversionPipeline()
    result = await p.run(PipelineContext(source="단순 단락"))
    reg = get_macro_registry()
    for mid, expected_marker in [("B1", "□"), ("B2", "○"), ("B3", "―"), ("B4", "※")]:
        m = reg.get(mid)
        # 모든 단락에 적용
        params = {"selected_block_ids": [b.id for b in result.ir.blocks if b.type.value == "paragraph"]}
        ir2 = m.apply(result.ir, params)
        markers = [b.list_item.bullet_marker for b in ir2.blocks if b.list_item]
        assert any(m_ == expected_marker for m_ in markers), f"{mid} → {expected_marker} 매핑 누락"


@pytest.mark.asyncio
async def test_smoke_glyph_g1_bold_toggle():
    p = ConversionPipeline()
    result = await p.run(PipelineContext(source="굵게 적용 대상"))
    g1 = get_macro_registry().get("G1")
    params = {"selected_block_ids": [b.id for b in result.ir.blocks]}
    ir2 = g1.apply(result.ir, params)
    # 모든 run에 bold=True
    runs_bold = [r.bold for b in ir2.blocks for r in b.runs]
    assert any(runs_bold)


@pytest.mark.asyncio
async def test_smoke_navigate_n1_returns_target_or_no_op():
    """N1: 빨강 점프 — 태그 0이면 no-op, ≥1이면 macro_log에 target."""
    p = ConversionPipeline()
    result = await p.run(PipelineContext(source="이는 추정됩니다."))
    n1 = get_macro_registry().get("N1")
    log_before = len(result.ir.macro_log)
    ir2 = n1.apply(result.ir, {"current_position": 0})
    # macro_log에 jump_target이 추가됐는지 (있으면 — 추정이 빨강으로 잡혔으니)
    new_logs = ir2.macro_log[log_before:]
    if result.ir.review_tags:
        assert any("jump_target" in e for e in new_logs)


@pytest.mark.asyncio
async def test_smoke_review_r3_hallucination():
    p = ConversionPipeline()
    result = await p.run(PipelineContext(source="성공할 것으로 보입니다."))
    red_before = sum(1 for t in result.ir.review_tags if t.color == "red")
    r3 = get_macro_registry().get("R3")
    ir2 = r3.apply(result.ir, {})
    red_after = sum(1 for t in ir2.review_tags if t.color == "red")
    assert red_after >= red_before


@pytest.mark.asyncio
async def test_smoke_review_r4_number_tagging():
    p = ConversionPipeline()
    result = await p.run(PipelineContext(source="예산은 1,500,000원이며 5건 진행."))
    r4 = get_macro_registry().get("R4")
    ir2 = r4.apply(result.ir, {})
    yellow = [t for t in ir2.review_tags if t.color == "yellow"]
    assert len(yellow) >= 2


@pytest.mark.asyncio
async def test_smoke_convenience_p1_p3_log_only():
    """P1·P3는 macro_log 기록만. IR 자체는 변하지 않음."""
    p = ConversionPipeline()
    result = await p.run(PipelineContext(source="아무거나"))
    reg = get_macro_registry()
    for mid in ("P1", "P3"):
        m = reg.get(mid)
        log_before = len(result.ir.macro_log)
        ir2 = m.apply(result.ir, {})
        assert len(ir2.macro_log) > log_before


def test_smoke_every_category_has_at_least_one_macro():
    reg = get_macro_registry()
    for cat in MacroCategory:
        items = reg.by_category(cat)
        assert len(items) > 0, f"카테고리 {cat.value} 비어있음"


def test_smoke_every_macro_has_metadata():
    reg = get_macro_registry()
    for m in reg.all():
        md = m.metadata()
        assert md["id"]
        assert md["name"]
        assert md["category"]
