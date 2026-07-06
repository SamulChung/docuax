# 상단 메뉴 개편 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. 설계서: docs/superpowers/specs/2026-07-06-menu-restructure-design.md

**Goal:** 리모컨 기능을 상단 메뉴 10종으로 흡수, 리본에 한 번에 변환, 드롭존 에디터 통합, 리모컨 기본 접힘.

**관례:** 이전 사이클과 동일 (jest는 src/__tests__/, 금지 파일 스테이지 금지, 검토자는 working tree 변조 금지).

### Task R1: 공유 로직 추출 — lib/convert.ts + lib/macroActions.ts (TDD)

- Create: `src/lib/convert.ts` — `performConvert(opts?: {forceFast?: boolean}): Promise<void>` (RemoteControl.tsx:60-98 handleConvert 본문 이동, getState 기반, busy 가드·429/할당량 오류 처리 그대로).
- Create: `src/lib/macroActions.ts` — `executeMacroAction(macroId: string, params?: Record<string, string|number>): Promise<void>` (RemoteControl.tsx:100-201 handleMacroExecute 분기 이동: N1/N2/N3→jumpToNext, GONGMUN_POLISH 시퀀스, T1~T4 표 생성→setSource+performConvert, B11/B12/B14 클립보드, 기본 executeMacro→setPreview). preview 필요한 분기는 가드(alert "먼저 변환하세요"). `MACRO_PARAM_SCHEMAS`는 MacroParamDialog에 있음 — macroActions는 params를 받기만 하고 대화상자는 열지 않음.
- Modify: RemoteControl.tsx — handleConvert/handleMacroExecute를 두 lib 호출로 대체 (이벤트 리스너·pendingDialog 흐름 유지). CommandPalette의 macro run도 executeMacroAction 사용으로 통일.
- Test: `src/__tests__/lib/macroActions.test.ts` — api 모킹: (1) preview 없으면 executeMacro 미호출+가드, (2) N1이 jumpToNext 호출(백엔드 X), (3) 일반 매크로 executeMacro→setPreview. convert.ts: (4) busy 중 재진입 무시, (5) forceFast가 skip_analyze/skip_review 전달.
- 검증: tsc + jest (기존 58 + 5). 커밋 `refactor(core): 변환·매크로 실행 로직 lib 추출 (메뉴·리본·팔레트 공유)`

### Task R2: 메뉴바 10종 + 리본 한 번에 변환

- Modify: `MenuBar.tsx` — MenuItem에 `disabled?: boolean; group?: string` 추가, 드롭다운 max-h-[60vh] overflow-auto, group 헤더 렌더(작은 회색 라벨). 메뉴 구성:
  - 표: 표 삽입(TABLE_3X3_MD) + divider + T 매크로(group "표 매크로") + S(group "셀 매크로")
  - 글자: B(group "블록") + G(group "글자")
  - 이동: 빨강/파랑/노랑 점프 (라벨에 preview.review_counts 수 표시, disabled=!preview)
  - 검토: AI 변환·검토(performConvert()) + divider + R 매크로 + 공문 원클릭 정돈(executeMacroAction("GONGMUN_POLISH"))
  - 출력: 내보내기 6종(ExportMenu와 동일 동작 — hwpx/hwp/docx/pdf는 다운로드 URL, hwp는 ExportMenu의 fetch 로직 함수로 추출해 재사용, md/pptx 동일) + 인쇄 + divider + 채널 변환 4종(CHANNEL_PRESETS를 lib로 이동) + P 매크로
  - 도구: "변환 실행" 항목 제거(검토와 중복), 나머지 유지
  - 매크로 항목: useSWR("macros")로 lazy 로드, 파라미터 스키마 있으면 MacroParamDialog 오픈(MenuBar 로컬 상태), 없으면 즉시 executeMacroAction. disabled=!preview.
- Modify: `RibbonToolbar.tsx` — AI 변환·검토 옆 `⚡ 한 번에 변환` 버튼(performConvert({forceFast:true}), busy 시 비활성).
- Test: MenuBar 메뉴 구성 테스트(그룹·disabled 로직은 단위 함수로 추출해 테스트 — buildTableMenu(macros, hasPreview) 같은 빌더 패턴 권장).
- 검증: tsc/jest/build + 수동(preview로 메뉴 열림·매크로 실행). 커밋 `feat(menu): 표·글자·이동·검토·출력 메뉴 — 매크로 101종 메뉴 통합 + 리본 한 번에 변환`

### Task R3: 드롭존 통합 + 리모컨 기본 접힘

- Modify: `HwpDropZone.tsx` — accept에 `.md,.txt,.markdown` 추가, md/txt 분기(FileReader 텍스트 → MarkdownDropZone.tsx의 splitTitle 로직 추출·재사용 → setSource/setTitle/currentDocId null), 라벨 "파일 열기(HWP·DOCX·MD)".
- Modify: `Editor.tsx` — 입력 영역 wrapper에 onDragOver/onDrop (HwpDropZone의 parseFile 추출 함수 호출, dragover 시 테두리 하이라이트).
- Modify: WorkerConvertPanel/HeavyConvertPanel — MarkdownDropZone 사용 제거(안내 문구 한 줄로 대체 "파일은 에디터에 드롭하세요"), MarkdownDropZone.tsx는 참조 0이면 삭제.
- Modify: `Workspace.tsx` — `useState(true)`로 리모컨 기본 접힘.
- E2E: 기존 스펙 회귀 + editing-experience에 한 단계 추가는 선택(수동 검증 가능하면 생략 가능 — 단 기존 E2E 2개는 반드시 재실행 통과).
- 검증: tsc/jest/build + Playwright 2 spec 재실행(서버 기동 절차는 e2e/helpers 참고, 8000 점유 시 8001). 커밋 `feat(editor): 파일 드롭 에디터 통합 + 리모컨 기본 접힘 (입력·미리보기 확대)`

### 최종: 통합 리뷰(경량) → main 머지 → guelzip 배포
