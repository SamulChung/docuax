"""파이프라인 7단계.

stage_1_parse        → 입력 마크다운/자유 텍스트 → DocumentIR
stage_2_analyze      → TenOS로 문서 유형 분류 (provider 호출)
stage_3_map_form     → 양식 매핑 (# → □ 등 한국 공문 4단계)
stage_4_review_tag   → TenOS 검토 태깅 (빨강·파랑·노랑)
stage_5_auto_macro   → 매크로 자동 적용 (셀 너비 균등 등)
stage_6_serialize    → DOCX/HWPX/PDF 직렬화 (renderers 모듈)
stage_7_render_view  → 미리보기 페이로드 생성 (프론트엔드용 JSON)
"""
from app.pipeline.stages.stage_1_parse import parse_markdown
from app.pipeline.stages.stage_2_analyze import analyze_document
from app.pipeline.stages.stage_3_map_form import apply_form_mapping
from app.pipeline.stages.stage_4_review_tag import apply_review_tags
from app.pipeline.stages.stage_5_auto_macro import apply_auto_macros
from app.pipeline.stages.stage_7_render_view import build_preview_payload

__all__ = [
    "analyze_document",
    "apply_auto_macros",
    "apply_form_mapping",
    "apply_review_tags",
    "build_preview_payload",
    "parse_markdown",
]
