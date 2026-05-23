"""매크로 베이스 — 모든 매크로의 공통 인터페이스.

매크로 100종은 declarative 메타데이터 + apply() 메서드로 구성된다.
각 카테고리별로 categories/ 폴더에 분리 — 추가·수정이 용이.
"""
from __future__ import annotations

import abc
from enum import StrEnum
from typing import Any, ClassVar

from pydantic import BaseModel, Field

from app.pipeline.ir import DocumentIR


class MacroCategory(StrEnum):
    """PRD 4장의 7개 카테고리."""

    TABLE = "T"  # 표 매크로 25종
    TABLE_DETAIL = "S"  # 표세부 매크로 15종
    BLOCK = "B"  # 블록 매크로 20종
    GLYPH = "G"  # 글자 매크로 15종 (Glyph)
    NAVIGATE = "N"  # 이동 매크로 10종 (시그니처)
    REVIEW = "R"  # 검토 매크로 10종
    CONVENIENCE = "P"  # 편리 매크로 5종 (Productivity)


class MacroParams(BaseModel):
    """매크로 호출 파라미터.

    UI에서 사용자가 선택한 블록·셀 등의 컨텍스트를 담는다.
    """

    selected_block_ids: list[str] = Field(default_factory=list)
    selected_text_range: dict[str, int] | None = None  # {"start": ..., "end": ...}
    options: dict[str, Any] = Field(default_factory=dict)


class MacroResult(BaseModel):
    """매크로 실행 결과."""

    macro_id: str
    success: bool = True
    message: str = ""
    affected_block_ids: list[str] = Field(default_factory=list)
    ai_used: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


class Macro(abc.ABC):
    """매크로 단위. 클래스 변수로 메타데이터, apply()로 동작.

    AI 강화 매크로는 ai_powered=True. 호출 시 provider를 받음.
    """

    id: ClassVar[str]  # "T1", "R3" 등 PRD 코드
    category: ClassVar[MacroCategory]
    name: ClassVar[str]  # 한국어 이름 (PRD 표 그대로)
    description: ClassVar[str]
    ai_powered: ClassVar[bool] = False
    auto: ClassVar[bool] = False  # Stage 5에서 자동 실행 여부
    shortcut: ClassVar[dict[str, str]] = {}  # {"win": "Ctrl+1", "mac": "⌘+1"}

    @abc.abstractmethod
    def apply(
        self,
        ir: DocumentIR,
        params: dict[str, Any] | MacroParams | None = None,
        **kwargs: Any,
    ) -> DocumentIR:
        """매크로를 DocumentIR에 적용해서 변형된 IR을 반환."""

    def metadata(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "category": self.category.value,
            "name": self.name,
            "description": self.description,
            "ai_powered": self.ai_powered,
            "auto": self.auto,
            "shortcut": self.shortcut,
        }
