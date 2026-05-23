"""이동 매크로 10종 — N1~N10. DocuAX의 시그니처.

대부분은 프론트엔드의 검토 점프 UX로 구현됨. 백엔드는 다음 점프 대상 좌표를 계산해서 반환.
빨강·파랑·노랑 검토 태그를 따라가는 게 핵심.
"""
from __future__ import annotations

from typing import Any

from app.macros.base import Macro, MacroCategory
from app.pipeline.ir import DocumentIR


def _next_tag_position(
    ir: DocumentIR, *, current_pos: int, color: str | None = None, reverse: bool = False
) -> dict[str, Any] | None:
    """현재 위치에서 다음(또는 이전) 색상 태그를 찾아 위치 반환."""
    tags = [t for t in ir.review_tags if color is None or t.color == color]
    if not tags:
        return None
    tags.sort(key=lambda t: t.span_start, reverse=reverse)
    if reverse:
        for t in tags:
            if t.span_start < current_pos:
                return {"start": t.span_start, "end": t.span_end, "color": t.color, "reason": t.reason}
    else:
        for t in tags:
            if t.span_start > current_pos:
                return {"start": t.span_start, "end": t.span_end, "color": t.color, "reason": t.reason}
    # wrap
    return {
        "start": tags[0].span_start,
        "end": tags[0].span_end,
        "color": tags[0].color,
        "reason": tags[0].reason,
        "wrapped": True,
    }


class _JumpBase(Macro):
    """공통 베이스 — 매크로는 IR을 바꾸지 않고 meta['jump_target']에 결과를 기록."""

    target_color: str | None = None
    reverse: bool = False

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        pos = int(params.get("current_position", 0))
        result = _next_tag_position(ir, current_pos=pos, color=self.target_color, reverse=self.reverse)
        if result:
            # meta에 기록 — pipeline result나 API 응답에서 읽어 클라이언트에 전달
            ir.macro_log.append({"macro_id": self.id, "jump_target": result})
        return ir


class N1_JumpRed(_JumpBase):
    id = "N1"; category = MacroCategory.NAVIGATE; target_color = "red"
    name = "빨강 점프"; description = "다음 빨강 표시(수정 필요)로 점프 — AI 사전 표시 순회"
    ai_powered = True
    shortcut = {"win": "Alt+R", "mac": "⌥+R"}


class N2_JumpBlue(_JumpBase):
    id = "N2"; category = MacroCategory.NAVIGATE; target_color = "blue"
    name = "파랑 점프"; description = "다음 파랑 표시(핵심 강조)로 점프"
    ai_powered = True
    shortcut = {"win": "Alt+B", "mac": "⌥+B"}


class N3_JumpYellow(_JumpBase):
    id = "N3"; category = MacroCategory.NAVIGATE; target_color = "yellow"
    name = "숫자 점프"; description = "다음 숫자(예산·통계·일자)로 점프"
    ai_powered = True
    shortcut = {"win": "Alt+N", "mac": "⌥+N"}


class N4_JumpBack(_JumpBase):
    id = "N4"; category = MacroCategory.NAVIGATE; target_color = None; reverse = True
    name = "이전 표시로"; description = "이전 빨강·파랑·노랑 표시로 역방향 점프"
    ai_powered = True


class N5_GoToPage(Macro):
    id = "N5"; category = MacroCategory.NAVIGATE
    name = "쪽 점프"; description = "지정한 쪽 번호로 즉시 이동"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        ir.macro_log.append({"macro_id": self.id, "page": int(params.get("page", 1))})
        return ir


class N6_PageNumberReset(Macro):
    id = "N6"; category = MacroCategory.NAVIGATE
    name = "쪽번호 초기화"; description = "현재 페이지부터 1로 재시작 (별책·부록용)"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        ir.macro_log.append({"macro_id": self.id, "from_page": int(params.get("page", 1))})
        return ir


class N7_JumpHome(Macro):
    id = "N7"; category = MacroCategory.NAVIGATE
    name = "처음 점프"; description = "문서 처음 (Ctrl+Home)"
    shortcut = {"win": "Ctrl+Home", "mac": "⌘+Home"}

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        ir.macro_log.append({"macro_id": self.id, "jump_target": {"start": 0, "end": 0}})
        return ir


class N8_JumpEnd(Macro):
    id = "N8"; category = MacroCategory.NAVIGATE
    name = "끝 점프"; description = "문서 끝 (Ctrl+End)"
    shortcut = {"win": "Ctrl+End", "mac": "⌘+End"}

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        end = len(ir.plain_text())
        ir.macro_log.append({"macro_id": self.id, "jump_target": {"start": end, "end": end}})
        return ir


class N9_SectionJump(Macro):
    id = "N9"; category = MacroCategory.NAVIGATE
    name = "□ 섹션 점프"; description = "다음 □ 글머리(1단계 섹션)로 점프"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        cursor = int(params.get("current_position", 0))
        pos = 0
        for blk in ir.blocks:
            text = blk.to_plain_text()
            if blk.list_item and blk.list_item.depth == 0 and pos > cursor:
                ir.macro_log.append(
                    {"macro_id": self.id, "jump_target": {"start": pos, "end": pos + len(text)}}
                )
                break
            pos += len(text) + 1
        return ir


class N10_ReviewAll(Macro):
    id = "N10"; category = MacroCategory.NAVIGATE
    name = "검토 모두 보기"; description = "빨강·파랑·노랑 표시를 사이드 패널에 목록으로"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        ir.macro_log.append(
            {
                "macro_id": self.id,
                "tags": [
                    {
                        "start": t.span_start,
                        "end": t.span_end,
                        "color": t.color,
                        "reason": t.reason,
                    }
                    for t in ir.review_tags
                ],
            }
        )
        return ir


MACROS = [
    N1_JumpRed, N2_JumpBlue, N3_JumpYellow, N4_JumpBack,
    N5_GoToPage, N6_PageNumberReset, N7_JumpHome, N8_JumpEnd,
    N9_SectionJump, N10_ReviewAll,
]
