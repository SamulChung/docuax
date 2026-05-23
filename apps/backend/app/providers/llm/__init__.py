"""LLM 어댑터 패키지.

`ModelProvider` 추상화 + provider 구현 + 레지스트리.
새 모델 추가 = `ModelProvider` 서브클래스 1개 + registry.py 등록 1줄.
"""
from app.providers.llm.base import (
    ChatMessage,
    DocumentClass,
    DocumentClassification,
    ModelProvider,
    ProviderUnavailable,
    ReviewTag,
    ReviewTags,
    TemplateMatchScore,
)
from app.providers.llm.registry import get_llm_provider

__all__ = [
    "ChatMessage",
    "DocumentClass",
    "DocumentClassification",
    "ModelProvider",
    "ProviderUnavailable",
    "ReviewTag",
    "ReviewTags",
    "TemplateMatchScore",
    "get_llm_provider",
]
