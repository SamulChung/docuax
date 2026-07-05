from __future__ import annotations

import json
import urllib.parse

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse

from app.core.config import get_settings
from app.renderers import get_renderer
from app.renderers.pdf_renderer import render_ir_to_html
from app.services.document_cache import get_document_cache

router = APIRouter()

# X-Docuax-Warnings 헤더 상한 — 프록시(nginx proxy_buffer_size 등)가 거대 헤더를
# 거부하지 않도록 항목 수·인코딩 후 바이트 수를 모두 제한한다.
_WARNINGS_HEADER_MAX_ITEMS = 20
_WARNINGS_HEADER_MAX_BYTES = 3800  # URL 인코딩 후 길이 기준 (< 4KB)


def _warnings_header_value(warnings: list[str]) -> str:
    """강등 경고 목록 → 헤더 값 (JSON 배열 → URL 인코딩, latin-1 안전).

    형태: JSON 문자열 배열. 상한을 넘으면 앞에서부터 담고 마지막 요소를
    "…외 N건" 요약으로 대체한다 — 프론트는 그대로 목록 표시하면 된다.
    """
    def encode(items: list[str]) -> str:
        return urllib.parse.quote(json.dumps(items, ensure_ascii=False))

    shown = list(warnings[:_WARNINGS_HEADER_MAX_ITEMS])
    while shown:
        omitted = len(warnings) - len(shown)
        items = shown + ([f"…외 {omitted}건"] if omitted else [])
        value = encode(items)
        if len(value) <= _WARNINGS_HEADER_MAX_BYTES:
            return value
        shown.pop()
    return encode([f"…외 {len(warnings)}건"])


# ── 클립보드용 HTML / plain text ────────────────────────────────────────
# specific 라우트는 catch-all `/render/{document_id}/{fmt}` 위에 등록.
# (FastAPI 는 등록 순서대로 매치)

@router.get(
    "/render/{document_id}/html",
    response_class=HTMLResponse,
    summary="변환결과를 클립보드용 HTML 로 반환",
)
async def render_html(
    document_id: str,
    block_ids: str = Query(
        "",
        description="콤마구분 블록 ID 목록 (선택). 미지정 시 전체 문서.",
    ),
) -> HTMLResponse:
    """변환결과 → HTML 문자열 (Word·한컴 클립보드 붙여넣기용).

    프론트엔드가 이 응답을 받아 `text/html` 클립보드에 쓰면,
    사용자가 Word/한컴/구글독스에 Ctrl+V 시 표·헤딩·글머리 서식 유지.
    """
    cache = get_document_cache()
    ir = cache.get(document_id)
    if ir is None:
        raise HTTPException(status_code=404, detail="document not found in cache")
    selected: list[str] = (
        [b.strip() for b in block_ids.split(",") if b.strip()] if block_ids else []
    )
    html_text = render_ir_to_html(ir, selected_block_ids=selected or None)
    return HTMLResponse(content=html_text, media_type="text/html; charset=utf-8")


@router.get(
    "/render/{document_id}/text",
    response_class=PlainTextResponse,
    summary="변환결과를 클립보드용 plain text 로 반환",
)
async def render_text(
    document_id: str,
    block_ids: str = Query("", description="콤마구분 블록 ID (선택)"),
) -> PlainTextResponse:
    """변환결과 → plain text (서식 없는 텍스트만)."""
    cache = get_document_cache()
    ir = cache.get(document_id)
    if ir is None:
        raise HTTPException(status_code=404, detail="document not found in cache")
    selected: set[str] = (
        {b.strip() for b in block_ids.split(",") if b.strip()} if block_ids else set()
    )
    if selected:
        text = "\n\n".join(b.to_plain_text() for b in ir.blocks if b.id in selected)
    else:
        parts: list[str] = []
        if ir.title and (not ir.cover or not ir.cover.title):
            parts.append(ir.title)
        if ir.cover and ir.cover.title:
            parts.append(ir.cover.title)
            if ir.cover.subtitle:
                parts.append(ir.cover.subtitle)
        for b in ir.blocks:
            parts.append(b.to_plain_text())
        text = "\n\n".join(parts)
    return PlainTextResponse(content=text, media_type="text/plain; charset=utf-8")


@router.get("/render/{document_id}/{fmt}")
async def render_download(document_id: str, fmt: str) -> FileResponse:
    cache = get_document_cache()
    ir = cache.get(document_id)
    if ir is None:
        raise HTTPException(status_code=404, detail="document not found in cache")

    try:
        renderer = get_renderer(fmt)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    settings = get_settings()
    out_dir = settings.storage_local_dir / document_id
    out_dir.mkdir(parents=True, exist_ok=True)
    filename = (ir.title or "document").strip() or "document"
    safe_name = "".join(c if c.isalnum() or c in " ._-가나다라마바사아자차카타파하" else "_" for c in filename)[:120]
    out_path = out_dir / f"{safe_name}{renderer.extension}"

    try:
        rendered = renderer.render(ir, out_path)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"render failed: {e}") from e

    # 강등 경고 노출 (설계문서 §3.5) — UI가 "HWPX 사용 권장" 안내를 띄우는 데이터 소스.
    # 프론트는 JSON.parse(decodeURIComponent(header))로 복원. 상한 처리(…외 N건)는
    # _warnings_header_value 참고.
    headers: dict[str, str] = {}
    warnings = getattr(renderer, "warnings", None)
    if warnings:
        headers["X-Docuax-Warnings"] = _warnings_header_value(list(warnings))

    return FileResponse(
        path=str(rendered),
        media_type=renderer.mime,
        filename=rendered.name,
        headers=headers or None,
    )
