"""단계 7 — 미리보기 페이로드.

프론트엔드 미리보기·검토 점프용 JSON. 블록별로:
  - plain text (검토 점프용)
  - inline runs (bold/italic/color/font_size — 매크로 효과 시각화용)
  - 표 셀 (align/background/border — 표 매크로 효과)
  - 검토 태그
"""
from __future__ import annotations

from typing import Any

from app.core.logging import get_logger
from app.pipeline.ir import BlockType, DocumentIR, InlineRun, TableCell
from app.services.visuals import (
    render_chart_to_png,
    render_diagram_to_png,
    render_equation_to_png,
)
from app.services.visuals.cache import resolve_image_to_path

log = get_logger(__name__)


def _png_to_static_url(p) -> str:
    """캐시된 PNG 경로 → 정적 URL (/visuals/<filename>).

    main.py 의 StaticFiles 마운트가 var/visuals/ 를 /visuals/ 로 노출.
    """
    if p is None:
        return ""
    try:
        from pathlib import Path
        return f"/visuals/{Path(p).name}"
    except Exception:  # noqa: BLE001
        return ""


def _image_data_to_url(img) -> str:
    """ImageData → 표시용 URL. http(s)/data: 는 그대로, 로컬은 /static 경유."""
    if img.url and img.url.startswith(("http://", "https://", "data:")):
        return img.url
    if img.data_b64:
        return img.data_b64 if img.data_b64.startswith("data:") else f"data:{img.mime};base64,{img.data_b64}"
    # 로컬 파일을 materialize → /visuals 또는 /static 경로 추정
    path = resolve_image_to_path(img)
    if not path:
        return img.src or ""
    return _png_to_static_url(path)


def _run_to_dict(r: InlineRun) -> dict[str, Any]:
    """InlineRun → 프론트가 시각화에 쓸 모든 속성."""
    out: dict[str, Any] = {"text": r.text}
    if r.bold: out["bold"] = True
    if r.italic: out["italic"] = True
    if r.underline: out["underline"] = True
    if r.strikethrough: out["strikethrough"] = True
    if r.superscript: out["superscript"] = True
    if r.subscript: out["subscript"] = True
    if r.code: out["code"] = True
    if r.color: out["color"] = r.color
    if r.background: out["background"] = r.background
    if r.font_family: out["font_family"] = r.font_family
    if r.font_size: out["font_size"] = r.font_size
    if r.link: out["link"] = r.link
    return out


def _cell_to_dict(c: TableCell) -> dict[str, Any]:
    """TableCell → 시각화 속성."""
    return {
        "runs": [_run_to_dict(r) for r in c.runs],
        "colspan": c.colspan,
        "rowspan": c.rowspan,
        "align": c.align,
        "background": c.background,
        "border": c.border,
        "rotate": c.rotate,
    }


def build_preview_payload(ir: DocumentIR) -> dict[str, Any]:
    # 블록별 시작 오프셋 계산
    plain = ir.plain_text()
    offsets: list[tuple[str, int, int]] = []  # (block_id, start, end)
    cursor = 0
    for b in ir.blocks:
        text = b.to_plain_text()
        offsets.append((b.id, cursor, cursor + len(text)))
        cursor += len(text) + 1  # +1 for \n separator

    block_tags: dict[str, list[dict[str, Any]]] = {b.id: [] for b in ir.blocks}
    for tag in ir.review_tags:
        # 어느 블록에 속하는지 찾기
        for bid, s, e in offsets:
            if s <= tag.span_start < e:
                # 블록 내부 상대 오프셋
                block_tags[bid].append(
                    {
                        "rel_start": tag.span_start - s,
                        "rel_end": min(tag.span_end - s, e - s),
                        "color": tag.color,
                        "reason": tag.reason,
                        "confidence": tag.confidence,
                    }
                )
                break

    # 전체 검토 태그 목록 (블록 매핑 없이도 점프할 수 있도록)
    all_tags = [
        {
            "global_start": t.span_start,
            "global_end": t.span_end,
            "color": t.color,
            "reason": t.reason,
            "confidence": t.confidence,
            # 어느 블록에 속하는지 (점프 시 해당 블록으로 스크롤)
            "block_id": next((bid for bid, s, e in offsets if s <= t.span_start < e), None),
        }
        for t in ir.review_tags
    ]
    # 최신 macro_log (점프 결과 포함)
    last_log = ir.macro_log[-1] if ir.macro_log else None

    blocks_payload = []
    for b in ir.blocks:
        block_data: dict[str, Any] = {
            "id": b.id,
            "type": b.type.value,
            "text": b.to_plain_text(),
            "heading_level": b.heading_level,
            "tags": block_tags.get(b.id, []),
        }
        # 블록 타입별 추가 속성 — 매크로 효과 시각화용
        if b.type == BlockType.TABLE and b.table:
            block_data["table"] = {
                "rows": [[_cell_to_dict(c) for c in row] for row in b.table.rows],
                "header_row": b.table.header_row,
                "border_style": b.table.border_style,
                "column_widths": b.table.column_widths,
                "align": b.table.align,
            }
        elif b.type == BlockType.LIST_ITEM and b.list_item:
            block_data["list_item"] = {
                "depth": b.list_item.depth,
                "bullet_marker": b.list_item.bullet_marker,
                "ordered": b.list_item.ordered,
                "index": b.list_item.index,
                "order_format": b.list_item.order_format,
                "runs": [_run_to_dict(r) for r in b.list_item.runs],
            }
        elif b.type == BlockType.IMAGE and b.image:
            block_data["image"] = {
                "src": b.image.src,
                "url": b.image.url,
                "alt": b.image.alt,
                "caption": b.image.caption,
                "align": b.image.align,
                "width": b.image.width,
                "height": b.image.height,
                "width_pt": b.image.width_pt,
                "image_url": _image_data_to_url(b.image),
            }
        elif b.type == BlockType.DIAGRAM and b.diagram:
            png_url = ""
            try:
                png_path = render_diagram_to_png(
                    engine=b.diagram.engine, source=b.diagram.source,
                )
                png_url = _png_to_static_url(png_path) if png_path else ""
            except Exception as e:  # noqa: BLE001
                log.warning("preview 다이어그램 렌더 실패", block=b.id, error=str(e))
            block_data["diagram"] = {
                "engine": b.diagram.engine,
                "source": b.diagram.source,
                "caption": b.diagram.caption,
                "align": b.diagram.align,
                "width": b.diagram.width,
                "height": b.diagram.height,
                "image_url": png_url,
            }
        elif b.type == BlockType.CHART and b.chart:
            png_url = ""
            try:
                png_path = render_chart_to_png(b.chart.spec)
                png_url = _png_to_static_url(png_path) if png_path else ""
            except Exception as e:  # noqa: BLE001
                log.warning("preview 차트 렌더 실패", block=b.id, error=str(e))
            block_data["chart"] = {
                "spec": b.chart.spec,
                "caption": b.chart.caption,
                "align": b.chart.align,
                "width": b.chart.width,
                "height": b.chart.height,
                "image_url": png_url,
            }
        elif b.type == BlockType.EQUATION and b.equation:
            png_url = ""
            try:
                png_path = render_equation_to_png(
                    latex=b.equation.latex, display=b.equation.display,
                )
                png_url = _png_to_static_url(png_path) if png_path else ""
            except Exception as e:  # noqa: BLE001
                log.warning("preview 수식 렌더 실패", block=b.id, error=str(e))
            block_data["equation"] = {
                "latex": b.equation.latex,
                "display": b.equation.display,
                "align": b.equation.align,
                "width": b.equation.width,
                "image_url": png_url,
            }
        else:
            block_data["runs"] = [_run_to_dict(r) for r in b.runs]
        blocks_payload.append(block_data)

    # 표지(cover) 정보 — 프론트엔드 PreviewPane에서 별도 페이지로 시각화
    cover_payload = None
    if ir.cover:
        cover_payload = {
            "title": ir.cover.title,
            "subtitle": ir.cover.subtitle,
            "author": ir.cover.author,
            "organization": ir.cover.organization,
            "department": ir.cover.department,
            "date": ir.cover.date,
            "document_number": ir.cover.document_number,
            "classification": ir.cover.classification,
            "logo_path": ir.cover.logo_path,
            "template": ir.cover.template,
            "accent_color": ir.cover.accent_color,
        }

    return {
        "document_id": ir.document_id,
        "title": ir.title,
        "document_class": ir.document_class.value,
        "template_applied": ir.template_applied,
        "persona_mode": ir.persona_mode.value,
        "cover": cover_payload,
        "plain_text": plain,
        "blocks": blocks_payload,
        "review_counts": {
            "red": sum(1 for t in ir.review_tags if t.color == "red"),
            "blue": sum(1 for t in ir.review_tags if t.color == "blue"),
            "yellow": sum(1 for t in ir.review_tags if t.color == "yellow"),
        },
        "all_tags": all_tags,
        "last_macro_log": last_log,
        "model_version": ir.model_version,
        "latency_ms": ir.latency_ms,
    }
