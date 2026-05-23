"""매크로 100종 카테고리별 모듈.

각 모듈은 `MACROS: list[type[Macro]]` 를 export — registry가 자동 수집.
"""
from app.macros.categories import block, convenience, glyph, navigate, review, table, table_detail

ALL_CATEGORY_MODULES = [table, table_detail, block, glyph, navigate, review, convenience]

__all__ = ["ALL_CATEGORY_MODULES"]
