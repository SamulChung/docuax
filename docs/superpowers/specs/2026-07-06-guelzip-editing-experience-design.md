# 글집(GuelZip) 편집 경험 완성 — Phase 1 설계서

- 날짜: 2026-07-06
- 상태: 승인됨 (대화 중 확정)
- 선행: v3 워드프로세서 개편 (2026-07-05 설계서, main 머지 완료)
- 후속: Phase 2 실시간 협업 (별도 설계 예정)

## 1. 목표

"세계 최고 워드프로세서"의 기본기 격차 7개를 해소한다. 진단된 격차:

| # | 격차 | 심각도 |
|---|---|---|
| 1 | 에디터 내용이 어디에도 저장되지 않음 — 새로고침 = 작업 유실 | 치명적 |
| 2 | 문서 저장·열기·최근 문서 개념 부재 (서버 문서 API 없음) | 치명적 |
| 3 | 찾기/바꾸기(Ctrl+F) 없음 | 치명적 |
| 4 | 인쇄(Ctrl+P) 미지원 | 완성도 |
| 5 | 목차 내비게이션 없음 | 완성도 |
| 6 | 명령 팔레트 없음 | 완성도 |
| 7 | DOCX 가져오기 없음 (HWP만 가능) | 완성도 |

## 2. 컴포넌트 설계

### 2.1 자동 저장 + 복구 (frontend)

- `store/workspace.ts`: `source`·`title` 변경 시 1초 디바운스로 localStorage `guelzip_draft` = `{source, title, savedAt}` 기록. 앱 로드 시 draft가 있고 스토어가 비어 있으면 자동 복구.
- 구현 위치: 스토어 구독 기반 헬퍼 `lib/draft.ts` (`saveDraft`, `loadDraft`, `clearDraft`) + Workspace 마운트 시 복구 훅.
- StatusBar에 저장 상태 표시: "임시 저장됨 HH:MM" (localStorage) / "저장됨 HH:MM" (서버, 2.4 연동) / "저장 실패 — 로컬 백업 유지" (경고색).
- `resetWorkspace`(새 문서) 시 draft 삭제.

### 2.2 문서 보관함 — 백엔드

- 모델 `app/models/document.py`: `Document(id: str uuid, user_id FK, title str, source_md text, created_at, updated_at)`. 기존 SQLAlchemy 패턴(User 모델) 준수.
- API `app/api/v1/documents.py` (인증 필수, 본인 소유만):
  - `GET /api/v1/documents?limit&offset` — 목록 (id, title, updated_at, 본문 앞 120자 미리보기)
  - `POST /api/v1/documents` — 생성 {title, source_md} → {id, ...}
  - `GET /api/v1/documents/{id}` — 단건 (source_md 포함)
  - `PUT /api/v1/documents/{id}` — 수정 {title?, source_md?}
  - `DELETE /api/v1/documents/{id}`
- 크기 제한: source_md 2MB. 초과 시 413.
- 테스트: pytest — CRUD, 소유권 격리(타인 문서 404), 크기 제한.

### 2.3 문서 보관함 — 프론트

- `lib/api.ts`: listDocuments/createDocument/getDocument/updateDocument/deleteDocument.
- `store/workspace.ts`: `currentDocId: string | null`, `dirty: boolean`, `lastSavedAt: number | null` 추가.
- 파일 메뉴 확장: 저장(Ctrl+S — currentDocId 있으면 PUT, 없으면 제목 프롬프트 후 POST), 다른 이름으로 저장, 열기…(모달), 최근 문서(목록 상위 5개 인라인), 새 문서(기존 + draft 삭제).
- `components/shell/DocumentPicker.tsx`: 문서 목록 모달 — 검색, 열기, 삭제(확인), 미리보기 120자.
- 비로그인: 파일 메뉴의 서버 저장 항목은 "로그인 필요" 안내로 비활성. localStorage draft는 항상 동작.
- Ctrl+S 키맵은 MarkdownEditor keymap에 추가 (브라우저 기본 저장 다이얼로그 차단).

### 2.4 서버 자동 저장

- 로그인 + `currentDocId` 존재 + `dirty`일 때 30초 간격 PUT. 실패 시 StatusBar 경고 + localStorage 백업은 그대로.

### 2.5 찾기/바꾸기

- `@codemirror/search` 설치, MarkdownEditor extensions에 `search()` + `searchKeymap` 추가 (Ctrl+F 검색, Ctrl+H는 openSearchPanel 바꾸기 모드 — searchKeymap 기본은 Mod-f/Mod-Alt-f이므로 Ctrl+H 커스텀 바인딩 추가).
- 패널 한국어화: `EditorState.phrases` — "Find"→"찾기", "Replace"→"바꾸기", "next"→"다음", "previous"→"이전", "all"→"모두", "match case"→"대소문자", "regexp"→"정규식", "by word"→"단어 단위", "replace"→"바꾸기", "replace all"→"모두 바꾸기", "close"→"닫기".
- 편집>찾기/바꾸기 메뉴 항목 추가.

### 2.6 인쇄

- `styles/globals.css`에 `@media print` 블록: TopBar·MenuBar·DocumentTabs·RibbonToolbar·에디터 패널·RemoteControl·StatusBar·ChatDock/Panel 숨김(`print:hidden` 유틸 또는 전용 클래스), A4Sheet를 전체 폭·그림자 없음으로, 페이지 가이드 오버레이 숨김, `page-break-inside: avoid`를 표·이미지 블록에.
- 파일>인쇄 메뉴(`window.print()`) + Ctrl+P는 브라우저 기본 동작 그대로 (인쇄 CSS만으로 결과가 정돈됨).

### 2.7 목차 사이드바

- `lib/outline.ts`: `parseOutline(source): {level, text, line}[]` — 마크다운 `#`~`###` 헤딩 파싱 (코드펜스 내부 제외).
- `components/shell/OutlinePanel.tsx`: 에디터 패널 좌측 접이식(기본 접힘, 리본에 토글 버튼). 클릭 시 `editorCommands.scrollToLine(line)` (신규 — EditorView.dispatch scrollIntoView) + 포커스.
- 단위 테스트: 파서(코드펜스 내 # 무시, 깊이 매핑).

### 2.8 명령 팔레트 (Ctrl+K)

- `components/shell/CommandPalette.tsx`: 모달 + 입력 + 퍼지 필터(단순 부분 문자열 + 초성 검색은 비범위) + 키보드 내비(↑↓ Enter Esc).
- 명령 소스: 정적 레지스트리 `lib/commands.ts` — 서식·삽입·파일·탭 전환·내보내기 명령을 {id, label, keywords, run} 목록으로 등록 (MenuBar·RibbonToolbar와 공유해 중복 제거). 매크로 101종은 팔레트 열릴 때 `listMacros()`로 lazy 병합, 실행은 기존 `executeMacro` 흐름(문서 변환 후에만 활성 — preview 없으면 "먼저 변환하세요" 안내).
- 전역 키맵: Ctrl+K (MarkdownEditor keymap + window keydown 둘 다, 중복 방지 가드).

### 2.9 DOCX 가져오기

- `mammoth`(docx→HTML) + `turndown`(HTML→마크다운) 설치.
- 기존 `HwpDropZone`을 `ImportDropZone`으로 확장: accept `.hwp/.hwpx/.docx`, 확장자별 파서 분기 (기존 kordoc 경로 유지 + docx 경로 신설 `lib/docxImport.ts`).
- 변환 실패 시 기존 HWP 실패 UX와 동일한 오류 안내.
- 단위 테스트: docxImport — mammoth/turndown 모킹으로 HTML→MD 매핑(제목·굵게·표) 검증.

## 3. 데이터 흐름

- 입력 → 스토어 → (1s) localStorage draft → (30s, 로그인+dirty) 서버 PUT.
- 열기 → GET document → setSource/setTitle/currentDocId → draft 갱신.
- 팔레트 실행 → 공유 명령 레지스트리 → editorCommands/API.

## 4. 오류 처리

- 서버 저장 실패: StatusBar 경고 + draft 유지, 다음 주기 재시도.
- localStorage 접근 불가(사파리 프라이빗 등): try/catch 무시 (기존 패턴).
- DOCX 파싱 실패: 오류 배너 + 파일 그대로 두기.
- 문서 API: 401 → 로그인 유도, 404 → 목록 새로고침.

## 5. 비범위 (Phase 2+)

실시간 협업(Yjs), 공유 링크, 버전 히스토리, 초성 검색, 오프라인 PWA, 이미지 서버 업로드 개선.

## 6. 테스트 전략

- 프론트 Jest: draft 저장/복구, outline 파서, 팔레트 필터·실행, docxImport 매핑, commands 레지스트리.
- 백엔드 pytest: documents CRUD·소유권·크기 제한.
- E2E 확장: 입력 → 새로고침 → 복구 확인 → Ctrl+S 저장 → 문서 열기 → Ctrl+F 검색 하이라이트 → Ctrl+K 팔레트로 명령 실행.

## 7. 구현 순서

1. 자동 저장+복구 (draft) — 최우선, 독립
2. 문서 API (백엔드) — 프론트와 병렬 가능
3. 문서 보관함 프론트 (파일 메뉴·모달·Ctrl+S·서버 자동 저장)
4. 찾기/바꾸기 + 인쇄 (소형 2건 묶음)
5. 목차 사이드바
6. 명령 팔레트 (+ 명령 레지스트리로 MenuBar/Ribbon 리팩터)
7. DOCX 가져오기
8. E2E 확장 + 배포 (guelzip.vercel.app + Railway)
