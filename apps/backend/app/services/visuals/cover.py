"""표지(Cover) 생성 — 마크다운 frontmatter 파싱.

YAML-like 형식:
  ---
  cover: true
  title: 2026년 R&D 사업 제안서
  subtitle: AI 기반 한국형 문서 자동화 플랫폼
  author: 정원훈
  organization: (주)텐에이아이 · DocuAX
  department: 기술연구소
  date: 2026.07.01
  document_number: DOCUAX-RND-2026-001
  classification: 공개
  logo: assets/logo.png
  ---

frontmatter 가 있으면 IR.cover 채우고 본문에서 frontmatter 제거.
"""
from __future__ import annotations

import re
from datetime import datetime

from app.pipeline.ir import CoverData


_FRONTMATTER_RE = re.compile(
    r"^---\s*\n(?P<body>.*?)\n---\s*\n",
    re.DOTALL,
)

# 간단 YAML 파서 — key: value 형식만 (multi-line·중첩 불필요)
_YAML_LINE_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$")


def extract_frontmatter(source: str) -> tuple[dict[str, str], str]:
    """마크다운에서 frontmatter 추출.

    반환: (메타데이터 dict, frontmatter 가 제거된 본문)
    frontmatter 없으면 ({}, source).
    """
    m = _FRONTMATTER_RE.match(source)
    if not m:
        return {}, source
    body = m.group("body")
    meta: dict[str, str] = {}
    for raw_line in body.split("\n"):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = _YAML_LINE_RE.match(line)
        if not match:
            continue
        key, value = match.group(1), match.group(2).strip()
        # 인용부호 제거
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        meta[key.lower()] = value
    remainder = source[m.end():]
    return meta, remainder


def cover_from_frontmatter(meta: dict[str, str], *, default_title: str = "") -> CoverData | None:
    """frontmatter dict → CoverData. cover 플래그가 명시되거나 cover 관련 필드가 있으면 생성.

    트리거 조건:
      - cover: true / yes
      - 또는 title, subtitle, author, organization 중 1개 이상 명시
    """
    if not meta:
        return None

    cover_flag = meta.get("cover", "").lower().strip()
    has_cover_fields = any(
        k in meta for k in ("title", "subtitle", "author", "organization", "department")
    )

    if cover_flag not in ("true", "yes", "1") and not has_cover_fields:
        return None

    # 날짜 — 미지정 시 오늘
    date_str = meta.get("date", "").strip()
    if not date_str:
        date_str = datetime.now().strftime("%Y. %m. %d.")

    # 템플릿 — 기본 modern, 5종 중 선택
    template_raw = (
        meta.get("cover_template", "")
        or meta.get("template", "")
        or "modern"
    ).strip().lower()
    if template_raw not in (
        "modern", "classic", "gongmun", "proposal", "research",
        "executive", "annual_report", "government", "whitepaper", "minimal",
    ):
        template_raw = "modern"

    return CoverData(
        title=meta.get("title", default_title).strip(),
        subtitle=meta.get("subtitle", "").strip(),
        author=meta.get("author", "").strip(),
        organization=meta.get("organization", "").strip(),
        department=meta.get("department", "").strip(),
        date=date_str,
        document_number=meta.get("document_number", "").strip() or meta.get("doc_no", "").strip(),
        logo_path=meta.get("logo", "").strip() or meta.get("logo_path", "").strip(),
        seal_path=meta.get("seal", "").strip(),
        classification=meta.get("classification", "").strip(),
        template=template_raw,  # type: ignore[arg-type]
        accent_color=meta.get("accent_color", "").strip() or meta.get("accent", "").strip(),
    )
