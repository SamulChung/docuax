"""사용자 양식 업로드 API.

엔드포인트:
  POST   /uploads/template               회사 양식 파일 업로드 + 텍스트 추출
  GET    /uploads/templates              내 업로드 / 조직 공유 목록 (scope)
  GET    /uploads/templates/{id}         상세 (마크다운 본문 포함)
  PATCH  /uploads/templates/{id}         카테고리·태그·설명·공유 수정
  DELETE /uploads/templates/{id}         삭제
  POST   /uploads/templates/{id}/index   RAG에 인덱싱
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.rag import get_template_store
from app.services.document_extractor import UnsupportedFormatError, extract_document
from app.services.template_library import (
    UploadedTemplate,
    UploadedTemplateDetail,
    delete_upload,
    get_upload_detail,
    list_uploads,
    mark_rag_indexed,
    store_upload,
    update_template_meta,
)

router = APIRouter()
log = get_logger(__name__)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_FORMATS = {".docx", ".hwpx", ".hwp", ".pdf", ".html", ".htm", ".md"}
VALID_CATEGORIES = {"", "공문", "보고서", "제안서", "회의록", "메모", "사업기획", "기타"}

# 이미지 업로드 — 에디터 본문 삽입용
ALLOWED_IMAGE_FORMATS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024
IMAGE_MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}


class ImageUploadResponse(BaseModel):
    url: str  # 본문에 삽입할 URL (서버 정적 경로 또는 data URL)
    filename: str
    size: int
    mime: str
    markdown: str  # 그대로 에디터에 붙여넣을 마크다운 (![alt](url))


class UploadResponse(BaseModel):
    template: UploadedTemplate
    extracted_preview: str


class TemplateUpdate(BaseModel):
    category: str | None = Field(None, description="공문/보고서/제안서/회의록/메모/기타 또는 빈 문자열")
    tags: list[str] | None = None
    description: str | None = None
    shared_with_org: bool | None = None


@router.post("/uploads/template", response_model=UploadResponse)
async def upload_template(
    file: UploadFile = File(...),
    description: str = Form(""),
    organization_id: str | None = Form(None),
    auto_index_rag: bool = Form(False),
    category: str = Form(""),
    tags: str = Form(""),
    shared_with_org: bool = Form(False),
    x_owner_id: str | None = Header(None, alias="X-Owner-Id"),
) -> UploadResponse:
    """파일 업로드 → 마크다운 추출 → 저장.

    소유자 식별: X-Owner-Id 헤더 (프론트는 localStorage UUID 사용). 미지정 시 'anonymous'.
    """
    filename = file.filename or "unnamed"
    from pathlib import Path
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"지원하지 않는 포맷: {suffix}. 허용: {', '.join(sorted(ALLOWED_FORMATS))}",
        )
    if category and category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"잘못된 카테고리: {category}. 허용: {', '.join(sorted(VALID_CATEGORIES))}",
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="빈 파일")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"파일이 너무 큽니다 ({len(content) / 1e6:.1f}MB). 최대 {MAX_UPLOAD_BYTES / 1e6:.0f}MB",
        )

    try:
        result = extract_document(filename, content)
    except UnsupportedFormatError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        log.exception("문서 추출 예외", filename=filename)
        raise HTTPException(status_code=500, detail=f"추출 실패: {e}") from e

    tag_list = [t.strip() for t in (tags or "").split(",") if t.strip()][:10]
    template = store_upload(
        filename=filename,
        content=content,
        extracted_markdown=result.markdown,
        extracted_title=result.title,
        file_format=result.format or suffix.lstrip("."),
        description=description,
        organization_id=organization_id,
        warnings=result.warnings,
        category=category,
        tags=tag_list,
        owner_id=x_owner_id or "anonymous",
        shared_with_org=shared_with_org,
    )

    if auto_index_rag and organization_id and result.markdown.strip():
        try:
            store = get_template_store()
            await store.index_document(
                organization_id=organization_id,
                document_id=template.id,
                title=template.title,
                content=result.markdown,
                metadata={"format": template.format, "filename": filename, "category": category},
            )
            mark_rag_indexed(template.id)
            template.rag_indexed = True
        except Exception as e:  # noqa: BLE001
            log.warning("RAG 인덱싱 실패", id=template.id, error=str(e))
            template.warnings.append(f"RAG 인덱싱 실패: {e}")

    preview = result.markdown[:500] + ("…" if len(result.markdown) > 500 else "")
    return UploadResponse(template=template, extracted_preview=preview)


@router.get("/uploads/templates", response_model=list[UploadedTemplate])
async def list_my_templates(
    organization_id: str | None = None,
    scope: Literal["mine", "shared", "org", "all"] = "all",
    x_owner_id: str | None = Header(None, alias="X-Owner-Id"),
) -> list[UploadedTemplate]:
    return list_uploads(
        organization_id=organization_id,
        owner_id=x_owner_id,
        scope=scope,
    )


@router.get("/uploads/templates/{template_id}", response_model=UploadedTemplateDetail)
async def get_template(template_id: str) -> UploadedTemplateDetail:
    detail = get_upload_detail(template_id)
    if not detail:
        raise HTTPException(status_code=404, detail="템플릿 없음")
    return detail


@router.patch("/uploads/templates/{template_id}", response_model=UploadedTemplate)
async def patch_template(
    template_id: str,
    update: TemplateUpdate,
    x_owner_id: str | None = Header(None, alias="X-Owner-Id"),
) -> UploadedTemplate:
    existing = get_upload_detail(template_id)
    if not existing:
        raise HTTPException(status_code=404, detail="템플릿 없음")
    if existing.owner_id and x_owner_id and existing.owner_id != x_owner_id:
        raise HTTPException(status_code=403, detail="소유자만 수정 가능")
    if update.category is not None and update.category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"잘못된 카테고리: {update.category}")
    updated = update_template_meta(
        template_id,
        category=update.category,
        tags=update.tags,
        description=update.description,
        shared_with_org=update.shared_with_org,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="템플릿 없음")
    return updated


@router.delete("/uploads/templates/{template_id}")
async def remove_template(
    template_id: str,
    x_owner_id: str | None = Header(None, alias="X-Owner-Id"),
) -> dict:
    existing = get_upload_detail(template_id)
    if not existing:
        raise HTTPException(status_code=404, detail="템플릿 없음")
    if existing.owner_id and x_owner_id and existing.owner_id != x_owner_id:
        raise HTTPException(status_code=403, detail="소유자만 삭제 가능")
    ok = delete_upload(template_id)
    if not ok:
        raise HTTPException(status_code=404, detail="템플릿 없음")
    return {"ok": True, "deleted_id": template_id}


@router.post("/uploads/image", response_model=ImageUploadResponse)
async def upload_image(
    file: UploadFile = File(...),
    alt: str = Form(""),
    caption: str = Form(""),
    x_owner_id: str | None = Header(None, alias="X-Owner-Id"),
) -> ImageUploadResponse:
    """에디터 이미지 업로드 — 본문 삽입용.

    정적 디렉토리 var/uploads/images/<uuid>.<ext> 에 저장 후
    /static/images/<uuid>.<ext> URL 로 응답.
    프론트는 응답의 markdown 필드를 그대로 에디터에 삽입.
    """
    from pathlib import Path as _P
    import uuid as _uuid

    filename = file.filename or "image.png"
    suffix = _P(filename).suffix.lower()
    if suffix not in ALLOWED_IMAGE_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"지원하지 않는 이미지 포맷: {suffix}. 허용: {', '.join(sorted(ALLOWED_IMAGE_FORMATS))}",
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="빈 파일")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"이미지가 너무 큽니다 ({len(content) / 1e6:.1f}MB). 최대 {MAX_IMAGE_BYTES / 1e6:.0f}MB",
        )

    # 정적 디렉토리에 저장 — main.py 가 /static 으로 마운트
    upload_root = _P("var/uploads/images")
    upload_root.mkdir(parents=True, exist_ok=True)
    image_id = _uuid.uuid4().hex[:16]
    out_path = upload_root / f"{image_id}{suffix}"
    out_path.write_bytes(content)

    # 응답 URL — 상대 경로 (프론트가 API_BASE 기준으로 처리)
    url = f"/static/images/{image_id}{suffix}"
    alt_text = alt or _P(filename).stem
    caption_part = f' "{caption}"' if caption else ""
    # 마크다운 — alt 에 |width=60% align=center 자동 추가로 사용자가 쉽게 수정 가능
    markdown = f"![{alt_text}|width=60% align=center]({url}{caption_part})"

    log.info(
        "이미지 업로드", filename=filename, size=len(content),
        owner=x_owner_id or "anonymous", saved=str(out_path),
    )
    return ImageUploadResponse(
        url=url,
        filename=filename,
        size=len(content),
        mime=IMAGE_MIME_BY_EXT.get(suffix, "application/octet-stream"),
        markdown=markdown,
    )


@router.post("/uploads/templates/{template_id}/index")
async def index_template_to_rag(template_id: str, organization_id: str) -> dict:
    detail = get_upload_detail(template_id)
    if not detail:
        raise HTTPException(status_code=404, detail="템플릿 없음")
    if not detail.content.strip():
        raise HTTPException(status_code=400, detail="추출된 본문이 없습니다")
    store = get_template_store()
    chunks = await store.index_document(
        organization_id=organization_id,
        document_id=template_id,
        title=detail.title,
        content=detail.content,
        metadata={"format": detail.format, "filename": detail.filename, "category": detail.category},
    )
    mark_rag_indexed(template_id)
    return {"ok": True, "chunks_indexed": chunks, "organization_id": organization_id}
