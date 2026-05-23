"""매크로 100종 풀셋 카운트 검증."""
from app.macros.registry import get_macro_registry


def test_total_macros_is_100():
    reg = get_macro_registry()
    stats = reg.stats()
    assert stats["total"] == 100, f"매크로 총 개수 100이어야 함, 실제: {stats['total']}"


def test_category_counts():
    reg = get_macro_registry()
    stats = reg.stats()
    expected = {"T": 25, "S": 15, "B": 20, "G": 15, "N": 10, "R": 10, "P": 5}
    for cat, n in expected.items():
        assert stats[cat] == n, f"카테고리 {cat}: 기대 {n}, 실제 {stats[cat]}"


def test_ai_macros_at_least_35():
    """PRD 4.1 표 — AI 강화 매크로 35종."""
    reg = get_macro_registry()
    ai_count = len(reg.ai_macros())
    assert ai_count >= 30, f"AI 강화 매크로는 30개 이상이어야 함 (PRD 기준 35), 실제: {ai_count}"


def test_all_review_macros_ai():
    """검토 매크로 R1~R10은 모두 AI 강화."""
    from app.macros.base import MacroCategory

    reg = get_macro_registry()
    for m in reg.by_category(MacroCategory.REVIEW):
        assert m.ai_powered, f"{m.id} 검토 매크로는 AI 강화여야 함"


def test_navigate_signature_macros():
    """이동 매크로 N1~N3는 시그니처 (AI 강화)."""
    reg = get_macro_registry()
    for mid in ("N1", "N2", "N3"):
        assert reg.get(mid).ai_powered, f"{mid}는 시그니처 AI 매크로"
