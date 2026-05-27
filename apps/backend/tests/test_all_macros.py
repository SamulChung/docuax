"""매크로 100종 자동 스모크.

각 매크로에 대해 다양한 기본 IR을 만들어 apply() 호출 → 예외 없이 동작하는지 검증.
회귀 방지가 목표 — 매크로별 의미 검증은 test_macros_smoke.py에서.
"""
import os
import pytest

os.environ.setdefault("LLM_PROVIDER", "mock")

from app.macros.registry import get_macro_registry
from app.macros.base import MacroCategory
from app.pipeline.runner import ConversionPipeline, PipelineContext


# 다양한 IR 패턴 — 모든 매크로가 안전하게 동작해야 함
TEST_INPUTS = [
    "# 짧은 문서\n\n본문 한 줄.",
    "# 표 포함\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |",
    "# 글머리 4단계\n\n- 1단계\n  - 2단계\n    - 3단계\n      - 4단계",
    "# 숫자·일자\n\n예산 1,500,000원, 2026-05-18, 30% 증가",
    "# hedging\n\n성공할 것으로 추정됩니다.",
    "# 강조\n\n**굵게** 및 *기울임* 텍스트",
    "# 표 다중\n\n| h1 | h2 | h3 |\n| --- | --- | --- |\n| a | b | c |\n| d | e | f |\n| g | h | i |",
    "# 인용\n\n> 인용문 한 줄\n\n본문",
    "# 코드\n\n```python\nprint('hi')\n```",
    "수신: 행정안전부\n\n## 본문\n\n협조 요청드립니다.",
]


def _prepare_irs():
    """다양한 IR 미리 생성. 한 번만 — 시간 절약."""
    import asyncio
    pipeline = ConversionPipeline()
    irs = []
    loop = asyncio.new_event_loop()
    try:
        for src in TEST_INPUTS:
            result = loop.run_until_complete(
                pipeline.run(PipelineContext(source=src, persona_mode="worker"))
            )
            irs.append(result.ir)
    finally:
        loop.close()
    return irs


# 모듈 레벨에서 IR 생성 (1회)
_TEST_IRS = None


def _get_irs():
    global _TEST_IRS
    if _TEST_IRS is None:
        _TEST_IRS = _prepare_irs()
    return _TEST_IRS


@pytest.mark.parametrize("macro_id", [m.id for m in get_macro_registry().all()])
def test_macro_does_not_crash(macro_id: str):
    """100종 각각 — 10개 IR 패턴에 대해 apply() 호출. 예외 없이 동작."""
    macro = get_macro_registry().get(macro_id)
    irs = _get_irs()

    crashes: list[str] = []
    for i, ir in enumerate(irs):
        try:
            # 모든 블록을 선택 영역으로 — 매크로가 작동할 컨텍스트 제공
            params = {
                "selected_block_ids": [b.id for b in ir.blocks],
                "row": 0, "col": 0,
                "row_start": 0, "row_end": 0, "col_start": 0, "col_end": 0,
                "rows": 3, "cols": 3,
                "current_position": 0,
                "page": 1,
                "size": 12, "factor": 1000, "op": "mul",
                "font": "맑은 고딕",
                "align": "center",
                "axis": "col",
            }
            # AI 매크로에는 mock provider 주입
            if macro.ai_powered:
                from app.providers.llm import get_llm_provider
                params["_provider"] = get_llm_provider()
            # IR을 복사해 매크로 적용 (원본 보존)
            ir_copy = ir.model_copy(deep=True)
            result_ir = macro.apply(ir_copy, params)
            assert result_ir is not None
        except Exception as e:  # noqa: BLE001
            crashes.append(f"input #{i}: {type(e).__name__}: {e}")

    assert not crashes, f"{macro_id} crashed on {len(crashes)}/{len(irs)} inputs:\n" + "\n".join(crashes[:3])


def test_macro_count_full_100():
    """매크로 100종 전체 검증 자체."""
    assert len(get_macro_registry().all()) == 101


def test_macros_by_category_complete():
    expected = {"T": 25, "S": 15, "B": 20, "G": 16, "N": 10, "R": 10, "P": 5}
    reg = get_macro_registry()
    for cat_code, count in expected.items():
        cat = next(c for c in MacroCategory if c.value == cat_code)
        items = reg.by_category(cat)
        assert len(items) == count, f"{cat_code}: 기대 {count}, 실제 {len(items)}"
