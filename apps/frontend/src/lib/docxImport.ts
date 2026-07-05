/** DOCX → 마크다운 가져오기 — mammoth(docx→HTML) + turndown(HTML→MD). 클라이언트 전용. */
import TurndownService from "turndown";
import { tables } from "turndown-plugin-gfm";

const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });
turndown.use(tables);

// turndown 기본 listItem 규칙은 마커 뒤 공백 3칸(`-   항목`)을 사용 — 표준 마크다운 스타일(`- 항목`, 1칸)로 재정의.
turndown.addRule("listItem", {
  filter: "li",
  replacement: (content, node, options) => {
    content = content.replace(/^\n+/, "").replace(/\n+$/, "\n").replace(/\n/gm, "\n  ");
    let prefix = `${options.bulletListMarker} `;
    const parent = node.parentNode as HTMLElement | null;
    if (parent && parent.nodeName === "OL") {
      const start = parent.getAttribute("start");
      const index = Array.prototype.indexOf.call(parent.children, node);
      prefix = `${start ? Number(start) + index : index + 1}. `;
    }
    return prefix + content + (node.nextSibling && !/\n$/.test(content) ? "\n" : "");
  },
});

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}

/** .docx File → 마크다운. 실패 시 Error throw (호출부가 UI 안내). */
export async function docxFileToMarkdown(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const { value: html, messages } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  if (messages?.length) console.warn("[docxImport] mammoth 변환 경고:", messages);
  const md = htmlToMarkdown(html);
  if (!md.trim()) throw new Error("빈 문서이거나 변환할 내용이 없습니다");
  return md;
}
