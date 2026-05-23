"""차트 렌더러 — matplotlib 으로 JSON 스펙을 고품질 PNG 로.

지원 type (18+):
  [막대]    bar · hbar · stacked_bar · grouped_bar · percent_stacked · waterfall
  [선]      line · step_line · area · mixed · dual_axis
  [비율]    pie · donut · funnel
  [분포]    scatter · bubble · histogram · boxplot
  [평가]    radar · gauge
  [매트릭스] heatmap · treemap · polar

공통:
- DocuAX 브랜드 팔레트 + 데이터 라벨 + 천단위 콤마
- 200 DPI 고해상도 · 한국어 폰트 자동
- title · subtitle · x_label · y_label · show_values · horizontal_legend
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.logging import get_logger
from app.services.visuals.cache import _hash_key, cache_path_for

log = get_logger(__name__)


_KOR_FONT_REGISTERED = False
_KOR_FONT_NAME: str | None = None

# DocuAX 브랜드 팔레트 — 하늘색을 중심으로 조화롭게
_DOCUAX_PALETTE = [
    "#1F5BAF",  # 메인 — 짙은 하늘색
    "#3F8AE0",  # 보조 — 밝은 하늘색
    "#F4B400",  # 강조 — 황금색
    "#0F9D58",  # 성장 — 녹색
    "#DB4437",  # 경고 — 빨강
    "#9C27B0",  # 보라
    "#FF7043",  # 주황
    "#607D8B",  # 회색
]


def _ensure_korean_font() -> str | None:
    """matplotlib 에 한국어 폰트 등록 + 모던 스타일 적용."""
    global _KOR_FONT_REGISTERED, _KOR_FONT_NAME
    if _KOR_FONT_REGISTERED:
        return _KOR_FONT_NAME
    try:
        import matplotlib
        from matplotlib import font_manager

        candidates = [
            "C:/Windows/Fonts/malgun.ttf",
            "C:/Windows/Fonts/NanumGothic.ttf",
            "/System/Library/Fonts/AppleSDGothicNeo.ttc",
            "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        ]
        for p in candidates:
            if Path(p).exists():
                font_manager.fontManager.addfont(p)
                prop = font_manager.FontProperties(fname=p)
                name = prop.get_name()
                matplotlib.rcParams["font.family"] = name
                matplotlib.rcParams["axes.unicode_minus"] = False
                # ── 모던 스타일 기본값 ──
                matplotlib.rcParams.update({
                    "axes.spines.top": False,
                    "axes.spines.right": False,
                    "axes.spines.left": True,
                    "axes.spines.bottom": True,
                    "axes.edgecolor": "#555555",
                    "axes.linewidth": 0.8,
                    "axes.grid": True,
                    "axes.grid.axis": "y",
                    "grid.color": "#E0E0E0",
                    "grid.linestyle": "--",
                    "grid.linewidth": 0.6,
                    "grid.alpha": 0.7,
                    "xtick.color": "#444444",
                    "ytick.color": "#444444",
                    "xtick.major.size": 0,
                    "ytick.major.size": 0,
                    "legend.frameon": True,
                    "legend.framealpha": 0.95,
                    "legend.edgecolor": "#CCCCCC",
                    "legend.facecolor": "white",
                    "legend.fontsize": 10,
                    "figure.facecolor": "white",
                    "axes.facecolor": "white",
                    "axes.titleweight": "bold",
                    "axes.titlesize": 14,
                    "axes.titlepad": 14,
                })
                _KOR_FONT_NAME = name
                _KOR_FONT_REGISTERED = True
                log.info("matplotlib 한국어 폰트 + 모던 스타일", font=name, path=p)
                return name
        log.warning("matplotlib 한국어 폰트 후보 없음")
        _KOR_FONT_REGISTERED = True
        return None
    except Exception as e:  # noqa: BLE001
        log.warning("matplotlib 폰트 등록 실패", error=str(e))
        _KOR_FONT_REGISTERED = True
        return None


def _fmt_num(v: float) -> str:
    """천 단위 콤마. 정수면 정수로, 소수면 1자리."""
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if abs(v - round(v)) < 1e-9:
            return f"{int(round(v)):,}"
        return f"{v:,.1f}"
    return str(v)


def render_chart_to_png(spec: dict[str, Any], *, width_px: int = 1400) -> Path | None:
    """차트 스펙 → 고품질 PNG.

    spec 예:
      {
        "type": "bar|hbar|stacked_bar|grouped_bar|line|area|mixed|pie|donut|scatter",
        "title": "월별 매출",
        "subtitle": "단위: 백만원",  // 옵션
        "x_label": "월",
        "y_label": "매출",
        "labels": ["1월","2월","3월","4월"],
        "datasets": [
           {"label":"2024","data":[12,19,15,22],"color":"#1F5BAF","type":"bar"},
           {"label":"2025","data":[15,24,20,28],"color":"#F4B400","type":"line"}
        ],
        "show_values": true,    // 데이터 라벨 자동 표시
        "horizontal_legend": false
      }
    """
    if not spec:
        return None

    key = _hash_key("chart-v2", json.dumps(spec, sort_keys=True, ensure_ascii=False), str(width_px))
    out = cache_path_for(key, ".png")
    if out.exists():
        return out

    try:
        import matplotlib
        matplotlib.use("Agg", force=True)
        import matplotlib.pyplot as plt
        from matplotlib.patches import FancyBboxPatch  # noqa: F401
    except ImportError:
        log.warning("matplotlib 미설치")
        return None

    _ensure_korean_font()

    chart_type = (spec.get("type") or "bar").lower()
    title = spec.get("title", "")
    subtitle = spec.get("subtitle", "")
    x_label = spec.get("x_label", "")
    y_label = spec.get("y_label", "")
    labels = spec.get("labels") or []
    datasets = spec.get("datasets") or []
    show_values = bool(spec.get("show_values", True))

    if not datasets:
        log.warning("차트 datasets 없음")
        return None

    fig_w = width_px / 120  # 120 dpi
    fig_h = fig_w * 0.58
    fig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=120)

    try:
        # ── BAR / HBAR / GROUPED / STACKED ──
        if chart_type in ("bar", "hbar", "grouped_bar", "stacked_bar"):
            n = len(datasets)
            x = list(range(len(labels)))
            stacked = chart_type == "stacked_bar"
            bar_w = 0.75 if stacked else 0.8 / max(n, 1)

            bottoms = [0.0] * len(labels)
            for i, ds in enumerate(datasets):
                color = ds.get("color") or _DOCUAX_PALETTE[i % len(_DOCUAX_PALETTE)]
                data = ds.get("data") or []
                if stacked:
                    bars = ax.bar(
                        x, data, width=bar_w, color=color,
                        label=ds.get("label", ""), bottom=bottoms,
                        edgecolor="white", linewidth=0.5,
                    )
                    bottoms = [b + d for b, d in zip(bottoms, data)]
                else:
                    offsets = [xi + (i - (n - 1) / 2) * bar_w for xi in x]
                    if chart_type == "hbar":
                        bars = ax.barh(
                            offsets, data, height=bar_w, color=color,
                            label=ds.get("label", ""), edgecolor="white", linewidth=0.5,
                        )
                    else:
                        bars = ax.bar(
                            offsets, data, width=bar_w, color=color,
                            label=ds.get("label", ""), edgecolor="white", linewidth=0.5,
                        )
                # 데이터 라벨
                if show_values:
                    for b, v in zip(bars, data):
                        if chart_type == "hbar":
                            ax.text(b.get_width() + max(data) * 0.01, b.get_y() + b.get_height() / 2,
                                    _fmt_num(v), va="center", fontsize=9, color="#333333")
                        else:
                            y_pos = (b.get_y() + b.get_height()) if stacked else b.get_height()
                            ax.text(b.get_x() + b.get_width() / 2, y_pos + max([max(d.get("data") or [0]) for d in datasets]) * 0.01,
                                    _fmt_num(v), ha="center", fontsize=9, color="#333333")

            if chart_type == "hbar":
                ax.set_yticks(x)
                ax.set_yticklabels(labels)
                ax.invert_yaxis()
                ax.grid(axis="x", alpha=0.5)
                ax.set_axisbelow(True)
            else:
                ax.set_xticks(x)
                ax.set_xticklabels(labels)
                ax.set_axisbelow(True)

        # ── LINE / AREA ──
        elif chart_type in ("line", "area"):
            x = labels if labels else list(range(len(datasets[0].get("data", []))))
            for i, ds in enumerate(datasets):
                color = ds.get("color") or _DOCUAX_PALETTE[i % len(_DOCUAX_PALETTE)]
                data = ds.get("data", [])
                if chart_type == "area":
                    ax.fill_between(range(len(x)), data, alpha=0.25, color=color)
                ax.plot(
                    range(len(x)), data,
                    marker="o", markersize=7, color=color,
                    label=ds.get("label", ""), linewidth=2.4,
                    markeredgecolor="white", markeredgewidth=1.5,
                )
                if show_values:
                    for xi, v in enumerate(data):
                        ax.annotate(
                            _fmt_num(v), (xi, v),
                            textcoords="offset points", xytext=(0, 8),
                            ha="center", fontsize=9, color="#333333",
                        )
            ax.set_xticks(range(len(x)))
            ax.set_xticklabels([str(s) for s in x])
            ax.set_axisbelow(True)

        # ── MIXED — 데이터셋별 type 다름 ──
        elif chart_type == "mixed":
            x = list(range(len(labels)))
            for i, ds in enumerate(datasets):
                color = ds.get("color") or _DOCUAX_PALETTE[i % len(_DOCUAX_PALETTE)]
                ds_type = (ds.get("type") or "bar").lower()
                data = ds.get("data", [])
                if ds_type == "line":
                    ax.plot(
                        x, data, marker="o", markersize=7, color=color,
                        label=ds.get("label", ""), linewidth=2.4,
                        markeredgecolor="white", markeredgewidth=1.5,
                    )
                else:
                    ax.bar(x, data, width=0.5, color=color, alpha=0.85,
                           label=ds.get("label", ""), edgecolor="white", linewidth=0.5)
            ax.set_xticks(x)
            ax.set_xticklabels(labels)
            ax.set_axisbelow(True)

        # ── PIE / DONUT ──
        elif chart_type in ("pie", "donut"):
            ds = datasets[0]
            data = ds.get("data") or []
            colors = ds.get("colors") or _DOCUAX_PALETTE[: len(data)]
            wedge_kwargs = {
                "edgecolor": "white",
                "linewidth": 2.0,
            }
            if chart_type == "donut":
                wedge_kwargs["width"] = 0.45
            wedges, texts, autotexts = ax.pie(
                data, labels=labels, colors=colors[: len(data)],
                autopct=lambda p: f"{p:.1f}%" if p >= 3 else "",
                startangle=90, pctdistance=0.78,
                wedgeprops=wedge_kwargs,
                textprops={"fontsize": 11, "color": "#333"},
            )
            for at in autotexts:
                at.set_fontsize(10)
                at.set_fontweight("bold")
                at.set_color("white")
            ax.set_aspect("equal")
            # donut 중앙 합계
            if chart_type == "donut" and show_values:
                total = sum(data)
                ax.text(0, 0, f"합계\n{_fmt_num(total)}",
                        ha="center", va="center",
                        fontsize=12, fontweight="bold", color="#1F5BAF")
            # 격자 제거
            ax.grid(False)

        # ── SCATTER ──
        elif chart_type == "scatter":
            for i, ds in enumerate(datasets):
                color = ds.get("color") or _DOCUAX_PALETTE[i % len(_DOCUAX_PALETTE)]
                pts = ds.get("data") or []
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                ax.scatter(xs, ys, color=color, label=ds.get("label", ""),
                           s=80, alpha=0.75, edgecolors="white", linewidths=1.2)
            ax.set_axisbelow(True)

        # ── BUBBLE — scatter + 가변 크기 ──
        elif chart_type == "bubble":
            for i, ds in enumerate(datasets):
                color = ds.get("color") or _DOCUAX_PALETTE[i % len(_DOCUAX_PALETTE)]
                pts = ds.get("data") or []  # [x, y, size]
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                sizes = [(p[2] if len(p) > 2 else 100) * 8 for p in pts]
                ax.scatter(xs, ys, s=sizes, color=color, alpha=0.55,
                           edgecolors="white", linewidths=1.5, label=ds.get("label", ""))
                # 데이터 라벨 (있으면)
                if show_values:
                    for j, (x, y) in enumerate(zip(xs, ys)):
                        label = pts[j][3] if len(pts[j]) > 3 else None
                        if label:
                            ax.annotate(str(label), (x, y), fontsize=9,
                                        ha="center", va="center", color="#1A1A1A")
            ax.set_axisbelow(True)

        # ── PERCENT STACKED BAR (100% 누적) ──
        elif chart_type == "percent_stacked":
            n_cats = len(labels)
            totals = [
                sum(ds.get("data", [0] * n_cats)[k] for ds in datasets)
                for k in range(n_cats)
            ]
            bottoms = [0.0] * n_cats
            x = list(range(n_cats))
            for i, ds in enumerate(datasets):
                color = ds.get("color") or _DOCUAX_PALETTE[i % len(_DOCUAX_PALETTE)]
                data = ds.get("data", [])
                pct = [
                    (d / totals[k] * 100) if totals[k] else 0
                    for k, d in enumerate(data)
                ]
                bars = ax.bar(x, pct, width=0.7, color=color,
                              bottom=bottoms, label=ds.get("label", ""),
                              edgecolor="white", linewidth=0.5)
                if show_values:
                    for b, p in zip(bars, pct):
                        if p > 4:
                            ax.text(
                                b.get_x() + b.get_width() / 2,
                                b.get_y() + b.get_height() / 2,
                                f"{p:.0f}%", ha="center", va="center",
                                fontsize=9, color="white", fontweight="bold",
                            )
                bottoms = [b + p for b, p in zip(bottoms, pct)]
            ax.set_xticks(x)
            ax.set_xticklabels(labels)
            ax.set_ylim(0, 100)
            ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _p: f"{v:.0f}%"))
            ax.set_axisbelow(True)

        # ── WATERFALL — 누적 변화 ──
        elif chart_type == "waterfall":
            ds = datasets[0]
            data = ds.get("data") or []
            cum = 0.0
            for i, (lbl, v) in enumerate(zip(labels, data)):
                # 첫·마지막은 보통 절대값 (시작·합계), 중간은 ±변화
                is_total = (i == 0 or i == len(labels) - 1) and v >= 0
                if is_total:
                    bottom = 0
                    height = v
                    color = "#1F5BAF"
                    cum = v if i == 0 else cum
                else:
                    bottom = cum
                    height = v
                    color = "#0F9D58" if v >= 0 else "#DB4437"
                    cum += v
                ax.bar(i, height, bottom=bottom, color=color, width=0.65,
                       edgecolor="white", linewidth=0.5)
                if show_values:
                    ax.text(i, bottom + height + max([abs(x) for x in data]) * 0.02,
                            _fmt_num(v), ha="center", fontsize=9, color="#333")
            ax.set_xticks(range(len(labels)))
            ax.set_xticklabels(labels, rotation=0)
            ax.set_axisbelow(True)

        # ── FUNNEL ──
        elif chart_type == "funnel":
            ds = datasets[0]
            data = ds.get("data") or []
            mx = max(data) if data else 1
            for i, (lbl, v) in enumerate(zip(labels, data)):
                # 사다리꼴 형태 — 위에서 아래로 좁아짐
                w = (v / mx)
                color = _DOCUAX_PALETTE[i % len(_DOCUAX_PALETTE)]
                ax.barh(i, w, color=color, height=0.78, alpha=0.85,
                        edgecolor="white", linewidth=2)
                # 가운데 정렬을 위해 음수 보정
                ax.barh(i, -w, color=color, height=0.78, alpha=0.85,
                        edgecolor="white", linewidth=2)
                if show_values:
                    ax.text(0, i, f"{lbl} · {_fmt_num(v)}",
                            ha="center", va="center", fontsize=11,
                            fontweight="bold", color="white")
            ax.set_yticks([])
            ax.set_xticks([])
            ax.set_xlim(-1.1, 1.1)
            ax.invert_yaxis()
            for s in ("top", "right", "left", "bottom"):
                ax.spines[s].set_visible(False)
            ax.grid(False)

        # ── HISTOGRAM ──
        elif chart_type == "histogram":
            for i, ds in enumerate(datasets):
                color = ds.get("color") or _DOCUAX_PALETTE[i % len(_DOCUAX_PALETTE)]
                vals = ds.get("data") or []
                bins = ds.get("bins") or spec.get("bins") or 10
                ax.hist(vals, bins=bins, color=color, edgecolor="white",
                        linewidth=0.6, alpha=0.85, label=ds.get("label", ""))
            ax.set_axisbelow(True)

        # ── BOXPLOT ──
        elif chart_type in ("boxplot", "box"):
            box_data = [ds.get("data") or [] for ds in datasets]
            box_labels = [ds.get("label", f"#{i+1}") for i, ds in enumerate(datasets)]
            bp = ax.boxplot(
                box_data, labels=box_labels, patch_artist=True,
                boxprops={"linewidth": 1.2},
                medianprops={"color": "#0F1A3D", "linewidth": 2},
                whiskerprops={"linewidth": 1.0, "color": "#555"},
                capprops={"linewidth": 1.0, "color": "#555"},
                flierprops={"marker": "o", "markerfacecolor": "#DB4437",
                            "markersize": 5, "markeredgecolor": "none"},
            )
            for patch, color in zip(bp["boxes"], _DOCUAX_PALETTE):
                patch.set_facecolor(color)
                patch.set_alpha(0.65)
            ax.set_axisbelow(True)

        # ── RADAR ──
        elif chart_type == "radar":
            import math

            plt.close(fig)
            n_axes = len(labels)
            angles = [n / float(n_axes) * 2 * math.pi for n in range(n_axes)]
            angles += angles[:1]
            fig, ax = plt.subplots(
                figsize=(fig_w * 0.85, fig_w * 0.85),
                subplot_kw={"polar": True}, dpi=120,
            )
            for i, ds in enumerate(datasets):
                color = ds.get("color") or _DOCUAX_PALETTE[i % len(_DOCUAX_PALETTE)]
                vals = list(ds.get("data", []))
                if len(vals) < n_axes:
                    vals += [0] * (n_axes - len(vals))
                vals = vals[:n_axes]
                vals += vals[:1]
                ax.plot(angles, vals, color=color, linewidth=2.4,
                        label=ds.get("label", ""), marker="o", markersize=6,
                        markeredgecolor="white", markeredgewidth=1.2)
                ax.fill(angles, vals, color=color, alpha=0.18)
            ax.set_xticks(angles[:-1])
            ax.set_xticklabels(labels, fontsize=10, color="#333")
            ax.set_rlabel_position(45)
            ax.tick_params(axis="y", labelsize=8, colors="#888")
            ax.grid(color="#E0E0E0", linestyle="--", linewidth=0.6)
            ax.spines["polar"].set_color("#CCC")

        # ── GAUGE — 반원형 KPI ──
        elif chart_type == "gauge":
            import math

            plt.close(fig)
            fig, ax = plt.subplots(figsize=(fig_w * 0.85, fig_w * 0.5), dpi=120)
            ds = datasets[0]
            value = float(ds.get("data", [0])[0]) if ds.get("data") else 0
            min_v = float(spec.get("min", 0))
            max_v = float(spec.get("max", 100))
            value = max(min_v, min(max_v, value))
            frac = (value - min_v) / max(max_v - min_v, 1e-9)

            # 반원 (180°~0°)
            theta = [math.pi * (1 - t / 100) for t in range(101)]
            radius = 1
            # 배경 호
            ax.plot(
                [r * math.cos(t) for r, t in zip([radius] * 101, theta)],
                [r * math.sin(t) for r, t in zip([radius] * 101, theta)],
                color="#E0E0E0", linewidth=24, solid_capstyle="round",
            )
            # 채워진 호
            theta_fill = theta[: int(101 * frac) + 1]
            color = ds.get("color") or (
                "#0F9D58" if frac >= 0.7 else "#F4B400" if frac >= 0.4 else "#DB4437"
            )
            ax.plot(
                [r * math.cos(t) for r, t in zip([radius] * len(theta_fill), theta_fill)],
                [r * math.sin(t) for r, t in zip([radius] * len(theta_fill), theta_fill)],
                color=color, linewidth=24, solid_capstyle="round",
            )
            # 중앙 텍스트
            ax.text(0, -0.05, _fmt_num(value), ha="center", va="center",
                    fontsize=42, fontweight="bold", color=color)
            ax.text(0, -0.32, ds.get("label", "") or spec.get("unit", ""),
                    ha="center", va="center", fontsize=11, color="#666")
            ax.text(-radius * 1.05, -0.1, _fmt_num(min_v), ha="right", fontsize=9, color="#888")
            ax.text(radius * 1.05, -0.1, _fmt_num(max_v), ha="left", fontsize=9, color="#888")
            ax.set_xlim(-radius * 1.2, radius * 1.2)
            ax.set_ylim(-0.5, radius * 1.15)
            ax.set_aspect("equal")
            ax.axis("off")

        # ── HEATMAP ──
        elif chart_type == "heatmap":
            import numpy as np

            # datasets 각각이 한 행
            data = np.array([ds.get("data", []) for ds in datasets])
            if data.size == 0:
                plt.close(fig)
                return None
            y_labels = [ds.get("label", f"#{i+1}") for i, ds in enumerate(datasets)]
            cmap = spec.get("cmap", "Blues")
            im = ax.imshow(data, cmap=cmap, aspect="auto")
            ax.set_xticks(range(len(labels)))
            ax.set_xticklabels(labels)
            ax.set_yticks(range(len(y_labels)))
            ax.set_yticklabels(y_labels)
            # 값 라벨
            if show_values:
                vmax = data.max()
                for ri in range(data.shape[0]):
                    for ci in range(data.shape[1]):
                        v = data[ri, ci]
                        color = "white" if v > vmax * 0.55 else "#1A1A1A"
                        ax.text(ci, ri, _fmt_num(v), ha="center", va="center",
                                fontsize=9, color=color)
            cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
            cbar.ax.tick_params(labelsize=8, colors="#666")
            ax.grid(False)

        # ── TREEMAP ──
        elif chart_type == "treemap":
            try:
                import squarify  # noqa: F401
            except ImportError:
                # squarify 없으면 직접 그리기 — 간단한 박스 분할
                squarify = None  # type: ignore[assignment]
            ds = datasets[0]
            sizes = ds.get("data") or []
            colors = ds.get("colors") or _DOCUAX_PALETTE[: len(sizes)]
            if squarify is None:
                # fallback: 가로 분할만
                total = sum(sizes)
                x = 0
                for i, (s, lbl) in enumerate(zip(sizes, labels)):
                    w = s / total
                    color = colors[i % len(colors)]
                    ax.barh(0, w, left=x, color=color, height=1,
                            edgecolor="white", linewidth=2)
                    if w > 0.05 and show_values:
                        ax.text(x + w / 2, 0, f"{lbl}\n{_fmt_num(s)}",
                                ha="center", va="center",
                                fontsize=11, fontweight="bold", color="white")
                    x += w
                ax.set_xlim(0, 1)
                ax.set_ylim(-0.5, 0.5)
                ax.axis("off")
            else:
                squarify.plot(  # type: ignore[union-attr]
                    sizes=sizes, label=labels, color=colors,
                    ax=ax, alpha=0.9, edgecolor="white", linewidth=2,
                    text_kwargs={"fontsize": 11, "color": "white", "fontweight": "bold"},
                )
                ax.axis("off")

        # ── STEP LINE ──
        elif chart_type == "step_line":
            x = labels if labels else list(range(len(datasets[0].get("data", []))))
            for i, ds in enumerate(datasets):
                color = ds.get("color") or _DOCUAX_PALETTE[i % len(_DOCUAX_PALETTE)]
                data = ds.get("data", [])
                ax.step(range(len(x)), data, where="post", marker="o", markersize=6,
                        color=color, label=ds.get("label", ""), linewidth=2.4,
                        markeredgecolor="white", markeredgewidth=1.2)
                if show_values:
                    for xi, v in enumerate(data):
                        ax.annotate(_fmt_num(v), (xi, v),
                                    textcoords="offset points", xytext=(0, 8),
                                    ha="center", fontsize=9, color="#333")
            ax.set_xticks(range(len(x)))
            ax.set_xticklabels([str(s) for s in x])
            ax.set_axisbelow(True)

        # ── DUAL AXIS — 좌우 두 축 ──
        elif chart_type == "dual_axis":
            ax2 = ax.twinx()
            x = list(range(len(labels)))
            for i, ds in enumerate(datasets):
                color = ds.get("color") or _DOCUAX_PALETTE[i % len(_DOCUAX_PALETTE)]
                ds_type = (ds.get("type") or ("bar" if i == 0 else "line")).lower()
                axis = (ds.get("axis") or ("left" if i == 0 else "right")).lower()
                target = ax if axis == "left" else ax2
                data = ds.get("data", [])
                if ds_type == "line":
                    target.plot(x, data, marker="o", color=color,
                                label=ds.get("label", ""), linewidth=2.4,
                                markeredgecolor="white", markeredgewidth=1.2, markersize=7)
                else:
                    target.bar(x, data, width=0.5, color=color,
                               label=ds.get("label", ""), edgecolor="white",
                               linewidth=0.5, alpha=0.85)
            ax.set_xticks(x)
            ax.set_xticklabels(labels)
            ax.set_axisbelow(True)
            ax2.spines["top"].set_visible(False)
            # 두 legend 합치기
            h1, l1 = ax.get_legend_handles_labels()
            h2, l2 = ax2.get_legend_handles_labels()
            ax.legend(h1 + h2, l1 + l2, loc="upper left",
                      bbox_to_anchor=(1.08, 1.0), frameon=True, fontsize=10)

        # ── POLAR (극좌표) ──
        elif chart_type == "polar":
            import math

            plt.close(fig)
            n_axes = len(labels)
            angles = [n / float(n_axes) * 2 * math.pi for n in range(n_axes)]
            fig, ax = plt.subplots(
                figsize=(fig_w * 0.85, fig_w * 0.85),
                subplot_kw={"polar": True}, dpi=120,
            )
            for i, ds in enumerate(datasets):
                color = ds.get("color") or _DOCUAX_PALETTE[i % len(_DOCUAX_PALETTE)]
                vals = ds.get("data") or []
                ax.bar(angles, vals, color=color, alpha=0.75, width=0.6,
                       label=ds.get("label", ""), edgecolor="white", linewidth=1.2)
            ax.set_xticks(angles)
            ax.set_xticklabels(labels, fontsize=10, color="#333")
            ax.grid(color="#E0E0E0", linestyle="--", linewidth=0.6)

        else:
            log.warning("알 수 없는 차트 type", type=chart_type)
            plt.close(fig)
            return None

        # ── 제목 + 부제 ──
        if title:
            ax.set_title(title, fontsize=15, fontweight="bold", color="#1A1A1A", pad=14, loc="left")
        if subtitle:
            ax.text(
                0.0, 1.02, subtitle,
                transform=ax.transAxes, fontsize=10.5,
                color="#666666", ha="left", va="bottom",
                style="italic",
            )

        # 폴라(radar/polar/gauge·funnel/treemap 등)는 일반 축 라벨/포맷터 미적용
        _no_axes_chart = {"pie", "donut", "radar", "gauge", "polar", "funnel", "treemap"}

        # ── 축 라벨 ──
        if x_label and chart_type not in _no_axes_chart:
            ax.set_xlabel(x_label, fontsize=11, color="#444", labelpad=8)
        if y_label and chart_type not in _no_axes_chart:
            ax.set_ylabel(y_label, fontsize=11, color="#444", labelpad=8)

        # y축 천 단위 콤마 (적용 가능한 차트만)
        if chart_type not in _no_axes_chart | {"hbar", "scatter", "bubble", "heatmap", "percent_stacked", "boxplot", "box"}:
            try:
                ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _p: _fmt_num(v)))
            except Exception:
                pass
        if chart_type == "hbar":
            ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda v, _p: _fmt_num(v)))

        # ── legend ──
        needs_legend = (
            len(datasets) > 1
            and chart_type not in _no_axes_chart | {"waterfall", "dual_axis", "boxplot", "box"}
        ) or chart_type == "line"
        if needs_legend:
            try:
                ax.legend(
                    loc="upper left", bbox_to_anchor=(1.01, 1.0),
                    frameon=True, fontsize=10, borderaxespad=0,
                )
            except Exception:
                pass

        fig.tight_layout()
        out.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(
            str(out), dpi=200, bbox_inches="tight",
            facecolor="white", edgecolor="none", pad_inches=0.2,
        )
        plt.close(fig)
        return out
    except Exception as e:  # noqa: BLE001
        plt.close(fig)
        log.warning("차트 렌더 실패", error=str(e), type=chart_type)
        return None
