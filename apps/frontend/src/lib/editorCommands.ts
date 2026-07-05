// CodeMirror 에디터 명령 레지스트리.
// 리본 툴바·메뉴바·InsertVisualBar가 에디터 인스턴스에 직접 의존하지 않고
// 이 모듈을 통해 마크다운 문법을 삽입한다.
import { EditorView } from "@codemirror/view";

let view: EditorView | null = null;

export function registerEditorView(v: EditorView | null): void {
  view = v;
}

/**
 * 등록 해제 — 자기 자신이 등록된 경우에만 해제 (compare-and-clear).
 * 에디터 인스턴스가 교체될 때(StrictMode 재마운트·탭 전환 등) 옛 인스턴스의
 * unmount cleanup 이 살아있는 새 인스턴스의 등록을 지우는 clobber 를 방지한다.
 */
export function unregisterEditorView(v: EditorView): void {
  if (view === v) view = null;
}

/** 등록된 EditorView 원본 접근 — MenuBar의 undo/redo에서 사용. */
export function getEditorView(): EditorView | null {
  return view;
}

/** 현재 커서 오프셋 (view 미등록 시 null). */
export function getCursorOffset(): number | null {
  return view ? view.state.selection.main.head : null;
}

type SelectionListener = (offset: number) => void;
const selectionListeners = new Set<SelectionListener>();

/** 커서/선택 변경 구독 — 해제 함수를 반환. */
export function onSelectionChange(fn: SelectionListener): () => void {
  selectionListeners.add(fn);
  return () => selectionListeners.delete(fn);
}

/** MarkdownEditor의 updateListener가 selection 변경 시 호출. */
export function notifySelectionChange(offset: number): void {
  selectionListeners.forEach((fn) => fn(offset));
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

/** 1-based 줄 번호로 스크롤 + 커서 이동. */
export function scrollToLine(line: number): void {
  if (!view) return;
  const docLine = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
  view.dispatch({
    selection: { anchor: docLine.from },
    effects: EditorView.scrollIntoView(docLine.from, { y: "start" }),
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
