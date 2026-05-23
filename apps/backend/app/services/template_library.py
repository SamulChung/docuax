"""사용자 업로드 템플릿 저장소.

저장 구조:
  data/uploads/index.json           # 메타 인덱스
  data/uploads/<id>/source.<ext>    # 원본 파일
  data/uploads/<id>/content.md      # 추출된 마크다운

운영에서는 DB(SQLAlchemy) + S3로 교체. 현재는 단순 파일 시스템.
"""
from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)


class UploadedTemplate(BaseModel):
    id: str
    title: str
    description: str = ""
    filename: str  # 원본 파일명
    format: str  # docx | hwpx | hwp | pdf
    organization_id: str | None = None
    rag_indexed: bool = False
    warnings: list[str] = Field(default_factory=list)
    size_bytes: int = 0
    uploaded_at: float = 0.0
    # Phase 3 — 분류
    category: str = ""  # 공문 | 보고서 | 제안서 | 회의록 | 메모 | 기타 | ""
    tags: list[str] = Field(default_factory=list)
    # Phase 4 — 소유·공유
    owner_id: str = ""
    shared_with_org: bool = False


class UploadedTemplateDetail(UploadedTemplate):
    content: str


def _root() -> Path:
    return get_settings().storage_local_dir.parent / "uploads"


def _index_path() -> Path:
    return _root() / "index.json"


_lock = threading.Lock()


def _load_index() -> dict[str, dict[str, Any]]:
    p = _index_path()
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save_index(idx: dict[str, dict[str, Any]]) -> None:
    p = _index_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding="utf-8")


def store_upload(
    *,
    filename: str,
    content: bytes,
    extracted_markdown: str,
    extracted_title: str,
    file_format: str,
    description: str = "",
    organization_id: str | None = None,
    warnings: list[str] | None = None,
    category: str = "",
    tags: list[str] | None = None,
    owner_id: str = "",
    shared_with_org: bool = False,
) -> UploadedTemplate:
    """업로드된 파일을 영구 저장 + 메타 인덱스에 등록."""
    tid = uuid.uuid4().hex[:12]
    root = _root() / tid
    root.mkdir(parents=True, exist_ok=True)

    src_path = root / f"source.{file_format}"
    src_path.write_bytes(content)
    md_path = root / "content.md"
    md_path.write_text(extracted_markdown, encoding="utf-8")

    meta = UploadedTemplate(
        id=tid,
        title=extracted_title or filename,
        description=description,
        filename=filename,
        format=file_format,
        organization_id=organization_id,
        rag_indexed=False,
        warnings=warnings or [],
        size_bytes=len(content),
        uploaded_at=time.time(),
        category=category,
        tags=tags or [],
        owner_id=owner_id,
        shared_with_org=shared_with_org,
    )

    with _lock:
        idx = _load_index()
        idx[tid] = meta.model_dump()
        _save_index(idx)

    log.info("템플릿 업로드 저장", id=tid, format=file_format, size=len(content), owner=owner_id)
    return meta


def list_uploads(
    *,
    organization_id: str | None = None,
    owner_id: str | None = None,
    scope: str = "all",  # mine | shared | org | all
) -> list[UploadedTemplate]:
    """범위 필터링.

    - mine: owner_id 일치만
    - shared: owner ≠ me 이면서 같은 organization + shared_with_org=True
    - org: organization 내 전체 (내 것 + 공유된 동료 것)
    - all: 모든 항목 (관리자용)
    """
    idx = _load_index()
    items = [UploadedTemplate(**m) for m in idx.values()]

    if scope == "mine":
        if owner_id is None:
            items = []
        else:
            items = [it for it in items if it.owner_id == owner_id]
    elif scope == "shared":
        if organization_id is None:
            items = []
        else:
            items = [
                it for it in items
                if it.organization_id == organization_id
                and it.shared_with_org
                and (owner_id is None or it.owner_id != owner_id)
            ]
    elif scope == "org":
        if organization_id is None:
            items = []
        else:
            items = [
                it for it in items
                if it.organization_id == organization_id
                and (it.owner_id == owner_id or it.shared_with_org)
            ]
    elif scope == "all":
        if organization_id is not None:
            items = [it for it in items if it.organization_id == organization_id]

    return sorted(items, key=lambda x: x.uploaded_at, reverse=True)


def update_template_meta(
    tid: str,
    *,
    category: str | None = None,
    tags: list[str] | None = None,
    description: str | None = None,
    shared_with_org: bool | None = None,
) -> UploadedTemplate | None:
    with _lock:
        idx = _load_index()
        if tid not in idx:
            return None
        m = idx[tid]
        if category is not None:
            m["category"] = category
        if tags is not None:
            m["tags"] = tags
        if description is not None:
            m["description"] = description
        if shared_with_org is not None:
            m["shared_with_org"] = shared_with_org
        idx[tid] = m
        _save_index(idx)
        return UploadedTemplate(**m)


def get_upload_detail(tid: str) -> UploadedTemplateDetail | None:
    idx = _load_index()
    meta = idx.get(tid)
    if not meta:
        return None
    md_path = _root() / tid / "content.md"
    content = md_path.read_text(encoding="utf-8") if md_path.exists() else ""
    return UploadedTemplateDetail(**meta, content=content)


def mark_rag_indexed(tid: str) -> None:
    with _lock:
        idx = _load_index()
        if tid in idx:
            idx[tid]["rag_indexed"] = True
            _save_index(idx)


def delete_upload(tid: str) -> bool:
    with _lock:
        idx = _load_index()
        if tid not in idx:
            return False
        del idx[tid]
        _save_index(idx)
    # 파일 삭제
    import shutil
    folder = _root() / tid
    if folder.exists():
        shutil.rmtree(folder, ignore_errors=True)
    return True
