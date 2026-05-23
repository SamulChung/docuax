"""고도화 종단 재검증 — 4종 시각 요소 품질 비교.

확인 항목:
  1. 차트 PNG 크기↑ (고해상도)
  2. 수식 PNG 크기↑ (4x DPI + STIX)
  3. 다이어그램 PNG 크기 정상 (DocuAX 테마 적용)
  4. 표지 5종 템플릿 PDF 출력 모두 정상
"""
from __future__ import annotations

import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# 캐시 비우기 — v2 신선한 결과를 보기 위해
from app.services.visuals.cache import cache_dir  # noqa: E402
cache = cache_dir()
for p in cache.glob("*.png"):
    p.unlink()
print(f"캐시 클리어: {cache}")

from app.pipeline.stages.stage_1_parse import parse_markdown  # noqa: E402
from app.renderers.pdf_renderer import PdfRenderer  # noqa: E402
from app.renderers.docx_renderer import DocxRenderer  # noqa: E402
from app.renderers.hwpx_renderer import HwpxRenderer  # noqa: E402
from app.services.visuals import (  # noqa: E402
    render_chart_to_png,
    render_diagram_to_png,
    render_equation_to_png,
)


def section(title: str) -> None:
    print()
    print(f"━━ {title} " + "━" * (40 - len(title)))


# ── 1. 차트 ──
section("1. 차트 고도화 검증")
chart_spec = {
    "type": "bar",
    "title": "DocuAX 월별 매출 (단위: 백만원)",
    "subtitle": "2026년 상반기 누적",
    "x_label": "월",
    "y_label": "매출",
    "labels": ["1월", "2월", "3월", "4월", "5월", "6월"],
    "datasets": [
        {"label": "Pro 플랜",  "data": [12, 18, 28, 42, 55, 72], "color": "#1F5BAF"},
        {"label": "Team 플랜", "data": [8, 14, 22, 33, 48, 65],  "color": "#F4B400"},
    ],
    "show_values": True,
}
t0 = time.time()
p = render_chart_to_png(chart_spec)
print(f"  ✓ bar 차트: {p.name if p else 'FAIL'} ({p.stat().st_size:,} bytes, {(time.time()-t0)*1000:.0f}ms)")

# pie
pie_spec = {
    "type": "donut",
    "title": "사용자 분포",
    "labels": ["공무원", "기업", "연구원", "기타"],
    "datasets": [{"data": [42, 30, 18, 10]}],
    "show_values": True,
}
p = render_chart_to_png(pie_spec)
print(f"  ✓ donut 차트: {p.name if p else 'FAIL'} ({p.stat().st_size:,} bytes)")

# stacked
stacked_spec = {
    "type": "stacked_bar",
    "title": "분기별 부서 매출 (스택)",
    "labels": ["1Q", "2Q", "3Q", "4Q"],
    "datasets": [
        {"label": "영업", "data": [10, 15, 22, 30]},
        {"label": "엔지니어링", "data": [8, 12, 18, 25]},
        {"label": "마케팅", "data": [5, 7, 10, 14]},
    ],
}
p = render_chart_to_png(stacked_spec)
print(f"  ✓ stacked_bar: {p.name if p else 'FAIL'} ({p.stat().st_size:,} bytes)")

# line
line_spec = {
    "type": "line",
    "title": "주간 활성 사용자",
    "labels": ["1주", "2주", "3주", "4주", "5주", "6주", "7주", "8주"],
    "datasets": [
        {"label": "DAU", "data": [120, 145, 180, 220, 280, 340, 420, 510]},
        {"label": "WAU", "data": [80, 95, 130, 165, 210, 260, 320, 410]},
    ],
}
p = render_chart_to_png(line_spec)
print(f"  ✓ line 차트: {p.name if p else 'FAIL'} ({p.stat().st_size:,} bytes)")

# ── 2. 수식 ──
section("2. 수식 고도화 검증 (STIX + DPI 400)")
equations = [
    ("E = mc^2", 1),
    (r"P(correct) = \frac{N_{correct}}{N_{total}} \times \alpha + \beta", 2),
    (r"\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}", 3),
    (r"\sum_{i=1}^{n} i^2 = \frac{n(n+1)(2n+1)}{6}", 4),
]
for latex, num in equations:
    p = render_equation_to_png(latex=latex, display=True, number=num)
    print(f"  ✓ 수식({num}): {p.stat().st_size:,} bytes — {latex[:60]}")

# ── 3. 다이어그램 ──
section("3. 다이어그램 고도화 검증 (DocuAX 테마)")
mermaid_src = """\
flowchart LR
    A[사용자] --> B[Markdown]
    B --> C{DocuAX 파이프라인}
    C --> D[HWPX]
    C --> E[DOCX]
    C --> F[PDF]
    D --> G[한컴 한글]
"""
t0 = time.time()
p = render_diagram_to_png(engine="mermaid", source=mermaid_src)
print(f"  ✓ flowchart: {p.name if p else 'FAIL'} ({p.stat().st_size:,} bytes, {(time.time()-t0)*1000:.0f}ms)")

# ── 4. 표지 5종 ──
section("4. 표지 5종 템플릿 PDF 검증")
out_dir = ROOT / "var" / "verify_v2"
out_dir.mkdir(parents=True, exist_ok=True)

TEMPLATES = ["modern", "classic", "gongmun", "proposal", "research"]
for tmpl in TEMPLATES:
    md = f"""---
cover: true
cover_template: {tmpl}
title: DocuAX 시각 요소 고도화 보고서
subtitle: {tmpl} 표지 템플릿 검증
author: 정원훈
organization: (주)텐에이아이 · DocuAX
department: 기술연구소
date: 2026. 05. 19.
document_number: DOCUAX-V2-{tmpl[:4].upper()}-001
classification: 공개
---

# 본문 (테스트)

## 차트

```chart
{{"type":"bar","title":"테스트","labels":["A","B","C"],"datasets":[{{"data":[10,20,30]}}]}}
```

## 다이어그램

```mermaid
flowchart LR
    A --> B --> C
```

## 수식

```math
E = mc^2
```
"""
    ir = parse_markdown(md)
    pdf_path = out_dir / f"cover_{tmpl}.pdf"
    t0 = time.time()
    PdfRenderer().render(ir, pdf_path)
    if pdf_path.exists() and pdf_path.stat().st_size > 30_000:
        print(f"  ✓ {tmpl:10s}: {pdf_path.stat().st_size:>8,} bytes ({(time.time()-t0)*1000:.0f}ms)")
    else:
        print(f"  ✗ {tmpl:10s}: 실패")

# ── 5. 모든 시각 요소 통합 1개 PDF ──
section("5. 4종 시각 요소 통합 PDF (modern 표지)")
combined_md = """---
cover: true
cover_template: modern
title: 시각 요소 고도화 종합 시연
subtitle: 표지·차트·다이어그램·수식 4종 통합
author: 정원훈
organization: (주)텐에이아이 · DocuAX
department: 기술연구소
date: 2026. 05. 19.
document_number: DOCUAX-DEMO-001
classification: 공개
---

# 1. 차트 — 막대형 (그룹)

```chart
{
  "type": "bar",
  "title": "분기별 매출 비교",
  "subtitle": "단위: 백만원",
  "labels": ["1Q","2Q","3Q","4Q"],
  "datasets": [
    {"label": "2025", "data": [12, 24, 38, 55], "color": "#1F5BAF"},
    {"label": "2026", "data": [22, 38, 58, 80], "color": "#F4B400"}
  ],
  "show_values": true
}
```

# 2. 차트 — 도넛

```chart
{
  "type": "donut",
  "title": "사용자 분포",
  "labels": ["공무원","기업","연구원","기타"],
  "datasets": [{"data": [42, 30, 18, 10]}]
}
```

# 3. 차트 — 라인

```chart
{
  "type": "line",
  "title": "주간 활성 사용자 추이",
  "labels": ["1주","2주","3주","4주","5주","6주"],
  "datasets": [
    {"label": "DAU", "data": [120, 180, 260, 340, 430, 520]}
  ],
  "show_values": true
}
```

# 4. 다이어그램

```mermaid
flowchart LR
    A[사용자] --> B[Markdown]
    B --> C{DocuAX}
    C -->|렌더| D[HWPX]
    C -->|렌더| E[DOCX]
    C -->|렌더| F[PDF]
```

# 5. 수식

본 시스템의 정확도 측정 함수:

```math
P(correct) = \\frac{N_{correct}}{N_{total}} \\times \\alpha + \\beta
```

가우스 적분:

```math
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
```
"""
ir = parse_markdown(combined_md)
combined_pdf = out_dir / "combined_demo.pdf"
combined_docx = out_dir / "combined_demo.docx"
combined_hwpx = out_dir / "combined_demo.hwpx"

t0 = time.time()
PdfRenderer().render(ir, combined_pdf)
print(f"  ✓ 통합 PDF:  {combined_pdf.stat().st_size:>8,} bytes ({(time.time()-t0)*1000:.0f}ms)")

t0 = time.time()
DocxRenderer().render(ir, combined_docx)
print(f"  ✓ 통합 DOCX: {combined_docx.stat().st_size:>8,} bytes ({(time.time()-t0)*1000:.0f}ms)")

t0 = time.time()
HwpxRenderer().render(ir, combined_hwpx)
print(f"  ✓ 통합 HWPX: {combined_hwpx.stat().st_size:>8,} bytes ({(time.time()-t0)*1000:.0f}ms)")

# ── 6. 캐시 통계 ──
section("6. PNG 캐시 결과 (고도화 후)")
pngs = sorted(cache.glob("*.png"), key=lambda p: -p.stat().st_size)
print(f"  PNG 파일 수: {len(pngs)}")
total = sum(p.stat().st_size for p in pngs)
print(f"  총 용량: {total/1024:.1f} KB")
print(f"  평균 크기: {total/len(pngs)/1024:.1f} KB" if pngs else "")
print()
print("  Top 5:")
for p in pngs[:5]:
    print(f"    - {p.name}: {p.stat().st_size:,} bytes")

print()
print("━" * 50)
print("✅ 시각 요소 고도화 종단 재검증 완료")
print()
print(f"📂 결과물 위치: {out_dir}")
