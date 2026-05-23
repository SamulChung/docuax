"""10종 표지 종합 검증 — PDF + HWPX 각 10개."""
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.pipeline.stages.stage_1_parse import parse_markdown  # noqa: E402
from app.renderers.hwpx_renderer import HwpxRenderer  # noqa: E402
from app.renderers.pdf_renderer import PdfRenderer  # noqa: E402

TEMPLATES = [
    ("modern",        "비즈니스·기획"),
    ("executive",     "비즈니스·기획"),
    ("proposal",      "비즈니스·기획"),
    ("annual_report", "비즈니스·기획"),
    ("gongmun",       "공공·행정"),
    ("government",    "공공·행정"),
    ("research",      "학술·연구"),
    ("whitepaper",    "학술·연구"),
    ("classic",       "고전·간결"),
    ("minimal",       "고전·간결"),
]

BODY = """
# 1. 개요

본 보고서는 DocuAX 의 표지 디자인 10종을 검증합니다.

## 1.1 주요 내용

□ 첫째 항목
○ 둘째 항목
"""


def main() -> int:
    out_dir = ROOT / "var" / "verify_covers_10"
    out_dir.mkdir(parents=True, exist_ok=True)

    ok = {"pdf": 0, "hwpx": 0}
    fail = {"pdf": 0, "hwpx": 0}

    print(f"━━ 표지 {len(TEMPLATES)}종 × 2 포맷 = {len(TEMPLATES)*2}개 검증")
    print()

    for tmpl, cat in TEMPLATES:
        md = f"""---
cover: true
cover_template: {tmpl}
title: 2026년 사업 계획 보고서
subtitle: {tmpl} 표지 디자인 검증
author: 정원훈
organization: (주)텐에이아이 · DocuAX
department: 기술연구소
date: 2026. 07. 01.
document_number: DOCUAX-{tmpl[:4].upper()}-001
classification: 공개
---

{BODY}
"""
        ir = parse_markdown(md)

        # PDF
        pdf_path = out_dir / f"{tmpl}.pdf"
        t0 = time.time()
        try:
            PdfRenderer().render(ir, pdf_path)
            elapsed = (time.time() - t0) * 1000
            if pdf_path.exists() and pdf_path.stat().st_size > 30_000:
                print(f"  ✓ {tmpl:14s} [{cat:8s}]  pdf={pdf_path.stat().st_size:>7,}B  ({elapsed:.0f}ms)")
                ok["pdf"] += 1
            else:
                print(f"  ✗ {tmpl:14s}  pdf 실패")
                fail["pdf"] += 1
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ {tmpl:14s}  pdf 예외: {type(e).__name__}: {str(e)[:60]}")
            fail["pdf"] += 1

        # HWPX
        hwpx_path = out_dir / f"{tmpl}.hwpx"
        t0 = time.time()
        try:
            HwpxRenderer().render(ir, hwpx_path)
            elapsed = (time.time() - t0) * 1000
            if hwpx_path.exists() and hwpx_path.stat().st_size > 3_000:
                ok["hwpx"] += 1
            else:
                fail["hwpx"] += 1
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ {tmpl:14s}  hwpx 예외: {type(e).__name__}: {str(e)[:60]}")
            fail["hwpx"] += 1

    print()
    print(f"━━ PDF: ✓ {ok['pdf']}/{len(TEMPLATES)},  HWPX: ✓ {ok['hwpx']}/{len(TEMPLATES)}")
    print(f"📂 결과물: {out_dir}")
    return 0 if (fail['pdf'] + fail['hwpx'] == 0) else 1


if __name__ == "__main__":
    sys.exit(main())
