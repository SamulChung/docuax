"""단계 5 — 매크로 자동 적용.

변환 시 자동 실행되는 매크로들 (auto=True 표시된 매크로). 나머지는 사용자가 리모컨으로 호출.

대표적인 자동 매크로:
- T5 셀 너비 균등 (모든 표)
- T16 테두리 일괄 (표 기본 테두리)
- S13 머리행 자동 강조 (첫 행 헤더화)
- B20 단락 자동 정리 (빈 단락·공백 정규화)
- G10 한컴 표준 크기 (공문 양식일 때)
"""
from __future__ import annotations

from app.macros.registry import MacroRegistry
from app.pipeline.ir import DocumentIR


def apply_auto_macros(ir: DocumentIR, registry: MacroRegistry) -> DocumentIR:
    """auto=True 표시된 매크로를 IR에 일괄 적용."""
    for macro in registry.auto_macros():
        try:
            ir = macro.apply(ir, params={})
            ir.macro_log.append(
                {"macro_id": macro.id, "auto": True, "status": "ok"}
            )
        except Exception as e:  # noqa: BLE001
            ir.macro_log.append(
                {"macro_id": macro.id, "auto": True, "status": "error", "error": str(e)}
            )
    return ir
