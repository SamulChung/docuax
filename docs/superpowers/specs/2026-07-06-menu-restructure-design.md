# 글집 상단 메뉴 개편 — 리모컨 흡수 설계서

- 날짜: 2026-07-06 · 상태: 승인됨 (사용자 제안 기반)
- 목표: 리모컨(표·글자·이동·출력) 기능을 워드프로세서식 상단 메뉴로 흡수하고, 변환 버튼·드롭존을 재배치해 입력/미리보기 공간을 확보한다.

## 1. 메뉴바 (MenuBar) — 10개 메뉴

`파일 · 편집 · 서식 · 삽입 · 표 · 글자 · 이동 · 검토 · 출력 · 도구`

| 메뉴 | 내용 | 소스 |
|---|---|---|
| 표 | 표 삽입(기존) + T1~T25 + S1~S15 (T/S 그룹 헤더, max-h 스크롤) | listMacros SWR("macros") |
| 글자 | B 블록 매크로 + G 글자 매크로 (B/G 그룹 헤더) | 〃 |
| 이동 | 빨강/파랑/노랑 점프 (preview.review_counts 뱃지) | store jumpToNext — 백엔드 호출 없음 |
| 검토 | AI 변환·검토 실행(full convert) + R1~R9 + 공문 원클릭 정돈(GONGMUN_POLISH) | 〃 + 매크로 |
| 출력 | 저장/.md/인쇄(파일에서 이관 안 함 — 내보내기 6종 + 인쇄 + 채널 변환 4종 + P 매크로) | ExportMenu 로직·CHANNEL_PRESETS 재사용 |
| 도구 | 기존 유지 (변환 실행 항목은 검토 메뉴와 중복되므로 제거) | |

- 매크로 실행 로직은 RemoteControl의 handleMacroExecute를 **lib/macroActions.ts로 추출**해 메뉴·리모컨·팔레트가 공유: `executeMacroAction(macroId, params?)` — N1~3 점프 분기, GONGMUN_POLISH 시퀀스, T1~T4 표 생성(에디터 삽입+변환), B11/B12/B14 클립보드 분기, 일반 executeMacro 포함. 파라미터 스키마(MACRO_PARAM_SCHEMAS) 필요 시 대화상자를 여는 책임은 호출 UI가 가짐 (MacroParamDialog 재사용).
- preview 없으면 매크로 항목 비활성(회색 + title "먼저 변환하세요"). N 점프·T1~T4·채널 프리셋도 preview 필요.
- 메뉴 드롭다운은 스크롤(max-h-[60vh]) + 그룹 헤더 지원으로 MenuBar 렌더러 확장. MenuItem 타입에 `disabled?: boolean`, `group?: string` 추가.

## 2. 리본 — "⚡ 한 번에 변환"

- `lib/convert.ts` 신설: `performConvert(opts?: {forceFast?: boolean})` — RemoteControl.handleConvert 본문 이동(스토어 getState 기반, 429/할당량 오류 처리 포함).
- RemoteControl은 performConvert를 호출하도록 리팩터 (이벤트 리스너 유지).
- 리본: [AI 변환·검토(full)] 옆에 [⚡ 한 번에 변환(forceFast)] 추가. 기존 AUTO_CONVERT_EVENT 경로는 유지(디바운스 자동 변환용).

## 3. 드롭존 통합

- HwpDropZone → 통합 파일 열기: accept `.hwp/.hwpx/.docx/.md/.txt/.markdown`. md/txt 분기는 MarkdownDropZone의 splitTitle 로직 재사용(제목 H1 추출). 라벨 "파일 열기".
- Editor 입력 영역 전체가 드래그 드롭 타겟 (dragover 하이라이트, HwpDropZone parseFile 재사용 — 함수 추출).
- WorkerConvertPanel/HeavyConvertPanel의 MarkdownDropZone 제거 (컴포넌트 파일은 남김 — 다른 참조 없으면 삭제).

## 4. 레이아웃

- 리모컨 기본 접힘 (`remoteCollapsed` 초기값 true) → 상시 에디터 6 | 미리보기 5 | 리모컨 1. 펼치면 5/4/3 (기존 그대로).
- 리모컨 자체 기능(조직 선택·정밀 변환·fastConvert 토글·검토 카운트·다운로드)은 변경 없음.

## 5. 비범위 / 오류 처리 / 테스트

- 비범위: 리모컨 삭제, 채널 프리셋 개편, 매크로 파라미터 스키마 확장.
- 오류: 매크로 실행 실패 alert(기존 관례), 변환 중(busy) 재진입 방지(기존 performConvert 로직 유지).
- 테스트: macroActions 단위(N 점프 분기·preview 가드), convert.ts 추출 후 기존 이벤트 경로 회귀(jest), MenuBar 그룹/비활성 렌더 스냅샷성 테스트 1, E2E: 표 메뉴에서 T14 실행 → 미리보기 갱신 1시나리오 추가.
