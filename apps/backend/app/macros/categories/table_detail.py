"""표세부 매크로 15종 — S1~S15. 셀 색상·서식·정렬."""
from __future__ import annotations

from typing import Any

from app.macros.base import Macro, MacroCategory
from app.macros.helpers import get_selected_tables
from app.pipeline.ir import DocumentIR, InlineRun


def _iter_target_cells(ir: DocumentIR, params: dict[str, Any] | None):
    """파라미터에서 (row_indices, col_indices)를 받아 해당 셀 순회. 없으면 전체."""
    params = params or {}
    rows_param = params.get("row_indices")
    cols_param = params.get("col_indices")
    for blk in get_selected_tables(ir, params):
        if not blk.table:
            continue
        for ri, row in enumerate(blk.table.rows):
            if rows_param is not None and ri not in rows_param:
                continue
            for ci, cell in enumerate(row):
                if cols_param is not None and ci not in cols_param:
                    continue
                yield cell


def _set_cell_bg(ir: DocumentIR, params: dict[str, Any] | None, color: str | None) -> DocumentIR:
    for cell in _iter_target_cells(ir, params):
        cell.background = color
    return ir


class S1_CellBgGray(Macro):
    id = "S1"
    category = MacroCategory.TABLE_DETAIL
    name = "셀 배경 회색"
    description = "헤더용 연회색(#F2F2F2) 배경"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _set_cell_bg(ir, params, "#F2F2F2")


class S2_CellBgBlue(Macro):
    id = "S2"
    category = MacroCategory.TABLE_DETAIL
    name = "셀 배경 파랑"
    description = "강조용 연파랑(#E8F0FE) 배경"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _set_cell_bg(ir, params, "#E8F0FE")


class S3_CellBgYellow(Macro):
    id = "S3"
    category = MacroCategory.TABLE_DETAIL
    name = "셀 배경 노랑"
    description = "주의용 연노랑(#FFF8DC) 배경"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _set_cell_bg(ir, params, "#FFF8DC")


class S4_CellBgClear(Macro):
    id = "S4"
    category = MacroCategory.TABLE_DETAIL
    name = "셀 배경 제거"
    description = "배경색 일괄 제거"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _set_cell_bg(ir, params, None)


def _set_run_color(ir: DocumentIR, params: dict[str, Any] | None, color: str) -> DocumentIR:
    for cell in _iter_target_cells(ir, params):
        for run in cell.runs:
            run.color = color
    return ir


class S5_FontBlack(Macro):
    id = "S5"
    category = MacroCategory.TABLE_DETAIL
    name = "글자 색 검정"
    description = "선택 영역 글자 색 검정(#000000)"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _set_run_color(ir, params, "#000000")


class S6_FontRed(Macro):
    id = "S6"
    category = MacroCategory.TABLE_DETAIL
    name = "글자 색 빨강"
    description = "수정 표시용 빨강(#C0392B)"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _set_run_color(ir, params, "#C0392B")


class S7_FontBlue(Macro):
    id = "S7"
    category = MacroCategory.TABLE_DETAIL
    name = "글자 색 파랑"
    description = "강조용 파랑(#1F5BAF)"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _set_run_color(ir, params, "#1F5BAF")


class S8_FontGray(Macro):
    id = "S8"
    category = MacroCategory.TABLE_DETAIL
    name = "글자 색 회색"
    description = "보조 텍스트용 회색(#666666)"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _set_run_color(ir, params, "#666666")


def _set_align(ir: DocumentIR, params: dict[str, Any] | None, align: str) -> DocumentIR:
    for cell in _iter_target_cells(ir, params):
        cell.align = align  # type: ignore[assignment]
    return ir


class S9_AlignLeft(Macro):
    id = "S9"
    category = MacroCategory.TABLE_DETAIL
    name = "텍스트 좌측 정렬"
    description = "셀 내 텍스트 좌측 정렬"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _set_align(ir, params, "left")


class S10_AlignCenter(Macro):
    id = "S10"
    category = MacroCategory.TABLE_DETAIL
    name = "텍스트 중앙 정렬"
    description = "셀 내 텍스트 중앙 정렬"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _set_align(ir, params, "center")


class S11_AlignRight(Macro):
    id = "S11"
    category = MacroCategory.TABLE_DETAIL
    name = "텍스트 우측 정렬"
    description = "셀 내 텍스트 우측 정렬"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        return _set_align(ir, params, "right")


class S12_NumberAutoRight(Macro):
    id = "S12"
    category = MacroCategory.TABLE_DETAIL
    name = "숫자 자동 우측 정렬"
    description = "셀이 숫자면 자동 우측 정렬"
    ai_powered = True
    auto = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        import re
        num_re = re.compile(r"^-?\s*\d[\d,.\s]*(?:%|원|건|명|개)?\s*$")
        for cell in _iter_target_cells(ir, params):
            text = "".join(r.text for r in cell.runs).strip()
            if text and num_re.match(text):
                cell.align = "right"
        return ir


class S13_HeaderAutoHighlight(Macro):
    id = "S13"
    category = MacroCategory.TABLE_DETAIL
    name = "머리행 자동 강조"
    description = "첫 행을 헤더 스타일로 자동 변환"
    ai_powered = True
    auto = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_tables(ir, params):
            if not blk.table or not blk.table.rows:
                continue
            if not blk.table.header_row:
                continue
            for cell in blk.table.rows[0]:
                cell.background = cell.background or "#F2F2F2"
                cell.align = "center"
                for run in cell.runs:
                    run.bold = True
        return ir


class S14_CopyCellFormat(Macro):
    id = "S14"
    category = MacroCategory.TABLE_DETAIL
    name = "모양 복사 (셀)"
    description = "셀 서식만 복사"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        # 클립보드는 IR 외부에 둔다 — 여기선 메타에 표시 (실제 클립보드는 프론트가 관리)
        params = params or {}
        src = params.get("source_cell")
        dst = params.get("target_cells", [])
        if not src or not dst:
            return ir
        # source 찾기
        for blk in get_selected_tables(ir, params):
            if not blk.table:
                continue
            sr, sc = int(src.get("row", 0)), int(src.get("col", 0))
            if sr >= len(blk.table.rows) or sc >= len(blk.table.rows[sr]):
                continue
            source_cell = blk.table.rows[sr][sc]
            for t in dst:
                tr, tc = int(t.get("row", 0)), int(t.get("col", 0))
                if tr < len(blk.table.rows) and tc < len(blk.table.rows[tr]):
                    target = blk.table.rows[tr][tc]
                    target.background = source_cell.background
                    target.align = source_cell.align
                    target.border = source_cell.border
        return ir


class S15_CellRotate(Macro):
    id = "S15"
    category = MacroCategory.TABLE_DETAIL
    name = "셀 회전"
    description = "셀 내 텍스트 90도 회전 (헤더용)"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        angle = int(params.get("angle", 90))
        if angle not in (0, 90):
            angle = 90
        for cell in _iter_target_cells(ir, params):
            cell.rotate = angle
        return ir


MACROS = [
    S1_CellBgGray, S2_CellBgBlue, S3_CellBgYellow, S4_CellBgClear,
    S5_FontBlack, S6_FontRed, S7_FontBlue, S8_FontGray,
    S9_AlignLeft, S10_AlignCenter, S11_AlignRight, S12_NumberAutoRight,
    S13_HeaderAutoHighlight, S14_CopyCellFormat, S15_CellRotate,
]
