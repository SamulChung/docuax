"""매크로 100종 레지스트리.

- 카테고리 모듈에서 MACROS 리스트를 자동 수집.
- 각 매크로는 ID(예: T1)로 조회 가능.
- 리모컨 UI는 카테고리별 필터링·검색에 사용.
- get_macro_registry() 는 lru_cache로 1회 초기화.
"""
from __future__ import annotations

from collections.abc import Iterable
from functools import lru_cache

from app.core.logging import get_logger
from app.macros.base import Macro, MacroCategory
from app.macros.categories import ALL_CATEGORY_MODULES

log = get_logger(__name__)


class MacroRegistry:
    def __init__(self) -> None:
        self._by_id: dict[str, Macro] = {}
        self._by_category: dict[MacroCategory, list[Macro]] = {c: [] for c in MacroCategory}

    def register(self, macro_cls: type[Macro]) -> None:
        instance = macro_cls()
        if instance.id in self._by_id:
            raise ValueError(f"중복된 매크로 ID: {instance.id}")
        self._by_id[instance.id] = instance
        self._by_category[instance.category].append(instance)

    def register_many(self, classes: Iterable[type[Macro]]) -> None:
        for c in classes:
            self.register(c)

    def get(self, macro_id: str) -> Macro:
        if macro_id not in self._by_id:
            raise KeyError(f"매크로 없음: {macro_id}")
        return self._by_id[macro_id]

    def all(self) -> list[Macro]:
        return list(self._by_id.values())

    def by_category(self, cat: MacroCategory) -> list[Macro]:
        return list(self._by_category[cat])

    def auto_macros(self) -> list[Macro]:
        return [m for m in self._by_id.values() if m.auto]

    def ai_macros(self) -> list[Macro]:
        return [m for m in self._by_id.values() if m.ai_powered]

    def stats(self) -> dict[str, int]:
        return {
            cat.value: len(self._by_category[cat]) for cat in MacroCategory
        } | {
            "total": len(self._by_id),
            "auto": len(self.auto_macros()),
            "ai_powered": len(self.ai_macros()),
        }


@lru_cache
def get_macro_registry() -> MacroRegistry:
    registry = MacroRegistry()
    total = 0
    for module in ALL_CATEGORY_MODULES:
        macros = getattr(module, "MACROS", [])
        registry.register_many(macros)
        total += len(macros)

    stats = registry.stats()
    log.info("매크로 레지스트리 초기화 완료", **stats)

    expected = {
        "T": 25, "S": 15, "B": 20, "G": 16, "N": 10, "R": 10, "P": 5,
    }
    for cat, count in expected.items():
        if stats.get(cat, 0) != count:
            log.warning(
                "매크로 카테고리 개수 불일치",
                category=cat,
                expected=count,
                actual=stats.get(cat, 0),
            )

    if stats["total"] != 101:
        log.warning("매크로 총 개수 불일치", total=stats["total"], expected=101)
    return registry
