"""차트 22종 종합 렌더 검증."""
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.visuals import render_chart_to_png  # noqa: E402
from app.services.visuals.cache import cache_dir  # noqa: E402


SPECS = {
    "bar":             {"type": "bar", "title": "분기별 매출", "labels": ["1Q","2Q","3Q","4Q"], "datasets": [{"label": "2025", "data": [12,18,24,30]}, {"label": "2026", "data": [20,28,38,50]}], "show_values": True},
    "hbar":            {"type": "hbar", "title": "부서별 인원", "labels": ["기획","개발","디자인","운영"], "datasets": [{"data": [12,28,8,15]}]},
    "stacked_bar":     {"type": "stacked_bar", "title": "구성", "labels": ["A","B","C"], "datasets": [{"label": "X", "data": [10,20,15]}, {"label": "Y", "data": [5,8,12]}]},
    "percent_stacked": {"type": "percent_stacked", "title": "점유율", "labels": ["23","24","25","26"], "datasets": [{"label": "DocuAX", "data": [5,12,22,35]}, {"label": "경쟁사", "data": [40,38,35,30]}, {"label": "기타", "data": [55,50,43,35]}]},
    "waterfall":       {"type": "waterfall", "title": "손익", "labels": ["시작","매출","원가","순이익"], "datasets": [{"data": [0, 150, -60, 90]}]},

    "line":            {"type": "line", "title": "추이", "labels": ["1월","2월","3월","4월","5월"], "datasets": [{"label": "매출", "data": [10,20,35,55,80]}]},
    "step_line":       {"type": "step_line", "title": "가격", "labels": ["1월","2월","3월","4월"], "datasets": [{"label": "가격", "data": [9900, 9900, 12000, 12000]}]},
    "area":            {"type": "area", "title": "누적", "labels": ["1","2","3","4","5"], "datasets": [{"label": "누적", "data": [100,280,520,840,1200]}]},
    "mixed":           {"type": "mixed", "title": "매출+증가율", "labels": ["1Q","2Q","3Q","4Q"], "datasets": [{"label": "매출", "data": [120,180,260,340], "type": "bar"}, {"label": "증가율", "data": [10,18,25,30], "type": "line"}]},
    "dual_axis":       {"type": "dual_axis", "title": "매출(좌) 단가(우)", "labels": ["1Q","2Q","3Q","4Q"], "datasets": [{"label": "매출", "data": [120,180,260,340], "type": "bar", "axis": "left"}, {"label": "단가", "data": [50,55,62,70], "type": "line", "axis": "right"}]},

    "pie":             {"type": "pie", "title": "분포", "labels": ["A","B","C","D"], "datasets": [{"data": [40,30,20,10]}]},
    "donut":           {"type": "donut", "title": "예산", "labels": ["개발","운영","마케팅"], "datasets": [{"data": [50,30,20]}]},
    "funnel":          {"type": "funnel", "title": "전환", "labels": ["방문","가입","구매","리텐션"], "datasets": [{"data": [10000, 3200, 1200, 800]}]},

    "scatter":         {"type": "scatter", "title": "상관관계", "x_label": "X", "y_label": "Y", "datasets": [{"label": "데이터", "data": [[1,2],[2,4],[3,6],[4,5],[5,9],[6,11]]}]},
    "bubble":          {"type": "bubble", "title": "포지셔닝", "x_label": "X", "y_label": "Y", "datasets": [{"label": "회사", "data": [[10,5,100,"A"],[20,8,200,"B"],[30,7,150,"C"]]}]},
    "histogram":       {"type": "histogram", "title": "응답시간", "bins": 8, "datasets": [{"data": [50,55,60,65,70,72,75,80,82,85,88,90,92,95,100,110,120,150]}]},
    "boxplot":         {"type": "boxplot", "title": "분포 비교", "datasets": [{"label": "A", "data": [10,15,20,25,30,35,40]}, {"label": "B", "data": [12,18,22,26,30,34,38]}, {"label": "C", "data": [8,12,16,20,24,28,32]}]},

    "radar":           {"type": "radar", "title": "역량 평가", "labels": ["가격","성능","UX","지원","확장","보안"], "datasets": [{"label": "DocuAX", "data": [85,90,95,88,92,87]}, {"label": "경쟁사", "data": [70,75,65,80,70,78]}]},
    "gauge":           {"type": "gauge", "title": "달성률", "min": 0, "max": 100, "unit": "%", "datasets": [{"label": "5월", "data": [78]}]},

    "heatmap":         {"type": "heatmap", "title": "요일 시간대", "labels": ["00","06","12","18"], "datasets": [{"label": "월", "data": [5,45,80,90]}, {"label": "화", "data": [4,50,85,95]}, {"label": "수", "data": [6,52,88,98]}], "cmap": "Blues"},
    "treemap":         {"type": "treemap", "title": "제품 구성", "labels": ["변환","AI","RAG","기타"], "datasets": [{"data": [450, 280, 180, 90]}]},
    "polar":           {"type": "polar", "title": "방향별", "labels": ["N","NE","E","SE","S","SW","W","NW"], "datasets": [{"label": "풍속", "data": [12,15,8,5,7,10,18,22]}]},
}


def main() -> int:
    print(f"━ 차트 {len(SPECS)}종 검증")
    print(f"  캐시: {cache_dir()}")
    ok = 0
    fail = 0
    for name, spec in SPECS.items():
        t0 = time.time()
        try:
            p = render_chart_to_png(spec)
            elapsed = (time.time() - t0) * 1000
            if p and p.exists() and p.stat().st_size > 1000:
                print(f"  ✓ {name:18s} {p.stat().st_size:>7,} bytes ({elapsed:.0f}ms)")
                ok += 1
            else:
                print(f"  ✗ {name:18s} 실패 ({elapsed:.0f}ms)")
                fail += 1
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ {name:18s} 예외: {type(e).__name__}: {e}")
            fail += 1
    print()
    print(f"━ 결과: ✓ {ok}/{len(SPECS)} 통과, ✗ {fail} 실패")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
