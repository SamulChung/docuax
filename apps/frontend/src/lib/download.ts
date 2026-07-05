/** Blob 다운로드 공통 코어 — a[download] 클릭 방식. 브라우저 저장 다이얼로그를 띄운다. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 현재 에디터 소스를 .md 파일로 즉시 다운로드 — 백엔드 불필요. */
export function downloadMarkdown(source: string, title: string): void {
  const name = (title || "document").trim().replace(/[\\/:*?"<>|]/g, "_") || "document";
  downloadBlob(new Blob([source], { type: "text/markdown;charset=utf-8" }), `${name}.md`);
}

/**
 * X-Docuax-Warnings 헤더 파싱 — 백엔드(render.py)가 강등 경고를
 * encodeURIComponent(JSON.stringify(string[])) 형태로 싣는다 (설계문서 §3.5).
 * 헤더 없음·형식 오류 시 빈 배열 반환 (경고 UI 미표시 = 안전한 실패).
 */
export function parseDocuaxWarnings(headerValue: string | null): string[] {
  if (!headerValue) return [];
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(headerValue));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((w): w is string => typeof w === "string");
  } catch {
    return [];
  }
}
