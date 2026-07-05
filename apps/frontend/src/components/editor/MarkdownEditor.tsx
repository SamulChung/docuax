"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

import { notifySelectionChange, registerEditorView, wrapSelection } from "@/lib/editorCommands";
import { useWorkspace } from "@/store/workspace";

const formatKeymap = keymap.of([
  { key: "Mod-b", run: () => (wrapSelection("**"), true) },
  { key: "Mod-i", run: () => (wrapSelection("*"), true) },
  { key: "Mod-u", run: () => (wrapSelection("<u>", "</u>"), true) },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-scroller": { fontFamily: "ui-monospace, monospace", lineHeight: "1.7" },
  ".cm-content": { padding: "16px" },
  "&.cm-focused": { outline: "none" },
});

export function MarkdownEditor({ placeholderText }: { placeholderText?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const source = useWorkspace((s) => s.source);
  const setSource = useWorkspace((s) => s.setSource);

  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: useWorkspace.getState().source,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          markdown(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          formatKeymap,
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
          placeholder(placeholderText ?? ""),
          theme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) setSource(u.state.doc.toString());
            // 커서 이동·선택 변경도 구독자(표→차트 감지 등)에게 알림
            if (u.selectionSet || u.docChanged) notifySelectionChange(u.state.selection.main.head);
          }),
        ],
      }),
    });
    viewRef.current = view;
    registerEditorView(view);
    return () => {
      registerEditorView(null);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 외부(템플릿·AI 채팅·HWP 가져오기)에서 source가 바뀐 경우 에디터에 반영.
  // 에디터 자신의 입력으로 인한 갱신은 doc 비교로 걸러진다.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== source) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: source },
      });
    }
  }, [source]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
