"""수식 렌더러 — LaTeX → 고품질 PNG.

지원:
- matplotlib MathText (STIX/CM/DejaVu 폰트셋)
- `\\tag{...}` 사용자 정의 식 번호 (왼/오른쪽 정렬)
- `\\color{#hex}{...}` 컬러 지원
- multi-line 정렬 (`\\begin{aligned}...\\end{aligned}`) — MathText 가 \\begin 지원하면 사용
- 인라인 / display 분리 스타일
- DPI 400 (인쇄 품질)
- 옵션 usetex=True (시스템 LaTeX 설치 시 — 전 표기 LaTeX 사용)

설정 (env):
  DOCUAX_EQUATION_USETEX=1   → 시스템 LaTeX 활성화 (texlive·MiKTeX 필요)
  DOCUAX_EQUATION_FONTSET=stix | cm | dejavusans | dejavuserif (기본 stix)
"""
from __future__ import annotations

import os
import re
from pathlib import Path

from app.core.logging import get_logger
from app.services.visuals.cache import _hash_key, cache_path_for
from app.services.visuals.chart import _ensure_korean_font

log = get_logger(__name__)


def _allow_external() -> bool:
    return os.environ.get("DOCUAX_OFFLINE", "0") != "1"


def _render_codecogs(latex: str, out: Path, *, dpi: int = 300) -> Path | None:
    """latex.codecogs.com — LaTeX → PNG.

    matplotlib MathText 가 못 그리는 환경 (\\begin{pmatrix}, \\begin{cases} 등) 백업.
    무료 공개 서비스로 거의 모든 LaTeX 문법 지원.
    """
    try:
        import urllib.parse
        import httpx
    except ImportError:
        return None

    src = latex.strip()
    # codecogs 는 \begin{equation*} 등 환경 그대로 받음. 그냥 raw 전달.
    encoded = urllib.parse.quote(src)
    url = f"https://latex.codecogs.com/png.image?\\dpi{{{dpi}}}{encoded}"

    try:
        with httpx.Client(timeout=20.0, follow_redirects=True) as client:
            r = client.get(url)
            ctype = r.headers.get("content-type", "")
            if r.status_code != 200 or "image" not in ctype:
                log.warning("codecogs 실패", status=r.status_code, ctype=ctype, body=r.text[:200])
                return None
            out.write_bytes(r.content)
            log.info("수식 렌더 (codecogs)", out=str(out), size=len(r.content))
            return out
    except Exception as e:  # noqa: BLE001
        log.warning("codecogs 예외", error=str(e))
        return None


# 호환용 alias
_render_kroki_tex = _render_codecogs


# `\tag{...}` 추출 — MathText 는 \tag 미지원이므로 우리가 별도 렌더
_TAG_RE = re.compile(r"\\tag\{([^}]*)\}")


def _split_tag(latex: str) -> tuple[str, str]:
    """LaTeX 에서 `\\tag{X}` 분리 → (latex_without_tag, tag_text)."""
    m = _TAG_RE.search(latex)
    if not m:
        return latex, ""
    return _TAG_RE.sub("", latex).strip(), m.group(1)


def render_equation_to_png(
    *,
    latex: str = "",
    display: bool = False,
    font_size_pt: float = 14.0,
    number: int | None = None,
    show_box: bool | None = None,
    color: str | None = None,
    background: str | None = None,
    fontset: str | None = None,
    usetex: bool | None = None,
) -> Path | None:
    """LaTeX 수식 → 고품질 PNG.

    Args:
        latex: LaTeX 본문. `\\tag{X}` 가 있으면 자동으로 우측 번호.
        display: True면 block (큰 폰트), False면 inline.
        font_size_pt: 기본 폰트 크기.
        number: 식 번호 (None=표시 안 함). `\\tag{}` 가 우선.
        show_box: 부드러운 배경 박스. None=자동 (display 일 때만).
        color: 본문 색 ("#1F5BAF" 등).
        background: 박스 배경색 override.
        fontset: "stix" | "cm" | "dejavusans" | "dejavuserif".
        usetex: True/False/None(env 따름).
    """
    if not latex.strip():
        return None

    if fontset is None:
        fontset = os.environ.get("DOCUAX_EQUATION_FONTSET", "stix")
    if usetex is None:
        usetex = os.environ.get("DOCUAX_EQUATION_USETEX", "0") == "1"

    # \tag{} 처리 — number 인자보다 우선
    expr_raw, tag = _split_tag(latex.strip())
    if tag and number is None:
        # tag 가 숫자만이면 number, 그 외에는 그대로 문자열 표시
        try:
            number_display = tag
        except Exception:
            number_display = tag
    else:
        number_display = str(number) if number is not None else ""

    key = _hash_key(
        "equation-v3", expr_raw, str(display), str(font_size_pt),
        str(number_display), str(show_box), str(color), str(background),
        fontset, str(usetex),
    )
    out = cache_path_for(key, ".png")
    if out.exists():
        return out

    try:
        import matplotlib
        matplotlib.use("Agg", force=True)
        import matplotlib.pyplot as plt
    except ImportError:
        log.warning("matplotlib 미설치")
        return None

    _ensure_korean_font()

    # 폰트셋 설정
    plt.rcParams["mathtext.fontset"] = fontset
    plt.rcParams["mathtext.default"] = "regular"
    plt.rcParams["text.usetex"] = bool(usetex)

    # $..$ 자동 감싸기 (이미 감싸진 경우 스킵)
    expr = expr_raw
    if not (expr.startswith("$") and expr.endswith("$")):
        expr = f"${expr}$"

    size = font_size_pt * (1.7 if display else 1.0)
    use_box = show_box if show_box is not None else display
    text_color = color or "#1A1A1A"
    box_bg = background or "#F7F9FC"
    box_edge = color or "#D0DCEC"

    fig = plt.figure(figsize=(0.01, 0.01), dpi=200)
    try:
        kwargs = {"fontsize": size, "color": text_color}
        if use_box:
            kwargs["bbox"] = {
                "boxstyle": "round,pad=0.5",
                "facecolor": box_bg,
                "edgecolor": box_edge,
                "linewidth": 1.0,
            }
        fig.text(0.0, 0.0, expr, **kwargs)

        # 식 번호 — 우측에
        if number_display and display:
            fig.text(
                1.0, 0.0, f"({number_display})",
                fontsize=font_size_pt * 0.95,
                color="#666666",
                ha="right", va="center",
            )

        out.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(
            str(out),
            dpi=400,
            bbox_inches="tight",
            pad_inches=0.12,
            transparent=False,
            facecolor="white",
        )
        plt.close(fig)
        return out
    except Exception as e:  # noqa: BLE001
        plt.close(fig)
        # matplotlib MathText 가 못 그리는 환경(\begin{pmatrix}, \begin{cases} 등) →
        # kroki.io TeX 으로 fallback
        log.info("matplotlib 수식 실패 → kroki fallback 시도",
                 error=str(e)[:120], latex=latex[:80])
        if _allow_external():
            kroki_path = _render_kroki_tex(expr_raw, out)
            if kroki_path:
                # 번호가 있으면 별도 합성 (PIL 사용) — 일단 그대로 반환
                return kroki_path
        log.warning("수식 렌더 최종 실패", error=str(e), latex=latex[:80])
        return None


def render_inline_equation_to_png(latex: str, *, font_size_pt: float = 11.0) -> Path | None:
    """인라인 수식 — 본문 흐름 안에 들어갈 작은 PNG."""
    return render_equation_to_png(
        latex=latex,
        display=False,
        font_size_pt=font_size_pt,
        show_box=False,
    )
