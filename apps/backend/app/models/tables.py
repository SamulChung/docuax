"""DB 테이블 정의 — PRD 6.1."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    plan: Mapped[str] = mapped_column(String(32), default="free")  # free | pro | team | enterprise
    persona_mode: Mapped[str] = mapped_column(String(16), default="worker")  # worker | heavy
    organization_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("organizations.id"), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), default="")
    # ISMS-P 옵트인 학습 — 기본 거부 (사용자가 명시적으로 동의해야 학습)
    opt_in_training: Mapped[bool] = mapped_column(Boolean, default=False)
    opt_in_marketing: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    google_id: Mapped[str | None] = mapped_column(String(120), nullable=True, unique=True, index=True)

    organization: Mapped[Organization | None] = relationship(back_populates="users")
    documents: Mapped[list[Document]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200))
    sso_config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    on_premise: Mapped[bool] = mapped_column(Boolean, default=False)
    monthly_doc_quota: Mapped[int] = mapped_column(Integer, default=10000)
    learned_docs_count: Mapped[int] = mapped_column(Integer, default=0)
    custom_template_path: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    users: Mapped[list[User]] = relationship(back_populates="organization")
    templates: Mapped[list[LearnedTemplate]] = relationship(back_populates="organization", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(500), default="")
    source_md: Mapped[str] = mapped_column(Text, default="")
    output_docx_path: Mapped[str] = mapped_column(String(500), default="")
    output_hwpx_path: Mapped[str] = mapped_column(String(500), default="")
    output_pdf_path: Mapped[str] = mapped_column(String(500), default="")
    document_class: Mapped[str] = mapped_column(String(32), default="일반")
    status: Mapped[str] = mapped_column(String(32), default="draft")  # draft | converted | finalized
    persona_mode: Mapped[str] = mapped_column(String(16), default="worker")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    user: Mapped[User] = relationship(back_populates="documents")
    runs: Mapped[list[ConversionRun]] = relationship(back_populates="document", cascade="all, delete-orphan")
    macros: Mapped[list[MacroLog]] = relationship(back_populates="document", cascade="all, delete-orphan")


class ConversionRun(Base):
    __tablename__ = "conversion_runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    document_id: Mapped[str] = mapped_column(String(32), ForeignKey("documents.id"))
    model_version: Mapped[str] = mapped_column(String(200))  # provider:model:hash
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0)
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    persona_mode: Mapped[str] = mapped_column(String(16), default="worker")
    review_tags: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)  # {"red":..., "blue":..., "yellow":...}
    timings_ms: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)  # 단계별 ms
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    document: Mapped[Document] = relationship(back_populates="runs")


class MacroLog(Base):
    __tablename__ = "macro_logs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    document_id: Mapped[str] = mapped_column(String(32), ForeignKey("documents.id"))
    user_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("users.id"), nullable=True)
    macro_id: Mapped[str] = mapped_column(String(8), index=True)  # T1~P5
    params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    ai_assisted: Mapped[bool] = mapped_column(Boolean, default=False)
    persona_mode: Mapped[str] = mapped_column(String(16), default="worker")
    executed_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    document: Mapped[Document] = relationship(back_populates="macros")


class MacroPreference(Base):
    __tablename__ = "macro_preferences"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True)
    macro_id: Mapped[str] = mapped_column(String(8), index=True)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    custom_shortcut: Mapped[str] = mapped_column(String(50), default="")


class AuditLog(Base):
    """ISMS-P 감사 로그 — 모든 민감 작업 기록.

    90일 retention (정기 cleanup 작업으로 삭제).
    필수 필드: 누가(user_id), 언제(at), 무엇을(action), 어디서(ip), 결과(status).
    """
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    at: Mapped[datetime] = mapped_column(DateTime, default=_now, index=True)
    user_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    user_email: Mapped[str] = mapped_column(String(255), default="")
    action: Mapped[str] = mapped_column(String(64), index=True)
    resource_type: Mapped[str] = mapped_column(String(48), default="")
    resource_id: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[str] = mapped_column(String(16), default="ok")  # ok | denied | error
    ip: Mapped[str] = mapped_column(String(64), default="")
    user_agent: Mapped[str] = mapped_column(String(500), default="")
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class RefreshToken(Base):
    """Refresh Token — SHA-256 해시만 저장 (평문 없음). rotation 방식."""
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # SHA-256 hex
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class UserApiKey(Base):
    """사용자가 본인 부담으로 등록한 외부 LLM API 키 (BYOK).

    원칙:
    - 키는 Fernet 으로 암호화 저장 — DB 노출 시에도 평문 유출 방지
    - 표시는 마지막 4자리만 ('sk-ant-***-xxxx')
    - UNIQUE(user_id, provider) — 사용자당 provider 1개
    - 시스템 운영자 키와 별도 — chat 호출 시 본인 키가 있으면 우선 사용
    """
    __tablename__ = "user_api_keys"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True)
    provider: Mapped[str] = mapped_column(String(32), index=True)  # openai | anthropic
    encrypted_key: Mapped[str] = mapped_column(Text)  # Fernet 토큰 (긴 문자열)
    last_4: Mapped[str] = mapped_column(String(8), default="")  # 표시용 마지막 4자리
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class LearnedTemplate(Base):
    __tablename__ = "learned_templates"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id"))
    template_name: Mapped[str] = mapped_column(String(200))
    embedding_path: Mapped[str] = mapped_column(String(500), default="")
    source_doc_count: Mapped[int] = mapped_column(Integer, default=0)
    last_trained_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    organization: Mapped[Organization] = relationship(back_populates="templates")


class Slide(Base):
    __tablename__ = "slides"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(500), default="")
    schema_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
