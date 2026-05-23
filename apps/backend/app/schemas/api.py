"""API I/O 스키마."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"] = "ok"
    version: str
    llm: dict[str, Any]
    macros: dict[str, int]


# ── 변환 ──

class ConvertRequest(BaseModel):
    source: str = Field(..., description="마크다운 또는 자유 텍스트")
    title: str = ""
    persona_mode: Literal["worker", "heavy"] = "worker"
    organization_id: str | None = None
    document_id: str | None = None
    skip_analyze: bool = False
    skip_review: bool = False


class ConvertResponse(BaseModel):
    document_id: str
    preview: dict[str, Any]
    timings_ms: dict[str, float]
    total_ms: float
    model_version: str


# ── 매크로 ──

class MacroDescriptor(BaseModel):
    id: str
    category: str
    name: str
    description: str
    ai_powered: bool
    auto: bool
    shortcut: dict[str, str]


class MacroExecuteRequest(BaseModel):
    macro_id: str
    document_id: str
    params: dict[str, Any] = Field(default_factory=dict)


class MacroExecuteResponse(BaseModel):
    success: bool
    macro_id: str
    preview: dict[str, Any]
    message: str = ""
    # 매크로가 반환한 추가 결과 (점프 좌표·R9 점수 등)
    result: dict[str, Any] = Field(default_factory=dict)


# ── 렌더링 (다운로드) ──

class RenderRequest(BaseModel):
    document_id: str
    format: Literal["docx", "hwpx", "pdf"]


class RenderResponse(BaseModel):
    document_id: str
    format: str
    download_url: str
    bytes: int


# ── RAG (기관 양식 학습) ──

class TemplateIndexRequest(BaseModel):
    organization_id: str
    document_id: str
    title: str
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class TemplateIndexResponse(BaseModel):
    organization_id: str
    chunks_indexed: int
    total_chunks_in_org: int
