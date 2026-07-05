"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { search, searchKeymap, openSearchPanel } from "@codemirror/search";

import { saveCurrentDocument } from "@/lib/docActions";
import { notifySelectionChange, registerEditorView, unregisterEditorView, wrapSelection } from "@/lib/editorCommands";
import { sanitizeString } from "@/lib/sanitize";
import { useWorkspace } from "@/store/workspace";

const formatKeymap = keymap.of([
  { key: "Mod-b", run: () => (wrapSelection("**"), true) },
  { key: "Mod-i", run: () => (wrapSelection("*"), true) },
  { key: "Mod-u", run: () => (wrapSelection("<u>", "</u>"), true) },
  { key: "Mod-s", run: () => { void saveCurrentDocument(); return true; }, preventDefault: true },
  { key: "Mod-h", run: (v) => { openSearchPanel(v); return true; }, preventDefault: true },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-scroller": { fontFamily: "ui-monospace, monospace", lineHeight: "1.7" },
  ".cm-content": { padding: "16px" },
  "&.cm-focused": { outline: "none" },
  ".cm-panel.cm-search": { fontSize: "12px" },
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
          search({ top: true }),
          keymap.of(searchKeymap),
          EditorState.phrases.of({
            "Find": "찾기", "Replace": "바꾸기", "next": "다음", "previous": "이전",
            "all": "모두", "match case": "대소문자", "regexp": "정규식",
            "by word": "단어 단위", "replace": "바꾸기", "replace all": "모두 바꾸기",
            "close": "닫기", "current match": "현재 일치", "replaced $ matches": "$개 바꿈",
            "replaced match on line $": "$번째 줄에서 바꿈", "on line": "줄",
          }),
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
      // compare-and-clear — 다른 인스턴스가 이미 등록을 교체했다면 건드리지 않는다
      // (StrictMode 재마운트·중복 마운트 시 살아있는 에디터의 등록 clobber 방지).
      unregisterEditorView(view);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 외부(템플릿·AI 채팅·HWP 가져오기)에서 source가 바뀐 경우 에디터에 반영.
  // 에디터 자신의 입력으로 인한 갱신은 doc 비교로 걸러진다.
  // 주의: setSource 는 저장 시 sanitize(lone surrogate·제어문자 제거)하므로,
  // 깨진 유니코드가 섞인 paste 직후에는 doc ≠ source 가 되어 자기 입력이
  // 외부 변경으로 오인될 수 있다 — 그 경우 전체 교체(커서 점프·undo 오염)가
  // 일어나지 않도록 sanitize 결과 기준으로 비교한다.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== source && sanitizeString(current) !== source) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: source },
      });
    }
  }, [source]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
