// CodeMirror 에디터 명령 레지스트리.
// 리본 툴바·메뉴바·InsertVisualBar가 에디터 인스턴스에 직접 의존하지 않고
// 이 모듈을 통해 마크다운 문법을 삽입한다.
import type { EditorView } from "@codemirror/view";

let view: EditorView | null = null;

export function registerEditorView(v: EditorView | null): void {
  view = v;
}

export function getEditorView(): EditorView | null {
  return view;
}

/** 선택 영역을 before/after 마커로 감싼다. 선택이 없으면 마커만 삽입 후 커서를 가운데 둔다. */
export function wrapSelection(before: string, after: string = before): void {
  if (!view) return;
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  view.dispatch({
    changes: { from, to, insert: `${before}${selected}${after}` },
    selection: {
      anchor: from + before.length,
      head: from + before.length + selected.length,
    },
  });
  view.focus();
}

/** 커서 위치에 인라인 텍스트 삽입. */
export function insertAtCursor(text: string): void {
  if (!view) return;
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
  });
  view.focus();
}

/** 블록 요소(표·차트·수식 등) 삽입 — 앞뒤 빈 줄을 보장한다. */
export function insertBlock(block: string): void {
  if (!view) return;
  const { to } = view.state.selection.main;
  const doc = view.state.doc.toString();
  const beforeText = doc.slice(0, to);
  const prefix = beforeText.length === 0 || beforeText.endsWith("\n\n")
    ? ""
    : beforeText.endsWith("\n") ? "\n" : "\n\n";
  const insert = `${prefix}${block}\n`;
  view.dispatch({
    changes: { from: to, to, insert },
    selection: { anchor: to + insert.length },
  });
  view.focus();
}

/** 현재 줄의 헤딩 레벨을 설정. 0 = 접두사 제거(본문). */
export function setHeadingLevel(level: number): void {
  if (!view) return;
  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  const stripped = line.text.replace(/^#{1,6}\s+/, "");
  const prefix = level > 0 ? "#".repeat(level) + " " : "";
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: prefix + stripped },
  });
  view.focus();
}

/** 현재 줄 앞에 목록 마커 토글. */
export function toggleListMarker(marker: "- " | "1. "): void {
  if (!view) return;
  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  const has = line.text.startsWith(marker);
  const insert = has ? line.text.slice(marker.length) : marker + line.text;
  view.dispatch({ changes: { from: line.from, to: line.to, insert } });
  view.focus();
}
