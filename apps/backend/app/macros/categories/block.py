"""블록 매크로 20종 — B1~B20. 글머리·들여쓰기·블록."""
from __future__ import annotations

import re
from typing import Any

from app.macros.base import Macro, MacroCategory
from app.macros.helpers import get_selected_blocks
from app.pipeline.ir import Block, BlockType, DocumentIR, InlineRun, ListItem


_BULLETS = ["□", "○", "―", "※", "*"]


def _make_list_item(blk: Block, depth: int, ordered: bool = False, order_format: str = "1.") -> None:
    """블록을 list_item으로 변환."""
    runs = blk.runs[:] or (blk.list_item.runs if blk.list_item else [])
    if not runs and blk.list_item:
        runs = blk.list_item.runs
    blk.type = BlockType.LIST_ITEM
    blk.list_item = ListItem(
        runs=runs,
        depth=depth,
        bullet_marker=_BULLETS[min(depth, 4)] if not ordered else "",
        ordered=ordered,
        order_format=order_format,  # type: ignore[arg-type]
    )
    blk.runs = []


def _bullet_at_depth(depth: int) -> str:
    return _BULLETS[min(depth, 4)]


# ─────────────────────────────────────────────────────────────────────────────
# B1~B5 글머리 단계
# ─────────────────────────────────────────────────────────────────────────────

class _BulletAtDepth(Macro):
    """공통 베이스: 특정 깊이의 글머리."""

    depth: int = 0

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_blocks(ir, params):
            if blk.type in (BlockType.PARAGRAPH, BlockType.HEADING, BlockType.LIST_ITEM):
                _make_list_item(blk, self.depth, ordered=False)
        return ir


class B1_Bullet1(_BulletAtDepth):
    id = "B1"; category = MacroCategory.BLOCK; depth = 0
    name = "1단계 글머리 □"; description = "□ 글머리 + 들여쓰기 0pt"
    shortcut = {"win": "Ctrl+1", "mac": "⌘+1"}


class B2_Bullet2(_BulletAtDepth):
    id = "B2"; category = MacroCategory.BLOCK; depth = 1
    name = "2단계 글머리 ○"; description = "○ 글머리 + 들여쓰기 200pt"
    shortcut = {"win": "Ctrl+2", "mac": "⌘+2"}


class B3_Bullet3(_BulletAtDepth):
    id = "B3"; category = MacroCategory.BLOCK; depth = 2
    name = "3단계 글머리 ―"; description = "― 글머리 + 들여쓰기 400pt"
    shortcut = {"win": "Ctrl+3", "mac": "⌘+3"}


class B4_Bullet4(_BulletAtDepth):
    id = "B4"; category = MacroCategory.BLOCK; depth = 3
    name = "4단계 글머리 ※"; description = "※ 글머리 + 들여쓰기 600pt"
    shortcut = {"win": "Ctrl+4", "mac": "⌘+4"}


class B5_Bullet5(_BulletAtDepth):
    id = "B5"; category = MacroCategory.BLOCK; depth = 4
    name = "5단계 글머리 *"; description = "* 글머리 (보조용)"


# ─────────────────────────────────────────────────────────────────────────────
# B6~B8 번호 매기기
# ─────────────────────────────────────────────────────────────────────────────

class _NumberedBase(Macro):
    order_format: str = "1."

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        idx = 0
        for blk in get_selected_blocks(ir, params):
            if blk.type in (BlockType.PARAGRAPH, BlockType.HEADING, BlockType.LIST_ITEM):
                idx += 1
                _make_list_item(blk, 0, ordered=True, order_format=self.order_format)
                if blk.list_item:
                    blk.list_item.index = idx
        return ir


class B6_NumberArabic(_NumberedBase):
    id = "B6"; category = MacroCategory.BLOCK
    name = "번호 매기기 1."; description = "1. 2. 3. 자동 번호"
    order_format = "1."


class B7_NumberKorean(_NumberedBase):
    id = "B7"; category = MacroCategory.BLOCK
    name = "번호 매기기 가."; description = "가. 나. 다. 한국식 번호"
    order_format = "가."


class B8_NumberParen(_NumberedBase):
    id = "B8"; category = MacroCategory.BLOCK
    name = "번호 매기기 (1)"; description = "(1) (2) (3) 괄호 번호"
    order_format = "(1)"


# ─────────────────────────────────────────────────────────────────────────────
# B9~B10 들여쓰기
# ─────────────────────────────────────────────────────────────────────────────

class B9_IndentIncrease(Macro):
    id = "B9"; category = MacroCategory.BLOCK
    name = "들여쓰기 +2"; description = "한 단계 들여쓰기 + 글머리 자동 변환"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_blocks(ir, params):
            if blk.list_item:
                blk.list_item.depth = min(blk.list_item.depth + 1, 4)
                blk.list_item.bullet_marker = _bullet_at_depth(blk.list_item.depth)
        return ir


class B10_IndentDecrease(Macro):
    id = "B10"; category = MacroCategory.BLOCK
    name = "들여쓰기 -2"; description = "한 단계 내어쓰기 + 글머리 자동 변환"
    ai_powered = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_blocks(ir, params):
            if blk.list_item:
                blk.list_item.depth = max(0, blk.list_item.depth - 1)
                blk.list_item.bullet_marker = _bullet_at_depth(blk.list_item.depth)
        return ir


# ─────────────────────────────────────────────────────────────────────────────
# B11~B14 복사·잘라내기·붙임 (IR 외부 클립보드는 프론트가 관리, 여기선 메타 마킹)
# ─────────────────────────────────────────────────────────────────────────────

class B11_BlockCopy(Macro):
    id = "B11"; category = MacroCategory.BLOCK
    name = "블록 복사"; description = "선택 블록 클립보드에 복사"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        # 백엔드에서는 no-op (프론트가 처리). 매크로 로그만 남김.
        return ir


class B12_BlockCut(Macro):
    id = "B12"; category = MacroCategory.BLOCK
    name = "블록 잘라내기"; description = "선택 블록 잘라내기"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        ids = set(params.get("selected_block_ids") or [])
        ir.blocks = [b for b in ir.blocks if b.id not in ids]
        return ir


class B13_BlockPasteWithFormat(Macro):
    id = "B13"; category = MacroCategory.BLOCK
    name = "블록 붙임 (서식 유지)"; description = "서식 유지하고 붙여넣기"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        blocks_data = params.get("clipboard_blocks", [])
        anchor_id = params.get("anchor_block_id")
        idx = next((i for i, b in enumerate(ir.blocks) if b.id == anchor_id), len(ir.blocks))
        for off, bd in enumerate(blocks_data):
            try:
                blk = Block(**bd)
                blk.id = f"blk-{len(ir.blocks) + off + 1:04d}"
                ir.blocks.insert(idx + 1 + off, blk)
            except Exception:  # noqa: BLE001
                continue
        return ir


class B14_BlockPastePlain(Macro):
    id = "B14"; category = MacroCategory.BLOCK
    name = "블록 붙임 (평문)"; description = "서식 없이 평문 붙여넣기"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        text = str(params.get("plain_text", ""))
        if not text:
            return ir
        anchor_id = params.get("anchor_block_id")
        idx = next((i for i, b in enumerate(ir.blocks) if b.id == anchor_id), len(ir.blocks))
        for off, line in enumerate(text.splitlines() or [text]):
            blk = Block(
                id=f"blk-{len(ir.blocks) + off + 1:04d}",
                type=BlockType.PARAGRAPH,
                runs=[InlineRun(text=line)],
            )
            ir.blocks.insert(idx + 1 + off, blk)
        return ir


# ─────────────────────────────────────────────────────────────────────────────
# B15~B16 위·아래 이동
# ─────────────────────────────────────────────────────────────────────────────

class B15_MoveUp(Macro):
    id = "B15"; category = MacroCategory.BLOCK
    name = "단락 위로 이동"; description = "현재 단락을 위 단락과 교체"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        ids = set(params.get("selected_block_ids") or [])
        for i in range(1, len(ir.blocks)):
            if ir.blocks[i].id in ids:
                ir.blocks[i - 1], ir.blocks[i] = ir.blocks[i], ir.blocks[i - 1]
        return ir


class B16_MoveDown(Macro):
    id = "B16"; category = MacroCategory.BLOCK
    name = "단락 아래로 이동"; description = "현재 단락을 아래 단락과 교체"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        params = params or {}
        ids = set(params.get("selected_block_ids") or [])
        for i in range(len(ir.blocks) - 2, -1, -1):
            if ir.blocks[i].id in ids:
                ir.blocks[i + 1], ir.blocks[i] = ir.blocks[i], ir.blocks[i + 1]
        return ir


# ─────────────────────────────────────────────────────────────────────────────
# B17~B20 스타일 블록
# ─────────────────────────────────────────────────────────────────────────────

class B17_Quote(Macro):
    id = "B17"; category = MacroCategory.BLOCK
    name = "블록 인용"; description = "선택 블록을 인용문 스타일로"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_blocks(ir, params):
            blk.type = BlockType.QUOTE
        return ir


class B18_Code(Macro):
    id = "B18"; category = MacroCategory.BLOCK
    name = "코드 블록"; description = "선택 블록을 코드 블록 스타일로"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_blocks(ir, params):
            blk.type = BlockType.CODE
            for r in blk.runs:
                r.code = True
                r.font_family = "JetBrains Mono"
        return ir


class B19_Box(Macro):
    id = "B19"; category = MacroCategory.BLOCK
    name = "박스 (테두리)"; description = "선택 블록을 테두리 박스로 감싸기"

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        for blk in get_selected_blocks(ir, params):
            blk.type = BlockType.BOX
            blk.meta["border"] = "default"
        return ir


_WS_RE = re.compile(r"[ \t]+")


class B20_AutoClean(Macro):
    id = "B20"; category = MacroCategory.BLOCK
    name = "단락 자동 정리"; description = "빈 단락 정리 + 공백 정규화"
    ai_powered = True
    auto = True

    def apply(self, ir: DocumentIR, params: dict[str, Any] | None = None, **_: Any) -> DocumentIR:
        cleaned: list[Block] = []
        prev_empty = False
        for blk in ir.blocks:
            # 빈 paragraph 연속 제거
            is_empty = (
                blk.type == BlockType.PARAGRAPH
                and not any(r.text.strip() for r in blk.runs)
            )
            if is_empty and prev_empty:
                continue
            prev_empty = is_empty
            # 공백 정규화
            for r in blk.runs:
                r.text = _WS_RE.sub(" ", r.text)
            if blk.list_item:
                for r in blk.list_item.runs:
                    r.text = _WS_RE.sub(" ", r.text)
            cleaned.append(blk)
        ir.blocks = cleaned
        return ir


MACROS = [
    B1_Bullet1, B2_Bullet2, B3_Bullet3, B4_Bullet4, B5_Bullet5,
    B6_NumberArabic, B7_NumberKorean, B8_NumberParen,
    B9_IndentIncrease, B10_IndentDecrease,
    B11_BlockCopy, B12_BlockCut, B13_BlockPasteWithFormat, B14_BlockPastePlain,
    B15_MoveUp, B16_MoveDown,
    B17_Quote, B18_Code, B19_Box, B20_AutoClean,
]
