"""시각 요소 종단 검증 — 표지·이미지·차트·다이어그램·수식 통합 샘플.

사용:
  cd apps/backend
  python scripts/verify_visuals.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.pipeline.stages.stage_1_parse import parse_markdown  # noqa: E402
from app.renderers.docx_renderer import DocxRenderer  # noqa: E402
from app.renderers.hwpx_renderer import HwpxRenderer  # noqa: E402
from app.renderers.pdf_renderer import PdfRenderer  # noqa: E402

SAMPLE_MD = """\
---
cover: true
title: 2026년 R&D 사업 제안서
subtitle: AI 기반 한국형 문서 자동화 플랫폼 DocuAX
author: 정원훈
organization: (주)텐에이아이 · DocuAX
department: 기술연구소
date: 2026. 07. 01.
document_number: DOCUAX-RND-2026-001
classification: 공개
---

# 사업 개요

본 사업은 한국 회사·기관 문서 작성의 표준화를 위한 AI 플랫폼 개발을 목표로 합니다.

## 시장 분석

□ 국내 문서 작성 시장 규모는 연간 약 3,200억원으로 추산됩니다.
○ 공공부문이 약 65%를 차지하며, 민간부문은 빠르게 성장 중
○ 한컴오피스·MS Office 사용자 약 800만명

```chart
{
  "type": "bar",
  "title": "분기별 예상 매출 (단위: 백만원)",
  "x_label": "분기",
  "y_label": "매출",
  "labels": ["1Q", "2Q", "3Q", "4Q"],
  "datasets": [
    {"label": "Pro 플랜", "data": [12, 28, 45, 68], "color": "#1F5BAF"},
    {"label": "Team 플랜", "data": [8, 22, 38, 55], "color": "#F4B400"}
  ]
}
```

## 시스템 아키텍처

```mermaid
flowchart LR
    A[사용자] --> B[Markdown 입력]
    B --> C{DocuAX 파이프라인}
    C --> D[HWPX]
    C --> E[DOCX]
    C --> F[PDF]
    D --> G[한컴 한글]
    E --> H[MS Word]
    F --> I[모든 환경]
```

## 핵심 수식

문서 변환 정확도 함수는 다음과 같이 정의됩니다:

```math
P(correct) = \\frac{N_{correct}}{N_{total}} \\times \\alpha + \\beta
```

여기서 α는 양식 매칭 가중치, β는 검토 보정 상수입니다.

## 사용자 분포

```chart
{
  "type": "pie",
  "title": "주요 사용자층 (가입자 기준)",
  "labels": ["공무원", "기업 기획팀", "연구원", "개인사업자", "기타"],
  "datasets": [{"data": [42, 28, 15, 10, 5]}]
}
```

## 결론

- 본 R&D 사업은 명확한 시장 수요에 기반합니다
- 기술적 차별점은 한국 공문서 표준 양식 학습입니다
- 2026년 7월 베타 출시 → 2027년 정식 출시 계획
"""


def main() -> None:
    out_dir = ROOT / "var" / "verify_visuals"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"출력 디렉토리: {out_dir}")
    print()

    print("1) 마크다운 파싱...")
    ir = parse_markdown(SAMPLE_MD)
    print(f"   - document_id: {ir.document_id}")
    print(f"   - title: {ir.title}")
    print(f"   - cover: {ir.cover.title if ir.cover else '(없음)'}")
    print(f"   - cover.organization: {ir.cover.organization if ir.cover else ''}")
    print(f"   - cover.document_number: {ir.cover.document_number if ir.cover else ''}")
    print(f"   - 블록 수: {len(ir.blocks)}")

    type_counts: dict[str, int] = {}
    for b in ir.blocks:
        type_counts[b.type] = type_counts.get(b.type, 0) + 1
    print(f"   - 블록 분포: {type_counts}")
    print()

    print("2) DOCX 렌더링...")
    docx_path = out_dir / "verify_visuals.docx"
    DocxRenderer().render(ir, docx_path)
    if docx_path.exists():
        print(f"   ✓ {docx_path.name} ({docx_path.stat().st_size:,} bytes)")
    else:
        print(f"   ✗ DOCX 생성 실패")
    print()

    print("3) PDF 렌더링...")
    pdf_path = out_dir / "verify_visuals.pdf"
    PdfRenderer().render(ir, pdf_path)
    if pdf_path.exists():
        print(f"   ✓ {pdf_path.name} ({pdf_path.stat().st_size:,} bytes)")
    else:
        print(f"   ✗ PDF 생성 실패")
    print()

    print("4) HWPX 렌더링...")
    hwpx_path = out_dir / "verify_visuals.hwpx"
    HwpxRenderer().render(ir, hwpx_path)
    if hwpx_path.exists():
        print(f"   ✓ {hwpx_path.name} ({hwpx_path.stat().st_size:,} bytes)")
    else:
        print(f"   ✗ HWPX 생성 실패")
    print()

    # 캐시 디렉토리 확인
    from app.services.visuals.cache import cache_dir
    cache = cache_dir()
    png_files = list(cache.glob("*.png"))
    print(f"5) 캐시 PNG 파일 수: {len(png_files)}")
    for f in sorted(png_files)[:8]:
        print(f"   - {f.name} ({f.stat().st_size:,} bytes)")
    print()

    print("✅ 시각 요소 종단 검증 완료")


if __name__ == "__main__":
    main()
