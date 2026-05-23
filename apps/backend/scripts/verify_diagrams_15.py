"""다이어그램 15종 종합 렌더 검증.

각 mermaid 다이어그램 타입이 모두 정상 PNG 로 변환되는지 확인.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.visuals import render_diagram_to_png  # noqa: E402
from app.services.visuals.cache import cache_dir  # noqa: E402


DIAGRAMS = {
    "flowchart_lr": "flowchart LR\n    A[시작] --> B{판단}\n    B -->|예| C[처리]\n    B -->|아니오| D[종료]\n    C --> D",
    "flowchart_td": "flowchart TD\n    A[요청] --> B[검토]\n    B --> C{승인}\n    C -->|승인| D[완료]",
    "sequence": "sequenceDiagram\n    participant 사용자\n    participant 시스템\n    사용자->>시스템: 로그인\n    시스템-->>사용자: 토큰",
    "class": "classDiagram\n    class 사용자 {\n        +String 이름\n        +로그인()\n    }\n    class 관리자\n    사용자 <|-- 관리자",
    "state": "stateDiagram-v2\n    [*] --> 작성중\n    작성중 --> 검토 : 제출\n    검토 --> 승인\n    승인 --> [*]",
    "er": "erDiagram\n    USER ||--o{ DOC : 작성\n    USER {\n        string id PK\n        string email\n    }",
    "gantt": "gantt\n    title 일정\n    dateFormat YYYY-MM-DD\n    section 개발\n    백엔드 :a1, 2026-01-01, 30d\n    프론트엔드 :a2, after a1, 30d",
    "pie": 'pie title 부서 비율\n    "기획" : 25\n    "개발" : 45\n    "운영" : 30',
    "journey": "journey\n    title 여정\n    section 시작\n      로그인: 5: 사용자\n      대시보드: 4: 사용자",
    "quadrant": "quadrantChart\n    title 우선순위\n    x-axis 낮은 긴급도 --> 높은 긴급도\n    y-axis 낮은 중요도 --> 높은 중요도\n    quadrant-1 즉시\n    quadrant-2 계획\n    quadrant-3 위임\n    quadrant-4 제거\n    핵심: [0.8, 0.85]",
    "mindmap": "mindmap\n  root((DocuAX))\n    문서\n      마크다운\n      AI\n    출력\n      HWPX\n      DOCX",
    "timeline": "timeline\n    title 로드맵\n    2026.03 : 법인 설립\n    2026.05 : 베타\n    2026.07 : 정식 출시",
    "gitgraph": "gitGraph\n    commit id: \"init\"\n    branch dev\n    checkout dev\n    commit\n    checkout main\n    merge dev",
    "c4": "C4Context\n    title 시스템\n    Person(user, \"사용자\")\n    System(sys, \"DocuAX\")\n    Rel(user, sys, \"사용\")",
    "requirement": "requirementDiagram\n    requirement test_req {\n        id: 1\n        text: the test text.\n        risk: high\n        verifymethod: test\n    }\n    element test_entity {\n        type: simulation\n    }\n    test_entity - satisfies -> test_req",
}


def section(title: str) -> None:
    print()
    print(f"━━ {title} " + "━" * (40 - len(title)))


def main() -> int:
    section(f"다이어그램 15종 렌더 검증 (mermaid)")
    print(f"  캐시: {cache_dir()}")
    print()

    ok = 0
    fail = 0
    for name, src in DIAGRAMS.items():
        t0 = time.time()
        try:
            p = render_diagram_to_png(engine="mermaid", source=src)
            elapsed = (time.time() - t0) * 1000
            if p and p.exists() and p.stat().st_size > 500:
                print(f"  ✓ {name:14s} {p.stat().st_size:>7,} bytes ({elapsed:.0f}ms)")
                ok += 1
            else:
                print(f"  ✗ {name:14s} 실패 ({elapsed:.0f}ms)")
                fail += 1
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ {name:14s} 예외: {e}")
            fail += 1

    print()
    print(f"━ 결과: ✓ {ok}/{len(DIAGRAMS)} 통과, ✗ {fail} 실패")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
