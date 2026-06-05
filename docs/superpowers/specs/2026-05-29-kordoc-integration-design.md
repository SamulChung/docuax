# kordoc 연동 6종 기능 통합 설계

**Goal:** kordoc 오픈소스 분석을 기반으로 DocuAX에 HWP 임포트·신구대조표·양식 채우기·배치 처리·MCP 서버·실시간 자동 변환 기능을 추가한다.

**Architecture:** 3개 Phase로 분리. Phase 1은 사용자 경험 즉각 향상(HWP 임포트·자동 변환), Phase 2는 핵심 차별 기능(신구대조표·양식 채우기), Phase 3는 생태계 확장(배치 처리·MCP 서버).

**Tech Stack:** kordoc(npm), Next.js API Routes, diff(npm), JSZip(npm), FastAPI, React

---

## Phase 1

### Feature 1: HWP/HWPX 파일 직접 임포트

#### 개요
사용자가 기존 .hwp/.hwpx 파일을 DocuAX 에디터에 드래그앤드롭하면 kordoc으로 파싱해 마크다운으로 변환 후 에디터에 자동 삽입한다.

#### 컴포넌트

**Next.js API Route: `apps/frontend/src/app/api/parse-hwp/route.ts`**
- `POST` multipart/form-data 수신 (file: .hwp or .hwpx)
- kordoc `parseDocument(buffer, { format: 'hwpx' })` 호출
- 반환: `{ markdown: string, title: string }`
- 에러: 지원되지 않는 포맷, 파싱 실패 시 400

**npm 의존성:**
```
kordoc (npm install kordoc)
```

**프론트엔드: `apps/frontend/src/components/editor/HwpDropZone.tsx`**
- 에디터 상단에 상시 표시되는 드래그앤드롭 영역
- 파일 선택 버튼 포함
- 업로드 중 스피너
- 파싱 성공 시 workspace.setSource(markdown) 호출

#### 데이터 흐름
```
사용자 파일 드롭
  → HwpDropZone: FormData 생성
  → POST /api/parse-hwp
  → kordoc.parseDocument()
  → { markdown, title }
  → workspace.setSource(markdown)
  → 에디터에 마크다운 표시
```

#### 에러 처리
- 파일 크기 > 50MB: 클라이언트에서 차단
- 지원 형식 아님: "HWP, HWPX 파일만 지원합니다" 토스트
- 파싱 실패: "파일을 읽을 수 없습니다. 암호화된 파일이거나 손상된 파일입니다" 토스트

---

### Feature 6: 실시간 자동 변환 (Watch 모드)

#### 개요
툴바에 "자동 변환" 토글을 추가. 켜면 소스 변경 후 2.5초 debounce로 자동 변환을 트리거한다.

#### 컴포넌트

**수정 파일: `apps/frontend/src/components/remote/WorkerConvertPanel.tsx` 또는 툴바**
- "자동 변환 ON/OFF" 토글 버튼
- localStorage에 설정 저장 (리로드 후 유지)

**수정 파일: `apps/frontend/src/store/workspace.ts`**
- `autoConvert: boolean` 상태 추가
- `setAutoConvert(v: boolean)` 액션 추가

**수정 파일: 에디터 컴포넌트 (Editor.tsx)**
- `useEffect` + `setTimeout` 2500ms debounce
- autoConvert 켜져 있고 source 변경 시 → 자동 변환 트리거

---

## Phase 2

### Feature 2: 신구대조표 (문서 비교 뷰)

#### 개요
변환 시마다 직전 결과를 보관. "비교" 버튼 클릭 시 현재·이전 마크다운을 diff 라이브러리로 비교해 하이라이팅된 뷰를 표시한다.

#### 컴포넌트

**npm 의존성:**
```
diff (npm install diff)
```

**수정 파일: `apps/frontend/src/store/workspace.ts`**
- `prevSource: string | null` 상태 추가 (변환 직전 소스 저장)
- 변환 성공 시 현재 source → prevSource로 보관

**신규: `apps/frontend/src/components/preview/DiffView.tsx`**
- `diff.diffLines(prevSource, currentSource)` 호출
- 추가: 초록 배경 `bg-emerald-50`
- 삭제: 빨강 배경 `bg-rose-50` + 취소선
- 변경 없음: 기본 스타일
- 전체/변경만 토글 버튼

**수정 파일: `apps/frontend/src/components/preview/PreviewPane.tsx`**
- 툴바에 "비교" 버튼 추가 (prevSource 있을 때만 활성화)
- `showDiff: boolean` state
- showDiff 켜지면 DiffView 컴포넌트 표시 (미리보기 대신)

#### 데이터 흐름
```
변환 완료
  → prevSource = 직전 source 저장
  → 미리보기 정상 표시

사용자 "비교" 클릭
  → DiffView(prevSource, currentSource) 렌더링
  → 추가/삭제/유지 하이라이팅 표시
```

---

### Feature 3: 양식 자동 채우기 강화

#### 개요
에디터 소스에서 `{필드명}`, `___`, `〇〇〇` 패턴을 감지해 우측 패널에 필드 목록 표시. 값 입력 시 소스에 실시간 대체.

#### 컴포넌트

**신규: `apps/frontend/src/components/editor/FormFillPanel.tsx`**

감지 패턴:
```typescript
const PATTERNS = [
  /\{([^}]{1,30})\}/g,        // {이름}, {날짜}
  /_{3,}(?:\(([^)]+)\))?/g,   // ___ 또는 ___(이름)
  /〇{2,}(?:\(([^)]+)\))?/g,  // 〇〇 패턴
];
```

동작:
1. 소스 변경 시 패턴 자동 스캔
2. 감지된 필드를 사이드 패널에 표시
3. 사용자가 값 입력 → 소스에서 실시간 replace
4. "초기화" 버튼: 원본 패턴 복원

**수정 파일: 에디터 레이아웃**
- 필드 감지 시 패널 자동 표시 (닫기 가능)
- 감지된 필드 수를 뱃지로 표시 ("📝 3개 필드 감지됨")

---

## Phase 3

### Feature 4: 배치 처리 UI

#### 개요
여러 파일을 동시에 업로드해 각각 변환 후 ZIP으로 일괄 다운로드.

#### 컴포넌트

**신규 페이지: `apps/frontend/src/app/batch/page.tsx`**
- 다중 파일 드래그앤드롭 영역
- 업로드된 파일 목록 (파일명, 크기, 상태)
- 출력 형식 선택 (HWPX/DOCX/PDF)
- "전체 변환" 버튼
- 파일별 진행률 바
- "ZIP 다운로드" 버튼

**Backend: `apps/backend/app/api/v1/batch.py`**
```python
POST /api/v1/batch/convert
  - files: List[UploadFile]
  - output_format: str
  반환: ZIP 파일 (각 파일별 변환 결과)
```

**TopBar에 "배치" 링크 추가**

---

### Feature 5: MCP 서버 등록

#### 개요
Claude/Cursor 등 AI 에이전트가 DocuAX의 변환·파싱 기능을 직접 호출할 수 있는 MCP 서버 스펙 엔드포인트 제공.

#### MCP 도구 목록

```json
{
  "tools": [
    {
      "name": "parse_document",
      "description": "HWP/HWPX/DOCX/PDF 파일을 마크다운으로 변환",
      "inputSchema": { "file_url": "string", "format": "string" }
    },
    {
      "name": "convert_to_hwpx",
      "description": "마크다운 텍스트를 HWPX 한글 문서로 변환",
      "inputSchema": { "markdown": "string", "title": "string" }
    },
    {
      "name": "convert_to_docx",
      "description": "마크다운 텍스트를 DOCX Word 문서로 변환",
      "inputSchema": { "markdown": "string" }
    },
    {
      "name": "fill_template",
      "description": "문서 템플릿의 플레이스홀더를 값으로 채우기",
      "inputSchema": { "template": "string", "fields": "object" }
    }
  ]
}
```

#### 컴포넌트

**Backend: `apps/backend/app/api/v1/mcp.py`**
- `GET /api/v1/mcp/spec` → MCP 서버 스펙 JSON 반환
- `POST /api/v1/mcp/tools/{tool_name}` → 도구 실행

**신규 페이지: `apps/frontend/src/app/mcp/page.tsx`**
- MCP 설정 가이드 페이지
- Claude Desktop, Cursor, Windsurf 각각 설정 코드 스니펫
- "설정 복사" 버튼

---

## 수정/신규 파일 전체 목록

| Phase | 파일 | 유형 |
|-------|------|------|
| 1 | `apps/frontend/src/app/api/parse-hwp/route.ts` | 신규 |
| 1 | `apps/frontend/src/components/editor/HwpDropZone.tsx` | 신규 |
| 1 | `apps/frontend/src/store/workspace.ts` | 수정 (autoConvert) |
| 1 | `apps/frontend/src/components/editor/Editor.tsx` | 수정 (debounce) |
| 1 | `apps/frontend/src/components/TopBar.tsx` | 수정 (자동변환 토글) |
| 2 | `apps/frontend/src/components/preview/DiffView.tsx` | 신규 |
| 2 | `apps/frontend/src/components/preview/PreviewPane.tsx` | 수정 (비교 버튼) |
| 2 | `apps/frontend/src/store/workspace.ts` | 수정 (prevSource) |
| 2 | `apps/frontend/src/components/editor/FormFillPanel.tsx` | 신규 |
| 3 | `apps/frontend/src/app/batch/page.tsx` | 신규 |
| 3 | `apps/backend/app/api/v1/batch.py` | 신규 |
| 3 | `apps/backend/app/api/v1/mcp.py` | 신규 |
| 3 | `apps/frontend/src/app/mcp/page.tsx` | 신규 |
| 전체 | `apps/frontend/src/components/TopBar.tsx` | 수정 (배치·MCP 링크) |

## npm 의존성 추가
```
kordoc        # HWP 파싱
diff          # 신구대조표
jszip         # 배치 ZIP (이미 있을 수 있음)
```
