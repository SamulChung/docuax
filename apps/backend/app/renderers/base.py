"""렌더러 베이스 — DocumentIR을 각 포맷으로 직렬화.

원칙(PRD 3.1 하층 — 표준 도구 통합):
- DOCX: python-docx (검증된 표준)
- HWPX: python-hwpx (한컴 공문 표준)
- PDF: weasyprint (HTML → PDF) 또는 LibreOffice headless

우리가 자체 구현하지 않는다 — 라이브러리에 위임하고 IR ↔ 라이브러리 어댑팅만.
"""
from __future__ import annotations

import abc
from pathlib import Path

from app.pipeline.ir import DocumentIR


class Renderer(abc.ABC):
    extension: str = ""
    mime: str = ""

    @abc.abstractmethod
    def render(self, ir: DocumentIR, output_path: Path) -> Path:
        """DocumentIR을 파일로 직렬화. 반환은 실제 저장 경로."""
