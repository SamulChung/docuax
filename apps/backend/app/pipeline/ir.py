"""DocumentIR — DocuAX의 중간 표현(Intermediate Representation).

마크다운 AST가 들어와서, 양식 매핑·검토 태그·매크로 적용을 거쳐, DOCX/HWPX/PDF 렌더러로 나간다.
모든 파이프라인 단계가 같은 데이터 타입을 주고받는다 — 이게 100종 매크로 확장의 토대.

설계:
- 블록(Block)은 단락·헤딩·리스트·표·코드·인용·박스 등 한 덩어리.
- 인라인(InlineRun)은 블록 안의 텍스트+서식 (bold, italic, color 등).
- 한국 공문 4단계 글머리(□ ○ ― ※)는 ListItem.bullet_marker로 표현.
- 검토 태그(빨강·파랑·노랑)는 별도 ReviewTag 컬렉션으로 보관.
"""
from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.providers.llm.base import DocumentClass, ReviewTag


class PersonaMode(StrEnum):
    """리모컨 모드 — 변환 결과의 단축키·매크로 기본 순서에 영향."""

    WORKER = "worker"  # 마크다운 워커 (개발자·기획자)
    HEAVY = "heavy"  # 한컴 헤비유저 (공무원·행정직)


class BlockType(StrEnum):
    PARAGRAPH = "paragraph"
    HEADING = "heading"
    LIST_ITEM = "list_item"
    TABLE = "table"
    CODE = "code"
    QUOTE = "quote"
    BOX = "box"  # 박스(테두리) 강조
    THEMATIC_BREAK = "thematic_break"
    HTML = "html"
    # ── 시각 요소 (Phase A 확장) ────────────────────────────────
    COVER = "cover"  # 표지 페이지 — DocumentIR.cover 와 1대1
    IMAGE = "image"  # 이미지 (마크다운 ![](url) · 업로드 · base64)
    DIAGRAM = "diagram"  # Mermaid · PlantUML — 렌더 시 PNG로 변환
    CHART = "chart"  # 차트 JSON 스펙 — matplotlib으로 PNG 렌더
    EQUATION = "equation"  # LaTeX 수식 — matplotlib MathText로 PNG 렌더


# ─────────────────────────────────────────────────────────────────────────────
# 인라인
# ─────────────────────────────────────────────────────────────────────────────

class InlineRun(BaseModel):
    """블록 안의 텍스트 한 조각 + 서식."""

    text: str
    bold: bool = False
    italic: bool = False
    underline: bool = False
    strikethrough: bool = False
    superscript: bool = False
    subscript: bool = False
    color: str | None = None  # #000000 등
    background: str | None = None
    font_family: str | None = None
    font_size: float | None = None  # pt
    code: bool = False
    link: str | None = None

    # 매크로 G14 한자 변환·G15 특수문자 결과 추적
    annotations: dict[str, Any] = Field(default_factory=dict)


# ─────────────────────────────────────────────────────────────────────────────
# 표
# ─────────────────────────────────────────────────────────────────────────────

class TableCell(BaseModel):
    runs: list[InlineRun] = Field(default_factory=list)
    colspan: int = 1
    rowspan: int = 1
    align: Literal["left", "center", "right"] = "left"
    background: str | None = None
    border: Literal["default", "none", "thick", "dashed"] = "default"
    rotate: int = 0  # 0 or 90 (S15)


class Table(BaseModel):
    rows: list[list[TableCell]] = Field(default_factory=list)
    border_style: Literal["default", "dashed", "grid", "header", "none"] = "default"
    header_row: bool = True
    column_widths: list[float] | None = None  # None이면 균등
    align: Literal["left", "center", "right"] = "center"

    @property
    def row_count(self) -> int:
        return len(self.rows)

    @property
    def col_count(self) -> int:
        return max((len(r) for r in self.rows), default=0)


# ─────────────────────────────────────────────────────────────────────────────
# 리스트
# ─────────────────────────────────────────────────────────────────────────────

class ListItem(BaseModel):
    """블록 글머리 항목.

    한국 공문 4단계 매핑:
      depth=0 → bullet_marker="□"
      depth=1 → bullet_marker="○"
      depth=2 → bullet_marker="―"
      depth=3 → bullet_marker="※"
    """

    runs: list[InlineRun] = Field(default_factory=list)
    depth: int = 0
    bullet_marker: str = "□"
    ordered: bool = False
    order_format: Literal["1.", "가.", "(1)", "①"] = "1."
    index: int = 0  # ordered일 때 번호


# ─────────────────────────────────────────────────────────────────────────────
# 시각 요소 (Phase A 확장) — 이미지·차트·다이어그램·수식
# ─────────────────────────────────────────────────────────────────────────────

class ImageData(BaseModel):
    """이미지 블록 데이터.

    크기 표기 — `width`/`height` 는 자유 형식 문자열:
      "70%"  — 본문 폭 대비 비율 (가장 직관적)
      "400px"
      "120mm"
      "300pt"
    """
    src: str = ""  # 원본 마크다운 표기 (![](src))
    url: str = ""  # http(s):// 외부 URL
    local_path: str = ""  # 서버 로컬 파일 경로
    data_b64: str = ""  # base64 (data URL prefix 포함 가능)
    mime: str = "image/png"
    alt: str = ""
    caption: str = ""
    width: str = ""  # "70%", "400px", "120mm", "300pt" 등
    height: str = ""
    width_pt: float | None = None  # 호환 — 매크로/렌더러가 계산하기 쉬운 pt 단위
    height_pt: float | None = None
    align: Literal["left", "center", "right"] = "center"


class DiagramData(BaseModel):
    """Mermaid · PlantUML 다이어그램 — 렌더 시 PNG로 변환."""
    engine: Literal["mermaid", "plantuml"] = "mermaid"
    source: str = ""  # 원본 다이어그램 코드
    caption: str = ""
    rendered_path: str = ""  # 캐시된 PNG 경로 (변환 후 채워짐)
    width: str = ""  # "70%", "400px" 등 자유 형식
    height: str = ""
    width_pt: float | None = None
    align: Literal["left", "center", "right"] = "center"


class ChartData(BaseModel):
    """차트 JSON 스펙 — matplotlib으로 PNG 렌더.

    spec 스키마 (Chart.js 류 간략화):
      { "type": "bar|line|pie|donut",
        "title": "...",
        "x_label": "...", "y_label": "...",
        "labels": ["1월", "2월", ...],
        "datasets": [ {"label": "매출", "data": [10, 20, ...], "color": "#1F5BAF"}, ... ] }
    """
    spec: dict[str, Any] = Field(default_factory=dict)
    caption: str = ""
    rendered_path: str = ""  # 캐시된 PNG 경로
    width: str = ""
    height: str = ""
    width_pt: float | None = None
    align: Literal["left", "center", "right"] = "center"


class EquationData(BaseModel):
    """LaTeX 수식 — matplotlib MathText로 PNG 렌더."""
    latex: str = ""  # \frac{a}{b} 등 LaTeX
    display: bool = False  # True면 block ($$...$$), False면 inline ($...$)
    rendered_path: str = ""
    width: str = ""
    align: Literal["left", "center", "right"] = "center"


class CoverData(BaseModel):
    """표지 페이지 — 한국 공문서 표준.

    template:
      - "modern"  : 현대적 — 큰 컬러 밴드 + 세련된 타이포 (기본값)
      - "classic" : 전통적 — 중앙 정렬 + 워터마크 로고
      - "gongmun" : 공문서 — 직인 자리 + 분류 박스 + 격식
      - "proposal": 제안서 — 좌측 컬러 밴드 + 큰 제목
      - "research": 연구보고서 — 학술 스타일 + 식별번호 강조
    """
    title: str = ""
    subtitle: str = ""
    author: str = ""  # "정원훈"
    organization: str = ""  # "(주)텐에이아이 · DocuAX"
    department: str = ""  # "기획팀"
    date: str = ""  # "2026. 05. 19." 또는 frontmatter date
    document_number: str = ""  # "DOCUAX-2026-001"
    logo_path: str = ""  # 로컬 파일 또는 URL
    seal_path: str = ""  # 직인 이미지 (선택)
    classification: str = ""  # "대외비" "공개" 등
    # 고도화 (10종)
    #   비즈니스·기획: modern · executive · proposal · annual_report
    #   공공·행정    : gongmun · government
    #   학술·연구    : research · whitepaper
    #   고전·간결    : classic · minimal
    template: Literal[
        "modern", "classic", "gongmun", "proposal", "research",
        "executive", "annual_report", "government", "whitepaper", "minimal",
    ] = "modern"
    accent_color: str = ""  # 헤딩 컬러 override (기본은 프로파일 brand)


# ─────────────────────────────────────────────────────────────────────────────
# 블록
# ─────────────────────────────────────────────────────────────────────────────

class Block(BaseModel):
    """문서의 한 줄/덩어리. type에 따라 채워지는 필드가 다름."""

    id: str  # blk-0001 형식. 매크로·검토 태그가 참조
    type: BlockType

    # 단락·헤딩·인용·코드·박스
    runs: list[InlineRun] = Field(default_factory=list)
    heading_level: int = 0  # 1~6 (heading일 때만)

    # 리스트
    list_item: ListItem | None = None

    # 표
    table: Table | None = None

    # 코드
    code_lang: str = ""

    # 시각 요소 (각 type에 맞는 것 하나만 채워짐)
    image: ImageData | None = None
    diagram: DiagramData | None = None
    chart: ChartData | None = None
    equation: EquationData | None = None

    # 매크로·렌더러에 전달할 자유 메타
    meta: dict[str, Any] = Field(default_factory=dict)

    def to_plain_text(self) -> str:
        if self.type == BlockType.TABLE and self.table:
            return "\n".join(
                "\t".join("".join(r.text for r in c.runs) for c in row) for row in self.table.rows
            )
        if self.type == BlockType.LIST_ITEM and self.list_item:
            return self.list_item.bullet_marker + " " + "".join(
                r.text for r in self.list_item.runs
            )
        if self.type == BlockType.IMAGE and self.image:
            return f"[이미지: {self.image.alt or self.image.caption or self.image.src}]"
        if self.type == BlockType.DIAGRAM and self.diagram:
            return f"[다이어그램: {self.diagram.caption or self.diagram.engine}]"
        if self.type == BlockType.CHART and self.chart:
            return f"[차트: {self.chart.caption or self.chart.spec.get('title', '')}]"
        if self.type == BlockType.EQUATION and self.equation:
            return f"[수식: {self.equation.latex}]"
        return "".join(r.text for r in self.runs)


# ─────────────────────────────────────────────────────────────────────────────
# 문서
# ─────────────────────────────────────────────────────────────────────────────

class DocumentIR(BaseModel):
    """파이프라인 전체 단계에서 흘러다니는 단일 진실 원본."""

    document_id: str
    title: str = ""
    persona_mode: PersonaMode = PersonaMode.WORKER
    document_class: DocumentClass = DocumentClass.GENERAL

    # 표지(Cover) — frontmatter 또는 명시 설정으로 채워지면 렌더 시 별도 페이지
    cover: CoverData | None = None

    # 파이프라인 단계 1·6의 결과
    source_markdown: str = ""
    blocks: list[Block] = Field(default_factory=list)

    # 단계 4 결과 — 빨강·파랑·노랑
    review_tags: list[ReviewTag] = Field(default_factory=list)

    # 양식 매핑 적용 여부 (한국 공문)
    template_applied: str = ""  # "default-gongmun" 등 템플릿 ID
    organization_id: str | None = None  # RAG 기관 양식 학습 대상

    # 매크로 자동 실행 로그
    macro_log: list[dict[str, Any]] = Field(default_factory=list)

    # 변환 메타
    model_version: str = ""  # provider:model:hash
    latency_ms: float | None = None

    def plain_text(self) -> str:
        return "\n".join(b.to_plain_text() for b in self.blocks)
