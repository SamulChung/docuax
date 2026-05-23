"""글자 매크로 15종 — G1~G15. 서식·크기·복사."""
from __future__ import annotations

from typing import Any

from app.macros.base import Macro, MacroCategory
from app.macros.helpers import get_selected_blocks, iter_runs, update_runs
from app.pipeline.ir import DocumentIR


def _toggle(attr: str):
    def fn(ir: DocumentIR, params: dict[str, Any] | None) -> DocumentIR:
        for blk in get_selected_blocks(ir, params):
            update_runs(blk, lambda r: setattr(r, attr, not getattr(r, attr)))
        return ir
    return fn


class G1_Bold(Macro):
    id = "G1"; category = MacroCategory.GLYPH
    name = "굵게"; description = "선택 텍스트 굵게"
    shortcut = {"win": "Ctrl+B", "mac": "⌘+B"}

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _toggle("bold")(ir, params)


class G2_Italic(Macro):
    id = "G2"; category = MacroCategory.GLYPH
    name = "기울임"; description = "선택 텍스트 기울임"
    shortcut = {"win": "Ctrl+I", "mac": "⌘+I"}

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _toggle("italic")(ir, params)


class G3_Underline(Macro):
    id = "G3"; category = MacroCategory.GLYPH
    name = "밑줄"; description = "선택 텍스트 밑줄"
    shortcut = {"win": "Ctrl+U", "mac": "⌘+U"}

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _toggle("underline")(ir, params)


class G4_Strikethrough(Macro):
    id = "G4"; category = MacroCategory.GLYPH
    name = "취소선"; description = "선택 텍스트 취소선"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _toggle("strikethrough")(ir, params)


class G5_Superscript(Macro):
    id = "G5"; category = MacroCategory.GLYPH
    name = "윗첨자"; description = "선택 텍스트 윗첨자"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _toggle("superscript")(ir, params)


class G6_Subscript(Macro):
    id = "G6"; category = MacroCategory.GLYPH
    name = "아랫첨자"; description = "선택 텍스트 아랫첨자"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _toggle("subscript")(ir, params)


class G7_FontSizeUp(Macro):
    id = "G7"; category = MacroCategory.GLYPH
    name = "글자 크기 +1"; description = "선택 글자 크기 +1pt"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_blocks(ir, params):
            for r in iter_runs(blk):
                r.font_size = (r.font_size or 11.0) + 1
        return ir


class G8_FontSizeDown(Macro):
    id = "G8"; category = MacroCategory.GLYPH
    name = "글자 크기 -1"; description = "선택 글자 크기 -1pt"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_blocks(ir, params):
            for r in iter_runs(blk):
                r.font_size = max(6.0, (r.font_size or 11.0) - 1)
        return ir


class G9_FontSizeUnify(Macro):
    id = "G9"; category = MacroCategory.GLYPH
    name = "글자 크기 일괄"; description = "선택 영역 크기 통일"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        size = float(params.get("size", 11.0))
        for blk in get_selected_blocks(ir, params):
            for r in iter_runs(blk):
                r.font_size = size
        return ir


class G10_HancomStandardSize(Macro):
    id = "G10"; category = MacroCategory.GLYPH
    name = "한컴 표준 크기"; description = "한컴 공문 표준 (15pt 본문, 13pt 표) 적용"
    ai_powered = True
    # auto는 공문 양식일 때만 가동 — apply에서 분기

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        from app.pipeline.ir import BlockType
        body_size = 15.0
        table_size = 13.0
        for blk in ir.blocks:
            if blk.type == BlockType.TABLE and blk.table:
                for row in blk.table.rows:
                    for cell in row:
                        for r in cell.runs:
                            r.font_size = table_size
            else:
                for r in iter_runs(blk):
                    r.font_size = body_size
                    r.font_family = r.font_family or "맑은 고딕"
        return ir


class G11_FontFamily(Macro):
    id = "G11"; category = MacroCategory.GLYPH
    name = "글꼴 일괄 변경"; description = "선택 영역 글꼴 일괄 (맑은고딕·바탕 등)"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        family = str(params.get("font", "맑은 고딕"))
        for blk in get_selected_blocks(ir, params):
            for r in iter_runs(blk):
                r.font_family = family
        return ir


class G12_CopyFontFormat(Macro):
    id = "G12"; category = MacroCategory.GLYPH
    name = "모양 복사 (글자)"; description = "글자 서식만 복사"
    shortcut = {"win": "Alt+C", "mac": "⌥+C"}

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        # 클립보드는 프론트 책임 — 백엔드는 메타 마킹만
        return ir


class G13_FontFormatPaintGlobal(Macro):
    id = "G13"; category = MacroCategory.GLYPH
    name = "모양 복사 (전역)"; description = "마지막 선택 서식을 다음 클릭에 적용"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        fmt = params.get("format", {})
        if not fmt:
            return ir
        for blk in get_selected_blocks(ir, params):
            for r in iter_runs(blk):
                for k, v in fmt.items():
                    if hasattr(r, k):
                        setattr(r, k, v)
        return ir


class G14_HanjaConvert(Macro):
    id = "G14"; category = MacroCategory.GLYPH
    name = "한자 변환"; description = "선택 한글을 한자로 변환 (한컴식)"
    ai_powered = True
    shortcut = {"win": "F9", "mac": "F9"}

    # 간단한 한글↔한자 사전 (확장 가능, RAG로 학습 추가 가능)
    _HANJA = {
        "회사": "會社", "보고": "報告", "계획": "計劃", "예산": "豫算",
        "수신": "受信", "발신": "發信", "결재": "決裁", "기안": "起案",
        "검토": "檢討", "협조": "協助", "통보": "通報", "안내": "案內",
        "조치": "措置", "시행": "施行", "공문": "公文", "문서": "文書",
    }

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_blocks(ir, params):
            for r in iter_runs(blk):
                for ko, hanja in self._HANJA.items():
                    if ko in r.text:
                        r.text = r.text.replace(ko, f"{ko}({hanja})")
                        r.annotations["hanja"] = True
        return ir


class G15_SpecialChar(Macro):
    id = "G15"; category = MacroCategory.GLYPH
    name = "특수문자 입력 패널"; description = "한컴식 특수문자 입력기 호출"
    shortcut = {"win": "Ctrl+F10", "mac": "⌘+F10"}

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        # UI 호출만 — IR 변형 없음. 사용자가 선택한 문자가 들어오면 삽입.
        params = params or {}
        chars = str(params.get("chars", ""))
        if not chars:
            return ir
        # 첫 번째 선택 블록에 추가
        blocks = get_selected_blocks(ir, params)
        if blocks:
            blk = blocks[0]
            target = blk.runs if blk.runs else (blk.list_item.runs if blk.list_item else None)
            if target is not None:
                from app.pipeline.ir import InlineRun as _IR  # avoid circular
                target.append(_IR(text=chars))
        return ir


MACROS = [
    G1_Bold, G2_Italic, G3_Underline, G4_Strikethrough,
    G5_Superscript, G6_Subscript, G7_FontSizeUp, G8_FontSizeDown,
    G9_FontSizeUnify, G10_HancomStandardSize, G11_FontFamily,
    G12_CopyFontFormat, G13_FontFormatPaintGlobal, G14_HanjaConvert, G15_SpecialChar,
]
