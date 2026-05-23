from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.renderers import get_renderer
from app.services.document_cache import get_document_cache

router = APIRouter()


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

    return FileResponse(
        path=str(rendered),
        media_type=renderer.mime,
        filename=rendered.name,
    )
