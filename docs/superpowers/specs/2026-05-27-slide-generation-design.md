# Slide Generation Feature — Design Spec

**Date:** 2026-05-27  
**Status:** Approved

---

## Goal

DocuAX 앱 내에 AI 기반 슬라이드 생성 기능을 추가한다. 사용자가 문서+지시어를 입력하거나 역관목조분 분석 결과를 선택하면 Claude가 슬라이드 JSON을 생성하고, Fabric.js 캔버스 에디터에서 Canva 수준의 자유 편집 후 PPTX로 내보낼 수 있다.

---

## Architecture

- **Backend (FastAPI):** 새 라우터 `slides.py` — 슬라이드 생성(`POST /generate`), 저장/불러오기(`GET|PUT /{id}`). `slide_generator.py` 서비스가 Claude를 호출해 SlideSchema JSON을 반환한다. `python-pptx`(기존 설치)로 업로드된 .pptx 파일의 스타일을 추출한다.
- **Frontend (Next.js):** `/app/slides` 라우트. Fabric.js(v6) 캔버스 에디터로 슬라이드를 렌더링·편집. pptxgenjs로 브라우저 사이드 PPTX 내보내기. Fabric.js는 SSR 불가이므로 `dynamic import + ssr: false`로 로드.
- **단일 소스 오브 트루스:** SlideSchema JSON이 Fabric.js 렌더링과 pptxgenjs 변환에 동일하게 사용된다.

---

## Slide JSON Schema

```json
{
  "id": "uuid",
  "title": "슬라이드 제목",
  "theme": "gov | corp | minimal | gradient | custom",
  "customTheme": {
    "source": "upload",
    "background": "#ffffff",
    "primary": "#1a2e5a",
    "accent": "#c8a94b",
    "fontFamily": "맑은 고딕",
    "headingSize": 28,
    "bodySize": 14,
    "shapes": { "borderRadius": 0, "strokeColor": "#1a2e5a" }
  },
  "slides": [
    {
      "id": "slide-1",
      "background": "#ffffff",
      "elements": [
        {
          "id": "el-1",
          "type": "textbox | image | rect | line | circle",
          "left": 80,
          "top": 60,
          "width": 560,
          "height": 70,
          "text": "슬라이드 제목",
          "fontSize": 28,
          "fontWeight": "bold",
          "fill": "#1e3a5f",
          "src": null
        }
      ]
    }
  ]
}
```

---

## Features

### 입력 방식 (2가지)

1. **문서 + 지시어:** 사용자가 문서 파일 업로드(또는 텍스트 붙여넣기) + 지시어 텍스트 입력 → Claude가 분석 후 슬라이드 생성
2. **역관목조분 자동 변환:** 기존 역관목조분 분석 결과 선택 → Claude가 역할/관계/목표/조건/분쟁 구조를 슬라이드로 자동 매핑
   - 역할 → 소개/담당자 슬라이드
   - 관계 → 관계 다이어그램 슬라이드 (도형+화살표)
   - 목표 → 목표 불릿 슬라이드
   - 조건 → 조건/요건 슬라이드
   - 분쟁 → 쟁점 슬라이드

### 테마 시스템 (5가지)

| 테마 | 설명 |
|------|------|
| `gov` | 흰 배경, 파란 강조색, 공공기관 격식 레이아웃 |
| `corp` | 다크 배경, 인디고 강조, 기업 피치덱 스타일 |
| `minimal` | 흰 배경, 앰버 포인트, 여백 중심 클린 디자인 |
| `gradient` | 딥 퍼플 그라데이션, 글로우 강조, 테크 감성 |
| `custom` | 사용자가 .pptx 또는 이미지 업로드 → 스타일 자동 추출 |

**커스텀 테마 추출 방식:**
- `.pptx` 업로드 → `python-pptx`로 배경색, 텍스트 색상, 강조색, 폰트 추출
- 이미지 업로드 → Claude Vision으로 색상 팔레트, 스타일 분석 → CustomTheme JSON 생성
- 추출 실패 시 `minimal` 테마로 폴백

### 에디터 (Fabric.js 캔버스)

- 슬라이드 크기: 1280×720 (16:9)
- 지원 요소: 텍스트박스, 이미지, 사각형, 원, 선
- 조작: 드래그 이동, 모서리 핸들 리사이즈, 더블클릭 텍스트 편집, 다중 선택, 레이어 순서 변경
- 툴바: 요소 추가(텍스트/이미지/도형), 테마 전환, 실행 취소/다시 실행
- 좌측 패널: 슬라이드 썸네일 목록, 슬라이드 추가/삭제/순서 변경

### 출력

- **인앱 미리보기:** 편집 중 실시간 Fabric.js 캔버스
- **PPTX 다운로드:** 편집 완료 후 pptxgenjs로 브라우저에서 .pptx 생성 → 다운로드
- **저장:** `PUT /api/v1/slides/{id}` — DB에 SlideSchema JSON 저장 (향후 불러오기 가능)

---

## Component Structure

```
apps/frontend/src/
  app/
    slides/
      page.tsx                    ← /slides 라우트 (SlideGeneratorPanel + SlideEditor 조합)
  components/slides/
    SlideGeneratorPanel.tsx        ← 입력 패널: 문서 업로드, 지시어, 역관목조분 선택, 테마 선택
    SlideEditor.tsx                ← Fabric.js 캔버스 에디터 (dynamic import, ssr: false)
    SlideThumbnails.tsx            ← 좌측 슬라이드 목록 패널
    SlideToolbar.tsx               ← 상단 툴바 (요소 추가, 테마 전환, 실행취소)
    SlideExportButton.tsx          ← PPTX 다운로드 버튼 (pptxgenjs)
    ThemeUploader.tsx              ← 커스텀 테마 파일 업로드 컴포넌트
  lib/slides/
    fabricHelpers.ts               ← SlideSchema ↔ Fabric.js 객체 변환 유틸
    pptxExport.ts                  ← SlideSchema → pptxgenjs 변환 유틸
    themePresets.ts                ← 4가지 내장 테마 프리셋 상수

apps/backend/
  routers/
    slides.py                      ← POST /api/v1/slides/generate, GET|PUT /api/v1/slides/{id}
  services/
    slide_generator.py             ← Claude 호출, SlideSchema 생성, 역관목조분 매핑
    theme_extractor.py             ← python-pptx/.pptx 스타일 추출, Claude Vision 이미지 분석
  models/
    slide.py                       ← SQLAlchemy Slide 모델 (id, user_id, title, schema_json, created_at)
  schemas/
    slide_schema.py                ← Pydantic SlideSchema, SlideElement, CustomTheme 모델
```

---

## API Endpoints

### `POST /api/v1/slides/generate`

**Request:**
```json
{
  "mode": "document | analysis",
  "document_text": "...",
  "instruction": "5장짜리 보고서 슬라이드로 만들어줘",
  "analysis_id": null,
  "theme": "gov | corp | minimal | gradient | custom",
  "custom_theme": { ... }
}
```

**Response:** `SlideSchema JSON`

### `GET /api/v1/slides/{id}`
저장된 슬라이드 불러오기

### `PUT /api/v1/slides/{id}`
편집된 슬라이드 저장

### `POST /api/v1/slides/extract-theme`
```json
{ "file_type": "pptx | image", "file_path": "..." }
```
**Response:** `CustomTheme JSON`

---

## Error Handling

| 상황 | 처리 |
|------|------|
| Claude 생성 실패 | 재시도 버튼 + 빈 슬라이드 1장 fallback |
| .pptx 스타일 추출 실패 | "스타일 추출 불가, minimal 테마로 대체" 토스트 |
| Vision 분석 실패 | minimal 테마로 폴백 |
| PPTX 내보내기 실패 | 에러 토스트 + 재시도 버튼 |
| Fabric.js SSR 오류 | `dynamic(() => import(...), { ssr: false })` 로 방지 |

---

## Testing Strategy

**Backend (pytest):**
- `test_slide_generator.py`: Claude 목킹 → SlideSchema 필드 유효성 검증
- `test_slides_router.py`: generate / get / put 엔드포인트 통합 테스트
- `test_theme_extractor.py`: 샘플 .pptx 파일 → CustomTheme 추출 결과 검증

**Frontend (jest + @testing-library/react):**
- `SlideGeneratorPanel`: 문서 업로드 + 지시어 제출 플로우
- `SlideExportButton`: pptxgenjs 목킹 → 다운로드 트리거 확인
- `SlideEditor`: fabric.js SSR 방지 (dynamic import 확인)
- `fabricHelpers`: SlideSchema → fabric 객체 변환 단위 테스트
- `pptxExport`: SlideSchema → pptxgenjs 호출 단위 테스트

---

## Out of Scope

- 실시간 협업 편집 (멀티유저 동시 편집)
- 슬라이드 발표 모드 (전체화면 프레젠테이션)
- 애니메이션/트랜지션 효과
- 클라우드 이미지 갤러리 (이미지 업로드는 로컬 파일만)
