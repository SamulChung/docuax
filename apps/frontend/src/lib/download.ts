/** 현재 에디터 소스를 .md 파일로 즉시 다운로드 — 백엔드 불필요. */
export function downloadMarkdown(source: string, title: string): void {
  const name = (title || "document").trim().replace(/[\\/:*?"<>|]/g, "_") || "document";
  const blob = new Blob([source], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
