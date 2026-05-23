"""HTML 프롬프트 핸드북 → 프롬프트 카드 자동 추출.

지원 패턴 (실측 3종):
  1. prompts.html / prompt-site.html (의료기기 AI 영업·문구조합 강의)
     <div class="prompt-card">
       <div class="card-title">…</div>
       <div class="card-desc">…</div>
       <div class="card-tags"><span class="tag">…</span>…</div>
       <pre>…본문…</pre>   ← 또는 <div class="prompt-content">…</div>

  2. AI활용_프롬프트_모음_경인지방데이터청.html
     <div class="prompt-card">
       <div class="prompt-title"><span class="num">1</span>제목</div>
       <div class="tag-row"><span class="tag-sm">…</span>…</div>
       <div class="prompt-body"><div class="prompt-text">…본문…</div></div>

설계:
- BeautifulSoup으로 .prompt-card 만 잡고, 안에서 가능한 선택자를 모두 시도
- 섹션 헤더(.section-title)로부터 가까운 조상 섹션을 카테고리로 사용
- 회사 라벨은 인자로 받음 (사용자가 "문구조합", "경인지방데이터청" 등을 지정)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.core.logging import get_logger

log = get_logger(__name__)


@dataclass
class ParsedPrompt:
    title: str
    description: str = ""
    content: str = ""
    category: str = ""
    tags: list[str] = field(default_factory=list)


@dataclass
class ExtractionResult:
    prompts: list[ParsedPrompt]
    detected_label: str = ""  # <title> 등에서 추정한 라벨
    warnings: list[str] = field(default_factory=list)


def _norm(text: str) -> str:
    """공백 정리: 연속 공백 1칸, 양끝 strip."""
    return re.sub(r"[\t ]+", " ", text).strip()


def _clean_lines(text: str) -> str:
    """줄바꿈은 보존하되 양끝 공백·연속 빈줄 정리."""
    lines = [ln.rstrip() for ln in text.splitlines()]
    out: list[str] = []
    empty = 0
    for ln in lines:
        if not ln.strip():
            empty += 1
            if empty <= 1:
                out.append("")
        else:
            out.append(ln)
            empty = 0
    return "\n".join(out).strip()


def _extract_title(card) -> str:
    """카드 안에서 제목 추출.

    .card-title 또는 .prompt-title. prompt-title 의 .num 은 제거.
    """
    el = card.select_one(".card-title, .prompt-title")
    if not el:
        # 폴백 — h3/h4/h5 등 헤딩
        el = card.find(["h3", "h4", "h5"])
    if not el:
        return ""
    # .num span 제거 (1, 2 … 같은 번호 마커)
    text_el = el
    for marker in text_el.select(".num"):
        marker.extract()
    return _norm(text_el.get_text(" ", strip=True))


def _extract_description(card) -> str:
    el = card.select_one(".card-desc, .prompt-desc")
    return _norm(el.get_text(" ", strip=True)) if el else ""


def _extract_tags(card) -> list[str]:
    """tag 클래스를 가진 모든 자식 추출 (.tag, .tag-sm, .tag-blue 등)."""
    seen: list[str] = []
    selectors = [
        ".card-tags .tag",
        ".tag-row .tag-sm",
        ".tag-row span",
        ".tags span",
        ".card-tag",
    ]
    for sel in selectors:
        for el in card.select(sel):
            t = _norm(el.get_text(" ", strip=True))
            if t and t not in seen:
                seen.append(t)
    # 폴백 — class에 "tag" 가 포함된 모든 span (남용 방지: 카드 내부만)
    if not seen:
        for el in card.find_all("span"):
            classes = el.get("class") or []
            if any("tag" in c for c in classes):
                t = _norm(el.get_text(" ", strip=True))
                if t and t not in seen:
                    seen.append(t)
    return seen


def _extract_content(card) -> str:
    """본문 추출. <pre> 가 있으면 우선, 없으면 .prompt-text / .prompt-content."""
    # <pre> 우선 (가장 신뢰도 높음 — 원본 줄바꿈 보존)
    pre = card.find("pre")
    if pre:
        return _clean_lines(pre.get_text("\n"))
    # .prompt-text — 줄바꿈을 \n 으로 보존
    el = card.select_one(".prompt-text, .prompt-content, .code-block")
    if el:
        # <br>은 \n 으로
        for br in el.find_all("br"):
            br.replace_with("\n")
        text = el.get_text("\n")
        # copy 버튼·svg 텍스트 제외 (이미 다른 단계에서 제거하지만 안전망)
        text = re.sub(r"^\s*복사\s*$", "", text, flags=re.M)
        return _clean_lines(text)
    # 마지막 폴백 — 카드 안의 직계 텍스트 (제목 제외 후)
    clone = card.__copy__() if hasattr(card, "__copy__") else None
    if clone is not None:
        for selector in [".card-title", ".prompt-title", ".card-desc", ".card-tags", ".tag-row", "button", "svg"]:
            for e in clone.select(selector):
                e.decompose()
        return _clean_lines(clone.get_text("\n"))
    return ""


def _find_section_title(card) -> str:
    """카드의 가장 가까운 조상 섹션의 .section-title 텍스트."""
    parent = card
    for _ in range(8):  # 최대 8단계 위로
        parent = parent.parent
        if parent is None:
            break
        if hasattr(parent, "select_one"):
            t = parent.select_one(".section-title, h2.section-title, h2")
            if t and t.get_text(strip=True):
                # 본인 카드의 자식 헤딩이 잡히지 않도록 직접 자손인지 확인
                if t.find_parent("div", class_="prompt-card") is None:
                    return _norm(t.get_text(" ", strip=True))
    return ""


def extract_prompt_cards(html_bytes: bytes) -> ExtractionResult:
    """HTML 바이트 → 프롬프트 카드 목록."""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return ExtractionResult(prompts=[], warnings=["beautifulsoup4 미설치"])

    # 인코딩 자동 감지
    try:
        text = html_bytes.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = html_bytes.decode("euc-kr")
        except UnicodeDecodeError:
            text = html_bytes.decode("utf-8", errors="replace")

    soup = BeautifulSoup(text, "html.parser")
    # 노이즈 제거
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    detected_label = ""
    if soup.title and soup.title.string:
        detected_label = soup.title.string.strip()
    elif soup.find("h1"):
        detected_label = _norm(soup.find("h1").get_text(" ", strip=True))

    cards = soup.select(".prompt-card")
    warnings: list[str] = []
    if not cards:
        return ExtractionResult(
            prompts=[],
            detected_label=detected_label,
            warnings=["프롬프트 카드(.prompt-card)를 찾지 못했습니다."],
        )

    out: list[ParsedPrompt] = []
    for card in cards:
        title = _extract_title(card)
        content = _extract_content(card)
        if not title and not content:
            continue
        # 본문에서 "복사" 버튼 글자가 끼어들어간 경우 제거
        content = re.sub(r"^복사\s*$", "", content, flags=re.M).strip()
        out.append(
            ParsedPrompt(
                title=title or "(제목 없음)",
                description=_extract_description(card),
                content=content,
                category=_find_section_title(card),
                tags=_extract_tags(card),
            )
        )

    if not out:
        warnings.append("카드를 찾았지만 추출 가능한 내용이 없습니다.")

    log.info("프롬프트 카드 추출", cards=len(cards), parsed=len(out), label=detected_label)
    return ExtractionResult(prompts=out, detected_label=detected_label, warnings=warnings)
