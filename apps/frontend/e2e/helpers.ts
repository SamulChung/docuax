import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * E2E 공용 헬퍼 — 인증 부트스트랩.
 *
 * middleware.ts 가 /app 접근에 docuax_token 쿠키를 요구한다 (게스트 모드 없음).
 * → 백엔드 API 로 일회용 계정을 등록하고 쿠키 + localStorage 토큰을 심는다
 *   (src/lib/api.ts setAuthToken 과 동일한 저장 방식).
 */

export const API_BASE = process.env.E2E_API_BASE ?? "http://localhost:8000";

export async function registerAndInjectAuth(
  page: Page,
  request: APIRequestContext,
  name = "E2E 검증",
): Promise<void> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const reg = await request.post(`${API_BASE}/api/v1/auth/register`, {
    data: { email, password: "e2e-pass-12345", name },
  });
  expect(reg.ok(), `register 실패: ${reg.status()} ${await reg.text()}`).toBeTruthy();
  const { access_token: token } = (await reg.json()) as { access_token: string };

  await page.context().addCookies([
    { name: "docuax_token", value: token, domain: "localhost", path: "/" },
  ]);
  // addInitScript 는 reload 후에도 재적용된다 — 새로고침 시나리오에서도 토큰 유지.
  await page.addInitScript((t) => {
    window.localStorage.setItem("docuax.access_token", t);
  }, token);
}
