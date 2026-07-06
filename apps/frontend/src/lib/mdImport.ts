// 마크다운·텍스트 가져오기 공용 로직 — 구 MarkdownDropZone 에서 추출 (드롭존 통합).

/** H1(#) 한 줄을 제목으로 추출하고 본문에서 그 줄을 제거. */
export function splitTitle(text: string): { title: string; body: string } {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i];
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (m) {
      const before = lines.slice(0, i);
      const after = lines.slice(i + 1);
      return { title: m[1].trim(), body: [...before, ...after].join("\n").trimStart() };
    }
    if (line.trim() && !line.startsWith("#")) break;
  }
  return { title: "", body: text };
}
