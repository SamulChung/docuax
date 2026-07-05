import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

/**
 * Docuax v3 워드프로세서 E2E 통합 시나리오.
 *
 * 커버 범위:
 *   입력(CodeMirror) → 리본 서식(굵게) → AI 변환(mock LLM) → A4 미리보기
 *   → 내보내기 6종(hwpx·hwp·docx·pdf 백엔드 렌더 + .md 클라이언트 + pptx 슬라이드 연결)
 *   → 슬라이드 탭 전환 + 에디터 내용 프리필.
 *
 * 인증: middleware.ts 가 /app 접근에 docuax_token 쿠키를 요구한다 (게스트 모드 없음).
 * → 테스트가 백엔드 API 로 일회용 계정을 등록하고 쿠키 + localStorage 토큰을 심는다
 *   (src/lib/api.ts setAuthToken 과 동일한 저장 방식).
 */

const API_BASE = process.env.E2E_API_BASE ?? "http://localhost:8000";

test("입력 → 변환 → 미리보기 → 내보내기 6종 → 슬라이드 연결", async ({ page, request }) => {
  // ── 0. 일회용 계정 등록 → 토큰 주입 (미들웨어 통과) ───────────────────
  const email = `e2e-${Date.now()}@test.local`;
  const reg = await request.post(`${API_BASE}/api/v1/auth/register`, {
    data: { email, password: "e2e-pass-12345", name: "E2E 통합검증" },
  });
  expect(reg.ok(), `register 실패: ${reg.status()} ${await reg.text()}`).toBeTruthy();
  const { access_token: token } = (await reg.json()) as { access_token: string };

  await page.context().addCookies([
    { name: "docuax_token", value: token, domain: "localhost", path: "/" },
  ]);
  await page.addInitScript((t) => {
    window.localStorage.setItem("docuax.access_token", t);
  }, token);

  // "/" 접근 시 미들웨어가 로그인 상태를 감지해 /app 으로 리다이렉트
  await page.goto("/");
  await expect(page).toHaveURL(/\/app/);

  // ── 1. CodeMirror 에디터 입력 ─────────────────────────────────────────
  // (빈 상태 안내 카드는 pointer-events-none — 클릭이 에디터로 통과)
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.type("# 통합 테스트 문서\n\n본문 문단입니다.\n");

  // ── 2. 리본 굵게 버튼 (RibbonToolbar wrapSelection("**")) ────────────
  await page.keyboard.type("굵은 텍스트");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.getByTitle("굵게 (Ctrl+B)").click();
  await expect(editor).toContainText("**굵은 텍스트**");

  // ── 3. 변환 → A4 미리보기 ────────────────────────────────────────────
  // 리본의 "AI 변환·검토" → POST /api/v1/convert (LLM_PROVIDER=mock).
  // 파이프라인이 첫 H1 을 문서 제목으로 승격 → <article> 상단 <h1> 로 렌더.
  await page.getByRole("button", { name: /AI 변환/ }).click();
  await expect(page.locator("article")).toContainText("통합 테스트 문서", { timeout: 30_000 });

  // ── 4. 백엔드 렌더 4종 다운로드 (hwpx, hwp, docx, pdf) ────────────────
  // ExportMenu(MenuBar 우측 "내보내기")의 <a href=/api/v1/render/{id}/{fmt}>.
  // Content-Disposition: attachment → Playwright download 이벤트 발생.
  let hwpPath: string | null = null;
  for (const fmt of ["hwpx", "hwp", "docx", "pdf"] as const) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /내보내기/ }).click();
    await page.getByText(new RegExp(`\\(\\.${fmt}\\)`)).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename(), `${fmt} 파일명`).toContain(`.${fmt}`);

    if (fmt === "hwp") {
      hwpPath = test.info().outputPath("export.hwp");
      await download.saveAs(hwpPath);
    }
  }

  // ── 4b. .hwp 바이너리 검증 ───────────────────────────────────────────
  expect(hwpPath).not.toBeNull();
  const hwpBuf = fs.readFileSync(hwpPath!);
  // OLE CFB 시그니처 (HWP 5.0 컨테이너) + 최소 크기
  expect(hwpBuf.subarray(0, 4).toString("hex")).toBe("d0cf11e0");
  expect(hwpBuf.length).toBeGreaterThan(1024);
  // kordoc 파싱 — 텍스트 추출이 본문을 되돌려주는지 확인.
  // (첫 H1 "통합 테스트 문서" 는 변환 파이프라인이 IR 제목으로 승격해 본문
  //  블록에서 제거 → HWP 에서는 SummaryInformation/PrvText 에만 존재하므로
  //  kordoc markdown 에는 본문 문단만 나온다. 본문 텍스트로 검증한다.)
  const out = execFileSync(
    process.execPath,
    [path.join(__dirname, "validate-hwp.mjs"), hwpPath!],
    { cwd: path.join(__dirname, ".."), encoding: "utf-8" },
  );
  const parsed = JSON.parse(out.trim().split("\n").pop()!) as {
    success: boolean;
    fileType: string;
    markdown: string;
  };
  expect(parsed.success).toBe(true);
  expect(parsed.fileType).toBe("hwp");
  expect(parsed.markdown).toContain("본문 문단입니다");
  expect(parsed.markdown).toContain("굵은 텍스트");

  // ── 5. .md 다운로드 (클라이언트 사이드 Blob) ─────────────────────────
  const mdPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /내보내기/ }).click();
  await page.getByText("마크다운 (.md)").click();
  expect((await mdPromise).suggestedFilename()).toMatch(/\.md$/);

  // ── 6. 슬라이드 탭 전환 + 프리필 (pptx 경로 = 6번째 내보내기) ─────────
  // 리본 "슬라이드로 변환" → sessionStorage docuax_slide_prefill → SlideGeneratorPanel
  await page.getByRole("button", { name: /슬라이드로 변환/ }).click();
  await expect(page.getByRole("heading", { name: "슬라이드 생성" })).toBeVisible({
    timeout: 20_000, // SlideWorkspace 는 dynamic import (ssr:false)
  });
  // 문서 텍스트란에 에디터 내용 프리필 확인
  await expect(page.locator("textarea").first()).toHaveValue(/통합 테스트 문서/);
});
