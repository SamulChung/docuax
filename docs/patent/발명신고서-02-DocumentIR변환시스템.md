# 발명신고서 #02

---

## 1. 발명의 명칭

**문서 중간 표현(Document IR)을 이용한 다형식 문서 동시 변환 시스템 및 방법**

영문: *System and Method for Multi-Format Simultaneous Document Conversion Using Document Intermediate Representation (DocumentIR)*

---

## 2. 발명자 정보

| 항목 | 내용 |
|------|------|
| 성명 | 정원훈 |
| 소속 | 텐에이아이 / DocuAX |
| 직책 | 대표 |
| 연락처 | specialdatastrategist@gmail.com |

---

## 3. 기술 분야

본 발명은 전자 문서 처리 기술 분야에 속한다. 구체적으로는 마크다운(Markdown), HTML, 자연어 텍스트 등의 입력 문서를 단일 중간 표현(Intermediate Representation)으로 변환한 후, 이를 HWPX(한컴 한글), DOCX(MS Word), PDF, PPTX(PowerPoint) 등 다수의 출력 형식으로 동시 생성하는 시스템 및 방법에 관한 것이다.

---

## 4. 배경 기술 및 종래 기술의 문제점

### 4.1 종래 기술

- **단방향 변환기**: Pandoc 등 대부분의 변환기는 A→B 단일 경로 변환만 지원. 여러 형식이 필요하면 각각 별도 변환 필요.
- **포맷별 전용 라이브러리 조합**: python-docx(DOCX), ReportLab(PDF), python-pptx(PPTX) 등을 각각 구현. 공통 처리 없이 N개 형식마다 별도 렌더러 전체를 독립 구현.
- **의미 정보 손실**: 변환 과정에서 표·수식·다이어그램 등의 구조적 의미가 소실되거나 최종 포맷의 기본값으로 대체됨.
- **HWPX 지원 부재**: 한국 표준 문서 형식인 HWPX(KS X 6101)를 직접 생성하는 오픈소스 파이프라인이 실질적으로 존재하지 않음.

### 4.2 종래 기술의 문제점

1. **중복 구현**: 동일 입력에서 3개 형식을 출력하려면 변환 로직을 3번 독립 구현해야 함.
2. **불일치 위험**: 각 렌더러가 독립적이어서 동일 문서임에도 포맷별 결과가 달라지는 의미 불일치 발생.
3. **HWPX 생성 어려움**: HWPX는 ZIP+XML 구조(OWPML 표준)로 직접 생성하기 매우 복잡. 기존 도구는 LibreOffice를 통한 우회 변환에 의존하여 서버 의존성과 변환 지연이 크다.
4. **의미 구조 보존 불가**: 수식(LaTeX), 다이어그램(Mermaid/Graphviz), 차트, 공문서 표지 등 풍부한 의미 구조를 전달하는 표준 인터페이스가 없음.

---

## 5. 발명의 목적

1. 입력 문서를 **단일 DocumentIR**로 파싱하여 이후 모든 출력 형식 생성의 공통 기반으로 사용
2. HWPX, DOCX, PDF, PPTX를 **단일 파이프라인에서 동시 생성**
3. 표·이미지·수식·다이어그램·차트·공문서 표지 등 **풍부한 의미 구조를 손실 없이 보존·전달**
4. 서버리스/컨테이너 환경에서도 **한국어 폰트 자동 공급** 및 PDF 한글 렌더링 보장
5. HWPX 형식에서 **표 셀 병합(colspan/rowspan), 인라인 스타일(색상·밑줄·취소선)** 자동 반영

---

## 6. 발명의 구성

### 6.1 DocumentIR — 통합 중간 표현 데이터 구조

DocumentIR은 다음 계층 구조로 문서를 표현한다:

```
DocumentIR
├── title: str                    # 문서 제목
├── cover: CoverBlock | None      # 공문서 표지 (10종 템플릿)
├── header/footer: str            # 머리글/바닥글
├── blocks: List[Block]           # 본문 블록 목록
│   ├── HEADING(level, runs)
│   ├── PARAGRAPH(runs)
│   ├── LIST_ITEM(depth, ordered, runs)
│   ├── TABLE(rows, header_row, column_widths)
│   │   └── TableCell(runs, colspan, rowspan, background, align)
│   ├── CODE(runs)
│   ├── QUOTE(runs)
│   ├── IMAGE(src, alt, caption)
│   ├── EQUATION(latex, display)   # LaTeX 수식
│   ├── DIAGRAM(engine, source)    # Mermaid/Graphviz
│   ├── CHART(spec)               # Vega-Lite 차트
│   └── BOX / THEMATIC_BREAK
└── InlineRun (각 블록 내 인라인 요소)
    ├── text, bold, italic, underline, strikethrough
    ├── color, font_family, font_size
    └── link
```

### 6.2 파싱 레이어 — 입력 → DocumentIR

입력 소스별 파서가 모두 동일한 DocumentIR을 출력한다:

| 입력 형식 | 파서 | 처리 특이사항 |
|-----------|------|--------------|
| Markdown | CommonMark 파서 + 확장 | 수식($$), 다이어그램(```mermaid) 블록 자동 감지 |
| HTML | BeautifulSoup | 시맨틱 태그 매핑 |
| 자연어(AI 생성) | LLM 구조화 요청 | AI가 직접 DocumentIR JSON 출력 |

### 6.3 렌더러 레이어 — DocumentIR → 출력 형식

DocumentIR을 입력받아 각 형식별 렌더러가 독립적으로 출력을 생성한다:

```
DocumentIR
     │
     ├──▶ HwpxRenderer  →  .hwpx  (python-hwpx 2.x + ZIP/XML 직접 조작)
     ├──▶ DocxRenderer  →  .docx  (python-docx)
     ├──▶ PdfRenderer   →  .pdf   (WeasyPrint + ReportLab)
     └──▶ PptxRenderer  →  .pptx  (python-pptx + pptxgenjs)
```

### 6.4 HWPX 직접 생성 — 핵심 기술

HWPX(KS X 6101/OWPML) 형식의 직접 생성은 다음 단계를 포함한다:

1. **charPr 동적 등록**: 밑줄·취소선·색상·폰트크기 조합별 문자 속성을 HWPX 헤더 XML에 동적 추가
2. **셀 병합 처리**: DocumentIR의 colspan/rowspan 데이터를 `merge_cells(row1, col1, row2, col2)` 호출로 변환
3. **borderFill 동적 생성**: 표 셀 배경색을 HWPX `borderFill` XML 요소로 동적 등록
4. **네임스페이스 후처리**: 생성된 XML의 네임스페이스 일관성 자동 보정
5. **폴백 체인**: python-hwpx 실패 시 LibreOffice 변환으로 자동 폴백

### 6.5 서버리스 환경 한국어 폰트 자동 공급 방법

클라우드/컨테이너 환경에서 시스템 한국어 폰트가 없는 경우:

```
1. 시스템 폰트 경로 목록 탐색 (Linux/macOS/Windows 경로 모두 지원)
2. NanumGothic 등 한국어 폰트 존재 여부 확인
3. 없으면: Google Fonts GitHub Raw URL 또는 jsDelivr CDN에서 자동 다운로드
4. 로컬 캐시 디렉토리에 저장 (재시작 후 재사용)
5. WeasyPrint @font-face CSS에 file:// URI로 등록
6. ReportLab TTFont로 서브셋 임베딩 (PDF 내장)
```

다운로드 URL은 우선순위 순 다중 소스를 시도하며, 10KB 미만이면 오류로 판정한다.

---

## 7. 발명의 효과

1. **개발 효율성**: N개 출력 형식을 위해 공통 IR 하나만 설계하면 됨 (기존: N개 독립 파이프라인)
2. **의미 일관성**: 모든 출력 형식이 동일 IR에서 생성되므로 내용 불일치 없음
3. **HWPX 직접 생성**: LibreOffice 없이 서버에서 직접 한글 문서 생성 가능
4. **환경 독립성**: 클라우드/컨테이너/서버리스 환경에서도 한국어 폰트 자동 공급
5. **풍부한 요소 지원**: 수식·다이어그램·차트·공문서 표지 등을 모든 포맷에서 동일하게 처리
6. **확장성**: 신규 출력 형식 추가 시 새 렌더러만 구현하면 됨 (파싱 레이어 재사용)

---

## 8. 청구항 아이디어 (변리사 검토용)

**독립 청구항 후보:**

1. 마크다운·HTML·자연어 입력을 DocumentIR로 파싱하고, 동일 IR로부터 HWPX·DOCX·PDF·PPTX를 동시 생성하는 다형식 문서 변환 시스템

2. 표 셀의 colspan·rowspan 정보를 포함하는 DocumentIR을 이용해 HWPX 형식의 병합 셀 문서를 직접 생성하는 방법

3. 클라우드 환경에서 한국어 폰트 부재를 감지하고 원격 소스로부터 자동 다운로드하여 PDF에 임베딩하는 방법

**종속 청구항 후보:**

- LaTeX 수식 블록을 PNG로 렌더링하여 각 출력 형식에 이미지로 삽입하는 단계를 포함하는 청구항 1의 시스템
- Mermaid·Graphviz 다이어그램 소스를 서버사이드 렌더링하여 IR에 통합하는 청구항 1의 시스템
- 10종의 공문서 표지 템플릿을 IR 메타데이터로 선택·렌더링하는 청구항 1의 방법
- 다운로드 실패 시 복수의 폴백 URL을 순차 시도하는 단계를 포함하는 청구항 3의 방법

---

## 9. 관련 자료 및 증빙

| 자료 | 위치 |
|------|------|
| DocumentIR 데이터 모델 | `apps/backend/app/core/document_ir.py` |
| HWPX 렌더러 | `apps/backend/app/renderers/hwpx_renderer.py` |
| PDF 렌더러 (폰트 자동 공급) | `apps/backend/app/renderers/pdf_renderer.py` |
| DOCX 렌더러 | `apps/backend/app/renderers/docx_renderer.py` |
| 변환 API 엔드포인트 | `apps/backend/app/api/v1/convert.py` |
| GitHub 저장소 | https://github.com/SamulChung/docuax |

---

## 10. 공개 여부 확인

- GitHub 공개 저장소에 소스코드 게시: **예** (2025년~)
- 상용 서비스 론칭일: 2025년

> ⚠️ **공개된 코드·서비스가 있으므로 출원일 기준 신규성 판단에 주의 요망. 조속한 출원 권고.**
