import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { useWorkspace } from "@/store/workspace";

// MarkdownEditor의 updateListener 가드(M1)를 검증.
// 실제 컴포넌트를 마운트하지 않고, 동일한 로직(문서 문자열이 store.source와
// 같으면 setSource 생략)을 헤드리스 EditorView + updateListener로 재현한다.
// 목적: 외부(store→doc) 동기화 왕복이 dirty를 되살리지 않는지 문서화·회귀 방지.
function makeGuardedView(doc: string) {
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            const text = u.state.doc.toString();
            if (text !== useWorkspace.getState().source) {
              useWorkspace.getState().setSource(text);
            }
          }
        }),
      ],
    }),
  });
}

describe("MarkdownEditor updateListener 가드 (M1)", () => {
  beforeEach(() => {
    useWorkspace.getState().setSource("초기 문서");
    useWorkspace.getState().setDirty(false);
  });

  it("동일 문자열로의 doc 변경(sync echo)은 dirty를 되살리지 않는다", () => {
    const view = makeGuardedView("초기 문서");
    expect(useWorkspace.getState().dirty).toBe(false);

    // store→doc sync effect가 dispatch하는 것과 동일한 전체 교체(동일 문자열).
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "초기 문서" },
    });

    expect(useWorkspace.getState().dirty).toBe(false);
    expect(useWorkspace.getState().source).toBe("초기 문서");
    view.destroy();
  });

  it("실제 사용자 입력(다른 문자열)은 여전히 setSource·dirty를 반영한다", () => {
    const view = makeGuardedView("초기 문서");
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "사용자 입력" },
    });

    expect(useWorkspace.getState().source).toBe("사용자 입력");
    expect(useWorkspace.getState().dirty).toBe(true);
    view.destroy();
  });
});
