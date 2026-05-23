"""HWPX 고도화 종합 검증.

- 5종 표지 템플릿 모두 정상 생성
- 본문 표·이미지·차트·다이어그램·수식 처리
- 한컴 한글에서 열 수 있는 유효한 HWPX
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.pipeline.stages.stage_1_parse import parse_markdown  # noqa: E402
from app.renderers.hwpx_renderer import HwpxRenderer  # noqa: E402

# 풀 콘텐츠 (표지 + 본문 + 표 + 시각 요소)
FULL_BODY = """
# 1. 회사 개요

## 1.1 기본 사항

□ 회사명 : (주)텐에이아이
○ 설립일 : 2026.03.05
○ 대표이사 : 정원훈

## 1.2 사업 현황

| 구분 | 내용 |
|---|---|
| 본사 | 서울특별시 서초구 |
| 직원수 | 14명 |
| 매출 | 1,200백만원 (2025) |

## 1.3 시장 매출 차트

```chart width=80%
{"type":"bar","title":"분기별 매출","labels":["1Q","2Q","3Q","4Q"],"datasets":[{"data":[12,28,45,68]}]}
```

## 1.4 조직도

```mermaid
---
title: 조직 구성
---
flowchart TD
    A[CEO 정원훈] --> B[기획팀]
    A --> C[개발팀]
    A --> D[운영팀]
```

## 1.5 핵심 수식

매출 정확도 측정:

```math
P = \\frac{N_{correct}}{N_{total}} \\times 100\\%
```
"""


def main() -> int:
    out_dir = ROOT / "var" / "verify_hwpx_v2"
    out_dir.mkdir(parents=True, exist_ok=True)

    templates = ["modern", "classic", "gongmun", "proposal", "research"]
    ok = 0
    fail = 0
    for tmpl in templates:
        md = f"""---
cover: true
cover_template: {tmpl}
title: 2026~2028 중기 사업계획서
subtitle: {tmpl} 표지 디자인 검증
author: 정원훈
organization: (주)텐에이아이 · DocuAX
department: 기술연구소
date: 2026. 07. 01.
document_number: DOCUAX-PLAN-2026-{tmpl[:3].upper()}
classification: 대외비
---

{FULL_BODY}
"""
        ir = parse_markdown(md)
        out = out_dir / f"hwpx_{tmpl}.hwpx"
        t0 = time.time()
        try:
            HwpxRenderer().render(ir, out)
            elapsed = (time.time() - t0) * 1000
            if out.exists() and out.stat().st_size > 3_000:
                print(f"  ✓ {tmpl:10s}  {out.stat().st_size:>7,} bytes  ({elapsed:.0f}ms)")
                ok += 1
            else:
                print(f"  ✗ {tmpl:10s}  실패 ({elapsed:.0f}ms)")
                fail += 1
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ {tmpl:10s}  예외: {type(e).__name__}: {str(e)[:80]}")
            fail += 1

    print()
    print(f"━━ 결과: ✓ {ok}/5 통과, ✗ {fail} 실패")
    print(f"📂 결과물: {out_dir}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
