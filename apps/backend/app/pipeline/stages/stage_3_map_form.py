"""단계 3 — 양식 매핑.

한국 공문 표준에 따라 헤딩·리스트 글머리·서식을 변환.
4단계 글머리: # → □, ## → ○, ### → ―, #### → ※

문서 유형별 기본 양식 ID:
  공문 → "default-gongmun"
  보고서 → "default-report"
  제안서 → "default-proposal"
  그 외 → "default-general"

RAG로 학습된 기관 양식이 있으면 organization_id 기반으로 추가 조정 (Stage 5에서 매크로로).
"""
from __future__ import annotations

from app.pipeline.ir import BlockType, DocumentIR, InlineRun, ListItem
from app.providers.llm.base import DocumentClass


_GONGMUN_BULLETS = ["□", "○", "―", "※", "*"]
_GONGMUN_HEADING_FONT_SIZES = {1: 16.0, 2: 14.0, 3: 13.0, 4: 12.0, 5: 11.0, 6: 11.0}
_DEFAULT_BODY_FONT_SIZE = 11.0


def _select_template(cls: DocumentClass) -> str:
    return {
        DocumentClass.GONGMUN: "default-gongmun",
        DocumentClass.REPORT: "default-report",
        DocumentClass.PROPOSAL: "default-proposal",
        DocumentClass.MEMO: "default-memo",
        DocumentClass.MINUTES: "default-minutes",
        DocumentClass.GENERAL: "default-general",
    }[cls]


def apply_form_mapping(ir: DocumentIR) -> DocumentIR:
    template_id = _select_template(ir.document_class)
    ir.template_applied = template_id

    for blk in ir.blocks:
        # 헤딩 처리 — 공문이라도 H1·H2는 큰 헤딩으로 보존 (시각 강조 유지)
        if blk.type == BlockType.HEADING and blk.heading_level >= 1:
            level = min(blk.heading_level, 4)
            marker = _GONGMUN_BULLETS[level - 1]

            # 공문이고 H3+ 만 글머리로 강등 (H1·H2는 헤딩 유지)
            if template_id.startswith("default-gongmun") and blk.heading_level >= 3:
                blk.type = BlockType.LIST_ITEM
                # depth 계산 — H3은 depth=0 (□), H4 → depth=1 (○) ...
                bullet_depth = blk.heading_level - 3
                bullet_depth = min(bullet_depth, 4)
                blk.list_item = ListItem(
                    runs=blk.runs,
                    depth=bullet_depth,
                    bullet_marker=_GONGMUN_BULLETS[bullet_depth],
                    ordered=False,
                )
                blk.runs = []
            else:
                # 헤딩 유지 — 폰트 크기 표준 + bold
                size = _GONGMUN_HEADING_FONT_SIZES.get(blk.heading_level, 12.0)
                for r in blk.runs:
                    r.font_size = r.font_size or size
                    r.bold = True

        # 본문 폰트 크기 기본값
        elif blk.type == BlockType.PARAGRAPH:
            for r in blk.runs:
                r.font_size = r.font_size or _DEFAULT_BODY_FONT_SIZE
                r.font_family = r.font_family or "맑은 고딕"

        # 리스트 항목 글머리 재매핑 (공문 양식)
        elif blk.type == BlockType.LIST_ITEM and blk.list_item:
            if template_id.startswith("default-gongmun"):
                d = min(blk.list_item.depth, 4)
                blk.list_item.bullet_marker = _GONGMUN_BULLETS[d]
            for r in blk.list_item.runs:
                r.font_size = r.font_size or _DEFAULT_BODY_FONT_SIZE

    return ir
