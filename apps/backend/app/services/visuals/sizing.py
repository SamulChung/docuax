"""시각 요소 크기 통일 변환 — % · px · pt · mm · cm 자유 입력 → 통일 단위.

지원 단위:
  "70%"      → 본문 폭 대비 비율 (렌더러가 페이지 폭으로 계산)
  "400px"    → 픽셀 (96dpi 기준 → pt 변환)
  "300pt"    → 포인트
  "120mm"    → 밀리미터
  "12cm"     → 센티미터
  "5in"      → 인치
숫자만 입력 시 px 로 간주.

사용:
  size = parse_size("70%")        → {"value": 70.0, "unit": "%"}
  pt = to_pt("120mm")              → 340.16
  css = to_css("70%")              → "70%"
"""
from __future__ import annotations

import re

_SIZE_RE = re.compile(r"^\s*(?P<v>[+-]?\d+(?:\.\d+)?)\s*(?P<u>%|px|pt|mm|cm|in)?\s*$", re.IGNORECASE)


def parse_size(s: str | None) -> tuple[float, str] | None:
    """크기 문자열 → (value, unit). 형식 불량이면 None.

    예: "70%" → (70.0, "%"), "400px" → (400.0, "px"), "" → None
    """
    if not s:
        return None
    m = _SIZE_RE.match(str(s).strip())
    if not m:
        return None
    val = float(m.group("v"))
    unit = (m.group("u") or "px").lower()
    return (val, unit)


def to_pt(s: str | None, *, body_pt: float = 480.0) -> float | None:
    """크기 문자열 → pt 변환.

    Args:
        s: 크기 문자열
        body_pt: 본문 폭(% 계산 기준). A4 25mm 여백 ≈ 480pt.

    Returns:
        pt 단위 float 또는 None.
    """
    parsed = parse_size(s)
    if not parsed:
        return None
    val, unit = parsed
    if unit == "%":
        return body_pt * val / 100.0
    if unit == "px":
        return val * 72.0 / 96.0  # 96dpi 기준
    if unit == "pt":
        return val
    if unit == "mm":
        return val * 72.0 / 25.4
    if unit == "cm":
        return val * 72.0 / 2.54
    if unit == "in":
        return val * 72.0
    return None


def to_css(s: str | None) -> str:
    """크기 문자열 → CSS width/height 값 (그대로 전달).

    % 은 그대로, 나머지는 명시적 단위로.
    """
    parsed = parse_size(s)
    if not parsed:
        return ""
    val, unit = parsed
    if unit == "%":
        return f"{val:g}%"
    return f"{val:g}{unit}"


def to_cm(s: str | None, *, body_cm: float = 16.0) -> float | None:
    """크기 → cm (python-docx Cm 등에 직접 사용)."""
    pt = to_pt(s, body_pt=body_cm * 72.0 / 2.54)
    if pt is None:
        return None
    return pt * 2.54 / 72.0


def to_mm(s: str | None, *, body_mm: float = 160.0) -> float | None:
    """크기 → mm."""
    cm = to_cm(s, body_cm=body_mm / 10.0)
    if cm is None:
        return None
    return cm * 10.0
