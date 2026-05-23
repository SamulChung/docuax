"""기관 양식 학습 RAG.

목적: 고객사 50개 문서 학습 → 그 회사 전용 스타일 모델 형성 (PRD 6.4 Lock-in).

구조:
- ChromaDB로 organization_id별 컬렉션 분리.
- 임베딩은 EmbeddingProvider 인터페이스 (LLM처럼 교체 가능).
- 학습 단위는 (문서 → 청크 → 임베딩 → 메타). 메타에 문서 유형·제목 등.
- 검색은 변환 시 자동 호출: 현재 문서 텍스트로 유사 문서 chunks 가져옴.
"""
from app.rag.store import OrgTemplateStore, get_template_store

__all__ = ["OrgTemplateStore", "get_template_store"]
