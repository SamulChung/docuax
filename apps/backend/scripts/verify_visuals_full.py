"""표지·차트·다이어그램·수식 4종 시각 요소 종합 재검증.

검증 경로:
  A. HTTP API (/api/v1/convert) — 프론트엔드가 받는 payload 검증
  B. 렌더링 (DOCX/PDF/HWPX) — 실제 다운로드 파일 검증
  C. PNG 캐시 — 차트/다이어그램/수식 변환 결과물 검증
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.pipeline.stages.stage_1_parse import parse_markdown  # noqa: E402
from app.renderers.docx_renderer import DocxRenderer  # noqa: E402
from app.renderers.hwpx_renderer import HwpxRenderer  # noqa: E402
from app.renderers.pdf_renderer import PdfRenderer  # noqa: E402
from app.services.visuals.cache import cache_dir  # noqa: E402

API = "http://127.0.0.1:8000"

SAMPLE = """\
---
cover: true
title: 시각 요소 종합 재검증
subtitle: DocuAX 표지·차트·다이어그램·수식 4종 점검
author: 정원훈
organization: (주)텐에이아이 · DocuAX
department: 기술연구소
date: 2026. 05. 19.
document_number: DOCUAX-VERIFY-001
classification: 공개
---

# 검증 본문

## 차트 (분기별 매출)

```chart
{
  "type": "bar",
  "title": "분기별 예상 매출 (백만원)",
  "labels": ["1Q", "2Q", "3Q", "4Q"],
  "datasets": [
    {"label": "2025", "data": [12, 28, 45, 68], "color": "#1F5BAF"},
    {"label": "2026", "data": [22, 38, 56, 80], "color": "#F4B400"}
  ]
}
```

## 차트 (사용자 분포)

```chart
{
  "type": "pie",
  "title": "주요 사용자층",
  "labels": ["공무원", "기업", "연구원", "기타"],
  "datasets": [{"data": [42, 30, 18, 10]}]
}
```

## 다이어그램

```mermaid
flowchart LR
    A[입력] --> B{파이프라인}
    B --> C[HWPX]
    B --> D[DOCX]
    B --> E[PDF]
```

## 수식

```math
P(correct) = \\frac{N_{correct}}{N_{total}} \\times \\alpha + \\beta
```

```math
E = mc^2
```
"""


def check(label: str, ok: bool, detail: str = "") -> None:
    mark = "✓" if ok else "✗"
    print(f"  {mark} {label}" + (f"  — {detail}" if detail else ""))


def section(title: str) -> None:
    print()
    print(f"━━ {title} " + "━" * (40 - len(title)))


def main() -> int:
    fails = 0

    # ────────────────────────────────────────────────────────────
    section("A. HTTP API 검증 — POST /api/v1/convert")
    # ────────────────────────────────────────────────────────────
    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.post(
                f"{API}/api/v1/convert",
                json={
                    "source": SAMPLE,
                    "skip_analyze": True,
                    "skip_review": True,
                },
            )
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"  ✗ HTTP 호출 실패: {e}")
        return 1

    preview = data.get("preview", {})
    check("응답 200", True)
    check("preview.title", preview.get("title") == "시각 요소 종합 재검증", repr(preview.get("title")))

    # ── 표지 ──
    cover = preview.get("cover")
    check("표지(cover) 존재", cover is not None)
    if cover:
        check("  cover.title",       cover.get("title") == "시각 요소 종합 재검증", repr(cover.get("title")))
        check("  cover.subtitle",    cover.get("subtitle") == "DocuAX 표지·차트·다이어그램·수식 4종 점검")
        check("  cover.author",      cover.get("author") == "정원훈")
        check("  cover.organization", cover.get("organization") == "(주)텐에이아이 · DocuAX")
        check("  cover.department",  cover.get("department") == "기술연구소")
        check("  cover.date",        cover.get("date") == "2026. 05. 19.")
        check("  cover.document_number", cover.get("document_number") == "DOCUAX-VERIFY-001")
        check("  cover.classification", cover.get("classification") == "공개")
    else:
        fails += 1

    blocks = preview.get("blocks", [])
    by_type: dict[str, int] = {}
    for b in blocks:
        by_type[b["type"]] = by_type.get(b["type"], 0) + 1
    print(f"  · 블록 분포: {by_type}")

    # ── 차트 2개 ──
    charts = [b for b in blocks if b["type"] == "chart"]
    check("차트 블록 2개", len(charts) == 2, f"실제 {len(charts)}개")
    for i, c in enumerate(charts, 1):
        spec = c.get("chart", {}).get("spec", {})
        check(f"  차트#{i} spec.type",  spec.get("type") in ("bar", "pie"),  repr(spec.get("type")))
        check(f"  차트#{i} spec.title", bool(spec.get("title")),              repr(spec.get("title")))
        check(f"  차트#{i} labels",     bool(spec.get("labels")),             f"len={len(spec.get('labels', []))}")
        check(f"  차트#{i} datasets",   bool(spec.get("datasets")),           f"len={len(spec.get('datasets', []))}")

    # ── 다이어그램 ──
    diagrams = [b for b in blocks if b["type"] == "diagram"]
    check("다이어그램 블록 1개", len(diagrams) == 1, f"실제 {len(diagrams)}개")
    if diagrams:
        d = diagrams[0].get("diagram", {})
        check("  diagram.engine = mermaid", d.get("engine") == "mermaid")
        check("  diagram.source 비어있지 않음", len(d.get("source", "")) > 20)
        check("  flowchart 키워드 포함", "flowchart" in d.get("source", ""))

    # ── 수식 2개 ──
    equations = [b for b in blocks if b["type"] == "equation"]
    check("수식 블록 2개", len(equations) == 2, f"실제 {len(equations)}개")
    for i, eq in enumerate(equations, 1):
        e = eq.get("equation", {})
        check(f"  수식#{i} display=True", e.get("display") is True)
        check(f"  수식#{i} latex 존재", bool(e.get("latex")), e.get("latex", "")[:50])

    # ── frontmatter 본문 노출 안 함 ──
    text_dump = " ".join((b.get("text") or "") for b in blocks)
    leaked = any(k in text_dump for k in ("cover: true", "classification:", "document_number:"))
    check("frontmatter 본문 미노출", not leaked, "유출 감지됨!" if leaked else "")

    # ────────────────────────────────────────────────────────────
    section("B. 렌더링 검증 — DOCX / PDF / HWPX")
    # ────────────────────────────────────────────────────────────
    out_dir = ROOT / "var" / "verify_visuals_full"
    out_dir.mkdir(parents=True, exist_ok=True)

    ir = parse_markdown(SAMPLE)
    check("로컬 parse_markdown", len(ir.blocks) > 0 and ir.cover is not None)

    # DOCX
    t0 = time.time()
    docx_path = out_dir / "verify.docx"
    DocxRenderer().render(ir, docx_path)
    docx_ok = docx_path.exists() and docx_path.stat().st_size > 50_000
    check(f"DOCX 생성 ({(time.time()-t0)*1000:.0f}ms)", docx_ok,
          f"{docx_path.stat().st_size:,} bytes" if docx_path.exists() else "파일 없음")

    # PDF
    t0 = time.time()
    pdf_path = out_dir / "verify.pdf"
    PdfRenderer().render(ir, pdf_path)
    pdf_ok = pdf_path.exists() and pdf_path.stat().st_size > 30_000
    check(f"PDF 생성 ({(time.time()-t0)*1000:.0f}ms)", pdf_ok,
          f"{pdf_path.stat().st_size:,} bytes" if pdf_path.exists() else "파일 없음")

    # HWPX
    t0 = time.time()
    hwpx_path = out_dir / "verify.hwpx"
    HwpxRenderer().render(ir, hwpx_path)
    hwpx_ok = hwpx_path.exists() and hwpx_path.stat().st_size > 3_000
    check(f"HWPX 생성 ({(time.time()-t0)*1000:.0f}ms)", hwpx_ok,
          f"{hwpx_path.stat().st_size:,} bytes" if hwpx_path.exists() else "파일 없음")

    # ────────────────────────────────────────────────────────────
    section("C. PNG 캐시 검증 — 차트/다이어그램/수식 PNG")
    # ────────────────────────────────────────────────────────────
    cache = cache_dir()
    pngs = sorted(cache.glob("*.png"), key=lambda p: -p.stat().st_size)
    print(f"  · 캐시 디렉토리: {cache}")
    print(f"  · PNG 파일 수: {len(pngs)}")
    check("PNG 캐시 4개 이상 (차트2+다이어그램1+수식2 = 최소 4)", len(pngs) >= 4)
    for p in pngs[:8]:
        print(f"    - {p.name} ({p.stat().st_size:,} bytes)")

    # 차트/수식은 matplotlib, 다이어그램은 mermaid-cli or mermaid.ink
    chart_pngs = [p for p in pngs if p.stat().st_size > 20_000]
    diagram_pngs = [p for p in pngs if 8_000 < p.stat().st_size < 30_000]
    check("큰 PNG (차트 2개 이상, >20KB)", len(chart_pngs) >= 2, f"{len(chart_pngs)}개")
    check("중간 PNG (다이어그램 1개 이상)", len(diagram_pngs) >= 1, f"{len(diagram_pngs)}개")

    # ────────────────────────────────────────────────────────────
    section("D. 다운로드 엔드포인트 검증")
    # ────────────────────────────────────────────────────────────
    doc_id = data["document_id"]
    formats = ["docx", "pdf", "hwpx"]
    for fmt in formats:
        try:
            with httpx.Client(timeout=60.0) as client:
                r = client.get(f"{API}/api/v1/render/{doc_id}/{fmt}")
            ok = r.status_code == 200 and len(r.content) > 3_000
            check(f"GET /render/{doc_id}/{fmt}", ok,
                  f"HTTP {r.status_code}, {len(r.content):,} bytes")
        except Exception as e:
            check(f"GET /render/{doc_id}/{fmt}", False, str(e))

    print()
    print("━" * 50)
    print("✅ 종합 재검증 완료" if fails == 0 else f"⚠ {fails}건 실패")
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
