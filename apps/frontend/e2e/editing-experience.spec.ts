import { test, expect } from "@playwright/test";

import { registerAndInjectAuth } from "./helpers";

/**
 * 글집(GuelZip) 편집 경험 Phase 1 E2E 시나리오.
 *
 * 커버 범위:
 *   localStorage draft 자동 저장(1초 디바운스) → 새로고침 복구 + 상태바 "임시 저장됨"
 *   → Ctrl+S 서버 저장(제목 프롬프트) → 파일 > 열기 모달에 문서 표시
 *   → Ctrl+F 검색 패널(한국어) + 매치 하이라이트 → 리본 목차 토글 + 항목 점프
 *   → Ctrl+K 명령 팔레트로 표 삽입.
 */

test("편집 경험 — 복구·저장·열기·찾기·팔레트·목차", async ({ page, request }) => {
  // 페이지 전체에서 uncaught exception 수집 (목차 점프 등 "에러 없음" 검증용)
  const pageErrors: Error[] = [];
  page.on("pageerror", (e) => pageErrors.push(e));

  // ── 1. 일회용 계정 등록 + 토큰 주입 → "/" → /app 리다이렉트 ──────────
  await registerAndInjectAuth(page, request, "E2E 편집경험");
  await page.goto("/");
  await expect(page).toHaveURL(/\/app/);

  // ── 2. CodeMirror 에디터 입력 ─────────────────────────────────────────
  // (빈 상태 안내 카드는 pointer-events-none — 클릭이 에디터로 통과)
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.type("# 복구 테스트\n\n본문 내용입니다.");
  await expect(editor).toContainText("복구 테스트");

  // ── 3. draft 디바운스(1초) 대기 → 새로고침 → 복구 확인 ────────────────
  await page.waitForTimeout(1500); // workspace.ts draftTimer = 1000ms
  await page.reload();
  await expect(page.locator(".cm-content")).toContainText("복구 테스트");
  // StatusBar: saveState.kind === "draft" → "임시 저장됨 HH:MM"
  await expect(page.getByText(/임시 저장됨/)).toBeVisible();

  // ── 4. Ctrl+S → 제목 프롬프트 accept → 서버 저장 ─────────────────────
  // docActions.saveCurrentDocument: currentDocId 없음 + title 빈 문자열
  // → window.prompt("문서 제목을 입력하세요") 발생. once 시맨틱으로 1회만 처리.
  page.once("dialog", (d) => void d.accept("E2E문서"));
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+s");
  // "임시 저장됨"(draft)과 구분 — 문자열 시작이 "저장됨"인 span 만 매치
  await expect(page.getByText(/^저장됨/)).toBeVisible();

  // ── 5. 파일 > 열기… (내 문서) → 모달에 저장 문서 표시 ────────────────
  await page.getByRole("button", { name: "파일", exact: true }).click();
  await page.getByRole("button", { name: "열기… (내 문서)" }).click();
  const pickerHeading = page.getByRole("heading", { name: "문서 열기" });
  await expect(pickerHeading).toBeVisible();
  await expect(page.getByText("E2E문서", { exact: true })).toBeVisible();
  // DocumentPicker 는 Esc 핸들러가 있지만, 여기서는 X(aria-label="닫기") 버튼으로 닫는다.
  // VerifyBanner(미인증 배너)에도 "닫기" 버튼이 있으므로 모달 헤더로 스코프 한정.
  await pickerHeading.locator("xpath=..").getByRole("button", { name: "닫기" }).click();
  await expect(pickerHeading).toBeHidden();

  // ── 6. Ctrl+F 검색 패널(한국어 phrases) + 매치 하이라이트 ─────────────
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+f");
  // EditorState.phrases: "Find" → "찾기" — 검색 입력란 placeholder 로 노출
  const searchInput = page.getByPlaceholder("찾기");
  await expect(searchInput).toBeVisible();
  // CM 검색 필드는 keyup/change 이벤트로만 쿼리를 커밋한다. 한글은 CDP insertText
  // 로 입력되어 keyup 이 발생하지 않으므로(fill 도 input 이벤트만), 값 입력 후
  // 무해한 키(End)를 한 번 눌러 keyup → commit 을 트리거한다.
  await searchInput.fill("본문");
  await searchInput.press("End");
  await expect(page.locator(".cm-searchMatch").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(searchInput).toBeHidden();

  // ── 7. 리본 목차 토글 → 항목 클릭(에러 없음) → 다시 닫기 ─────────────
  await page.getByTitle("목차").click();
  const outlineItem = page.getByRole("button", { name: "복구 테스트" });
  await expect(outlineItem).toBeVisible();
  await outlineItem.click(); // scrollToLine — 예외 없이 동작해야 함
  expect(pageErrors, `uncaught page errors: ${pageErrors.map((e) => e.message).join(", ")}`).toEqual([]);
  await page.getByTitle("목차").click();
  await expect(outlineItem).toBeHidden();

  // ── 8. Ctrl+K 팔레트 → "표" → Enter → 표 마크다운 삽입 ────────────────
  await page.keyboard.press("Control+k");
  const paletteInput = page.getByPlaceholder("명령 검색… (서식·삽입·매크로·내보내기)");
  await expect(paletteInput).toBeVisible();
  await paletteInput.fill("표");
  // 정적 명령이 매크로보다 앞 — 첫 결과가 "표 삽입 (3×3)" 이어야 Enter 로 실행됨.
  // 리본에도 같은 이름(title)의 버튼이 있으므로 팔레트 카드로 스코프 한정.
  const paletteCard = paletteInput.locator("xpath=ancestor::div[contains(@class, 'max-w-md')]");
  await expect(paletteCard.getByRole("button", { name: "표 삽입 (3×3)" })).toBeVisible();
  await paletteInput.press("Enter");
  await expect(paletteInput).toBeHidden();
  await expect(page.locator(".cm-content")).toContainText("| 항목 |");
});
