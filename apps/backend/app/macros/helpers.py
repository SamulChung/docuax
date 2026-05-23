"""매크로 구현 공용 헬퍼.

대부분의 매크로는 (1) 선택된 블록 가져오기 (2) 변형 (3) 반환의 동일한 패턴.
헬퍼로 보일러플레이트 제거.
"""
from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from app.pipeline.ir import Block, BlockType, DocumentIR, InlineRun, Table, TableCell


def get_selected_blocks(ir: DocumentIR, params: dict[str, Any] | None) -> list[Block]:
    """params['selected_block_ids'] 에서 블록 목록 추출. 비어있으면 전체."""
    if not params:
        return list(ir.blocks)
    ids = set(params.get("selected_block_ids") or [])
    if not ids:
        return list(ir.blocks)
    return [b for b in ir.blocks if b.id in ids]


def get_selected_tables(ir: DocumentIR, params: dict[str, Any] | None) -> list[Block]:
    """선택된 표(또는 전체 표)."""
    return [b for b in get_selected_blocks(ir, params) if b.type == BlockType.TABLE and b.table]


def iter_runs(blk: Block) -> Iterable[InlineRun]:
    """블록 안 모든 InlineRun 순회 (단락/리스트/표 모두)."""
    if blk.runs:
        yield from blk.runs
    if blk.list_item:
        yield from blk.list_item.runs
    if blk.table:
        for row in blk.table.rows:
            for cell in row:
                yield from cell.runs


def update_runs(blk: Block, fn) -> None:
    """블록 안 모든 InlineRun에 fn(run)을 적용."""
    for r in iter_runs(blk):
        fn(r)


def selected_text_range(params: dict[str, Any] | None) -> tuple[int, int] | None:
    if not params:
        return None
    r = params.get("selected_text_range")
    if not r:
        return None
    return (int(r["start"]), int(r["end"]))


def normalize_column_widths(table: Table) -> Table:
    """모든 행의 셀 개수를 최대 열 수로 맞추고 빈 셀로 채움."""
    col_count = max((len(r) for r in table.rows), default=0)
    for row in table.rows:
        while len(row) < col_count:
            row.append(TableCell())
    return table


def clone_run(r: InlineRun, **overrides: Any) -> InlineRun:
    return r.model_copy(update=overrides)
