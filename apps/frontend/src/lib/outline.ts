/** 마크다운 헤딩(H1~H3) 목차 파서 — 코드펜스 내부는 무시. */
export interface OutlineItem {
  level: 1 | 2 | 3;
  text: string;
  line: number; // 1-based
}

export function parseOutline(source: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let inFence = false;
  source.split("\n").forEach((raw, i) => {
    if (/^(```|~~~)/.test(raw.trim())) { inFence = !inFence; return; }
    if (inFence) return;
    const m = /^(#{1,3})\s+(.+)$/.exec(raw);
    if (m) items.push({ level: m[1].length as 1 | 2 | 3, text: m[2].trim(), line: i + 1 });
  });
  return items;
}
