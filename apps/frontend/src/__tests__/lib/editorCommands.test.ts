import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  registerEditorView,
  wrapSelection,
  insertAtCursor,
  insertBlock,
  setHeadingLevel,
  getCursorOffset,
} from "@/lib/editorCommands";

function makeView(doc: string, anchor: number, head?: number) {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor, head: head ?? anchor },
    }),
  });
  registerEditorView(view);
  return view;
}

afterEach(() => registerEditorView(null));

describe("editorCommands", () => {
  it("wrapSelection — 선택 영역을 **로 감싼다", () => {
    const v = makeView("hello world", 0, 5);
    wrapSelection("**");
    expect(v.state.doc.toString()).toBe("**hello** world");
  });

  it("wrapSelection — 선택 없으면 마커만 삽입하고 커서를 가운데로", () => {
    const v = makeView("abc", 3);
    wrapSelection("**");
    expect(v.state.doc.toString()).toBe("abc****");
    expect(v.state.selection.main.anchor).toBe(5);
  });

  it("insertAtCursor — 커서 위치에 텍스트 삽입", () => {
    const v = makeView("ab", 1);
    insertAtCursor("X");
    expect(v.state.doc.toString()).toBe("aXb");
  });

  it("insertBlock — 앞뒤 빈 줄을 보장하며 블록 삽입", () => {
    const v = makeView("line1", 5);
    insertBlock("| a | b |\n|---|---|");
    expect(v.state.doc.toString()).toBe("line1\n\n| a | b |\n|---|---|\n");
  });

  it("setHeadingLevel — 현재 줄 접두사를 교체", () => {
    const v = makeView("## old heading", 3);
    setHeadingLevel(1);
    expect(v.state.doc.toString()).toBe("# old heading");
  });

  it("setHeadingLevel(0) — 접두사 제거(본문 전환)", () => {
    const v = makeView("### x", 2);
    setHeadingLevel(0);
    expect(v.state.doc.toString()).toBe("x");
  });

  it("view 미등록 시 아무 것도 하지 않는다 (throw 금지)", () => {
    registerEditorView(null);
    expect(() => wrapSelection("**")).not.toThrow();
  });

  it("getCursorOffset — 등록된 view 의 head 위치를 반환", () => {
    makeView("hello world", 2, 7);
    expect(getCursorOffset()).toBe(7);
  });

  it("getCursorOffset — view 미등록 시 null", () => {
    registerEditorView(null);
    expect(getCursorOffset()).toBeNull();
  });
});
