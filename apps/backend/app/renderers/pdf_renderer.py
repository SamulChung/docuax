"""PDF 렌더러 — 한국어 호환.

폴백 체인:
1. WeasyPrint (HTML → PDF) — 최고 품질, 단 GTK·Pango 시스템 의존성 필요
2. LibreOffice headless (DOCX → PDF) — soffice 설치 시
3. ReportLab (pure Python) — Windows·Mac·Linux 모두 동작, 한국어 폰트 자동 등록
4. HTML 텍스트 폴백 — 최후 (운영에선 도달 X)

ReportLab은 시스템 한국어 폰트(맑은 고딕·나눔고딕)를 자동 검색해서 등록한다.
"""
from __future__ import annotations

import html
import shutil
import subprocess
import tempfile
from pathlib import Path

from app.core.logging import get_logger
from app.pipeline.ir import Block, BlockType, CoverData, DocumentIR, InlineRun
from app.renderers.base import Renderer
from app.renderers.docx_renderer import DocxRenderer
from app.services.visuals import (
    materialize_image,
    render_chart_to_png,
    render_diagram_to_png,
    render_equation_to_png,
)
from app.services.visuals.cache import resolve_image_to_path

log = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# 1) WeasyPrint 경로 — HTML 빌드
# ─────────────────────────────────────────────────────────────────────────────

_PAGE_CSS = """
@page { size: A4; margin: 25mm; @bottom-center { content: counter(page); font-size: 9pt; color: #888; } }
@page cover { margin: 0; @bottom-center { content: none; } }
body { font-family: '맑은 고딕', 'Malgun Gothic', 'Noto Sans CJK KR', sans-serif; font-size: 11pt; line-height: 1.7; color: #1a1a1a; }
h1, h2, h3, h4 { font-weight: 700; line-height: 1.35; }
h1 { font-size: 19pt; border-bottom: 2px solid #1F5BAF; padding-bottom: 4px; margin-top: 1.2em; }
h2 { font-size: 15pt; color: #1F5BAF; margin-top: 1em; }
h3 { font-size: 13pt; color: #333; }
table { border-collapse: collapse; width: 100%; margin: 0.6em 0; }
table.bordered td, table.bordered th { border: 1px solid #444; padding: 6px 8px; }
table.bordered th { background: #E8F0FC; color: #0F1A3D; }
.li-1 { padding-left: 0em; } .li-2 { padding-left: 1.5em; } .li-3 { padding-left: 3em; } .li-4 { padding-left: 4.5em; }
.quote { border-left: 4px solid #1F5BAF; padding: 4px 0 4px 12px; color: #444; background: #F7F9FC; }
.code { background: #F5F7FA; padding: 10px; font-family: 'JetBrains Mono', 'D2Coding', monospace; font-size: 9.5pt; white-space: pre-wrap; border-left: 3px solid #1F5BAF; border-radius: 2px; }
.box { border: 1.5px solid #1F5BAF; padding: 12px; border-radius: 4px; background: #F7F9FC; }
.figure { text-align: center; margin: 1.2em 0; page-break-inside: avoid; }
.figure img { max-width: 95%; height: auto; }
.figure .caption { font-size: 9.5pt; color: #666; margin-top: 0.4em; font-style: italic; }
.equation-display { text-align: center; margin: 1em 0; page-break-inside: avoid; }
.equation-display img { max-height: 56px; }

/* ──────────────────────────────────────────────────────────────────
 * 표지 (Cover) — 5종 템플릿
 * ────────────────────────────────────────────────────────────────── */
.cover-page { page: cover; page-break-after: always; position: relative; width: 210mm; height: 297mm; box-sizing: border-box; overflow: hidden; }

/* MODERN — 상하 컬러 밴드 */
.cover-modern { padding: 0; }
.cover-modern .band-top { height: 70mm; background: linear-gradient(135deg, #1F5BAF 0%, #3F8AE0 100%); position: relative; }
.cover-modern .band-top .org { position: absolute; left: 25mm; bottom: 14mm; color: white; font-size: 16pt; font-weight: bold; letter-spacing: 0.5px; }
.cover-modern .band-top .logo-img { position: absolute; right: 25mm; top: 14mm; max-height: 36mm; }
.cover-modern .body { padding: 30mm 25mm 0 25mm; }
.cover-modern .title { font-size: 34pt; font-weight: 800; color: #0F1A3D; line-height: 1.25; margin-bottom: 8mm; }
.cover-modern .subtitle { font-size: 17pt; color: #555; margin-bottom: 50mm; line-height: 1.4; }
.cover-modern .info { font-size: 12pt; line-height: 2.2; color: #333; }
.cover-modern .info .lbl { display: inline-block; width: 26mm; font-weight: bold; color: #1F5BAF; }
.cover-modern .band-bottom { position: absolute; bottom: 0; left: 0; right: 0; height: 14mm; background: #1F5BAF; }
.cover-modern .classification { position: absolute; top: 28mm; right: 25mm; padding: 3px 12px; border: 2px solid #C0392B; color: #C0392B; font-weight: bold; font-size: 11pt; background: white; }

/* CLASSIC — 워터마크 + 중앙 정렬 */
.cover-classic { text-align: center; padding: 50mm 25mm 25mm 25mm; }
.cover-classic .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.06; font-size: 240pt; font-weight: 900; color: #1F5BAF; z-index: 0; }
.cover-classic > * { position: relative; z-index: 1; }
.cover-classic .logo-img { max-height: 30mm; margin-bottom: 10mm; }
.cover-classic .org { font-size: 16pt; font-weight: bold; color: #1F5BAF; margin-bottom: 4mm; }
.cover-classic .dept { font-size: 12pt; color: #666; margin-bottom: 30mm; }
.cover-classic .divider { width: 50mm; height: 2px; background: #1F5BAF; margin: 8mm auto; }
.cover-classic .title { font-size: 30pt; font-weight: bold; color: #0F1A3D; line-height: 1.3; margin: 6mm 0; }
.cover-classic .subtitle { font-size: 14pt; color: #666; font-style: italic; margin-bottom: 40mm; }
.cover-classic .info { font-size: 11.5pt; line-height: 2; color: #333; }
.cover-classic .info .lbl { font-weight: bold; }
.cover-classic .classification { display: inline-block; margin-bottom: 12mm; padding: 3px 14px; border: 1.5px solid #C0392B; color: #C0392B; font-weight: bold; }

/* GONGMUN — 공문서 양식 */
.cover-gongmun { padding: 25mm; }
.cover-gongmun .header-bar { border-top: 4px double #000; border-bottom: 4px double #000; padding: 8mm 0; text-align: center; margin-bottom: 20mm; }
.cover-gongmun .header-bar .org { font-size: 22pt; font-weight: bold; color: #000; letter-spacing: 4px; }
.cover-gongmun .doc-no { text-align: right; font-size: 11pt; color: #333; margin-bottom: 4mm; }
.cover-gongmun .classification-line { text-align: right; margin-bottom: 30mm; }
.cover-gongmun .classification { display: inline-block; padding: 4px 16px; border: 2px solid #000; color: #000; font-weight: bold; font-size: 12pt; background: #FFE; }
.cover-gongmun .title { text-align: center; font-size: 28pt; font-weight: bold; color: #000; line-height: 1.3; margin: 20mm 0 8mm 0; padding: 8mm 0; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; }
.cover-gongmun .subtitle { text-align: center; font-size: 14pt; color: #333; margin-bottom: 35mm; }
.cover-gongmun .meta-table { width: 100%; border-collapse: collapse; margin-top: 30mm; }
.cover-gongmun .meta-table td { border: 1px solid #333; padding: 8px 12px; font-size: 11pt; }
.cover-gongmun .meta-table .lbl { background: #F0F0F0; font-weight: bold; width: 30mm; text-align: center; }
.cover-gongmun .seal-area { position: absolute; bottom: 30mm; right: 25mm; width: 35mm; height: 35mm; border: 1.5px dashed #C0392B; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #C0392B; font-size: 10pt; }

/* PROPOSAL — 좌측 컬러 밴드 + 큰 제목 */
.cover-proposal { padding: 0; }
.cover-proposal .band-left { position: absolute; left: 0; top: 0; bottom: 0; width: 60mm; background: linear-gradient(180deg, #1F5BAF 0%, #0F1A3D 100%); padding: 25mm 12mm; box-sizing: border-box; color: white; }
.cover-proposal .band-left .org { font-size: 13pt; font-weight: bold; margin-bottom: 8mm; line-height: 1.4; }
.cover-proposal .band-left .dept { font-size: 10.5pt; opacity: 0.9; margin-bottom: 30mm; }
.cover-proposal .band-left .logo-img { max-width: 32mm; opacity: 0.9; }
.cover-proposal .band-left .badge { position: absolute; bottom: 25mm; left: 12mm; font-size: 9pt; opacity: 0.75; letter-spacing: 2px; text-transform: uppercase; }
.cover-proposal .body { margin-left: 60mm; padding: 50mm 25mm 0 25mm; }
.cover-proposal .label-proposal { font-size: 10.5pt; letter-spacing: 4px; color: #1F5BAF; font-weight: bold; margin-bottom: 12mm; }
.cover-proposal .title { font-size: 36pt; font-weight: 800; color: #0F1A3D; line-height: 1.2; margin-bottom: 10mm; }
.cover-proposal .subtitle { font-size: 16pt; color: #555; line-height: 1.4; margin-bottom: 50mm; }
.cover-proposal .info { font-size: 11.5pt; line-height: 2.2; color: #333; }
.cover-proposal .info .lbl { font-weight: bold; color: #1F5BAF; margin-right: 6mm; }
.cover-proposal .classification { position: absolute; top: 25mm; right: 25mm; padding: 3px 12px; background: #C0392B; color: white; font-weight: bold; font-size: 10pt; letter-spacing: 1px; }

/* EXECUTIVE — 임원/CEO 보고서 — 고급 비즈니스 */
.cover-executive { padding: 40mm 25mm 25mm 25mm; position: relative; }
.cover-executive::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 8mm; background: linear-gradient(90deg, #0F1A3D 0%, #1F5BAF 100%); }
.cover-executive::after { content: ""; position: absolute; bottom: 0; left: 0; right: 0; height: 8mm; background: linear-gradient(90deg, #1F5BAF 0%, #0F1A3D 100%); }
.cover-executive .logo-img { max-height: 22mm; margin-bottom: 8mm; }
.cover-executive .org { font-size: 13pt; color: #555; letter-spacing: 8px; margin-bottom: 4mm; }
.cover-executive .label { font-size: 10pt; font-weight: bold; color: #1F5BAF; letter-spacing: 5px; margin-bottom: 30mm; }
.cover-executive .title { font-size: 32pt; font-weight: 900; color: #0F1A3D; line-height: 1.25; margin-bottom: 6mm; font-family: 'Georgia', '맑은 고딕', serif; }
.cover-executive .subtitle { font-size: 15pt; color: #444; font-style: italic; margin-bottom: 40mm; }
.cover-executive .divider { width: 30mm; height: 2.5px; background: #1F5BAF; margin: 6mm 0; }
.cover-executive .meta { font-size: 11.5pt; line-height: 2.1; color: #333; }
.cover-executive .meta .lbl { display: inline-block; width: 24mm; font-weight: bold; color: #0F1A3D; letter-spacing: 1px; }
.cover-executive .classification { position: absolute; top: 20mm; right: 25mm; padding: 4px 14px; border: 2.5px solid #C0392B; color: #C0392B; font-weight: bold; font-size: 12pt; background: white; }

/* ANNUAL_REPORT — 연차 보고서 — 풍부한 표지 */
.cover-annual { padding: 0; }
.cover-annual .top { height: 130mm; background: linear-gradient(135deg, #0F1A3D 0%, #1F5BAF 60%, #3F8AE0 100%); padding: 25mm; position: relative; color: white; }
.cover-annual .top .year { position: absolute; top: 25mm; right: 25mm; font-size: 64pt; font-weight: 900; opacity: 0.18; line-height: 1; font-family: 'Georgia', serif; }
.cover-annual .top .label { font-size: 12pt; letter-spacing: 6px; opacity: 0.85; margin-bottom: 8mm; }
.cover-annual .top .org { font-size: 16pt; font-weight: bold; margin-bottom: 25mm; }
.cover-annual .top .title { font-size: 36pt; font-weight: 900; line-height: 1.15; max-width: 130mm; }
.cover-annual .bottom { padding: 25mm; }
.cover-annual .bottom .subtitle { font-size: 17pt; color: #444; line-height: 1.4; margin-bottom: 40mm; }
.cover-annual .meta { display: table; width: 100%; padding-top: 8mm; border-top: 3px solid #1F5BAF; }
.cover-annual .meta .col { display: table-cell; font-size: 11pt; padding-right: 10mm; }
.cover-annual .meta .lbl { display: block; font-size: 9pt; color: #1F5BAF; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 2mm; }
.cover-annual .meta .val { color: #222; }

/* GOVERNMENT — 정부 공문 표준 */
.cover-government { padding: 30mm 25mm 25mm 25mm; text-align: center; }
.cover-government .emblem { width: 28mm; height: 28mm; border: 2.5px solid #C0392B; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 6mm auto; color: #C0392B; font-weight: bold; font-size: 18pt; font-family: serif; }
.cover-government .org { font-size: 22pt; font-weight: bold; color: #000; letter-spacing: 4px; margin-bottom: 4mm; font-family: 'Batang', serif; }
.cover-government .dept { font-size: 12pt; color: #333; margin-bottom: 25mm; }
.cover-government .doc-no { font-size: 11pt; color: #333; text-align: left; margin-bottom: 2mm; }
.cover-government .classification-line { text-align: right; margin-bottom: 25mm; }
.cover-government .classification { display: inline-block; padding: 4px 16px; border: 2.5px solid #C0392B; color: #C0392B; font-weight: bold; font-size: 12pt; }
.cover-government .title { font-size: 26pt; font-weight: bold; color: #000; line-height: 1.35; margin: 12mm 0 8mm 0; padding: 10mm 0; border-top: 2.5px solid #000; border-bottom: 2.5px solid #000; font-family: 'Batang', serif; }
.cover-government .subtitle { font-size: 13pt; color: #333; margin-bottom: 30mm; }
.cover-government .meta-table { width: 100%; border-collapse: collapse; text-align: left; margin-top: 20mm; }
.cover-government .meta-table td { border: 1.5px solid #000; padding: 8px 12px; font-size: 11pt; }
.cover-government .meta-table .lbl { background: #F0F0F0; font-weight: bold; width: 28mm; text-align: center; }
.cover-government .seal-row { display: flex; justify-content: flex-end; gap: 20mm; margin-top: 30mm; }
.cover-government .seal-box { width: 28mm; height: 28mm; border: 1.5px dashed #C0392B; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #C0392B; font-size: 10pt; }

/* WHITEPAPER — 백서 */
.cover-whitepaper { padding: 35mm 25mm 25mm 25mm; }
.cover-whitepaper .top-band { display: flex; justify-content: space-between; align-items: center; padding-bottom: 6mm; border-bottom: 4px solid #1F5BAF; margin-bottom: 25mm; }
.cover-whitepaper .top-band .label { font-size: 11pt; font-weight: bold; letter-spacing: 4px; color: #1F5BAF; text-transform: uppercase; }
.cover-whitepaper .top-band .doc-no { font-size: 10pt; color: #666; font-family: monospace; }
.cover-whitepaper .label-big { font-size: 14pt; font-weight: bold; color: #1F5BAF; letter-spacing: 3px; margin-bottom: 6mm; }
.cover-whitepaper .title { font-size: 28pt; font-weight: 800; color: #0F1A3D; line-height: 1.25; margin-bottom: 6mm; }
.cover-whitepaper .subtitle { font-size: 14pt; color: #555; font-style: italic; line-height: 1.5; margin-bottom: 35mm; }
.cover-whitepaper .keywords { display: flex; flex-wrap: wrap; gap: 6mm; margin-bottom: 35mm; }
.cover-whitepaper .keyword { padding: 3px 12px; background: #E8F0FC; color: #1F5BAF; font-size: 10pt; border-radius: 16px; font-weight: 500; }
.cover-whitepaper .meta { padding-top: 8mm; border-top: 1px solid #CCC; font-size: 11pt; line-height: 1.9; color: #333; }
.cover-whitepaper .meta .lbl { display: inline-block; width: 28mm; font-weight: bold; color: #1F5BAF; }
.cover-whitepaper .footer-note { position: absolute; bottom: 18mm; left: 25mm; right: 25mm; padding-top: 5mm; border-top: 1px solid #CCC; font-size: 9pt; color: #888; text-align: center; }

/* MINIMAL — 제목만 강조한 미니멀 */
.cover-minimal { padding: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; text-align: center; }
.cover-minimal .accent-line { width: 18mm; height: 3px; background: #1F5BAF; margin-bottom: 25mm; }
.cover-minimal .org { font-size: 11pt; color: #888; letter-spacing: 6px; margin-bottom: 8mm; text-transform: uppercase; }
.cover-minimal .title { font-size: 38pt; font-weight: 300; color: #0F1A3D; line-height: 1.2; letter-spacing: -0.5px; margin-bottom: 8mm; max-width: 150mm; }
.cover-minimal .subtitle { font-size: 14pt; color: #888; font-weight: 300; margin-bottom: 40mm; max-width: 140mm; }
.cover-minimal .meta { font-size: 10.5pt; color: #999; line-height: 2; }
.cover-minimal .meta .lbl { font-weight: bold; color: #555; margin-right: 6mm; }
.cover-minimal .classification { position: absolute; top: 25mm; right: 25mm; padding: 2px 10px; border: 1px solid #C0392B; color: #C0392B; font-weight: bold; font-size: 10pt; letter-spacing: 2px; }

/* RESEARCH — 학술 스타일 */
.cover-research { padding: 35mm 30mm 25mm 30mm; }
.cover-research .doc-no { font-family: monospace; font-size: 10pt; color: #666; margin-bottom: 30mm; padding-bottom: 4mm; border-bottom: 1px solid #CCC; }
.cover-research .label-report { font-size: 11pt; color: #1F5BAF; font-weight: bold; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 8mm; }
.cover-research .title { font-size: 26pt; font-weight: bold; color: #0F1A3D; line-height: 1.35; margin-bottom: 12mm; }
.cover-research .subtitle { font-size: 14pt; color: #555; font-style: italic; margin-bottom: 50mm; line-height: 1.5; }
.cover-research .meta { margin-top: 40mm; padding-top: 8mm; border-top: 2px solid #1F5BAF; }
.cover-research .meta-row { display: table; width: 100%; margin-bottom: 3mm; }
.cover-research .meta-row .lbl { display: table-cell; width: 28mm; font-size: 10pt; color: #1F5BAF; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
.cover-research .meta-row .val { display: table-cell; font-size: 12pt; color: #222; }
.cover-research .footer { position: absolute; bottom: 20mm; left: 30mm; right: 30mm; padding-top: 6mm; border-top: 1px solid #CCC; font-size: 9.5pt; color: #666; text-align: center; letter-spacing: 1px; }
"""


def _run_to_html(r: InlineRun) -> str:
    t = html.escape(r.text)
    if r.bold: t = f"<strong>{t}</strong>"
    if r.italic: t = f"<em>{t}</em>"
    if r.underline: t = f"<u>{t}</u>"
    if r.strikethrough: t = f"<s>{t}</s>"
    if r.code: t = f"<code>{t}</code>"
    return t


def _file_to_data_url(p: Path) -> str:
    """파일 → data URL (WeasyPrint 임베드용)."""
    import base64

    suffix = p.suffix.lower().lstrip(".")
    mime = {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "svg": "image/svg+xml",
        "webp": "image/webp",
    }.get(suffix, "image/png")
    try:
        data = base64.b64encode(p.read_bytes()).decode("ascii")
        return f"data:{mime};base64,{data}"
    except Exception:
        return ""


def _cover_logo_html(cover: CoverData, css_class: str = "logo-img") -> str:
    if not cover.logo_path:
        return ""
    logo = materialize_image(local_path=cover.logo_path, src=cover.logo_path)
    if not logo:
        return ""
    return f"<img class='{css_class}' src='{_file_to_data_url(logo)}' alt='logo'/>"


def _cover_to_html(cover: CoverData) -> str:
    """10종 템플릿 중 하나로 표지 HTML 생성."""
    template = cover.template
    dispatch = {
        "modern":        _cover_modern_html,
        "classic":       _cover_classic_html,
        "gongmun":       _cover_gongmun_html,
        "proposal":      _cover_proposal_html,
        "research":      _cover_research_html,
        "executive":     _cover_executive_html,
        "annual_report": _cover_annual_html,
        "government":    _cover_government_html,
        "whitepaper":    _cover_whitepaper_html,
        "minimal":       _cover_minimal_html,
    }
    fn = dispatch.get(template, _cover_modern_html)
    return fn(cover)


def _info_row(label: str, value: str) -> str:
    return f"<div><span class='lbl'>{label}</span>{html.escape(value)}</div>"


def _cover_modern_html(c: CoverData) -> str:
    parts = ["<div class='cover-page cover-modern'>"]
    parts.append("<div class='band-top'>")
    if c.organization:
        parts.append(f"<div class='org'>{html.escape(c.organization)}</div>")
    parts.append(_cover_logo_html(c))
    parts.append("</div>")
    if c.classification:
        parts.append(f"<div class='classification'>{html.escape(c.classification)}</div>")
    parts.append("<div class='body'>")
    if c.title:
        parts.append(f"<div class='title'>{html.escape(c.title)}</div>")
    if c.subtitle:
        parts.append(f"<div class='subtitle'>{html.escape(c.subtitle)}</div>")
    parts.append("<div class='info'>")
    if c.author:
        parts.append(_info_row("작성자", c.author))
    if c.department:
        parts.append(_info_row("부서", c.department))
    if c.date:
        parts.append(_info_row("작성일자", c.date))
    if c.document_number:
        parts.append(_info_row("문서번호", c.document_number))
    parts.append("</div>")
    parts.append("</div>")
    parts.append("<div class='band-bottom'></div>")
    parts.append("</div>")
    return "".join(parts)


def _cover_classic_html(c: CoverData) -> str:
    parts = ["<div class='cover-page cover-classic'>"]
    if c.organization:
        parts.append(f"<div class='watermark'>{html.escape(c.organization[:2])}</div>")
    parts.append(_cover_logo_html(c))
    if c.organization:
        parts.append(f"<div class='org'>{html.escape(c.organization)}</div>")
    if c.department:
        parts.append(f"<div class='dept'>{html.escape(c.department)}</div>")
    parts.append("<div class='divider'></div>")
    if c.classification:
        parts.append(f"<div class='classification'>{html.escape(c.classification)}</div>")
    if c.title:
        parts.append(f"<div class='title'>{html.escape(c.title)}</div>")
    if c.subtitle:
        parts.append(f"<div class='subtitle'>{html.escape(c.subtitle)}</div>")
    parts.append("<div class='info'>")
    if c.author:
        parts.append(f"<div><span class='lbl'>작성자</span> &nbsp; {html.escape(c.author)}</div>")
    if c.date:
        parts.append(f"<div><span class='lbl'>작성일자</span> &nbsp; {html.escape(c.date)}</div>")
    if c.document_number:
        parts.append(f"<div><span class='lbl'>문서번호</span> &nbsp; {html.escape(c.document_number)}</div>")
    parts.append("</div></div>")
    return "".join(parts)


def _cover_gongmun_html(c: CoverData) -> str:
    parts = ["<div class='cover-page cover-gongmun'>"]
    parts.append("<div class='header-bar'>")
    if c.organization:
        parts.append(f"<div class='org'>{html.escape(c.organization)}</div>")
    parts.append("</div>")
    if c.document_number:
        parts.append(f"<div class='doc-no'>문서번호 : {html.escape(c.document_number)}</div>")
    if c.classification:
        parts.append(f"<div class='classification-line'><span class='classification'>{html.escape(c.classification)}</span></div>")
    if c.title:
        parts.append(f"<div class='title'>{html.escape(c.title)}</div>")
    if c.subtitle:
        parts.append(f"<div class='subtitle'>{html.escape(c.subtitle)}</div>")
    parts.append("<table class='meta-table'>")
    if c.department:
        parts.append(f"<tr><td class='lbl'>부서</td><td>{html.escape(c.department)}</td></tr>")
    if c.author:
        parts.append(f"<tr><td class='lbl'>작성자</td><td>{html.escape(c.author)}</td></tr>")
    if c.date:
        parts.append(f"<tr><td class='lbl'>작성일자</td><td>{html.escape(c.date)}</td></tr>")
    parts.append("</table>")
    parts.append("<div class='seal-area'>(직&nbsp;인)</div>")
    parts.append("</div>")
    return "".join(parts)


def _cover_proposal_html(c: CoverData) -> str:
    parts = ["<div class='cover-page cover-proposal'>"]
    parts.append("<div class='band-left'>")
    if c.organization:
        parts.append(f"<div class='org'>{html.escape(c.organization)}</div>")
    if c.department:
        parts.append(f"<div class='dept'>{html.escape(c.department)}</div>")
    parts.append(_cover_logo_html(c))
    parts.append("<div class='badge'>P R O P O S A L</div>")
    parts.append("</div>")
    if c.classification:
        parts.append(f"<div class='classification'>{html.escape(c.classification)}</div>")
    parts.append("<div class='body'>")
    parts.append("<div class='label-proposal'>P R O P O S A L &nbsp; · &nbsp; 제안서</div>")
    if c.title:
        parts.append(f"<div class='title'>{html.escape(c.title)}</div>")
    if c.subtitle:
        parts.append(f"<div class='subtitle'>{html.escape(c.subtitle)}</div>")
    parts.append("<div class='info'>")
    if c.author:
        parts.append(f"<div><span class='lbl'>작성자</span>{html.escape(c.author)}</div>")
    if c.date:
        parts.append(f"<div><span class='lbl'>작성일자</span>{html.escape(c.date)}</div>")
    if c.document_number:
        parts.append(f"<div><span class='lbl'>문서번호</span>{html.escape(c.document_number)}</div>")
    parts.append("</div></div></div>")
    return "".join(parts)


def _cover_research_html(c: CoverData) -> str:
    parts = ["<div class='cover-page cover-research'>"]
    if c.document_number:
        parts.append(f"<div class='doc-no'>Document No. {html.escape(c.document_number)}</div>")
    parts.append("<div class='label-report'>R E S E A R C H &nbsp; R E P O R T</div>")
    if c.title:
        parts.append(f"<div class='title'>{html.escape(c.title)}</div>")
    if c.subtitle:
        parts.append(f"<div class='subtitle'>{html.escape(c.subtitle)}</div>")
    parts.append("<div class='meta'>")
    if c.author:
        parts.append(f"<div class='meta-row'><div class='lbl'>저자</div><div class='val'>{html.escape(c.author)}</div></div>")
    if c.department:
        parts.append(f"<div class='meta-row'><div class='lbl'>소속</div><div class='val'>{html.escape(c.department)}</div></div>")
    if c.organization:
        parts.append(f"<div class='meta-row'><div class='lbl'>기관</div><div class='val'>{html.escape(c.organization)}</div></div>")
    if c.date:
        parts.append(f"<div class='meta-row'><div class='lbl'>발행일</div><div class='val'>{html.escape(c.date)}</div></div>")
    if c.classification:
        parts.append(f"<div class='meta-row'><div class='lbl'>분류</div><div class='val'>{html.escape(c.classification)}</div></div>")
    parts.append("</div>")
    if c.organization:
        parts.append(f"<div class='footer'>{html.escape(c.organization)}</div>")
    parts.append("</div>")
    return "".join(parts)


# ─── 신규 5종 표지 HTML ─────────────────────────────────────────

def _cover_executive_html(c: CoverData) -> str:
    parts = ["<div class='cover-page cover-executive'>"]
    if c.classification:
        parts.append(f"<div class='classification'>{html.escape(c.classification)}</div>")
    parts.append(_cover_logo_html(c))
    if c.organization:
        parts.append(f"<div class='org'>{html.escape(c.organization).upper()}</div>")
    parts.append("<div class='label'>EXECUTIVE &nbsp; REPORT</div>")
    if c.title:
        parts.append(f"<div class='title'>{html.escape(c.title)}</div>")
    if c.subtitle:
        parts.append(f"<div class='subtitle'>{html.escape(c.subtitle)}</div>")
    parts.append("<div class='divider'></div>")
    parts.append("<div class='meta'>")
    if c.author:
        parts.append(_info_row("Author", c.author))
    if c.department:
        parts.append(_info_row("Division", c.department))
    if c.date:
        parts.append(_info_row("Date", c.date))
    if c.document_number:
        parts.append(_info_row("Ref. No.", c.document_number))
    parts.append("</div>")
    parts.append("</div>")
    return "".join(parts)


def _cover_annual_html(c: CoverData) -> str:
    # 연도 추출 — date 에서 4자리 숫자
    year_match = "".join([ch for ch in (c.date or "") if ch.isdigit()])[:4]
    parts = ["<div class='cover-page cover-annual'>"]
    parts.append("<div class='top'>")
    if year_match:
        parts.append(f"<div class='year'>{html.escape(year_match)}</div>")
    parts.append("<div class='label'>ANNUAL &nbsp; REPORT</div>")
    if c.organization:
        parts.append(f"<div class='org'>{html.escape(c.organization)}</div>")
    if c.title:
        parts.append(f"<div class='title'>{html.escape(c.title)}</div>")
    parts.append("</div>")
    parts.append("<div class='bottom'>")
    if c.subtitle:
        parts.append(f"<div class='subtitle'>{html.escape(c.subtitle)}</div>")
    parts.append("<div class='meta'>")
    if c.author:
        parts.append(f"<div class='col'><span class='lbl'>발행</span><span class='val'>{html.escape(c.author)}</span></div>")
    if c.department:
        parts.append(f"<div class='col'><span class='lbl'>부서</span><span class='val'>{html.escape(c.department)}</span></div>")
    if c.date:
        parts.append(f"<div class='col'><span class='lbl'>발행일</span><span class='val'>{html.escape(c.date)}</span></div>")
    if c.document_number:
        parts.append(f"<div class='col'><span class='lbl'>문서번호</span><span class='val'>{html.escape(c.document_number)}</span></div>")
    parts.append("</div></div></div>")
    return "".join(parts)


def _cover_government_html(c: CoverData) -> str:
    parts = ["<div class='cover-page cover-government'>"]
    # 태극 또는 기관 상징 자리
    if c.logo_path:
        logo = materialize_image(local_path=c.logo_path, src=c.logo_path)
        if logo:
            parts.append(f"<img class='emblem' style='border:none;width:28mm;height:28mm;object-fit:contain' src='{_file_to_data_url(logo)}' alt='emblem'/>")
        else:
            parts.append("<div class='emblem'>인</div>")
    else:
        parts.append("<div class='emblem'>인</div>")
    if c.organization:
        parts.append(f"<div class='org'>{html.escape(c.organization)}</div>")
    if c.department:
        parts.append(f"<div class='dept'>{html.escape(c.department)}</div>")
    if c.document_number:
        parts.append(f"<div class='doc-no'>문서번호 : {html.escape(c.document_number)}</div>")
    if c.classification:
        parts.append(f"<div class='classification-line'><span class='classification'>{html.escape(c.classification)}</span></div>")
    if c.title:
        parts.append(f"<div class='title'>{html.escape(c.title)}</div>")
    if c.subtitle:
        parts.append(f"<div class='subtitle'>{html.escape(c.subtitle)}</div>")
    parts.append("<table class='meta-table'>")
    if c.author:
        parts.append(f"<tr><td class='lbl'>작성자</td><td>{html.escape(c.author)}</td></tr>")
    if c.date:
        parts.append(f"<tr><td class='lbl'>작성일자</td><td>{html.escape(c.date)}</td></tr>")
    if c.department:
        parts.append(f"<tr><td class='lbl'>담당부서</td><td>{html.escape(c.department)}</td></tr>")
    parts.append("</table>")
    parts.append("<div class='seal-row'>")
    parts.append("<div class='seal-box'>(담당)</div>")
    parts.append("<div class='seal-box'>(검토)</div>")
    parts.append("<div class='seal-box'>(결재)</div>")
    parts.append("</div>")
    parts.append("</div>")
    return "".join(parts)


def _cover_whitepaper_html(c: CoverData) -> str:
    parts = ["<div class='cover-page cover-whitepaper'>"]
    parts.append("<div class='top-band'>")
    parts.append("<div class='label'>WHITE PAPER · 백서</div>")
    if c.document_number:
        parts.append(f"<div class='doc-no'>{html.escape(c.document_number)}</div>")
    parts.append("</div>")
    parts.append("<div class='label-big'>기술·산업 분석 보고서</div>")
    if c.title:
        parts.append(f"<div class='title'>{html.escape(c.title)}</div>")
    if c.subtitle:
        parts.append(f"<div class='subtitle'>{html.escape(c.subtitle)}</div>")
    # 키워드 — classification 을 키워드로 활용하거나 비워둠
    if c.classification:
        parts.append("<div class='keywords'>")
        for kw in c.classification.split(","):
            kw = kw.strip()
            if kw:
                parts.append(f"<div class='keyword'>{html.escape(kw)}</div>")
        parts.append("</div>")
    parts.append("<div class='meta'>")
    if c.author:
        parts.append(_info_row("저자", c.author))
    if c.department:
        parts.append(_info_row("연구팀", c.department))
    if c.organization:
        parts.append(_info_row("발행기관", c.organization))
    if c.date:
        parts.append(_info_row("발행일", c.date))
    parts.append("</div>")
    if c.organization:
        parts.append(f"<div class='footer-note'>© {html.escape(c.organization)}</div>")
    parts.append("</div>")
    return "".join(parts)


def _cover_minimal_html(c: CoverData) -> str:
    parts = ["<div class='cover-page cover-minimal'>"]
    if c.classification:
        parts.append(f"<div class='classification'>{html.escape(c.classification)}</div>")
    parts.append("<div class='accent-line'></div>")
    if c.organization:
        parts.append(f"<div class='org'>{html.escape(c.organization)}</div>")
    if c.title:
        parts.append(f"<div class='title'>{html.escape(c.title)}</div>")
    if c.subtitle:
        parts.append(f"<div class='subtitle'>{html.escape(c.subtitle)}</div>")
    parts.append("<div class='meta'>")
    if c.author:
        parts.append(f"<div><span class='lbl'>{html.escape(c.author)}</span></div>")
    if c.date:
        parts.append(f"<div><span class='lbl'>{html.escape(c.date)}</span></div>")
    if c.document_number:
        parts.append(f"<div><span class='lbl'>{html.escape(c.document_number)}</span></div>")
    parts.append("</div></div>")
    return "".join(parts)


def _img_to_figure_html(
    image_path: Path,
    caption: str = "",
    align: str = "center",
    width: str = "",
    height: str = "",
) -> str:
    src = _file_to_data_url(image_path)
    if not src:
        return f"<p><em>[이미지 로드 실패: {html.escape(image_path.name)}]</em></p>"
    fig_style = f"text-align:{align};" if align != "center" else ""
    # width/height 가 있으면 인라인 img style 로 적용
    img_style_parts = []
    if width:
        img_style_parts.append(f"width:{html.escape(width)}")
    if height:
        img_style_parts.append(f"height:{html.escape(height)}")
    if not width:
        img_style_parts.append("max-width:95%")
    img_style = "; ".join(img_style_parts)
    cap_html = f"<div class='caption'>{html.escape(caption)}</div>" if caption else ""
    return (
        f"<div class='figure' style='{fig_style}'>"
        f"<img src='{src}' alt='{html.escape(caption)}' style='{img_style}'/>"
        f"{cap_html}</div>"
    )


def _block_to_html(blk: Block) -> str:
    if blk.type == BlockType.HEADING:
        level = max(1, min(6, blk.heading_level or 1))
        return f"<h{level}>{''.join(_run_to_html(r) for r in blk.runs)}</h{level}>"
    if blk.type == BlockType.LIST_ITEM and blk.list_item:
        d = blk.list_item.depth + 1
        marker = f"{blk.list_item.index}. " if blk.list_item.ordered else f"{blk.list_item.bullet_marker} "
        return f"<p class='li-{min(d,4)}'><strong>{html.escape(marker)}</strong>{''.join(_run_to_html(r) for r in blk.list_item.runs)}</p>"
    if blk.type == BlockType.QUOTE:
        return f"<div class='quote'>{''.join(_run_to_html(r) for r in blk.runs)}</div>"
    if blk.type == BlockType.CODE:
        return f"<pre class='code'>{''.join(html.escape(r.text) for r in blk.runs)}</pre>"
    if blk.type == BlockType.TABLE and blk.table:
        rows_html = []
        for ri, row in enumerate(blk.table.rows):
            cells = []
            tag = "th" if (ri == 0 and blk.table.header_row) else "td"
            for cell in row:
                if cell.colspan == 0 or cell.rowspan == 0:
                    continue
                cells.append(f"<{tag}>{''.join(_run_to_html(r) for r in cell.runs)}</{tag}>")
            rows_html.append("<tr>" + "".join(cells) + "</tr>")
        return "<table class='bordered'>" + "".join(rows_html) + "</table>"
    if blk.type == BlockType.BOX:
        return f"<div class='box'>{''.join(_run_to_html(r) for r in blk.runs)}</div>"
    if blk.type == BlockType.THEMATIC_BREAK:
        return "<hr/>"

    # ── 시각 요소 ──
    if blk.type == BlockType.IMAGE and blk.image:
        path = resolve_image_to_path(blk.image)
        if not path:
            return f"<p><em>[이미지 로드 실패: {html.escape(blk.image.alt or blk.image.src)}]</em></p>"
        return _img_to_figure_html(
            path, blk.image.caption, blk.image.align,
            width=blk.image.width, height=blk.image.height,
        )

    if blk.type == BlockType.DIAGRAM and blk.diagram:
        png = render_diagram_to_png(engine=blk.diagram.engine, source=blk.diagram.source)
        if png:
            return _img_to_figure_html(
                png, blk.diagram.caption, blk.diagram.align,
                width=blk.diagram.width, height=blk.diagram.height,
            )
        return f"<p><em>[다이어그램 렌더 실패: {blk.diagram.engine}]</em></p>"

    if blk.type == BlockType.CHART and blk.chart:
        png = render_chart_to_png(blk.chart.spec)
        if png:
            return _img_to_figure_html(
                png, blk.chart.caption, blk.chart.align,
                width=blk.chart.width, height=blk.chart.height,
            )
        return "<p><em>[차트 렌더 실패]</em></p>"

    if blk.type == BlockType.EQUATION and blk.equation:
        png = render_equation_to_png(latex=blk.equation.latex, display=blk.equation.display)
        if png:
            extra_style = f"width:{html.escape(blk.equation.width)};" if blk.equation.width else ""
            return (
                f"<div class='equation-display'>"
                f"<img src='{_file_to_data_url(png)}' alt='{html.escape(blk.equation.latex)}'"
                f" style='{extra_style}'/></div>"
            )
        return f"<p><em>{html.escape(blk.equation.latex)}</em></p>"

    return f"<p>{''.join(_run_to_html(r) for r in blk.runs)}</p>"


def _ir_to_html(ir: DocumentIR) -> str:
    body = ""
    # 표지 — 본문 위
    if ir.cover:
        body += _cover_to_html(ir.cover)
    # 제목 (표지에 들어갔으면 중복 X)
    if ir.title and (not ir.cover or not ir.cover.title):
        body += f"<h1 style='text-align:center'>{html.escape(ir.title)}</h1>"
    for blk in ir.blocks:
        try:
            body += _block_to_html(blk)
        except Exception as e:  # noqa: BLE001
            log.warning("PDF HTML 블록 실패", block=blk.id, error=str(e))
            continue
    return f"<!DOCTYPE html><html><head><meta charset='utf-8'><style>{_PAGE_CSS}</style></head><body>{body}</body></html>"


def render_ir_to_html(
    ir: DocumentIR,
    *,
    selected_block_ids: list[str] | None = None,
) -> str:
    """클립보드 복사용 HTML 생성 — Word/한컴 등에 붙여넣으면 서식 유지.

    Args:
        ir: 변환된 DocumentIR
        selected_block_ids: 지정 시 해당 ID 블록만 HTML 로. 없으면 전체.

    Returns:
        완전한 HTML 문서 (CSS 인라인 포함).
    """
    body = ""

    # 전체 모드 — 표지·제목·모든 블록
    if not selected_block_ids:
        if ir.cover:
            body += _cover_to_html(ir.cover)
        if ir.title and (not ir.cover or not ir.cover.title):
            body += f"<h1 style='text-align:center'>{html.escape(ir.title)}</h1>"
        for blk in ir.blocks:
            try:
                body += _block_to_html(blk)
            except Exception as e:  # noqa: BLE001
                log.warning("HTML 블록 실패", block=blk.id, error=str(e))
                continue
    # 선택 모드 — 지정된 블록만 (선택 순서 유지)
    else:
        id_set = set(selected_block_ids)
        for blk in ir.blocks:
            if blk.id not in id_set:
                continue
            try:
                body += _block_to_html(blk)
            except Exception as e:  # noqa: BLE001
                log.warning("HTML 블록 실패", block=blk.id, error=str(e))
                continue

    return (
        f"<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<style>{_PAGE_CSS}</style></head><body>{body}</body></html>"
    )


def _try_weasyprint(html_str: str, out: Path) -> bool:
    try:
        from weasyprint import HTML
    except (ImportError, OSError) as e:
        log.info("weasyprint 미가용 (다음 폴백으로)", error=str(e)[:80])
        return False
    try:
        HTML(string=html_str).write_pdf(str(out))
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("weasyprint PDF 변환 실패", error=str(e))
        return False


# ─────────────────────────────────────────────────────────────────────────────
# 2) LibreOffice 폴백
# ─────────────────────────────────────────────────────────────────────────────

def _docx_to_pdf_via_libreoffice(ir: DocumentIR, out: Path) -> bool:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        return False
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp_docx:
        tmp_docx_path = Path(tmp_docx.name)
    try:
        DocxRenderer().render(ir, tmp_docx_path)
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(
                [soffice, "--headless", "--convert-to", "pdf", "--outdir", tmp, str(tmp_docx_path)],
                check=True,
                capture_output=True,
                timeout=120,
            )
            converted = Path(tmp) / (tmp_docx_path.stem + ".pdf")
            if converted.exists():
                out.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(converted, out)
                return True
    except Exception as e:  # noqa: BLE001
        log.warning("LibreOffice PDF 변환 실패", error=str(e))
    finally:
        tmp_docx_path.unlink(missing_ok=True)
    return False


# ─────────────────────────────────────────────────────────────────────────────
# 3) ReportLab 폴백 — pure Python, 한국어 폰트 자동 등록
# ─────────────────────────────────────────────────────────────────────────────

# 시스템 한국어 폰트 후보 (우선순위 순)
_KOREAN_FONT_CANDIDATES = [
    ("MalgunGothic", "C:/Windows/Fonts/malgun.ttf"),
    ("MalgunGothicBold", "C:/Windows/Fonts/malgunbd.ttf"),
    ("NanumGothic", "C:/Windows/Fonts/NanumGothic.ttf"),
    ("NanumGothicBold", "C:/Windows/Fonts/NanumGothicBold.ttf"),
    # macOS
    ("AppleSDGothic", "/System/Library/Fonts/AppleSDGothicNeo.ttc"),
    # Linux
    ("NanumGothicLinux", "/usr/share/fonts/truetype/nanum/NanumGothic.ttf"),
    ("NotoCJK", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
]

_REGISTERED_FONT: str | None = None
_REGISTERED_FONT_BOLD: str | None = None


def _ensure_korean_font() -> tuple[str, str]:
    """시스템에서 사용 가능한 한국어 폰트를 등록하고 (regular, bold) 폰트 이름 반환."""
    global _REGISTERED_FONT, _REGISTERED_FONT_BOLD
    if _REGISTERED_FONT:
        return _REGISTERED_FONT, _REGISTERED_FONT_BOLD or _REGISTERED_FONT

    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    regular: str | None = None
    bold: str | None = None
    for name, path in _KOREAN_FONT_CANDIDATES:
        p = Path(path)
        if not p.exists():
            continue
        try:
            pdfmetrics.registerFont(TTFont(name, str(p)))
            if not regular:
                regular = name
            if name.endswith("Bold") and not bold:
                bold = name
        except Exception as e:  # noqa: BLE001
            log.debug("ReportLab 폰트 등록 실패", font=name, error=str(e))
            continue

    if not regular:
        # 시스템 폰트 못 찾으면 기본 Helvetica (한글 깨짐)
        log.warning("시스템 한국어 폰트 없음 — Helvetica 사용 (한글 깨질 수 있음)")
        regular = "Helvetica"
        bold = "Helvetica-Bold"
    if not bold:
        bold = regular

    _REGISTERED_FONT = regular
    _REGISTERED_FONT_BOLD = bold
    return regular, bold


def _try_reportlab(ir: DocumentIR, out: Path) -> bool:
    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import cm, mm
        from reportlab.platypus import (
            HRFlowable,
            Image,
            PageBreak,
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError:
        return False

    try:
        font_regular, font_bold = _ensure_korean_font()

        out.parent.mkdir(parents=True, exist_ok=True)
        doc = SimpleDocTemplate(
            str(out),
            pagesize=A4,
            leftMargin=25 * mm,
            rightMargin=25 * mm,
            topMargin=25 * mm,
            bottomMargin=25 * mm,
            title=ir.title or "DocuAX Document",
        )

        # 스타일
        styles = getSampleStyleSheet()
        body_style = ParagraphStyle(
            "body", parent=styles["Normal"],
            fontName=font_regular, fontSize=11, leading=16, spaceAfter=4,
        )
        h_styles = {
            i: ParagraphStyle(
                f"h{i}", parent=styles["Normal"],
                fontName=font_bold, fontSize=22 - i * 2, leading=28 - i * 2,
                spaceBefore=12, spaceAfter=6, textColor=colors.HexColor("#1E2761"),
            )
            for i in range(1, 7)
        }
        title_style = ParagraphStyle(
            "title", parent=styles["Title"],
            fontName=font_bold, fontSize=20, leading=26,
            alignment=1, spaceAfter=18, textColor=colors.HexColor("#0F1A3D"),
        )
        quote_style = ParagraphStyle(
            "quote", parent=body_style,
            leftIndent=20, borderColor=colors.HexColor("#1F5BAF"),
            borderPadding=6, borderRadius=2, textColor=colors.HexColor("#444"),
        )
        code_style = ParagraphStyle(
            "code", parent=body_style,
            fontName=font_regular, fontSize=9.5, leading=14,
            backColor=colors.HexColor("#f5f5f5"), borderPadding=6,
        )

        def runs_to_html(runs: list[InlineRun]) -> str:
            parts = []
            for r in runs:
                t = html.escape(r.text).replace("\n", "<br/>")
                if r.bold: t = f"<b>{t}</b>"
                if r.italic: t = f"<i>{t}</i>"
                if r.underline: t = f"<u>{t}</u>"
                if r.strikethrough: t = f"<strike>{t}</strike>"
                if r.color:
                    t = f'<font color="{r.color}">{t}</font>'
                parts.append(t)
            return "".join(parts) or "&nbsp;"

        # 이미지 임베드 헬퍼 (ReportLab)
        def add_picture_to_story(image_path: Path, caption: str = "", max_w_cm: float = 14.0):
            try:
                # 이미지 비율 유지하면서 폭 제한
                img = Image(str(image_path), width=max_w_cm * cm, height=max_w_cm * cm * 0.75, kind="proportional")
                img.hAlign = "CENTER"
                story.append(img)
                if caption:
                    cap_style = ParagraphStyle(
                        "cap", parent=body_style,
                        fontSize=9, textColor=colors.HexColor("#666666"),
                        alignment=TA_CENTER, spaceBefore=2, spaceAfter=6,
                    )
                    story.append(Paragraph(html.escape(caption), cap_style))
                story.append(Spacer(1, 4))
            except Exception as e:  # noqa: BLE001
                log.warning("ReportLab 이미지 임베드 실패", error=str(e))

        story: list = []
        # ── 표지 (ReportLab) ──
        if ir.cover:
            cover = ir.cover
            cover_title_style = ParagraphStyle(
                "ctitle", parent=title_style, fontSize=28, leading=36, spaceBefore=0, spaceAfter=8,
            )
            cover_subtitle_style = ParagraphStyle(
                "csub", parent=body_style, fontSize=16, alignment=TA_CENTER,
                textColor=colors.HexColor("#444444"), spaceAfter=40,
            )
            cover_org_style = ParagraphStyle(
                "corg", parent=body_style, fontSize=14, alignment=TA_CENTER,
                textColor=colors.HexColor("#1E2761"), fontName=font_bold,
            )
            cover_info_style = ParagraphStyle(
                "cinfo", parent=body_style, fontSize=11, alignment=TA_CENTER, leading=22,
            )
            classification_style = ParagraphStyle(
                "ccls", parent=body_style, fontSize=11, alignment=TA_CENTER,
                textColor=colors.HexColor("#C0392B"), fontName=font_bold,
            )

            story.append(Spacer(1, 50))
            if cover.logo_path:
                logo = materialize_image(local_path=cover.logo_path, src=cover.logo_path)
                if logo:
                    try:
                        story.append(Image(str(logo), width=4*cm, height=4*cm, kind="proportional"))
                        story[-1].hAlign = "CENTER"
                        story.append(Spacer(1, 12))
                    except Exception:
                        pass
            if cover.organization:
                story.append(Paragraph(html.escape(cover.organization), cover_org_style))
                story.append(Spacer(1, 4))
            if cover.department:
                story.append(Paragraph(html.escape(cover.department), cover_info_style))
            if cover.classification:
                story.append(Spacer(1, 20))
                story.append(Paragraph(f"[ {html.escape(cover.classification)} ]", classification_style))
            story.append(Spacer(1, 60))
            if cover.title:
                story.append(Paragraph(html.escape(cover.title), cover_title_style))
            if cover.subtitle:
                story.append(Paragraph(html.escape(cover.subtitle), cover_subtitle_style))
            story.append(Spacer(1, 80))
            info_lines = []
            if cover.author:
                info_lines.append(f"작 성 자 :  {html.escape(cover.author)}")
            if cover.date:
                info_lines.append(f"작성일자 :  {html.escape(cover.date)}")
            if cover.document_number:
                info_lines.append(f"문서번호 :  {html.escape(cover.document_number)}")
            for line in info_lines:
                story.append(Paragraph(line, cover_info_style))
            story.append(PageBreak())

        if ir.title and (not ir.cover or not ir.cover.title):
            story.append(Paragraph(html.escape(ir.title), title_style))

        for blk in ir.blocks:
            try:
                if blk.type == BlockType.HEADING:
                    lvl = max(1, min(6, blk.heading_level or 1))
                    story.append(Paragraph(runs_to_html(blk.runs), h_styles[lvl]))
                elif blk.type == BlockType.LIST_ITEM and blk.list_item:
                    indent = blk.list_item.depth * 24
                    marker = (
                        f"{blk.list_item.index}{blk.list_item.order_format.replace('1.', '.')}"
                        if blk.list_item.ordered
                        else blk.list_item.bullet_marker
                    )
                    li_style = ParagraphStyle(
                        f"li-{blk.list_item.depth}", parent=body_style, leftIndent=indent,
                    )
                    story.append(
                        Paragraph(
                            f"<b>{html.escape(marker)}</b>&nbsp;{runs_to_html(blk.list_item.runs)}",
                            li_style,
                        )
                    )
                elif blk.type == BlockType.QUOTE:
                    story.append(Paragraph(runs_to_html(blk.runs), quote_style))
                elif blk.type == BlockType.CODE:
                    txt = "".join(r.text for r in blk.runs)
                    story.append(Paragraph(html.escape(txt).replace("\n", "<br/>"), code_style))
                elif blk.type == BlockType.TABLE and blk.table and blk.table.rows:
                    data = []
                    for row in blk.table.rows:
                        cells = []
                        for cell in row:
                            if cell.colspan == 0 or cell.rowspan == 0:
                                cells.append("")
                                continue
                            cells.append(Paragraph(runs_to_html(cell.runs), body_style))
                        data.append(cells)
                    if not data:
                        continue
                    cols = max(len(r) for r in data)
                    # 행 길이 맞춤
                    for r in data:
                        while len(r) < cols:
                            r.append("")
                    avail = doc.width
                    col_widths = [avail / cols] * cols
                    t = Table(data, colWidths=col_widths, repeatRows=1 if blk.table.header_row else 0)
                    ts = TableStyle([
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#666666")),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("FONTNAME", (0, 0), (-1, -1), font_regular),
                        ("FONTSIZE", (0, 0), (-1, -1), 10),
                        ("LEFTPADDING", (0, 0), (-1, -1), 4),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                        ("TOPPADDING", (0, 0), (-1, -1), 3),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ])
                    if blk.table.header_row and len(data) > 0:
                        ts.add("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F2F2F2"))
                        ts.add("FONTNAME", (0, 0), (-1, 0), font_bold)
                    t.setStyle(ts)
                    story.append(t)
                    story.append(Spacer(1, 6))
                elif blk.type == BlockType.THEMATIC_BREAK:
                    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
                elif blk.type == BlockType.IMAGE and blk.image:
                    path = resolve_image_to_path(blk.image)
                    if path:
                        add_picture_to_story(path, blk.image.caption)
                    else:
                        story.append(Paragraph(
                            f"<i>[이미지 로드 실패: {html.escape(blk.image.alt or blk.image.src)}]</i>",
                            body_style,
                        ))
                elif blk.type == BlockType.DIAGRAM and blk.diagram:
                    png = render_diagram_to_png(engine=blk.diagram.engine, source=blk.diagram.source)
                    if png:
                        add_picture_to_story(png, blk.diagram.caption)
                    else:
                        story.append(Paragraph(
                            f"<i>[다이어그램 렌더 실패: {blk.diagram.engine}]</i>",
                            body_style,
                        ))
                elif blk.type == BlockType.CHART and blk.chart:
                    png = render_chart_to_png(blk.chart.spec)
                    if png:
                        add_picture_to_story(png, blk.chart.caption)
                    else:
                        story.append(Paragraph("<i>[차트 렌더 실패]</i>", body_style))
                elif blk.type == BlockType.EQUATION and blk.equation:
                    png = render_equation_to_png(
                        latex=blk.equation.latex, display=blk.equation.display,
                    )
                    if png:
                        add_picture_to_story(png, "", max_w_cm=10)
                    else:
                        story.append(Paragraph(
                            f"<i>{html.escape(blk.equation.latex)}</i>", body_style,
                        ))
                else:
                    story.append(Paragraph(runs_to_html(blk.runs), body_style))
            except Exception as e:  # noqa: BLE001
                log.warning("ReportLab 블록 변환 실패, 스킵", block_id=blk.id, error=str(e))
                continue

        doc.build(story)
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("ReportLab PDF 변환 실패", error=str(e))
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Renderer
# ─────────────────────────────────────────────────────────────────────────────

class PdfRenderer(Renderer):
    extension = ".pdf"
    mime = "application/pdf"

    def render(self, ir: DocumentIR, output_path: Path) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # 1) WeasyPrint
        html_str = _ir_to_html(ir)
        if _try_weasyprint(html_str, output_path):
            log.info("PDF 생성 완료 (weasyprint)", path=str(output_path))
            return output_path

        # 2) LibreOffice
        if _docx_to_pdf_via_libreoffice(ir, output_path):
            log.info("PDF 생성 완료 (LibreOffice)", path=str(output_path))
            return output_path

        # 3) ReportLab — Windows·Mac·Linux 공통 동작
        if _try_reportlab(ir, output_path):
            log.info("PDF 생성 완료 (ReportLab)", path=str(output_path))
            return output_path

        # 4) 최후 — HTML 그대로 (운영에서는 도달 X)
        log.error("PDF 변환 모든 경로 실패, HTML 폴백")
        output_path.write_text(html_str, encoding="utf-8")
        return output_path
