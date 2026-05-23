"""변환 결과 직접 편집 API.

사용자가 미리보기에서 직접 수정할 수 있는 동작:
- POST /edit/cell — 표 셀 텍스트 수정
- POST /edit/block — 단락/헤딩/리스트 블록 텍스트 수정

서식·정렬 등은 매크로로 처리. 이 API는 텍스트 콘텐츠 수정만.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.pipeline.ir import BlockType, InlineRun
from app.pipeline.stages import build_preview_payload
from app.services.document_cache import get_document_cache

router = APIRouter()


class CellEditRequest(BaseModel):
    document_id: str
    block_id: str
    row: int = Field(ge=0)
    col: int = Field(ge=0)
    text: str  # 새 셀 텍스트


class BlockEditRequest(BaseModel):
    document_id: str
    block_id: str
    text: str  # 새 블록 텍스트


class EditResponse(BaseModel):
    success: bool
    preview: dict[str, Any]
    message: str = ""


@router.post("/edit/cell", response_model=EditResponse)
async def edit_cell(req: CellEditRequest) -> EditResponse:
    """표 셀 텍스트 직접 수정. 기존 run의 서식은 첫 번째 run만 보존."""
    cache = get_document_cache()
    ir = cache.get(req.document_id)
    if ir is None:
        raise HTTPException(status_code=404, detail="document not found — 변환을 먼저 실행하세요")

    blk = next((b for b in ir.blocks if b.id == req.block_id), None)
    if blk is None or blk.type != BlockType.TABLE or not blk.table:
        raise HTTPException(status_code=400, detail="해당 블록이 표가 아닙니다")

    if req.row >= len(blk.table.rows) or req.col >= len(blk.table.rows[req.row]):
        raise HTTPException(status_code=400, detail="셀 위치가 표 범위를 벗어남")

    cell = blk.table.rows[req.row][req.col]
    # 첫 run의 서식 (bold/align 등)은 보존, 텍스트만 교체
    if cell.runs:
        # 첫 run의 속성 복사 + 새 텍스트
        base = cell.runs[0]
        cell.runs = [InlineRun(
            text=req.text,
            bold=base.bold, italic=base.italic, underline=base.underline,
            color=base.color, font_size=base.font_size, font_family=base.font_family,
        )]
    else:
        cell.runs = [InlineRun(text=req.text)]

    cache.set(ir)
    return EditResponse(success=True, preview=build_preview_payload(ir), message="셀 수정")


@router.post("/edit/block", response_model=EditResponse)
async def edit_block(req: BlockEditRequest) -> EditResponse:
    """단락/헤딩/리스트 항목의 텍스트 직접 수정."""
    cache = get_document_cache()
    ir = cache.get(req.document_id)
    if ir is None:
        raise HTTPException(status_code=404, detail="document not found")

    blk = next((b for b in ir.blocks if b.id == req.block_id), None)
    if blk is None:
        raise HTTPException(status_code=404, detail="블록을 찾을 수 없음")

    target_runs = None
    if blk.type == BlockType.LIST_ITEM and blk.list_item:
        target_runs = blk.list_item.runs
    elif blk.type in (BlockType.PARAGRAPH, BlockType.HEADING, BlockType.QUOTE, BlockType.CODE, BlockType.BOX):
        target_runs = blk.runs
    else:
        raise HTTPException(status_code=400, detail=f"{blk.type.value} 블록은 직접 편집 불가")

    # 첫 run 서식 보존, 텍스트 교체
    if target_runs:
        base = target_runs[0]
        new_run = InlineRun(
            text=req.text,
            bold=base.bold, italic=base.italic, underline=base.underline,
            color=base.color, font_size=base.font_size, font_family=base.font_family,
        )
        if blk.type == BlockType.LIST_ITEM and blk.list_item:
            blk.list_item.runs = [new_run]
        else:
            blk.runs = [new_run]
    else:
        new_run = InlineRun(text=req.text)
        if blk.type == BlockType.LIST_ITEM and blk.list_item:
            blk.list_item.runs = [new_run]
        else:
            blk.runs = [new_run]

    cache.set(ir)
    return EditResponse(success=True, preview=build_preview_payload(ir), message="블록 수정")
