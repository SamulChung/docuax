"""단계 2 — TenOS 분석. 문서 유형을 분류."""
from __future__ import annotations

from app.pipeline.ir import DocumentIR
from app.providers.llm import ModelProvider


async def analyze_document(ir: DocumentIR, provider: ModelProvider) -> DocumentIR:
    """provider에게 문서 유형 판별을 요청. ir.document_class 설정.

    실패 시 GENERAL로 두고 진행 — 파이프라인 중단 X (graceful degradation).
    """
    text = ir.plain_text()
    if not text.strip():
        return ir
    cls = await provider.classify_document(text)
    ir.document_class = cls.document_class
    return ir
