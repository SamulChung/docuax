import { defineConfig } from "@playwright/test";

/**
 * E2E 통합 검증 (Docuax v3 워드프로세서)
 *
 * 사전 조건 — 서버 2개를 직접 띄운 뒤 실행한다 (webServer 자동 기동 미사용):
 *   1) 백엔드:  cd apps/backend
 *      LLM_PROVIDER=mock python -m uvicorn app.main:app --port 8000
 *      (레포에 체크인된 docuax.db 는 스키마가 구버전 — users.email_verified 없음.
 *       DATABASE_URL 로 새 SQLite 파일을 지정하면 create_all 이 최신 스키마로 생성)
 *   2) 프론트:  cd apps/frontend
 *      NEXT_PUBLIC_API_BASE=http://localhost:8000 npm run dev
 *      (미설정 시 next.config.js 가 Railway 프로덕션 URL 을 기본값으로 사용하므로 필수)
 *
 * 실행: npm run test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    locale: "ko-KR",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
});
