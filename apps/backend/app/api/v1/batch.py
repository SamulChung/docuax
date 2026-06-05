"""배치 문서 변환 API — 다수 파일을 ZIP으로 일괄 변환."""
from __future__ import annotations

import io
import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_optional
from app.core.logging import get_logger
from app.db import get_db
from app.models import User
from app.pipeline import PersonaMode
from app.pipeline.runner import ConversionPipeline, PipelineContext
from app.renderers import get_renderer

log = get_logger(__name__)
router = APIRouter()


async def _render_to_bytes(
    source: str,
    output_format: str,
    db: AsyncSession,
    user: User | None,
) -> bytes:
    """마크다운 소스를 지정 포맷 바이트로 변환."""
    pipeline = ConversionPipeline()
    ctx = PipelineContext(
        source=source,
        persona_mode=PersonaMode.worker,
        skip_analyze=True,
        skip_review=True,
    )
    result = await pipeline.run(ctx)
    ir = result.ir

    renderer = get_renderer(output_format)

    with tempfile.TemporaryDirectory() as tmp_dir:
        out_path = Path(tmp_dir) / f"document{renderer.extension}"
        rendered = renderer.render(ir, out_path)
        return rendered.read_bytes()


@router.post("/batch/convert")
async def batch_convert(
    files: list[UploadFile] = File(...),
    output_format: str = Form("hwpx"),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
) -> StreamingResponse:
    """여러 마크다운 파일을 지정 형식으로 일괄 변환 후 ZIP 반환."""
    if output_format not in ("hwpx", "docx", "pdf"):
        raise HTTPException(status_code=400, detail="output_format은 hwpx/docx/pdf 중 하나")
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="최대 20개 파일까지 가능합니다")
    if len(files) == 0:
        raise HTTPException(status_code=400, detail="파일이 없습니다")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            try:
                content = (await f.read()).decode("utf-8", errors="replace")
                stem = f.filename.rsplit(".", 1)[0] if f.filename else "document"
                result_bytes = await _render_to_bytes(content, output_format, db, user)
                zf.writestr(f"{stem}.{output_format}", result_bytes)
                log.info("배치 변환 성공", filename=f.filename, output_format=output_format)
            except Exception as e:  # noqa: BLE001
                log.warning("배치 변환 실패", filename=f.filename, error=str(e))
                error_name = f"{f.filename}.error.txt" if f.filename else "error.txt"
                zf.writestr(error_name, str(e))

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="docuax_batch.zip"'},
    )
