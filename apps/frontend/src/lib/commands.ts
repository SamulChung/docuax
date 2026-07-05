/** 명령 레지스트리 — 팔레트(Ctrl+K)·메뉴·리본이 공유하는 실행 단위. */
import { insertBlock, setHeadingLevel, toggleListMarker, wrapSelection } from "@/lib/editorCommands";
import { dispatchAutoConvert } from "@/lib/events";
import { downloadMarkdown } from "@/lib/download";
import { saveCurrentDocument, saveAsNewDocument } from "@/lib/docActions";
import { useWorkspace } from "@/store/workspace";

export interface Command {
  id: string;
  label: string;
  keywords: string;
  run: () => void;
}

export const TABLE_3X3_MD = "| 항목 | 내용 | 비고 |\n|------|------|------|\n|      |      |      |\n|      |      |      |";

export function getStaticCommands(): Command[] {
  const ws = () => useWorkspace.getState();
  return [
    { id: "format.h1", label: "제목 1", keywords: "heading h1", run: () => setHeadingLevel(1) },
    { id: "format.h2", label: "제목 2", keywords: "heading h2", run: () => setHeadingLevel(2) },
    { id: "format.h3", label: "제목 3", keywords: "heading h3", run: () => setHeadingLevel(3) },
    { id: "format.body", label: "본문으로", keywords: "paragraph", run: () => setHeadingLevel(0) },
    { id: "format.bold", label: "굵게", keywords: "bold strong", run: () => wrapSelection("**") },
    { id: "format.italic", label: "기울임", keywords: "italic", run: () => wrapSelection("*") },
    { id: "format.underline", label: "밑줄", keywords: "underline", run: () => wrapSelection("<u>", "</u>") },
    { id: "format.strike", label: "취소선", keywords: "strikethrough", run: () => wrapSelection("~~") },
    { id: "format.bullet", label: "글머리 목록", keywords: "bullet list", run: () => toggleListMarker("- ") },
    { id: "format.number", label: "번호 목록", keywords: "ordered list", run: () => toggleListMarker("1. ") },
    { id: "insert.table", label: "표 삽입 (3×3)", keywords: "table", run: () => insertBlock(TABLE_3X3_MD) },
    { id: "insert.hr", label: "구분선 삽입", keywords: "horizontal rule hr", run: () => insertBlock("---") },
    { id: "insert.quote", label: "인용 삽입", keywords: "quote blockquote", run: () => insertBlock("> 인용문") },
    { id: "file.save", label: "저장", keywords: "save ctrl+s", run: () => void saveCurrentDocument() },
    { id: "file.saveAs", label: "다른 이름으로 저장", keywords: "save as", run: () => void saveAsNewDocument() },
    { id: "export.md", label: "마크다운으로 내보내기 (.md)", keywords: "export markdown download", run: () => downloadMarkdown(ws().source, ws().title) },
    { id: "convert.run", label: "AI 변환·검토 실행", keywords: "convert ai review ctrl+enter", run: () => dispatchAutoConvert() },
    { id: "view.slides", label: "슬라이드 탭으로", keywords: "slides ppt presentation", run: () => ws().setActiveTab("slides") },
    { id: "view.doc", label: "문서 탭으로", keywords: "document editor", run: () => ws().setActiveTab("doc") },
    { id: "view.outline", label: "목차 토글", keywords: "outline toc", run: () => ws().toggleOutline() },
    { id: "view.print", label: "인쇄", keywords: "print ctrl+p", run: () => window.print() },
  ];
}

export function filterCommands(cmds: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return cmds;
  return cmds.filter(
    (c) => c.label.toLowerCase().includes(q) || c.keywords.toLowerCase().includes(q),
  );
}
