"""시각 요소 서비스 — 이미지·차트·다이어그램·수식·표지 렌더링 헬퍼.

각 모듈은 IR 블록 데이터를 받아 PNG 파일로 변환하고 캐시한다.
렌더러(HWPX·DOCX·PDF)는 변환된 PNG 경로만 받아 임베드.
"""
from app.services.visuals.cache import (
    cache_dir,
    materialize_image,
    resolve_image_to_path,
)
from app.services.visuals.chart import render_chart_to_png
from app.services.visuals.diagram import render_diagram_to_png
from app.services.visuals.equation import render_equation_to_png
from app.services.visuals.sizing import parse_size, to_cm, to_css, to_mm, to_pt

__all__ = [
    "cache_dir",
    "materialize_image",
    "resolve_image_to_path",
    "render_chart_to_png",
    "render_diagram_to_png",
    "render_equation_to_png",
    "parse_size",
    "to_pt",
    "to_cm",
    "to_mm",
    "to_css",
]
