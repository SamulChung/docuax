"""문서 보관함 CRUD — 사용자 소유 문서의 저장·목록·열기·삭제.

기존 Document 모델(tables.py)을 재사용한다. 소유권: 본인 문서만 접근,
타인 문서는 존재 여부를 숨기기 위해 404.
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db import get_db
from app.models.tables import Document, User

router = APIRouter()

MAX_SOURCE_BYTES = 2 * 1024 * 1024  # 2MB


class DocumentCreate(BaseModel):
    title: str = Field(default="", max_length=500)
    source_md: str = ""


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    source_md: str | None = None


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    source_md: str
    created_at: datetime
    updated_at: datetime


class DocumentListItem(BaseModel):
    id: str
    title: str
    preview: str
    updated_at: datetime


def _check_size(source_md: str | None) -> None:
    if source_md is not None and len(source_md.encode("utf-8")) > MAX_SOURCE_BYTES:
        raise HTTPException(status_code=413, detail="문서가 2MB를 초과합니다")


async def _owned(db: AsyncSession, user: User, doc_id: str) -> Document:
    doc = (
        await db.execute(
            select(Document).where(Document.id == doc_id, Document.user_id == user.id)
        )
    ).scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="document not found")
    return doc


@router.get("/documents", response_model=list[DocumentListItem])
async def list_documents(
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """내 문서 목록 — updated_at 내림차순, preview(앞 120자)만 표시."""
    rows = (
        await db.execute(
            select(Document)
            .where(Document.user_id == user.id)
            .order_by(Document.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return [
        DocumentListItem(
            id=d.id, title=d.title, preview=d.source_md[:120],
            updated_at=d.updated_at,
        )
        for d in rows
    ]


@router.post("/documents", response_model=DocumentOut)
async def create_document(
    body: DocumentCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """새 문서 저장 — 2MB 초과 시 413."""
    _check_size(body.source_md)
    doc = Document(user_id=user.id, title=body.title, source_md=body.source_md)
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return DocumentOut.model_validate(doc)


@router.get("/documents/{doc_id}", response_model=DocumentOut)
async def get_document(
    doc_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """문서 열기 — 본인 문서만, 없거나 타인 소유면 404."""
    return DocumentOut.model_validate(await _owned(db, user, doc_id))


@router.put("/documents/{doc_id}", response_model=DocumentOut)
async def update_document(
    doc_id: str,
    body: DocumentUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """문서 수정 — 전달된 필드(title/source_md)만 갱신."""
    _check_size(body.source_md)
    doc = await _owned(db, user, doc_id)
    if body.title is not None:
        doc.title = body.title
    if body.source_md is not None:
        doc.source_md = body.source_md
    await db.commit()
    await db.refresh(doc)
    return DocumentOut.model_validate(doc)


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """문서 삭제 — 본인 문서만."""
    doc = await _owned(db, user, doc_id)
    await db.delete(doc)
    await db.commit()
    return {"ok": True, "deleted_id": doc_id}
