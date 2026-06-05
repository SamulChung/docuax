"""MCP(Model Context Protocol) 서버 스펙 및 도구 실행 엔드포인트."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import get_settings

router = APIRouter()


def _base_url() -> str:
    s = get_settings()
    # Try common attribute names for public URL
    for attr in ("public_url", "frontend_url", "app_url"):
        val = getattr(s, attr, None)
        if val:
            return str(val).rstrip("/")
    return "https://docuax-production.up.railway.app"


@router.get("/mcp/spec")
async def mcp_spec() -> dict:
    """MCP 서버 스펙 반환."""
    base = _base_url()
    return {
        "name": "DocuAX",
        "version": "1.0.0",
        "description": "한국어 문서 변환 플랫폼 — 마크다운 ↔ HWPX·DOCX·PDF",
        "tools": [
            {
                "name": "convert_to_hwpx",
                "description": "마크다운 텍스트를 HWPX 한글 문서로 변환합니다.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "markdown": {"type": "string", "description": "변환할 마크다운 텍스트"},
                        "title": {"type": "string", "description": "문서 제목 (선택)"},
                    },
                    "required": ["markdown"],
                },
                "endpoint": f"{base}/api/v1/mcp/tools/convert_to_hwpx",
            },
            {
                "name": "convert_to_docx",
                "description": "마크다운 텍스트를 DOCX Word 문서로 변환합니다.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "markdown": {"type": "string"},
                        "title": {"type": "string"},
                    },
                    "required": ["markdown"],
                },
                "endpoint": f"{base}/api/v1/mcp/tools/convert_to_docx",
            },
            {
                "name": "convert_to_pdf",
                "description": "마크다운 텍스트를 PDF로 변환합니다.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "markdown": {"type": "string"},
                        "title": {"type": "string"},
                    },
                    "required": ["markdown"],
                },
                "endpoint": f"{base}/api/v1/mcp/tools/convert_to_pdf",
            },
            {
                "name": "fill_template",
                "description": "{필드명} 플레이스홀더가 있는 마크다운 템플릿에 값을 채웁니다.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "template": {"type": "string", "description": "{필드명} 패턴이 포함된 마크다운"},
                        "fields": {
                            "type": "object",
                            "description": '{"필드명": "값"} 딕셔너리',
                        },
                    },
                    "required": ["template", "fields"],
                },
                "endpoint": f"{base}/api/v1/mcp/tools/fill_template",
            },
        ],
    }


class ToolRequest(BaseModel):
    markdown: str | None = None
    title: str | None = None
    template: str | None = None
    fields: dict | None = None


@router.post("/mcp/tools/fill_template")
async def mcp_fill_template(req: ToolRequest) -> dict:
    """플레이스홀더 채우기."""
    if not req.template or not req.fields:
        raise HTTPException(status_code=400, detail="template과 fields 필수")
    result = req.template
    for key, value in req.fields.items():
        result = result.replace(f"{{{key}}}", str(value))
    return {"markdown": result}
