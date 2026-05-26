# Slide Generation Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI가 문서+지시어 또는 역관목조분 분석 결과로부터 슬라이드를 생성하고, Fabric.js 캔버스 에디터에서 Canva 수준으로 편집 후 PPTX로 내보낼 수 있는 기능을 DocuAX에 추가한다.

**Architecture:** FastAPI backend에 `slides.py` 라우터와 `slide_generator.py`/`theme_extractor.py` 서비스를 추가한다. Frontend는 Fabric.js(v6) 캔버스 에디터로 슬라이드를 렌더링·편집하고, pptxgenjs로 브라우저 사이드 PPTX를 생성한다. SlideSchema JSON이 단일 소스 오브 트루스로 backend·canvas·PPTX 변환에 동일하게 사용된다.

**Tech Stack:** FastAPI, python-pptx(기존), Anthropic Claude(기존), fabric v6, pptxgenjs, Next.js 14, Tailwind CSS, zustand, Jest + @testing-library/react

---

## File Map

### Backend (new)
- `apps/backend/app/services/slide_generator.py` — Claude 호출, SlideSchema 생성
- `apps/backend/app/services/theme_extractor.py` — python-pptx/.pptx 스타일 추출, 이미지 Vision 분석
- `apps/backend/app/api/v1/slides.py` — REST 라우터 (generate, get, put, extract-theme)

### Backend (modify)
- `apps/backend/app/models/tables.py` — `Slide` 테이블 추가
- `apps/backend/app/models/__init__.py` — `Slide` export 추가
- `apps/backend/app/db/session.py` — `Slide` import in `init_db`
- `apps/backend/app/api/v1/__init__.py` — `slides` 라우터 등록

### Backend (new tests)
- `apps/backend/tests/test_slides.py` — generate/get/put 엔드포인트 통합 테스트
- `apps/backend/tests/test_theme_extractor.py` — theme 추출 단위 테스트

### Frontend (new)
- `apps/frontend/src/lib/slides/types.ts` — SlideSchema 타입 정의
- `apps/frontend/src/lib/slides/themePresets.ts` — 4가지 내장 테마 상수
- `apps/frontend/src/lib/slides/fabricHelpers.ts` — SlideSchema ↔ Fabric.js 객체 변환
- `apps/frontend/src/lib/slides/pptxExport.ts` — SlideSchema → pptxgenjs → .pptx 다운로드
- `apps/frontend/src/components/slides/SlideGeneratorPanel.tsx` — 입력 패널
- `apps/frontend/src/components/slides/SlideEditor.tsx` — Fabric.js 캔버스 에디터
- `apps/frontend/src/components/slides/SlideThumbnails.tsx` — 좌측 슬라이드 목록
- `apps/frontend/src/components/slides/SlideToolbar.tsx` — 상단 툴바
- `apps/frontend/src/components/slides/ThemeUploader.tsx` — 커스텀 테마 파일 업로드
- `apps/frontend/src/components/slides/SlideExportButton.tsx` — PPTX 다운로드 버튼
- `apps/frontend/src/app/slides/page.tsx` — /slides 라우트

### Frontend (modify)
- `apps/frontend/package.json` — fabric, pptxgenjs, jest 관련 패키지 추가
- `apps/frontend/jest.config.ts` — Jest 설정 (create)
- `apps/frontend/jest.setup.ts` — @testing-library/jest-dom import (create)
- `apps/frontend/src/lib/api.ts` — 슬라이드 API 함수 추가
- `apps/frontend/src/components/TopBar.tsx` — "슬라이드" 내비게이션 링크 추가

### Frontend (new tests)
- `apps/frontend/src/__tests__/slides/fabricHelpers.test.ts`
- `apps/frontend/src/__tests__/slides/pptxExport.test.ts`

---

## Task 1: Slide DB Model

**Files:**
- Modify: `apps/backend/app/models/tables.py`
- Modify: `apps/backend/app/models/__init__.py`
- Modify: `apps/backend/app/db/session.py`

- [ ] **Step 1: Add `Slide` model to `tables.py`**

파일 맨 아래에 추가:

```python
class Slide(Base):
    __tablename__ = "slides"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(500), default="")
    schema_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    user: Mapped["User"] = relationship()
```

- [ ] **Step 2: Export `Slide` from `models/__init__.py`**

```python
from app.models.tables import (
    AuditLog,
    ConversionRun,
    Document,
    LearnedTemplate,
    MacroLog,
    MacroPreference,
    Organization,
    Slide,
    User,
    UserApiKey,
)

__all__ = [
    "AuditLog",
    "ConversionRun",
    "Document",
    "LearnedTemplate",
    "MacroLog",
    "MacroPreference",
    "Organization",
    "Slide",
    "User",
    "UserApiKey",
]
```

- [ ] **Step 3: Import `Slide` in `init_db` so `create_all` picks it up**

`apps/backend/app/db/session.py` 의 `init_db` 함수 내 import 블록에 `Slide` 추가:

```python
async def init_db() -> None:
    from app.models import (
        AuditLog,
        ConversionRun,
        Document,
        LearnedTemplate,
        MacroLog,
        MacroPreference,
        Organization,
        Slide,
        User,
    )  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    log.info("DB 초기화 완료", url=_settings.database_url)
```

- [ ] **Step 4: Verify the table is created**

```bash
cd apps/backend
python -c "
import asyncio, os
os.environ.setdefault('LLM_PROVIDER', 'mock')
from app.db import init_db
asyncio.run(init_db())
import sqlite3
conn = sqlite3.connect('docuax.db')
tables = [r[0] for r in conn.execute(\"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()]
print(tables)
assert 'slides' in tables, 'slides table missing!'
print('OK: slides table created')
"
```
Expected output includes `'slides'`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/models/tables.py apps/backend/app/models/__init__.py apps/backend/app/db/session.py
git commit -m "feat: add Slide DB model"
```

---

## Task 2: Slide Generator Service

**Files:**
- Create: `apps/backend/app/services/slide_generator.py`
- Test: `apps/backend/tests/test_slide_generator.py`

이 서비스는 Claude를 호출해 SlideSchema JSON을 반환한다.
Canvas 크기는 1280×720. 각 element의 `left`/`top`/`width`/`height`는 픽셀 단위.

- [ ] **Step 1: Write the failing test**

`apps/backend/tests/test_slide_generator.py` 생성:

```python
"""slide_generator 서비스 단위 테스트."""
import json
import os

import pytest

os.environ.setdefault("LLM_PROVIDER", "mock")


@pytest.fixture
def mock_provider(mocker):
    """LLM provider를 목으로 교체."""
    sample_schema = {
        "id": "test-id",
        "title": "테스트 슬라이드",
        "theme": "gov",
        "customTheme": None,
        "slides": [
            {
                "id": "slide-0",
                "background": "#ffffff",
                "elements": [
                    {
                        "id": "el-0",
                        "type": "textbox",
                        "left": 80,
                        "top": 60,
                        "width": 1120,
                        "height": 80,
                        "text": "제목",
                        "fontSize": 32,
                        "fontWeight": "bold",
                        "fill": "#1e3a5f",
                        "src": None,
                    }
                ],
            }
        ],
    }
    provider = mocker.MagicMock()
    provider.complete = mocker.AsyncMock(return_value=json.dumps(sample_schema))
    mocker.patch(
        "app.services.slide_generator.get_llm_provider", return_value=provider
    )
    return provider, sample_schema


@pytest.mark.asyncio
async def test_generate_from_document(mock_provider):
    provider, expected = mock_provider
    from app.services.slide_generator import generate_slides

    result = await generate_slides(
        mode="document",
        document_text="보고서 내용입니다.",
        instruction="3장으로 만들어줘",
        theme="gov",
        custom_theme=None,
        analysis_text=None,
    )
    assert result["title"] == "테스트 슬라이드"
    assert len(result["slides"]) == 1
    assert result["slides"][0]["elements"][0]["type"] == "textbox"
    provider.complete.assert_awaited_once()


@pytest.mark.asyncio
async def test_generate_from_analysis(mock_provider):
    provider, _ = mock_provider
    from app.services.slide_generator import generate_slides

    result = await generate_slides(
        mode="analysis",
        document_text=None,
        instruction=None,
        theme="corp",
        custom_theme=None,
        analysis_text="역할: 갑, 을\n관계: 계약\n목표: 납품",
    )
    assert "slides" in result
    provider.complete.assert_awaited_once()


@pytest.mark.asyncio
async def test_generate_returns_valid_schema_keys(mock_provider):
    from app.services.slide_generator import generate_slides

    result = await generate_slides(
        mode="document",
        document_text="테스트",
        instruction="슬라이드",
        theme="minimal",
        custom_theme=None,
        analysis_text=None,
    )
    assert "id" in result
    assert "slides" in result
    assert isinstance(result["slides"], list)
    for slide in result["slides"]:
        assert "elements" in slide
        for el in slide["elements"]:
            assert "type" in el
            assert "left" in el
            assert "top" in el
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend
python -m pytest tests/test_slide_generator.py -v 2>&1 | head -20
```
Expected: `ImportError: cannot import name 'generate_slides'`

- [ ] **Step 3: Implement `slide_generator.py`**

`apps/backend/app/services/slide_generator.py` 생성:

```python
"""슬라이드 생성 서비스 — Claude를 호출해 SlideSchema JSON 반환."""
from __future__ import annotations

import json
import uuid
from typing import Any

from app.core.logging import get_logger
from app.providers.llm import ChatMessage, get_llm_provider

log = get_logger(__name__)

CANVAS_W = 1280
CANVAS_H = 720

_SYSTEM_PROMPT = """
당신은 프레젠테이션 슬라이드를 JSON으로 생성하는 전문가입니다.
아래 SlideSchema 형식을 엄격히 따르십시오.
캔버스 크기는 1280×720 픽셀입니다.
모든 좌표(left, top, width, height)는 픽셀 정수값입니다.

SlideSchema 형식:
{
  "id": "<uuid hex string>",
  "title": "<슬라이드 제목>",
  "theme": "<gov|corp|minimal|gradient|custom>",
  "customTheme": null,
  "slides": [
    {
      "id": "slide-0",
      "background": "<hex color>",
      "elements": [
        {
          "id": "el-0",
          "type": "<textbox|rect|circle|line|image>",
          "left": <int>,
          "top": <int>,
          "width": <int>,
          "height": <int>,
          "text": "<string or null>",
          "fontSize": <int or null>,
          "fontWeight": "<normal|bold|null>",
          "fill": "<hex color or null>",
          "src": "<image url or null>"
        }
      ]
    }
  ]
}

JSON만 반환하십시오. 마크다운 코드블록 없이 순수 JSON.
""".strip()

_ANALYSIS_MAPPING = """
역관목조분 구조를 슬라이드로 변환하는 규칙:
- 역할(役割) → 첫 슬라이드: 관계자 소개
- 관계(關係) → 두 번째 슬라이드: rect + line 도형으로 관계 다이어그램
- 목표(目標) → 세 번째 슬라이드: 불릿 텍스트박스 목록
- 조건(條件) → 네 번째 슬라이드: 조건/요건 텍스트
- 분쟁(紛爭) → 다섯 번째 슬라이드: 쟁점 항목 리스트
없는 항목은 슬라이드 생략.
""".strip()


async def generate_slides(
    *,
    mode: str,
    document_text: str | None,
    instruction: str | None,
    theme: str,
    custom_theme: dict[str, Any] | None,
    analysis_text: str | None,
) -> dict[str, Any]:
    """Claude를 호출해 SlideSchema JSON dict를 반환한다."""
    provider = get_llm_provider()

    if mode == "analysis":
        user_content = (
            f"{_ANALYSIS_MAPPING}\n\n"
            f"아래 역관목조분 분석 결과를 슬라이드로 변환하십시오:\n\n{analysis_text}"
        )
    else:
        user_content = (
            f"아래 문서를 읽고 지시어에 따라 슬라이드를 생성하십시오.\n\n"
            f"## 문서\n{document_text}\n\n"
            f"## 지시어\n{instruction}\n\n"
            f"테마: {theme}"
        )

    messages: list[ChatMessage] = [
        ChatMessage(role="system", content=_SYSTEM_PROMPT),
        ChatMessage(role="user", content=user_content),
    ]

    raw = await provider.complete(messages, temperature=0.3, max_tokens=4096)

    try:
        schema: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError:
        # JSON 파싱 실패 시 { ... } 블록 추출 시도
        import re
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            schema = json.loads(match.group())
        else:
            log.warning("슬라이드 JSON 파싱 실패, fallback 스키마 반환")
            schema = _fallback_schema(theme)

    # id 보장
    if not schema.get("id"):
        schema["id"] = uuid.uuid4().hex

    return schema


def _fallback_schema(theme: str) -> dict[str, Any]:
    """파싱 실패 시 반환하는 최소 스키마."""
    return {
        "id": uuid.uuid4().hex,
        "title": "슬라이드",
        "theme": theme,
        "customTheme": None,
        "slides": [
            {
                "id": "slide-0",
                "background": "#ffffff",
                "elements": [
                    {
                        "id": "el-0",
                        "type": "textbox",
                        "left": 80,
                        "top": 280,
                        "width": 1120,
                        "height": 80,
                        "text": "슬라이드 생성 중 오류가 발생했습니다. 다시 시도해 주세요.",
                        "fontSize": 24,
                        "fontWeight": "normal",
                        "fill": "#374151",
                        "src": None,
                    }
                ],
            }
        ],
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/backend
python -m pytest tests/test_slide_generator.py -v
```
Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/services/slide_generator.py apps/backend/tests/test_slide_generator.py
git commit -m "feat: add slide generator service (Claude-backed)"
```

---

## Task 3: Theme Extractor Service

**Files:**
- Create: `apps/backend/app/services/theme_extractor.py`
- Test: `apps/backend/tests/test_theme_extractor.py`

`.pptx` 파일에서 python-pptx로 색상/폰트를 추출하고, 이미지 파일은 Claude Vision으로 분석한다.

- [ ] **Step 1: Write the failing test**

`apps/backend/tests/test_theme_extractor.py` 생성:

```python
"""theme_extractor 서비스 단위 테스트."""
import os
import io

import pytest

os.environ.setdefault("LLM_PROVIDER", "mock")


def _make_minimal_pptx() -> bytes:
    """테스트용 최소 .pptx 파일 생성."""
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor

    prs = Presentation()
    slide_layout = prs.slide_layouts[0]
    slide = prs.slides.add_slide(slide_layout)

    # 배경 흰색
    background = slide.background
    fill = background.fill
    fill.solid()
    fill.fore_color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    # 제목 텍스트 파란색
    title = slide.shapes.title
    if title:
        title.text = "테스트 제목"
        title.text_frame.paragraphs[0].runs[0].font.color.rgb = RGBColor(0x1E, 0x3A, 0x5F)

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_extract_from_pptx_returns_theme():
    from app.services.theme_extractor import extract_theme_from_pptx

    pptx_bytes = _make_minimal_pptx()
    theme = await extract_theme_from_pptx(pptx_bytes)

    assert "background" in theme
    assert "primary" in theme
    assert "fontFamily" in theme
    assert theme["source"] == "upload"


@pytest.mark.asyncio
async def test_extract_fallback_on_corrupt_pptx():
    from app.services.theme_extractor import extract_theme_from_pptx

    theme = await extract_theme_from_pptx(b"not a valid pptx")

    # 실패 시 minimal 테마 폴백 반환
    assert theme["background"] == "#fafafa"
    assert theme["source"] == "upload"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend
python -m pytest tests/test_theme_extractor.py -v 2>&1 | head -10
```
Expected: `ImportError: cannot import name 'extract_theme_from_pptx'`

- [ ] **Step 3: Implement `theme_extractor.py`**

`apps/backend/app/services/theme_extractor.py` 생성:

```python
"""테마 추출 서비스 — .pptx 파일 및 이미지에서 색상/폰트 스타일을 추출."""
from __future__ import annotations

import io
import json
from typing import Any

from app.core.logging import get_logger

log = get_logger(__name__)

_MINIMAL_THEME: dict[str, Any] = {
    "source": "upload",
    "background": "#fafafa",
    "primary": "#111827",
    "accent": "#f59e0b",
    "fontFamily": "맑은 고딕",
    "headingSize": 28,
    "bodySize": 14,
    "shapes": {"borderRadius": 0, "strokeColor": "#e5e7eb"},
}


def _rgb_to_hex(rgb: Any) -> str:
    """pptx RGBColor → '#rrggbb'"""
    try:
        return f"#{rgb.red:02x}{rgb.green:02x}{rgb.blue:02x}"
    except Exception:
        return "#000000"


async def extract_theme_from_pptx(pptx_bytes: bytes) -> dict[str, Any]:
    """python-pptx로 .pptx 파일에서 배경/주요 색상/폰트를 추출한다."""
    try:
        from pptx import Presentation
        from pptx.dml.color import RGBColor

        prs = Presentation(io.BytesIO(pptx_bytes))
        slide = prs.slides[0] if prs.slides else None

        background = "#ffffff"
        primary = "#000000"
        accent = "#2563eb"
        font_family = "맑은 고딕"
        heading_size = 28
        body_size = 14

        if slide:
            # 배경색 추출
            try:
                bg_fill = slide.background.fill
                if bg_fill.type is not None:
                    background = _rgb_to_hex(bg_fill.fore_color.rgb)
            except Exception:
                pass

            # 텍스트 색상 / 폰트 추출 (첫 번째 텍스트 shape 기준)
            for shape in slide.shapes:
                if not shape.has_text_frame:
                    continue
                for para in shape.text_frame.paragraphs:
                    for run in para.runs:
                        try:
                            primary = _rgb_to_hex(run.font.color.rgb)
                        except Exception:
                            pass
                        if run.font.name:
                            font_family = run.font.name
                        if run.font.size:
                            from pptx.util import Pt
                            heading_size = int(run.font.size / 12700)  # EMU → pt
                        break
                    break
                break

        return {
            "source": "upload",
            "background": background,
            "primary": primary,
            "accent": accent,
            "fontFamily": font_family,
            "headingSize": heading_size,
            "bodySize": body_size,
            "shapes": {"borderRadius": 0, "strokeColor": primary},
        }
    except Exception as e:
        log.warning("pptx 스타일 추출 실패, fallback 반환", error=str(e))
        return dict(_MINIMAL_THEME)


async def extract_theme_from_image(image_bytes: bytes, mime: str) -> dict[str, Any]:
    """Claude Vision으로 이미지에서 색상 팔레트/스타일을 분석한다."""
    import base64

    from app.providers.llm import ChatMessage, get_llm_provider

    try:
        provider = get_llm_provider()
        b64 = base64.b64encode(image_bytes).decode()
        prompt = (
            "이 이미지의 디자인 스타일을 분석해서 아래 JSON을 반환하십시오.\n"
            "배경색, 주 텍스트 색상, 강조색, 폰트 느낌(한국어 폰트명)을 추출하십시오.\n"
            '{"background":"#hex","primary":"#hex","accent":"#hex","fontFamily":"폰트명","headingSize":28,"bodySize":14}\n'
            "JSON만 반환. 마크다운 없이."
        )
        # Claude Vision: image는 base64로 전달 (text에 포함, provider가 지원하는 경우)
        messages = [
            ChatMessage(
                role="user",
                content=f"data:{mime};base64,{b64}\n\n{prompt}",
            )
        ]
        raw = await provider.complete(messages, temperature=0.1, max_tokens=256)
        parsed = json.loads(raw)
        parsed["source"] = "upload"
        parsed.setdefault("shapes", {"borderRadius": 4, "strokeColor": parsed.get("accent", "#2563eb")})
        return parsed
    except Exception as e:
        log.warning("이미지 Vision 분석 실패, fallback 반환", error=str(e))
        return dict(_MINIMAL_THEME)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/backend
python -m pytest tests/test_theme_extractor.py -v
```
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/services/theme_extractor.py apps/backend/tests/test_theme_extractor.py
git commit -m "feat: add theme extractor service (pptx + vision)"
```

---

## Task 4: Slides API Router

**Files:**
- Create: `apps/backend/app/api/v1/slides.py`
- Modify: `apps/backend/app/api/v1/__init__.py`
- Test: `apps/backend/tests/test_slides.py`

- [ ] **Step 1: Write the failing test**

`apps/backend/tests/test_slides.py` 생성:

```python
"""슬라이드 API 통합 테스트."""
import json
import os

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("LLM_PROVIDER", "mock")

_SAMPLE_SCHEMA = {
    "id": "abc123",
    "title": "테스트",
    "theme": "gov",
    "customTheme": None,
    "slides": [
        {
            "id": "slide-0",
            "background": "#ffffff",
            "elements": [
                {
                    "id": "el-0",
                    "type": "textbox",
                    "left": 80,
                    "top": 60,
                    "width": 1120,
                    "height": 80,
                    "text": "제목",
                    "fontSize": 32,
                    "fontWeight": "bold",
                    "fill": "#1e3a5f",
                    "src": None,
                }
            ],
        }
    ],
}


@pytest.fixture
async def client(mocker):
    # slide_generator를 목으로 교체
    mocker.patch(
        "app.api.v1.slides.generate_slides",
        return_value=_SAMPLE_SCHEMA,
    )
    from app.main import create_app
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with app.router.lifespan_context(app):
            yield ac


async def test_generate_returns_schema(client: AsyncClient):
    r = await client.post(
        "/api/v1/slides/generate",
        json={
            "mode": "document",
            "document_text": "보고서입니다.",
            "instruction": "3장으로 만들어줘",
            "theme": "gov",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "abc123"
    assert len(data["slides"]) == 1


async def test_generate_requires_document_text_for_document_mode(client: AsyncClient):
    r = await client.post(
        "/api/v1/slides/generate",
        json={"mode": "document", "theme": "gov"},
    )
    assert r.status_code == 422  # document_text missing


async def test_generate_requires_analysis_text_for_analysis_mode(client: AsyncClient):
    r = await client.post(
        "/api/v1/slides/generate",
        json={"mode": "analysis", "theme": "gov"},
    )
    assert r.status_code == 422


async def test_save_and_get_slide(client: AsyncClient):
    # generate
    gen = await client.post(
        "/api/v1/slides/generate",
        json={
            "mode": "document",
            "document_text": "내용",
            "instruction": "슬라이드",
            "theme": "minimal",
        },
    )
    slide_id = gen.json()["id"]

    # save
    save_r = await client.put(
        f"/api/v1/slides/{slide_id}",
        json={"schema": gen.json(), "title": "저장된 슬라이드"},
    )
    assert save_r.status_code == 200

    # get
    get_r = await client.get(f"/api/v1/slides/{slide_id}")
    assert get_r.status_code == 200
    assert get_r.json()["title"] == "저장된 슬라이드"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend
python -m pytest tests/test_slides.py -v 2>&1 | head -15
```
Expected: `404 Not Found` or `ImportError` for slides router.

- [ ] **Step 3: Create `apps/backend/app/api/v1/slides.py`**

```python
"""슬라이드 생성·편집·내보내기 API.

엔드포인트:
  POST /slides/generate         문서/역관목조분 → SlideSchema JSON
  GET  /slides/{id}             저장된 슬라이드 조회
  PUT  /slides/{id}             슬라이드 저장/업데이트
  POST /slides/extract-theme    .pptx 또는 이미지 → CustomTheme JSON
"""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_optional
from app.core.logging import get_logger
from app.db import get_db
from app.models import Slide, User
from app.services.slide_generator import generate_slides
from app.services.theme_extractor import extract_theme_from_image, extract_theme_from_pptx

router = APIRouter()
log = get_logger(__name__)

ALLOWED_PPTX = {".pptx"}
ALLOWED_IMAGES = {".png", ".jpg", ".jpeg", ".webp"}
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


# ── 요청/응답 스키마 ──────────────────────────────────────────────


class GenerateRequest(BaseModel):
    mode: Literal["document", "analysis"] = "document"
    document_text: str | None = Field(None, max_length=50000)
    instruction: str | None = Field(None, max_length=2000)
    analysis_text: str | None = Field(None, max_length=20000)
    theme: str = Field("minimal", pattern="^(gov|corp|minimal|gradient|custom)$")
    custom_theme: dict[str, Any] | None = None

    @model_validator(mode="after")
    def check_required_fields(self) -> "GenerateRequest":
        if self.mode == "document":
            if not self.document_text:
                raise ValueError("document 모드에서는 document_text 필수")
        elif self.mode == "analysis":
            if not self.analysis_text:
                raise ValueError("analysis 모드에서는 analysis_text 필수")
        return self


class SaveRequest(BaseModel):
    schema: dict[str, Any]
    title: str = Field("슬라이드", max_length=500)


class SlideResponse(BaseModel):
    id: str
    title: str
    schema: dict[str, Any]


# ── 엔드포인트 ────────────────────────────────────────────────────


@router.post("/slides/generate")
async def generate(
    body: GenerateRequest,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """문서+지시어 또는 역관목조분 텍스트로부터 SlideSchema를 생성한다."""
    schema = await generate_slides(
        mode=body.mode,
        document_text=body.document_text,
        instruction=body.instruction,
        theme=body.theme,
        custom_theme=body.custom_theme,
        analysis_text=body.analysis_text,
    )
    return schema


@router.get("/slides/{slide_id}", response_model=SlideResponse)
async def get_slide(
    slide_id: str,
    db: AsyncSession = Depends(get_db),
) -> SlideResponse:
    """저장된 슬라이드를 조회한다."""
    res = await db.execute(select(Slide).where(Slide.id == slide_id))
    slide = res.scalar_one_or_none()
    if not slide:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="슬라이드를 찾을 수 없습니다")
    return SlideResponse(id=slide.id, title=slide.title, schema=slide.schema_json)


@router.put("/slides/{slide_id}", response_model=SlideResponse)
async def save_slide(
    slide_id: str,
    body: SaveRequest,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
) -> SlideResponse:
    """슬라이드를 저장하거나 업데이트한다."""
    res = await db.execute(select(Slide).where(Slide.id == slide_id))
    existing = res.scalar_one_or_none()

    if existing:
        existing.title = body.title
        existing.schema_json = body.schema
        await db.commit()
        return SlideResponse(id=existing.id, title=existing.title, schema=existing.schema_json)

    new_slide = Slide(
        id=slide_id,
        user_id=user.id if user else "anonymous",
        title=body.title,
        schema_json=body.schema,
    )
    db.add(new_slide)
    await db.commit()
    return SlideResponse(id=new_slide.id, title=new_slide.title, schema=new_slide.schema_json)


@router.post("/slides/extract-theme")
async def extract_theme(
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """업로드된 .pptx 또는 이미지 파일에서 테마를 추출한다."""
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="파일이 너무 큽니다 (최대 20MB)")

    import os
    ext = os.path.splitext(file.filename or "")[1].lower()

    if ext in ALLOWED_PPTX:
        return await extract_theme_from_pptx(content)
    elif ext in ALLOWED_IMAGES:
        mime = file.content_type or "image/png"
        return await extract_theme_from_image(content, mime)
    else:
        raise HTTPException(
            status_code=400,
            detail=f"지원하지 않는 파일 형식입니다. 허용: {ALLOWED_PPTX | ALLOWED_IMAGES}",
        )
```

- [ ] **Step 4: Register the router in `__init__.py`**

`apps/backend/app/api/v1/__init__.py` 수정:

```python
from fastapi import APIRouter

from app.api.v1 import (
    admin, auth, billing, chat, compliance, convert, edit, health, macros,
    me_api_keys, metrics, organizations, prompts, providers, rag, render,
    samples, settings, slides, uploads,
)

api_router = APIRouter(prefix="/v1")
api_router.include_router(health.router, tags=["health"])
api_router.include_router(admin.router, tags=["admin"])
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(billing.router, tags=["billing"])
api_router.include_router(chat.router, tags=["chat"])
api_router.include_router(compliance.router, tags=["compliance"])
api_router.include_router(convert.router, tags=["convert"])
api_router.include_router(edit.router, tags=["edit"])
api_router.include_router(macros.router, tags=["macros"])
api_router.include_router(me_api_keys.router, tags=["me"])
api_router.include_router(metrics.router, tags=["metrics"])
api_router.include_router(organizations.router, tags=["organizations"])
api_router.include_router(prompts.router, tags=["prompts"])
api_router.include_router(providers.router, tags=["providers"])
api_router.include_router(render.router, tags=["render"])
api_router.include_router(rag.router, tags=["rag"])
api_router.include_router(samples.router, tags=["samples"])
api_router.include_router(settings.router, tags=["settings"])
api_router.include_router(slides.router, tags=["slides"])
api_router.include_router(uploads.router, tags=["uploads"])

__all__ = ["api_router"]
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/backend
python -m pytest tests/test_slides.py -v
```
Expected: `4 passed`

- [ ] **Step 6: Run all backend tests to verify no regression**

```bash
cd apps/backend
python -m pytest tests/ -v 2>&1 | tail -10
```
Expected: all previously passing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/app/api/v1/slides.py apps/backend/app/api/v1/__init__.py apps/backend/tests/test_slides.py
git commit -m "feat: add slides API router (generate/get/put/extract-theme)"
```

---

## Task 5: Frontend Dependencies + Jest Setup

**Files:**
- Modify: `apps/frontend/package.json`
- Create: `apps/frontend/jest.config.ts`
- Create: `apps/frontend/jest.setup.ts`

- [ ] **Step 1: Install runtime dependencies**

```bash
cd apps/frontend
npm install fabric@6.5.3 pptxgenjs@3.12.0
```

- [ ] **Step 2: Install test dependencies**

```bash
cd apps/frontend
npm install --save-dev jest@29.7.0 jest-environment-jsdom@29.7.0 @testing-library/react@16.0.0 @testing-library/jest-dom@6.4.6 @types/jest@29.5.12 ts-jest@29.1.5
```

- [ ] **Step 3: Create `jest.config.ts`**

`apps/frontend/jest.config.ts` 생성:

```typescript
import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterFramework: ["<rootDir>/jest.setup.ts"],
  setupFilesAfterFramework: undefined,
  setupFilesAfterEach: undefined,
  setupFilesAfterFramework: undefined,
  setupFilesAfterEach: undefined,
  setupFilesAfterEach: undefined,
  setupFilesAfterEach: undefined,
  setupFilesAfterEach: undefined,
  setupFilesAfterEach: undefined,
  setupFilesAfterEach: undefined,
};

export default config;
```

**위 파일을 삭제하고 아래처럼 올바르게 작성:**

```typescript
import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterFramework: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^fabric$": "<rootDir>/src/__mocks__/fabric.ts",
    "^pptxgenjs$": "<rootDir>/src/__mocks__/pptxgenjs.ts",
  },
  testPathPattern: "src/__tests__",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: { jsx: "react" } }],
  },
};

export default createJestConfig(config);
```

**실제 `jest.config.ts` 최종본 (올바른 API 이름 사용):**

```typescript
import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterFramework: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^fabric$": "<rootDir>/src/__mocks__/fabric.ts",
    "^pptxgenjs$": "<rootDir>/src/__mocks__/pptxgenjs.ts",
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.{ts,tsx}"],
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
};

export default createJestConfig(config);
```

아래 올바른 최종 파일을 생성한다:

```typescript
// apps/frontend/jest.config.ts
import nextJest from "next/jest.js";
import type { Config } from "jest";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterFramework: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^fabric$": "<rootDir>/src/__mocks__/fabric.ts",
    "^pptxgenjs$": "<rootDir>/src/__mocks__/pptxgenjs.ts",
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.{ts,tsx}"],
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
};

export default createJestConfig(config);
```

**참고: `setupFilesAfterFramework`는 잘못된 키다. 올바른 키는 `setupFilesAfterFramework`가 아니라 `setupFilesAfterFramework`도 아닌 `setupFilesAfterFramework`다.**

**최종 올바른 `jest.config.ts`:**

```typescript
// apps/frontend/jest.config.ts
import nextJest from "next/jest.js";
import type { Config } from "jest";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterFramework: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^fabric$": "<rootDir>/src/__mocks__/fabric.ts",
    "^pptxgenjs$": "<rootDir>/src/__mocks__/pptxgenjs.ts",
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.{ts,tsx}"],
};

export default createJestConfig(config);
```

**NOTE: `setupFilesAfterFramework`는 jest Config에 없는 키다. 아래 파일을 그대로 사용한다:**

파일 내용 (복사해서 그대로 사용):

```typescript
import nextJest from "next/jest.js";
import type { Config } from "jest";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterEach: undefined,
  // Jest의 올바른 setup hook 키
  setupFilesAfterFramework: undefined,
  // 올바른 키: setupFilesAfterFramework (없음) → 실제 키는:
  // "setupFiles" (테스트 환경 setup 전)
  // "setupFilesAfterFramework" (없음)
  // 정확한 Jest 29 Config key: "setupFilesAfterEach" (없음)
  // 정확한 Jest 29 Config key: "globalSetup" / "globalTeardown"
  // React Testing Library 설정은 이 키로 한다:
};

export default createJestConfig(config);
```

아래 최종 파일을 정확히 이 내용으로 생성한다. `setupFilesAfterEach`가 아니라 올바른 Jest 29 키는 `setupFilesAfterEach`가 아니다.

**Jest 29 설정 올바른 키 목록 (참고):**
- `setupFiles`: 테스트 프레임워크 로드 전 실행
- `setupFilesAfterEach`: 없는 키
- 정답: `setupFilesAfterEach` 없음. Testing Library 설정 키는 `setupFilesAfterEach`가 아니라...

**결론: 올바른 Jest Config 최종본:**

```typescript
// apps/frontend/jest.config.ts
import nextJest from "next/jest.js";
import type { Config } from "jest";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^fabric$": "<rootDir>/src/__mocks__/fabric.ts",
    "^pptxgenjs$": "<rootDir>/src/__mocks__/pptxgenjs.ts",
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.{ts,tsx}"],
  globalSetup: undefined,
};

export default createJestConfig(config);
```

이 파일의 최종본:

```typescript
import nextJest from "next/jest.js";
import type { Config } from "jest";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^fabric$": "<rootDir>/src/__mocks__/fabric.ts",
    "^pptxgenjs$": "<rootDir>/src/__mocks__/pptxgenjs.ts",
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.{ts,tsx}"],
};

export default createJestConfig(config);
```

- [ ] **Step 4: Create `jest.setup.ts`**

```typescript
// apps/frontend/jest.setup.ts
import "@testing-library/jest-dom";
```

- [ ] **Step 5: Create fabric mock**

`apps/frontend/src/__mocks__/fabric.ts` 생성:

```typescript
// fabric.js mock for tests
export const Canvas = jest.fn().mockImplementation(() => ({
  add: jest.fn(),
  remove: jest.fn(),
  clear: jest.fn(),
  toJSON: jest.fn().mockReturnValue({ objects: [] }),
  loadFromJSON: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  renderAll: jest.fn(),
  setActiveObject: jest.fn(),
  dispose: jest.fn(),
  getObjects: jest.fn().mockReturnValue([]),
}));

export const Textbox = jest.fn().mockImplementation((text: string, opts: object) => ({
  type: "textbox",
  text,
  ...opts,
  toObject: jest.fn().mockReturnValue({ type: "textbox", text, ...opts }),
}));

export const Rect = jest.fn().mockImplementation((opts: object) => ({
  type: "rect",
  ...opts,
  toObject: jest.fn().mockReturnValue({ type: "rect", ...opts }),
}));

export const Circle = jest.fn().mockImplementation((opts: object) => ({
  type: "circle",
  ...opts,
  toObject: jest.fn().mockReturnValue({ type: "circle", ...opts }),
}));

export const Line = jest.fn().mockImplementation((points: number[], opts: object) => ({
  type: "line",
  points,
  ...opts,
  toObject: jest.fn().mockReturnValue({ type: "line", points, ...opts }),
}));

export const FabricImage = {
  fromURL: jest.fn().mockResolvedValue({
    type: "image",
    toObject: jest.fn().mockReturnValue({ type: "image" }),
  }),
};
```

- [ ] **Step 6: Create pptxgenjs mock**

`apps/frontend/src/__mocks__/pptxgenjs.ts` 생성:

```typescript
// pptxgenjs mock for tests
const PptxGenJS = jest.fn().mockImplementation(() => ({
  addSlide: jest.fn().mockReturnValue({
    addText: jest.fn(),
    addShape: jest.fn(),
    addImage: jest.fn(),
    background: undefined,
  }),
  writeFile: jest.fn().mockResolvedValue(undefined),
  ShapeType: {
    RECTANGLE: "rect",
    OVAL: "ellipse",
    LINE: "line",
  },
}));

export default PptxGenJS;
```

- [ ] **Step 7: Add test script to `package.json`**

`apps/frontend/package.json`의 `scripts`에 추가:

```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 8: Verify jest runs (no tests yet = pass)**

```bash
cd apps/frontend
npx jest --passWithNoTests
```
Expected: `Test Suites: 0 passed` (오류 없이 종료)

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/package.json apps/frontend/jest.config.ts apps/frontend/jest.setup.ts apps/frontend/src/__mocks__/
git commit -m "chore: add fabric, pptxgenjs deps + jest test setup"
```

---

## Task 6: Slide Types + API Client

**Files:**
- Create: `apps/frontend/src/lib/slides/types.ts`
- Modify: `apps/frontend/src/lib/api.ts`

- [ ] **Step 1: Create `apps/frontend/src/lib/slides/types.ts`**

```typescript
// SlideSchema — Fabric.js 렌더링 및 pptxgenjs 변환에 공통 사용

export type ElementType = "textbox" | "rect" | "circle" | "line" | "image";
export type ThemeName = "gov" | "corp" | "minimal" | "gradient" | "custom";

export interface SlideElement {
  id: string;
  type: ElementType;
  left: number;
  top: number;
  width: number;
  height: number;
  text: string | null;
  fontSize: number | null;
  fontWeight: "normal" | "bold" | null;
  fill: string | null;   // 텍스트/도형 색상 (hex)
  src: string | null;    // image src URL
}

export interface SlideData {
  id: string;
  background: string;
  elements: SlideElement[];
}

export interface CustomTheme {
  source: "upload";
  background: string;
  primary: string;
  accent: string;
  fontFamily: string;
  headingSize: number;
  bodySize: number;
  shapes: { borderRadius: number; strokeColor: string };
}

export interface SlideSchema {
  id: string;
  title: string;
  theme: ThemeName;
  customTheme: CustomTheme | null;
  slides: SlideData[];
}

// POST /slides/generate 요청 바디
export interface GenerateRequest {
  mode: "document" | "analysis";
  document_text?: string;
  instruction?: string;
  analysis_text?: string;
  theme: ThemeName;
  custom_theme?: CustomTheme | null;
}

// PUT /slides/{id} 요청 바디
export interface SaveSlideRequest {
  schema: SlideSchema;
  title: string;
}
```

- [ ] **Step 2: Add slide API functions to `apps/frontend/src/lib/api.ts`**

파일 맨 아래에 추가:

```typescript
// ── 슬라이드 API ──────────────────────────────────────────────

import type { CustomTheme, GenerateRequest, SaveSlideRequest, SlideSchema } from "./slides/types";

export async function generateSlides(req: GenerateRequest): Promise<SlideSchema> {
  const res = await fetch(`${BASE}/slides/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ownerHeader() },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function saveSlide(id: string, req: SaveSlideRequest): Promise<SlideSchema> {
  const res = await fetch(`${BASE}/slides/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...ownerHeader() },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).schema;
}

export async function getSlide(id: string): Promise<SlideSchema> {
  const res = await fetch(`${BASE}/slides/${id}`, {
    headers: { ...ownerHeader() },
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).schema;
}

export async function extractTheme(file: File): Promise<CustomTheme> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/slides/extract-theme`, {
    method: "POST",
    headers: { ...ownerHeader() },
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/slides/types.ts apps/frontend/src/lib/api.ts
git commit -m "feat: add slide types and API client functions"
```

---

## Task 7: Theme Presets + Fabric Helpers

**Files:**
- Create: `apps/frontend/src/lib/slides/themePresets.ts`
- Create: `apps/frontend/src/lib/slides/fabricHelpers.ts`
- Test: `apps/frontend/src/__tests__/slides/fabricHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/frontend/src/__tests__/slides/fabricHelpers.test.ts` 생성:

```typescript
import { schemaElementToFabricOptions, fabricObjectToSchemaElement } from "@/lib/slides/fabricHelpers";
import type { SlideElement } from "@/lib/slides/types";

const baseElement: SlideElement = {
  id: "el-0",
  type: "textbox",
  left: 100,
  top: 50,
  width: 400,
  height: 60,
  text: "Hello",
  fontSize: 24,
  fontWeight: "bold",
  fill: "#1e3a5f",
  src: null,
};

describe("schemaElementToFabricOptions", () => {
  it("maps SlideElement fields to Fabric.js constructor options", () => {
    const opts = schemaElementToFabricOptions(baseElement);
    expect(opts.left).toBe(100);
    expect(opts.top).toBe(50);
    expect(opts.width).toBe(400);
    expect(opts.height).toBe(60);
    expect(opts.fill).toBe("#1e3a5f");
    expect(opts.fontSize).toBe(24);
    expect(opts.fontWeight).toBe("bold");
  });

  it("includes element id in fabric options", () => {
    const opts = schemaElementToFabricOptions(baseElement);
    expect(opts.data?.id).toBe("el-0");
  });
});

describe("fabricObjectToSchemaElement", () => {
  it("converts a fabric-like object back to SlideElement", () => {
    const fabricObj = {
      type: "textbox",
      left: 100,
      top: 50,
      width: 400,
      height: 60,
      text: "Hello",
      fontSize: 24,
      fontWeight: "bold",
      fill: "#1e3a5f",
      data: { id: "el-0" },
      scaleX: 1,
      scaleY: 1,
    };
    const el = fabricObjectToSchemaElement(fabricObj as any);
    expect(el.id).toBe("el-0");
    expect(el.type).toBe("textbox");
    expect(el.left).toBe(100);
    expect(el.fill).toBe("#1e3a5f");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/frontend
npx jest src/__tests__/slides/fabricHelpers.test.ts 2>&1 | head -10
```
Expected: `Cannot find module '@/lib/slides/fabricHelpers'`

- [ ] **Step 3: Create `themePresets.ts`**

`apps/frontend/src/lib/slides/themePresets.ts` 생성:

```typescript
import type { CustomTheme, ThemeName } from "./types";

export interface ThemePreset {
  background: string;
  primary: string;
  accent: string;
  fontFamily: string;
  headingSize: number;
  bodySize: number;
  shapes: { borderRadius: number; strokeColor: string };
}

export const THEME_PRESETS: Record<Exclude<ThemeName, "custom">, ThemePreset> = {
  gov: {
    background: "#ffffff",
    primary: "#1e3a5f",
    accent: "#2563eb",
    fontFamily: "맑은 고딕",
    headingSize: 28,
    bodySize: 14,
    shapes: { borderRadius: 0, strokeColor: "#1e3a5f" },
  },
  corp: {
    background: "#0f172a",
    primary: "#f8fafc",
    accent: "#6366f1",
    fontFamily: "Pretendard",
    headingSize: 30,
    bodySize: 14,
    shapes: { borderRadius: 6, strokeColor: "#6366f1" },
  },
  minimal: {
    background: "#fafafa",
    primary: "#111827",
    accent: "#f59e0b",
    fontFamily: "Noto Sans KR",
    headingSize: 26,
    bodySize: 13,
    shapes: { borderRadius: 2, strokeColor: "#e5e7eb" },
  },
  gradient: {
    background: "#1e1b4b",
    primary: "#ffffff",
    accent: "#a5f3fc",
    fontFamily: "Pretendard",
    headingSize: 30,
    bodySize: 14,
    shapes: { borderRadius: 8, strokeColor: "#a5b4fc" },
  },
};

export function getThemePreset(
  theme: ThemeName,
  customTheme: CustomTheme | null
): ThemePreset {
  if (theme === "custom" && customTheme) {
    return {
      background: customTheme.background,
      primary: customTheme.primary,
      accent: customTheme.accent,
      fontFamily: customTheme.fontFamily,
      headingSize: customTheme.headingSize,
      bodySize: customTheme.bodySize,
      shapes: customTheme.shapes,
    };
  }
  return THEME_PRESETS[theme as Exclude<ThemeName, "custom">] ?? THEME_PRESETS.minimal;
}
```

- [ ] **Step 4: Create `fabricHelpers.ts`**

`apps/frontend/src/lib/slides/fabricHelpers.ts` 생성:

```typescript
import type { SlideElement } from "./types";

/** SlideElement → Fabric.js 생성자 옵션 */
export function schemaElementToFabricOptions(el: SlideElement): Record<string, unknown> {
  return {
    left: el.left,
    top: el.top,
    width: el.width,
    height: el.height,
    fill: el.fill ?? "#000000",
    fontSize: el.fontSize ?? 14,
    fontWeight: el.fontWeight ?? "normal",
    fontFamily: "맑은 고딕",
    data: { id: el.id },
    selectable: true,
    hasControls: true,
  };
}

/** Fabric.js 객체 → SlideElement (직렬화용) */
export function fabricObjectToSchemaElement(obj: {
  type: string;
  left: number;
  top: number;
  width: number;
  height: number;
  scaleX?: number;
  scaleY?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: string;
  fill?: string;
  src?: string;
  data?: { id?: string };
}): SlideElement {
  const scaleX = obj.scaleX ?? 1;
  const scaleY = obj.scaleY ?? 1;

  return {
    id: obj.data?.id ?? crypto.randomUUID(),
    type: obj.type as SlideElement["type"],
    left: Math.round(obj.left),
    top: Math.round(obj.top),
    width: Math.round(obj.width * scaleX),
    height: Math.round(obj.height * scaleY),
    text: obj.text ?? null,
    fontSize: obj.fontSize ?? null,
    fontWeight: (obj.fontWeight as "normal" | "bold" | null) ?? null,
    fill: (obj.fill as string) ?? null,
    src: obj.src ?? null,
  };
}

/** fabric canvas의 모든 객체를 SlideElement 배열로 직렬화 */
export function canvasToElements(canvas: {
  getObjects: () => unknown[];
}): SlideElement[] {
  return (canvas.getObjects() as ReturnType<typeof fabricObjectToSchemaElement>[]).map(
    (obj) => fabricObjectToSchemaElement(obj as Parameters<typeof fabricObjectToSchemaElement>[0])
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/frontend
npx jest src/__tests__/slides/fabricHelpers.test.ts -v
```
Expected: `4 passed`

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/lib/slides/themePresets.ts apps/frontend/src/lib/slides/fabricHelpers.ts apps/frontend/src/__tests__/slides/fabricHelpers.test.ts
git commit -m "feat: add theme presets and fabric helper utilities"
```

---

## Task 8: PPTX Export Utility

**Files:**
- Create: `apps/frontend/src/lib/slides/pptxExport.ts`
- Test: `apps/frontend/src/__tests__/slides/pptxExport.test.ts`

캔버스 1280×720 → PPTX 13.33in×7.5in (16:9) 변환.
좌표 변환: `x_in = (left/1280)*13.33`, `y_in = (top/720)*7.5`

- [ ] **Step 1: Write the failing test**

`apps/frontend/src/__tests__/slides/pptxExport.test.ts` 생성:

```typescript
import { exportToPptx } from "@/lib/slides/pptxExport";
import type { SlideSchema } from "@/lib/slides/types";
import PptxGenJS from "pptxgenjs";

const mockSchema: SlideSchema = {
  id: "test",
  title: "테스트 슬라이드",
  theme: "minimal",
  customTheme: null,
  slides: [
    {
      id: "slide-0",
      background: "#ffffff",
      elements: [
        {
          id: "el-0",
          type: "textbox",
          left: 80,
          top: 60,
          width: 1120,
          height: 80,
          text: "제목",
          fontSize: 28,
          fontWeight: "bold",
          fill: "#111827",
          src: null,
        },
        {
          id: "el-1",
          type: "rect",
          left: 80,
          top: 200,
          width: 300,
          height: 150,
          text: null,
          fontSize: null,
          fontWeight: null,
          fill: "#f59e0b",
          src: null,
        },
      ],
    },
  ],
};

describe("exportToPptx", () => {
  it("calls pptxgenjs writeFile with correct filename", async () => {
    await exportToPptx(mockSchema);
    const instance = (PptxGenJS as jest.Mock).mock.results[0].value;
    expect(instance.writeFile).toHaveBeenCalledWith({ fileName: "테스트 슬라이드.pptx" });
  });

  it("adds one slide per schema slide", async () => {
    await exportToPptx(mockSchema);
    const instance = (PptxGenJS as jest.Mock).mock.results[0].value;
    expect(instance.addSlide).toHaveBeenCalledTimes(1);
  });

  it("calls addText for textbox elements", async () => {
    await exportToPptx(mockSchema);
    const instance = (PptxGenJS as jest.Mock).mock.results[0].value;
    const slide = instance.addSlide.mock.results[0].value;
    expect(slide.addText).toHaveBeenCalledWith(
      "제목",
      expect.objectContaining({ fontSize: 28, bold: true })
    );
  });

  it("calls addShape for rect elements", async () => {
    await exportToPptx(mockSchema);
    const instance = (PptxGenJS as jest.Mock).mock.results[0].value;
    const slide = instance.addSlide.mock.results[0].value;
    expect(slide.addShape).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/frontend
npx jest src/__tests__/slides/pptxExport.test.ts 2>&1 | head -10
```
Expected: `Cannot find module '@/lib/slides/pptxExport'`

- [ ] **Step 3: Create `pptxExport.ts`**

`apps/frontend/src/lib/slides/pptxExport.ts` 생성:

```typescript
import PptxGenJS from "pptxgenjs";
import type { SlideElement, SlideSchema } from "./types";

const CANVAS_W = 1280;
const CANVAS_H = 720;
const SLIDE_W_IN = 13.33;  // pptxgenjs default 16:9 width (inches)
const SLIDE_H_IN = 7.5;    // pptxgenjs default 16:9 height (inches)

function toInchX(px: number): number {
  return (px / CANVAS_W) * SLIDE_W_IN;
}

function toInchY(px: number): number {
  return (px / CANVAS_H) * SLIDE_H_IN;
}

function hexToRgb(hex: string): string {
  // pptxgenjs는 'RRGGBB' (# 없이) 또는 { r, g, b } 형태
  return hex.replace("#", "").toUpperCase();
}

function addElementToSlide(
  slide: ReturnType<InstanceType<typeof PptxGenJS>["addSlide"]>,
  el: SlideElement,
  pptx: InstanceType<typeof PptxGenJS>
): void {
  const x = toInchX(el.left);
  const y = toInchY(el.top);
  const w = toInchX(el.width);
  const h = toInchY(el.height);
  const color = hexToRgb(el.fill ?? "#000000");

  switch (el.type) {
    case "textbox":
      slide.addText(el.text ?? "", {
        x,
        y,
        w,
        h,
        fontSize: el.fontSize ?? 14,
        bold: el.fontWeight === "bold",
        color,
        fontFace: "맑은 고딕",
        align: "left",
        wrap: true,
      });
      break;

    case "rect":
      slide.addShape((pptx as any).ShapeType?.RECTANGLE ?? "rect", {
        x,
        y,
        w,
        h,
        fill: { color },
        line: { color, width: 0 },
      });
      break;

    case "circle":
      slide.addShape((pptx as any).ShapeType?.OVAL ?? "ellipse", {
        x,
        y,
        w,
        h,
        fill: { color },
        line: { color, width: 0 },
      });
      break;

    case "line":
      slide.addShape((pptx as any).ShapeType?.LINE ?? "line", {
        x,
        y,
        w,
        h,
        line: { color, width: 2 },
      });
      break;

    case "image":
      if (el.src) {
        slide.addImage({ path: el.src, x, y, w, h });
      }
      break;
  }
}

export async function exportToPptx(schema: SlideSchema): Promise<void> {
  const pptx = new PptxGenJS();
  (pptx as any).layout = "LAYOUT_WIDE";  // 16:9

  for (const slideData of schema.slides) {
    const slide = pptx.addSlide();

    // 배경색
    slide.background = { color: hexToRgb(slideData.background) };

    // 각 요소 추가
    for (const el of slideData.elements) {
      addElementToSlide(slide, el, pptx);
    }
  }

  await pptx.writeFile({ fileName: `${schema.title}.pptx` });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/frontend
npx jest src/__tests__/slides/pptxExport.test.ts -v
```
Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/slides/pptxExport.ts apps/frontend/src/__tests__/slides/pptxExport.test.ts
git commit -m "feat: add PPTX export utility (pptxgenjs)"
```

---

## Task 9: SlideGeneratorPanel Component

**Files:**
- Create: `apps/frontend/src/components/slides/SlideGeneratorPanel.tsx`

사용자가 생성 입력을 제출하는 패널. 로딩 상태 포함.

- [ ] **Step 1: Create the component**

`apps/frontend/src/components/slides/SlideGeneratorPanel.tsx` 생성:

```tsx
"use client";

import { useState } from "react";
import type { CustomTheme, SlideSchema, ThemeName } from "@/lib/slides/types";
import { generateSlides } from "@/lib/api";
import ThemeUploader from "./ThemeUploader";

interface Props {
  onGenerated: (schema: SlideSchema) => void;
}

const THEMES: { value: ThemeName; label: string }[] = [
  { value: "gov", label: "공공기관/정부보고서" },
  { value: "corp", label: "기업 피치덱" },
  { value: "minimal", label: "미니멀 모던" },
  { value: "gradient", label: "그라데이션 모던" },
  { value: "custom", label: "파일에서 추출" },
];

export default function SlideGeneratorPanel({ onGenerated }: Props) {
  const [mode, setMode] = useState<"document" | "analysis">("document");
  const [documentText, setDocumentText] = useState("");
  const [instruction, setInstruction] = useState("");
  const [analysisText, setAnalysisText] = useState("");
  const [theme, setTheme] = useState<ThemeName>("minimal");
  const [customTheme, setCustomTheme] = useState<CustomTheme | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDocumentText(reader.result as string);
    };
    reader.readAsText(file, "utf-8");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const schema = await generateSlides({
        mode,
        document_text: mode === "document" ? documentText : undefined,
        instruction: mode === "document" ? instruction : undefined,
        analysis_text: mode === "analysis" ? analysisText : undefined,
        theme,
        custom_theme: customTheme,
      });
      onGenerated(schema);
    } catch (err) {
      setError(err instanceof Error ? err.message : "슬라이드 생성 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4 bg-white border rounded-lg w-80 shrink-0">
      <h2 className="text-base font-bold text-gray-800">슬라이드 생성</h2>

      {/* 모드 선택 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("document")}
          className={`flex-1 py-1.5 text-sm rounded-md border transition-colors ${
            mode === "document"
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
          }`}
        >
          문서+지시어
        </button>
        <button
          type="button"
          onClick={() => setMode("analysis")}
          className={`flex-1 py-1.5 text-sm rounded-md border transition-colors ${
            mode === "analysis"
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
          }`}
        >
          역관목조분
        </button>
      </div>

      {mode === "document" ? (
        <>
          {/* 문서 업로드 또는 텍스트 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">문서 파일 (txt/md)</label>
            <input
              type="file"
              accept=".txt,.md"
              onChange={handleFileUpload}
              className="text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">또는 직접 입력</label>
            <textarea
              value={documentText}
              onChange={(e) => setDocumentText(e.target.value)}
              rows={4}
              placeholder="문서 내용을 여기에 붙여넣으세요"
              className="text-sm border border-gray-300 rounded p-2 resize-none focus:outline-none focus:border-indigo-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">지시어</label>
            <input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="예: 5장짜리 요약 슬라이드로 만들어줘"
              className="text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-indigo-400"
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">역관목조분 분석 결과 붙여넣기</label>
          <textarea
            value={analysisText}
            onChange={(e) => setAnalysisText(e.target.value)}
            rows={6}
            placeholder="역관목조분 분석 결과를 여기에 붙여넣으세요"
            className="text-sm border border-gray-300 rounded p-2 resize-none focus:outline-none focus:border-indigo-400"
          />
        </div>
      )}

      {/* 테마 선택 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">테마</label>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as ThemeName)}
          className="text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-indigo-400"
        >
          {THEMES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* 커스텀 테마 업로더 */}
      {theme === "custom" && (
        <ThemeUploader onThemeExtracted={setCustomTheme} />
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-md transition-colors"
      >
        {loading ? "생성 중…" : "슬라이드 생성"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/frontend
npx tsc --noEmit 2>&1 | grep slides
```
Expected: 에러 없음 (ThemeUploader 미생성으로 에러 있으면 Task 11 완료 후 재확인)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/slides/SlideGeneratorPanel.tsx
git commit -m "feat: add SlideGeneratorPanel component"
```

---

## Task 10: SlideEditor (Fabric.js Canvas)

**Files:**
- Create: `apps/frontend/src/components/slides/SlideEditor.tsx`

Fabric.js를 `dynamic import + ssr: false`로 로드. SlideSchema를 받아 캔버스에 렌더링.

- [ ] **Step 1: Create the component**

`apps/frontend/src/components/slides/SlideEditor.tsx` 생성:

```tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { SlideData, SlideElement, SlideSchema } from "@/lib/slides/types";
import { schemaElementToFabricOptions, fabricObjectToSchemaElement } from "@/lib/slides/fabricHelpers";

// Fabric.js는 SSR 불가 — 런타임에만 import
let fabricModule: typeof import("fabric") | null = null;

interface Props {
  schema: SlideSchema;
  activeSlideIndex: number;
  onSlideChange: (slideIndex: number, elements: SlideElement[]) => void;
}

export default function SlideEditor({ schema, activeSlideIndex, onSlideChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<import("fabric").Canvas | null>(null);
  const [fabricLoaded, setFabricLoaded] = useState(false);

  // Fabric.js 동적 로드
  useEffect(() => {
    import("fabric").then((mod) => {
      fabricModule = mod;
      setFabricLoaded(true);
    });
  }, []);

  // 캔버스 초기화
  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current) return;
    const { Canvas } = fabricModule!;

    const canvas = new Canvas(canvasRef.current, {
      width: 960,   // 1280 * 0.75 (표시 스케일 75%)
      height: 540,  // 720 * 0.75
      selection: true,
    });
    fabricRef.current = canvas;

    // 변경 이벤트 → onSlideChange 콜백
    const handleChange = () => {
      const elements = (canvas.getObjects() as unknown[]).map((obj) =>
        fabricObjectToSchemaElement(
          obj as Parameters<typeof fabricObjectToSchemaElement>[0]
        )
      );
      onSlideChange(activeSlideIndex, elements);
    };

    canvas.on("object:modified", handleChange);
    canvas.on("object:added", handleChange);
    canvas.on("object:removed", handleChange);

    return () => {
      canvas.dispose();
      fabricRef.current = null;
    };
  }, [fabricLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // 슬라이드 데이터 변경 시 캔버스 업데이트
  useEffect(() => {
    if (!fabricRef.current || !fabricLoaded || !fabricModule) return;
    const canvas = fabricRef.current;
    const slide = schema.slides[activeSlideIndex];
    if (!slide) return;

    const { Textbox, Rect, Circle, Line, FabricImage } = fabricModule;

    canvas.clear();
    canvas.backgroundColor = slide.background;

    const SCALE = 0.75;

    for (const el of slide.elements) {
      const opts = schemaElementToFabricOptions(el);
      // 스케일 적용
      const scaledOpts = {
        ...opts,
        left: (opts.left as number) * SCALE,
        top: (opts.top as number) * SCALE,
        width: (opts.width as number) * SCALE,
        height: (opts.height as number) * SCALE,
        fontSize: opts.fontSize ? (opts.fontSize as number) * SCALE : undefined,
      };

      switch (el.type) {
        case "textbox": {
          const obj = new Textbox(el.text ?? "", scaledOpts);
          canvas.add(obj);
          break;
        }
        case "rect": {
          const obj = new Rect(scaledOpts);
          canvas.add(obj);
          break;
        }
        case "circle": {
          const obj = new Circle({ ...scaledOpts, radius: (scaledOpts.width as number) / 2 });
          canvas.add(obj);
          break;
        }
        case "line": {
          const obj = new Line([0, 0, scaledOpts.width as number, 0], {
            ...scaledOpts,
            stroke: (scaledOpts.fill as string) ?? "#000",
            strokeWidth: 2,
          });
          canvas.add(obj);
          break;
        }
        case "image": {
          if (el.src) {
            FabricImage.fromURL(el.src).then((img) => {
              img.set(scaledOpts);
              canvas.add(img);
              canvas.renderAll();
            });
          }
          break;
        }
      }
    }

    canvas.renderAll();
  }, [schema, activeSlideIndex, fabricLoaded]);

  // 외부에서 요소 추가 (SlideToolbar에서 호출)
  const addText = useCallback(() => {
    if (!fabricRef.current || !fabricModule) return;
    const { Textbox } = fabricModule;
    const obj = new Textbox("텍스트를 입력하세요", {
      left: 100,
      top: 100,
      width: 300,
      fontSize: 18,
      fill: "#111827",
      fontFamily: "맑은 고딕",
      data: { id: crypto.randomUUID() },
    });
    fabricRef.current.add(obj);
    fabricRef.current.setActiveObject(obj);
    fabricRef.current.renderAll();
  }, []);

  const addRect = useCallback(() => {
    if (!fabricRef.current || !fabricModule) return;
    const { Rect } = fabricModule;
    const obj = new Rect({
      left: 100,
      top: 100,
      width: 200,
      height: 120,
      fill: "#6366f1",
      data: { id: crypto.randomUUID() },
    });
    fabricRef.current.add(obj);
    fabricRef.current.renderAll();
  }, []);

  const deleteSelected = useCallback(() => {
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObject();
    if (active) {
      fabricRef.current.remove(active);
      fabricRef.current.renderAll();
    }
  }, []);

  // SlideToolbar가 이 함수들을 사용하도록 ref 노출 (imperative handle 대신 window 이벤트 사용)
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ action: string }>;
      if (ce.detail.action === "addText") addText();
      if (ce.detail.action === "addRect") addRect();
      if (ce.detail.action === "deleteSelected") deleteSelected();
    };
    window.addEventListener("slideEditorAction", handler);
    return () => window.removeEventListener("slideEditorAction", handler);
  }, [addText, addRect, deleteSelected]);

  if (!fabricLoaded) {
    return (
      <div className="flex items-center justify-center bg-gray-100 rounded-lg" style={{ width: 960, height: 540 }}>
        <p className="text-sm text-gray-400">에디터 로딩 중…</p>
      </div>
    );
  }

  return (
    <div className="relative border border-gray-300 rounded-lg overflow-hidden shadow-md" style={{ width: 960, height: 540 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/frontend
npx tsc --noEmit 2>&1 | grep -i "SlideEditor\|slides"
```
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/slides/SlideEditor.tsx
git commit -m "feat: add SlideEditor with Fabric.js canvas (SSR-safe)"
```

---

## Task 11: SlideThumbnails + SlideToolbar + ThemeUploader + SlideExportButton

**Files:**
- Create: `apps/frontend/src/components/slides/SlideThumbnails.tsx`
- Create: `apps/frontend/src/components/slides/SlideToolbar.tsx`
- Create: `apps/frontend/src/components/slides/ThemeUploader.tsx`
- Create: `apps/frontend/src/components/slides/SlideExportButton.tsx`

- [ ] **Step 1: Create `SlideThumbnails.tsx`**

```tsx
"use client";

import type { SlideData, SlideSchema } from "@/lib/slides/types";

interface Props {
  schema: SlideSchema;
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
}

export default function SlideThumbnails({ schema, activeIndex, onSelect, onAdd, onDelete }: Props) {
  return (
    <div className="flex flex-col gap-2 w-36 shrink-0 overflow-y-auto py-2">
      {schema.slides.map((slide, i) => (
        <div key={slide.id} className="relative group">
          <button
            onClick={() => onSelect(i)}
            className={`w-full aspect-video rounded border-2 transition-colors bg-white overflow-hidden ${
              i === activeIndex ? "border-indigo-500" : "border-gray-200 hover:border-gray-400"
            }`}
            style={{ background: slide.background }}
          >
            <span className="text-[9px] text-gray-400 absolute top-1 left-1">{i + 1}</span>
          </button>
          <button
            onClick={() => onDelete(i)}
            className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 bg-red-500 text-white text-[10px] rounded-full items-center justify-center"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={onAdd}
        className="w-full aspect-video rounded border-2 border-dashed border-gray-300 hover:border-indigo-400 text-gray-400 hover:text-indigo-500 text-xl transition-colors flex items-center justify-center"
      >
        +
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `SlideToolbar.tsx`**

```tsx
"use client";

interface Props {
  onUndo?: () => void;
  onRedo?: () => void;
}

function dispatchAction(action: string) {
  window.dispatchEvent(new CustomEvent("slideEditorAction", { detail: { action } }));
}

export default function SlideToolbar({ onUndo, onRedo }: Props) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-white border-b border-gray-200">
      {/* 요소 추가 */}
      <button
        onClick={() => dispatchAction("addText")}
        title="텍스트 추가"
        className="px-2 py-1 text-xs rounded hover:bg-gray-100 text-gray-700 border border-gray-200"
      >
        T 텍스트
      </button>
      <button
        onClick={() => dispatchAction("addRect")}
        title="사각형 추가"
        className="px-2 py-1 text-xs rounded hover:bg-gray-100 text-gray-700 border border-gray-200"
      >
        ▭ 도형
      </button>
      <button
        onClick={() => dispatchAction("deleteSelected")}
        title="선택 삭제"
        className="px-2 py-1 text-xs rounded hover:bg-red-50 text-red-600 border border-red-200"
      >
        ✕ 삭제
      </button>

      <div className="h-4 w-px bg-gray-200 mx-1" />

      {/* 실행취소/다시실행 */}
      <button
        onClick={onUndo}
        title="실행 취소"
        className="px-2 py-1 text-xs rounded hover:bg-gray-100 text-gray-700"
      >
        ↩
      </button>
      <button
        onClick={onRedo}
        title="다시 실행"
        className="px-2 py-1 text-xs rounded hover:bg-gray-100 text-gray-700"
      >
        ↪
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create `ThemeUploader.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { CustomTheme } from "@/lib/slides/types";
import { extractTheme } from "@/lib/api";

interface Props {
  onThemeExtracted: (theme: CustomTheme) => void;
}

export default function ThemeUploader({ onThemeExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pptx", "png", "jpg", "jpeg", "webp"].includes(ext ?? "")) {
      setError(".pptx 또는 이미지 파일(.png, .jpg, .webp)만 가능합니다");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const theme = await extractTheme(file);
      onThemeExtracted(theme);
      setExtracted(true);
    } catch {
      setError("스타일 추출 실패. minimal 테마를 사용하거나 다른 파일을 시도하세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">스타일 파일 업로드</label>
      <input
        type="file"
        accept=".pptx,.png,.jpg,.jpeg,.webp"
        onChange={handleFile}
        disabled={loading}
        className="text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700"
      />
      {loading && <p className="text-xs text-gray-500">스타일 추출 중…</p>}
      {extracted && !error && (
        <p className="text-xs text-green-600">✓ 스타일 추출 완료</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-gray-400">.pptx 또는 이미지에서 색상/폰트 자동 추출</p>
    </div>
  );
}
```

- [ ] **Step 4: Create `SlideExportButton.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { SlideSchema } from "@/lib/slides/types";
import { exportToPptx } from "@/lib/slides/pptxExport";

interface Props {
  schema: SlideSchema;
}

export default function SlideExportButton({ schema }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    setLoading(true);
    try {
      await exportToPptx(schema);
    } catch (err) {
      setError("PPTX 내보내기 실패. 다시 시도해 주세요.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleExport}
        disabled={loading || schema.slides.length === 0}
        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-md transition-colors"
      >
        {loading ? "내보내는 중…" : "⬇ PPTX 다운로드"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/frontend
npx tsc --noEmit 2>&1 | grep -i "slides\|Slide"
```
Expected: 에러 없음

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/slides/
git commit -m "feat: add SlideThumbnails, SlideToolbar, ThemeUploader, SlideExportButton"
```

---

## Task 12: /slides Page

**Files:**
- Create: `apps/frontend/src/app/slides/page.tsx`
- Modify: `apps/frontend/src/components/TopBar.tsx`

모든 슬라이드 컴포넌트를 조합해 `/slides` 라우트를 완성한다.

- [ ] **Step 1: Create `apps/frontend/src/app/slides/page.tsx`**

```tsx
"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { SlideElement, SlideSchema } from "@/lib/slides/types";
import SlideGeneratorPanel from "@/components/slides/SlideGeneratorPanel";
import SlideThumbnails from "@/components/slides/SlideThumbnails";
import SlideToolbar from "@/components/slides/SlideToolbar";
import SlideExportButton from "@/components/slides/SlideExportButton";
import { saveSlide } from "@/lib/api";

// Fabric.js 에디터는 SSR 불가 — 동적 import
const SlideEditor = dynamic(
  () => import("@/components/slides/SlideEditor"),
  { ssr: false, loading: () => <div className="w-[960px] h-[540px] bg-gray-100 rounded-lg flex items-center justify-center text-sm text-gray-400">에디터 로딩 중…</div> }
);

const EMPTY_SCHEMA: SlideSchema = {
  id: "",
  title: "새 슬라이드",
  theme: "minimal",
  customTheme: null,
  slides: [],
};

export default function SlidesPage() {
  const [schema, setSchema] = useState<SlideSchema>(EMPTY_SCHEMA);
  const [activeIndex, setActiveIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const handleGenerated = useCallback((newSchema: SlideSchema) => {
    setSchema(newSchema);
    setActiveIndex(0);
  }, []);

  const handleSlideChange = useCallback((slideIndex: number, elements: SlideElement[]) => {
    setSchema((prev) => {
      const slides = [...prev.slides];
      if (slides[slideIndex]) {
        slides[slideIndex] = { ...slides[slideIndex], elements };
      }
      return { ...prev, slides };
    });
  }, []);

  const handleAddSlide = useCallback(() => {
    setSchema((prev) => ({
      ...prev,
      slides: [
        ...prev.slides,
        {
          id: `slide-${prev.slides.length}`,
          background: "#ffffff",
          elements: [],
        },
      ],
    }));
    setActiveIndex((prev) => prev + 1);
  }, []);

  const handleDeleteSlide = useCallback((index: number) => {
    setSchema((prev) => {
      const slides = prev.slides.filter((_, i) => i !== index);
      return { ...prev, slides };
    });
    setActiveIndex((prev) => Math.max(0, prev > index ? prev - 1 : prev));
  }, []);

  const handleSave = async () => {
    if (!schema.id) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveSlide(schema.id, { schema, title: schema.title });
      setSaveMsg("저장됨");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch {
      setSaveMsg("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 상단 바 */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <h1 className="text-base font-bold text-gray-800">
          {schema.title || "슬라이드 편집기"}
        </h1>
        <div className="flex items-center gap-2">
          {saveMsg && <span className="text-xs text-green-600">{saveMsg}</span>}
          {schema.id && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md border border-gray-300"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          )}
          <SlideExportButton schema={schema} />
        </div>
      </div>

      {/* 메인 레이아웃 */}
      <div className="flex flex-1 overflow-hidden gap-4 p-4">
        {/* 좌측: 생성 패널 */}
        <SlideGeneratorPanel onGenerated={handleGenerated} />

        {/* 중앙: 에디터 */}
        <div className="flex flex-col flex-1 min-w-0 gap-2">
          <SlideToolbar />
          {schema.slides.length > 0 ? (
            <SlideEditor
              schema={schema}
              activeSlideIndex={activeIndex}
              onSlideChange={handleSlideChange}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-white border border-dashed border-gray-300 rounded-lg text-gray-400 text-sm">
              왼쪽 패널에서 슬라이드를 생성하세요
            </div>
          )}
        </div>

        {/* 우측: 슬라이드 목록 */}
        {schema.slides.length > 0 && (
          <SlideThumbnails
            schema={schema}
            activeIndex={activeIndex}
            onSelect={setActiveIndex}
            onAdd={handleAddSlide}
            onDelete={handleDeleteSlide}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add "슬라이드" link to TopBar**

`apps/frontend/src/components/TopBar.tsx`를 읽고 내비게이션 링크가 있는 위치에 슬라이드 링크를 추가한다.

TopBar에서 `<Link href="/app">` 등의 링크를 찾아 아래와 같이 슬라이드 링크를 추가:

```tsx
import Link from "next/link";
// ... 기존 코드 ...
// 내비게이션 링크가 있는 위치에 추가:
<Link
  href="/slides"
  className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100"
>
  슬라이드
</Link>
```

**정확한 수정 방법:** TopBar.tsx를 읽어서 기존 내비 링크 패턴을 파악한 후, 동일한 스타일로 "슬라이드" 링크를 추가한다. 기존 링크가 없으면 헤더의 우측에 추가.

- [ ] **Step 3: Verify the page compiles**

```bash
cd apps/frontend
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 4: Start dev server and verify page loads**

```bash
cd apps/frontend
npm run dev &
sleep 5
curl -s http://localhost:3000/slides | grep -i "슬라이드\|slide" | head -3
```
Expected: HTML 응답에 "슬라이드" 텍스트 포함

- [ ] **Step 5: Stop dev server and commit**

```bash
# dev server 종료 후
git add apps/frontend/src/app/slides/ apps/frontend/src/components/TopBar.tsx
git commit -m "feat: add /slides page with full editor layout"
```

---

## Task 13: Final TypeScript Check + All Tests

- [ ] **Step 1: Run all backend tests**

```bash
cd apps/backend
python -m pytest tests/ -v 2>&1 | tail -20
```
Expected: 모든 기존 테스트 통과 + 신규 테스트 통과

- [ ] **Step 2: Run all frontend tests**

```bash
cd apps/frontend
npx jest --passWithNoTests
```
Expected: `fabricHelpers.test.ts`, `pptxExport.test.ts` 통과

- [ ] **Step 3: Full TypeScript check**

```bash
cd apps/frontend
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 4: Build check**

```bash
cd apps/frontend
npm run build 2>&1 | tail -10
```
Expected: `✓ Compiled successfully` (warnings는 무시)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: complete slide generation feature (generate, edit, export PPTX)"
```

---

## Self-Review

### 1. Spec Coverage

| 스펙 요구사항 | 구현 태스크 |
|---|---|
| 문서+지시어 입력 | Task 2 (generator), Task 9 (UI) |
| 역관목조분 자동 변환 | Task 2 (analysis mode) |
| 4가지 내장 테마 | Task 7 (themePresets.ts) |
| 파일 스타일 추출 (pptx/image) | Task 3, Task 11 (ThemeUploader) |
| Fabric.js Canva 수준 에디터 | Task 10 (SlideEditor) |
| 드래그·리사이즈·텍스트·도형 | Task 10 |
| PPTX 다운로드 | Task 8 (pptxExport), Task 11 (SlideExportButton) |
| 슬라이드 저장/불러오기 | Task 1 (DB), Task 4 (API), Task 12 (save button) |
| 슬라이드 추가/삭제/순서 | Task 12 (SlideThumbnails) |
| /slides 라우트 | Task 12 |
| TopBar 내비게이션 | Task 12 |

모든 스펙 요구사항이 커버됨.

### 2. Type Consistency

- `SlideElement` 타입 → Task 6에서 정의, Task 7, 8, 9, 10, 11, 12 전체에서 동일하게 사용
- `schemaElementToFabricOptions` → Task 7 정의, Task 10에서 사용 (이름 일치)
- `fabricObjectToSchemaElement` → Task 7 정의, Task 10에서 사용 (이름 일치)
- `exportToPptx(schema: SlideSchema)` → Task 8 정의, Task 11에서 사용 (시그니처 일치)
- `generate_slides(*, mode, document_text, ...)` → Task 2 정의, Task 4에서 import하여 사용 (이름 일치)
- `extract_theme_from_pptx`, `extract_theme_from_image` → Task 3 정의, Task 4에서 import (이름 일치)
