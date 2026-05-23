"""표 매크로 25종 — T1~T25.

PRD 4.2 명세 그대로 구현.
"""
from __future__ import annotations

from typing import Any

from app.macros.base import Macro, MacroCategory
from app.macros.helpers import get_selected_tables, normalize_column_widths
from app.pipeline.ir import Block, BlockType, DocumentIR, InlineRun, Table, TableCell


def _new_table(rows: int, cols: int, *, border: str = "default", header: bool = False) -> Table:
    body: list[list[TableCell]] = []
    for _r in range(rows):
        body.append([TableCell() for _c in range(cols)])
    return Table(rows=body, border_style=border, header_row=header)  # type: ignore[arg-type]


def _append_table(ir: DocumentIR, table: Table) -> str:
    blk_id = f"blk-{len(ir.blocks) + 1:04d}"
    ir.blocks.append(Block(id=blk_id, type=BlockType.TABLE, table=table))
    return blk_id


# ─────────────────────────────────────────────────────────────────────────────
# T1~T4 표 생성
# ─────────────────────────────────────────────────────────────────────────────

class T1_BasicTable(Macro):
    id = "T1"
    category = MacroCategory.TABLE
    name = "표 생성 (기본)"
    description = "지정한 행×열 기본 표 삽입 (테두리·정렬 표준 적용)"
    shortcut = {"win": "Ctrl+N,T", "mac": "⌘+N,T"}

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        rows = int(params.get("rows", 3))
        cols = int(params.get("cols", 3))
        _append_table(ir, _new_table(rows, cols, border="default", header=True))
        return ir


class T2_DashedTable(Macro):
    id = "T2"
    category = MacroCategory.TABLE
    name = "표 생성 (점선)"
    description = "초안용 점선 테두리 표"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        _append_table(ir, _new_table(int(params.get("rows", 3)), int(params.get("cols", 3)), border="dashed"))
        return ir


class T3_GridTable(Macro):
    id = "T3"
    category = MacroCategory.TABLE
    name = "표 생성 (격자)"
    description = "데이터 표용 격자 무늬 표"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        _append_table(ir, _new_table(int(params.get("rows", 3)), int(params.get("cols", 3)), border="grid"))
        return ir


class T4_HeaderTable(Macro):
    id = "T4"
    category = MacroCategory.TABLE
    name = "표 생성 (헤더형)"
    description = "첫 행이 헤더로 강조된 표"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        rows = int(params.get("rows", 3))
        cols = int(params.get("cols", 3))
        tbl = _new_table(rows, cols, border="header", header=True)
        if tbl.rows:
            for cell in tbl.rows[0]:
                cell.background = "#F2F2F2"
                cell.align = "center"
        _append_table(ir, tbl)
        return ir


# ─────────────────────────────────────────────────────────────────────────────
# T5~T7 셀 크기
# ─────────────────────────────────────────────────────────────────────────────

class T5_EqualCellWidth(Macro):
    id = "T5"
    category = MacroCategory.TABLE
    name = "셀 너비 균등"
    description = "선택 표·행의 셀 너비 자동 균등 분배"
    auto = True  # 변환 시 모든 표에 자동 적용
    shortcut = {"win": "F5", "mac": "F5"}

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_tables(ir, params):
            t = blk.table
            if not t or not t.rows:
                continue
            normalize_column_widths(t)
            cols = t.col_count
            if cols:
                t.column_widths = [1.0 / cols] * cols
        return ir


class T6_EqualCellHeight(Macro):
    id = "T6"
    category = MacroCategory.TABLE
    name = "셀 높이 균등"
    description = "선택 행의 셀 높이 자동 균등 분배"
    shortcut = {"win": "F6", "mac": "F6"}

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        # IR에는 행 높이 필드를 별도 두지 않음 — meta에 표시
        for blk in get_selected_tables(ir, params):
            blk.meta["equal_row_height"] = True
        return ir


class T7_AutoFitWidth(Macro):
    id = "T7"
    category = MacroCategory.TABLE
    name = "셀 너비 자동 맞춤"
    description = "셀 내용에 맞춰 너비 자동 조정"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_tables(ir, params):
            t = blk.table
            if not t or not t.rows:
                continue
            normalize_column_widths(t)
            cols = t.col_count
            # 각 열의 평균 텍스트 길이로 가중 (간단한 휴리스틱)
            widths = []
            for c in range(cols):
                lengths = [
                    sum(len(r.text) for r in row[c].runs) for row in t.rows if c < len(row)
                ]
                widths.append(max(1, sum(lengths) // max(1, len(lengths))))
            total = sum(widths) or 1
            t.column_widths = [w / total for w in widths]
        return ir


# ─────────────────────────────────────────────────────────────────────────────
# T8~T13 행·열 추가·삭제
# ─────────────────────────────────────────────────────────────────────────────

def _target_table_and_pos(blk: Block, params: dict[str, Any] | None) -> tuple[Table, int, int]:
    t = blk.table
    assert t is not None
    row = int((params or {}).get("row", 0))
    col = int((params or {}).get("col", 0))
    return t, row, col


def _equalize_columns(t: Table) -> None:
    """셀 너비·높이 모두 균등 — T5+T6 결합. 행/열 추가/삭제 후 자동 적용.

    빈 셀에 공백을 채워 행 높이가 0이 되지 않도록 함 → 모든 행이 동일 높이.
    """
    from app.pipeline.ir import InlineRun

    normalize_column_widths(t)
    cols = t.col_count
    if cols > 0:
        t.column_widths = [1.0 / cols] * cols

    for row in t.rows:
        for cell in row:
            # 테두리 일관성
            if cell.border not in ("default", "none"):
                cell.border = "default"
            # 빈 셀 공백 — 행 높이 시각 균등
            if not cell.runs:
                cell.runs = [InlineRun(text=" ")]


class T8_AddRowAbove(Macro):
    id = "T8"
    category = MacroCategory.TABLE
    name = "행 추가 (위)"
    description = "현재 행 위에 1개 추가"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        # 행 위치 미지정 시 마지막 행 직전(기본은 첫 행 위) — 표 끝에 추가가 자연스러움
        for blk in get_selected_tables(ir, params):
            t = blk.table
            if not t:
                continue
            cols = t.col_count
            row = int(params.get("row", 0))
            t.rows.insert(row, [TableCell() for _ in range(cols)])
            _equalize_columns(t)
        return ir


class T9_AddRowBelow(Macro):
    id = "T9"
    category = MacroCategory.TABLE
    name = "행 추가 (아래)"
    description = "현재 행 아래에 1개 추가 (셀 너비 자동 균등)"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        for blk in get_selected_tables(ir, params):
            t = blk.table
            if not t:
                continue
            cols = t.col_count
            # 행 미지정 시 마지막 행 다음 (직관적)
            row = int(params.get("row", len(t.rows) - 1))
            t.rows.insert(row + 1, [TableCell() for _ in range(cols)])
            _equalize_columns(t)
        return ir


class T10_AddColLeft(Macro):
    id = "T10"
    category = MacroCategory.TABLE
    name = "열 추가 (왼쪽)"
    description = "현재 열 왼쪽에 1개 추가 (셀 너비 자동 균등)"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_tables(ir, params):
            t, _, col = _target_table_and_pos(blk, params)
            for row in t.rows:
                row.insert(col, TableCell())
            _equalize_columns(t)
        return ir


class T11_AddColRight(Macro):
    id = "T11"
    category = MacroCategory.TABLE
    name = "열 추가 (오른쪽)"
    description = "현재 열 오른쪽에 1개 추가 (셀 너비 자동 균등)"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        for blk in get_selected_tables(ir, params):
            t = blk.table
            if not t:
                continue
            cols = t.col_count
            col = int(params.get("col", cols - 1))  # 미지정 시 마지막 열 다음
            for row in t.rows:
                row.insert(col + 1, TableCell())
            _equalize_columns(t)
        return ir


class T12_DeleteRow(Macro):
    id = "T12"
    category = MacroCategory.TABLE
    name = "행 삭제"
    description = "현재 행 삭제 (셀 너비 자동 균등)"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        for blk in get_selected_tables(ir, params):
            t = blk.table
            if not t:
                continue
            # 미지정 시 마지막 행 — 직관적
            row = int(params.get("row", len(t.rows) - 1))
            if 0 <= row < len(t.rows):
                t.rows.pop(row)
            _equalize_columns(t)
        return ir


class T13_DeleteCol(Macro):
    id = "T13"
    category = MacroCategory.TABLE
    name = "열 삭제"
    description = "현재 열 삭제 (셀 너비 자동 균등)"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        for blk in get_selected_tables(ir, params):
            t = blk.table
            if not t:
                continue
            col = int(params.get("col", t.col_count - 1))  # 미지정 시 마지막 열
            for row in t.rows:
                if 0 <= col < len(row):
                    row.pop(col)
            _equalize_columns(t)
        return ir


# ─────────────────────────────────────────────────────────────────────────────
# T14~T15 셀 병합·분할
# ─────────────────────────────────────────────────────────────────────────────

class T14_MergeCells(Macro):
    id = "T14"
    category = MacroCategory.TABLE
    name = "셀 병합"
    description = "선택된 다중 셀을 하나로 병합"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        for blk in get_selected_tables(ir, params):
            t = blk.table
            if not t:
                continue
            r0 = int(params.get("row_start", 0))
            r1 = int(params.get("row_end", r0))
            c0 = int(params.get("col_start", 0))
            c1 = int(params.get("col_end", c0))
            if r0 > r1 or c0 > c1:
                continue
            # 첫 셀에 colspan/rowspan 부여, 나머지는 비우기 (렌더러가 처리)
            try:
                head = t.rows[r0][c0]
                head.rowspan = r1 - r0 + 1
                head.colspan = c1 - c0 + 1
                merged_text = " ".join(
                    "".join(r.text for r in t.rows[rr][cc].runs)
                    for rr in range(r0, r1 + 1)
                    for cc in range(c0, c1 + 1)
                    if not (rr == r0 and cc == c0)
                )
                if merged_text:
                    head.runs.append(InlineRun(text=" " + merged_text))
                for rr in range(r0, r1 + 1):
                    for cc in range(c0, c1 + 1):
                        if rr == r0 and cc == c0:
                            continue
                        if rr < len(t.rows) and cc < len(t.rows[rr]):
                            t.rows[rr][cc] = TableCell(runs=[], colspan=0, rowspan=0)
            except IndexError:
                pass
        return ir


class T15_SplitCell(Macro):
    id = "T15"
    category = MacroCategory.TABLE
    name = "셀 분할"
    description = "병합된 셀을 다시 분할"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        for blk in get_selected_tables(ir, params):
            t = blk.table
            if not t:
                continue
            r = int(params.get("row", 0))
            c = int(params.get("col", 0))
            try:
                cell = t.rows[r][c]
                rs, cs = cell.rowspan, cell.colspan
                cell.rowspan = 1
                cell.colspan = 1
                for rr in range(r, r + rs):
                    for cc in range(c, c + cs):
                        if rr == r and cc == c:
                            continue
                        if rr < len(t.rows) and cc < len(t.rows[rr]):
                            t.rows[rr][cc] = TableCell()
            except IndexError:
                pass
        return ir


# ─────────────────────────────────────────────────────────────────────────────
# T16~T17 테두리
# ─────────────────────────────────────────────────────────────────────────────

class T16_BorderAll(Macro):
    id = "T16"
    category = MacroCategory.TABLE
    name = "테두리 일괄"
    description = "외곽 굵게·내부 얇게 표준 테두리"
    auto = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_tables(ir, params):
            if blk.table:
                blk.table.border_style = "default"
                for row in blk.table.rows:
                    for cell in row:
                        if cell.border == "none":
                            continue
                        cell.border = "default"
        return ir


class T17_BorderNone(Macro):
    id = "T17"
    category = MacroCategory.TABLE
    name = "테두리 없음"
    description = "전체 테두리 제거 (레이아웃용)"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_tables(ir, params):
            if blk.table:
                blk.table.border_style = "none"
                for row in blk.table.rows:
                    for cell in row:
                        cell.border = "none"
        return ir


# ─────────────────────────────────────────────────────────────────────────────
# T18~T22 계산·표시
# ─────────────────────────────────────────────────────────────────────────────

import re

_NUM_RE = re.compile(r"-?\d+(?:,\d{3})*(?:\.\d+)?")


def _parse_num(text: str) -> float | None:
    m = _NUM_RE.search(text)
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", ""))
    except ValueError:
        return None


def _cell_number(cell: TableCell) -> float | None:
    return _parse_num("".join(r.text for r in cell.runs))


def _aggregate(t: Table, *, axis: str, op: str, idx: int) -> float:
    nums: list[float] = []
    if axis == "row" and 0 <= idx < len(t.rows):
        for c in t.rows[idx]:
            v = _cell_number(c)
            if v is not None:
                nums.append(v)
    elif axis == "col":
        for row in t.rows:
            if idx < len(row):
                v = _cell_number(row[idx])
                if v is not None:
                    nums.append(v)
    if not nums:
        return 0.0
    if op == "sum":
        return sum(nums)
    if op == "avg":
        return sum(nums) / len(nums)
    if op == "count":
        return float(len(nums))
    return 0.0


class T18_AutoSum(Macro):
    id = "T18"
    category = MacroCategory.TABLE
    name = "합계 자동"
    description = "선택 행/열의 합계 자동 계산"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        axis = str(params.get("axis", "col"))
        for blk in get_selected_tables(ir, params):
            t = blk.table
            if not t or not t.rows:
                continue
            if axis == "col":
                cols = t.col_count
                new_row = [TableCell(runs=[InlineRun(text="합계", bold=True)])]
                for c in range(1, cols):
                    s = _aggregate(t, axis="col", op="sum", idx=c)
                    new_row.append(TableCell(runs=[InlineRun(text=f"{s:,.0f}")], align="right"))
                t.rows.append(new_row)
            else:
                for row in t.rows:
                    s = sum((_cell_number(c) or 0) for c in row[1:])
                    row.append(TableCell(runs=[InlineRun(text=f"{s:,.0f}", bold=True)], align="right"))
        return ir


class T19_AutoAvg(Macro):
    id = "T19"
    category = MacroCategory.TABLE
    name = "평균 자동"
    description = "선택 행/열의 평균 자동 계산"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        for blk in get_selected_tables(ir, params):
            t = blk.table
            if not t or not t.rows:
                continue
            cols = t.col_count
            new_row: list[TableCell] = [TableCell(runs=[InlineRun(text="평균", bold=True)])]
            for c in range(1, cols):
                avg = _aggregate(t, axis="col", op="avg", idx=c)
                new_row.append(TableCell(runs=[InlineRun(text=f"{avg:,.2f}")], align="right"))
            t.rows.append(new_row)
        return ir


class T20_AutoCount(Macro):
    id = "T20"
    category = MacroCategory.TABLE
    name = "개수 자동"
    description = "선택 셀 개수 자동 카운트"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_tables(ir, params):
            if not blk.table:
                continue
            n = sum(1 for row in blk.table.rows for c in row if any(r.text.strip() for r in c.runs))
            blk.meta["non_empty_count"] = n
        return ir


class T21_ThousandsScale(Macro):
    id = "T21"
    category = MacroCategory.TABLE
    name = "천 단위 곱·나눔"
    description = "선택 셀 숫자 ×1000 또는 ÷1000"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        factor = float(params.get("factor", 1000))
        op = str(params.get("op", "mul"))
        for blk in get_selected_tables(ir, params):
            if not blk.table:
                continue
            for row in blk.table.rows:
                for cell in row:
                    v = _cell_number(cell)
                    if v is None:
                        continue
                    nv = v * factor if op == "mul" else v / factor
                    cell.runs = [InlineRun(text=f"{nv:,.0f}")]
        return ir


class T22_RatioMark(Macro):
    id = "T22"
    category = MacroCategory.TABLE
    name = "엑셀 비율 표시"
    description = "두 셀의 비율을 (30%) 형태로 추가"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        num_col = int(params.get("numerator_col", 1))
        den_col = int(params.get("denominator_col", 2))
        for blk in get_selected_tables(ir, params):
            if not blk.table:
                continue
            for row in blk.table.rows:
                if max(num_col, den_col) >= len(row):
                    continue
                n = _cell_number(row[num_col])
                d = _cell_number(row[den_col])
                if n is None or not d:
                    continue
                pct = n / d * 100
                row[num_col].runs.append(InlineRun(text=f" ({pct:.0f}%)", color="#666666"))
        return ir


# ─────────────────────────────────────────────────────────────────────────────
# T23~T25 정렬·분할·역변환
# ─────────────────────────────────────────────────────────────────────────────

class T23_TableAlign(Macro):
    id = "T23"
    category = MacroCategory.TABLE
    name = "표 정렬 (좌·중·우)"
    description = "표 자체를 페이지 좌·중·우 정렬"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        align = str(params.get("align", "center"))
        if align not in ("left", "center", "right"):
            align = "center"
        for blk in get_selected_tables(ir, params):
            if blk.table:
                blk.table.align = align  # type: ignore[assignment]
        return ir


class T24_SplitTable(Macro):
    id = "T24"
    category = MacroCategory.TABLE
    name = "표 분할"
    description = "표를 두 개로 분할 (현재 행 기준)"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        split_row = int(params.get("row", 1))
        new_blocks: list[Block] = []
        for blk in ir.blocks:
            new_blocks.append(blk)
            if blk.type != BlockType.TABLE or not blk.table:
                continue
            if (params.get("selected_block_ids") and blk.id not in params["selected_block_ids"]):
                continue
            if split_row <= 0 or split_row >= len(blk.table.rows):
                continue
            top_rows = blk.table.rows[:split_row]
            bot_rows = blk.table.rows[split_row:]
            blk.table.rows = top_rows
            new_id = f"blk-{len(ir.blocks) + len(new_blocks):04d}"
            new_blocks.append(
                Block(
                    id=new_id,
                    type=BlockType.TABLE,
                    table=Table(
                        rows=bot_rows,
                        border_style=blk.table.border_style,
                        header_row=False,
                        column_widths=blk.table.column_widths,
                    ),
                )
            )
        ir.blocks = new_blocks
        return ir


class T25_TableToMarkdown(Macro):
    id = "T25"
    category = MacroCategory.TABLE
    name = "표 → 마크다운"
    description = "표를 마크다운 텍스트로 역변환"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_tables(ir, params):
            t = blk.table
            if not t or not t.rows:
                continue
            normalize_column_widths(t)
            lines = []
            header = t.rows[0]
            lines.append("| " + " | ".join("".join(r.text for r in c.runs) or " " for c in header) + " |")
            lines.append("| " + " | ".join(["---"] * len(header)) + " |")
            for row in t.rows[1:]:
                lines.append("| " + " | ".join("".join(r.text for r in c.runs) or " " for c in row) + " |")
            md = "\n".join(lines)
            # 표 블록 → 단락으로 교체
            blk.type = BlockType.PARAGRAPH
            blk.table = None
            blk.runs = [InlineRun(text=md, code=True)]
        return ir


MACROS = [
    T1_BasicTable, T2_DashedTable, T3_GridTable, T4_HeaderTable,
    T5_EqualCellWidth, T6_EqualCellHeight, T7_AutoFitWidth,
    T8_AddRowAbove, T9_AddRowBelow, T10_AddColLeft, T11_AddColRight,
    T12_DeleteRow, T13_DeleteCol, T14_MergeCells, T15_SplitCell,
    T16_BorderAll, T17_BorderNone, T18_AutoSum, T19_AutoAvg, T20_AutoCount,
    T21_ThousandsScale, T22_RatioMark, T23_TableAlign, T24_SplitTable, T25_TableToMarkdown,
]
