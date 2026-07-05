// .hwp 바이너리 검증 헬퍼 — kordoc 으로 파싱해 결과를 JSON 한 줄로 stdout 출력.
// Playwright 테스트에서 child_process 로 호출한다.
// (kordoc dist/index.cjs 는 require() 로 로드 시 import.meta 구문 오류가 있어
//  ESM 동적 import 만 동작 → 테스트 본체 대신 별도 .mjs 스크립트로 분리)
//
// 사용: node e2e/validate-hwp.mjs <file.hwp>   (cwd = apps/frontend)
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node e2e/validate-hwp.mjs <file.hwp>");
  process.exit(1);
}

const { parse } = await import("kordoc");
const result = await parse(fs.readFileSync(file));

if (!result.success) {
  console.error(`kordoc parse failed: ${result.error}`);
  process.exit(2);
}

console.log(
  JSON.stringify({
    success: true,
    fileType: result.fileType,
    pageCount: result.pageCount ?? null,
    markdown: result.markdown,
  }),
);
