# Docuax v3 워드프로세서 UI 개편 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 Docuax를 워드프로세서 스타일 UI(메뉴바·리본·상태바·문서/슬라이드 탭)로 개편하고, CodeMirror 6 분할 화면 에디터 + A4 페이지 미리보기 + 내보내기 6종(.hwpx/.hwp/.docx/.pdf/.md/.pptx)을 완성한다.

**Architecture:** 백엔드 7단계 파이프라인·매크로·기존 렌더러는 무변경. 프론트는 Workspace 셸을 탭 구조로 재편하고 textarea를 CodeMirror 6로 교체, 리본 툴바는 마크다운 문법 삽입 방식. 백엔드는 `hwp_renderer`(HWP 5.0 바이너리, OLE CFB 자체 라이터) 1종만 추가.

**Tech Stack:** Next.js 14 / TypeScript / Tailwind / Zustand / CodeMirror 6 (신규) / FastAPI / python-hwpx / olefile(검증용) / zlib

**설계서:** `docs/superpowers/specs/2026-07-05-docuax-v3-word-processor-design.md`

**작업 디렉토리:** `C:\project\docua` — 브랜치 `feature/v3-word-processor`

**실행 명령 참고 (Windows):**
- 프론트: `cd apps/frontend && npm install && npm test -- --watchAll=false`, 개발 서버 `npm run dev` (:3000)
- 백엔드: `cd apps/backend && python -m pytest tests/ -x -q`, 서버 `uvicorn app.main:app --port 8000` (환경변수 `LLM_PROVIDER=mock`)

**설계서 대비 조정 1건:** 기존 `TopBar`(로고·인증·사용량)는 흡수하지 않고 유지한다. 메뉴바는 TopBar 바로 아래 별도 스트립으로 추가한다 — 인증/SWR 로직 재배선 위험 대비 이득이 없음.

---

## 파일 구조 (신규/수정 총괄)

```
apps/frontend/src/
├── store/workspace.ts                     [수정] activeTab·pageCount 추가
├── lib/api.ts                             [수정] downloadUrl에 "hwp" 추가
├── lib/editorCommands.ts                  [신규] CodeMirror 명령 레지스트리
├── lib/download.ts                        [신규] .md Blob 다운로드
├── components/Workspace.tsx               [수정] 탭 셸 재편
├── components/shell/DocumentTabs.tsx      [신규] 문서|슬라이드 탭
├── components/shell/MenuBar.tsx           [신규] 파일·편집·서식·삽입·도구
├── components/shell/RibbonToolbar.tsx     [신규] 서식/삽입/AI 리본
├── components/shell/ExportMenu.tsx        [신규] 내보내기 드롭다운
├── components/shell/StatusBar.tsx         [신규] 글자수·쪽수·포맷
├── components/editor/MarkdownEditor.tsx   [신규] CodeMirror 6 래퍼
├── components/editor/Editor.tsx           [수정] textarea → MarkdownEditor
├── components/editor/InsertVisualBar.tsx  [수정] onInsert prop 추가
├── components/preview/A4Sheet.tsx         [신규] A4 페이지 시뮬레이션
├── components/preview/PreviewPane.tsx     [수정] A4Sheet 적용
└── components/slides/SlideWorkspace.tsx   [신규] app/slides/page.tsx 본문 이동

apps/backend/app/
├── renderers/__init__.py                  [수정] "hwp" 등록
├── renderers/hwp/__init__.py              [신규]
├── renderers/hwp/cfb_writer.py            [신규] OLE CFB 컨테이너 라이터
├── renderers/hwp/records.py               [신규] HWP 레코드 인코딩
├── renderers/hwp/docinfo.py               [신규] DocInfo 스트림 빌더
├── renderers/hwp/bodytext.py              [신규] BodyText 스트림 빌더
├── renderers/hwp_renderer.py              [신규] Renderer 구현
└── tests/
    ├── test_cfb_writer.py                 [신규]
    └── test_hwp_renderer.py               [신규]
```

각 작업 완료 시 커밋. 커밋 메시지는 기존 관례(한국어, `feat(scope): …`)를 따른다.

---

### Task 1: 스토어 확장 + 문서/슬라이드 탭 셸

**Files:**
- Modify: `apps/frontend/src/store/workspace.ts`
- Create: `apps/frontend/src/components/shell/DocumentTabs.tsx`
- Modify: `apps/frontend/src/components/Workspace.tsx`
- Test: `apps/frontend/src/store/__tests__/workspace.test.ts`

- [ ] **Step 1: 스토어 실패 테스트 작성**

`apps/frontend/src/store/__tests__/workspace.test.ts` 생성:

```ts
import { useWorkspace } from "../workspace";

describe("workspace store — v3 shell state", () => {
  it("activeTab 기본값은 doc, setActiveTab으로 전환", () => {
    expect(useWorkspace.getState().activeTab).toBe("doc");
    useWorkspace.getState().setActiveTab("slides");
    expect(useWorkspace.getState().activeTab).toBe("slides");
    useWorkspace.getState().setActiveTab("doc");
  });

  it("pageCount 기본값 0, setPageCount로 갱신", () => {
    expect(useWorkspace.getState().pageCount).toBe(0);
    useWorkspace.getState().setPageCount(3);
    expect(useWorkspace.getState().pageCount).toBe(3);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/frontend && npx jest src/store/__tests__/workspace.test.ts`
Expected: FAIL — `activeTab`이 undefined.

- [ ] **Step 3: 스토어에 activeTab·pageCount 추가**

`apps/frontend/src/store/workspace.ts`의 `WorkspaceState` 인터페이스에 추가 (`resetWorkspace` 선언 위):

```ts
  /** v3 셸 — 문서/슬라이드 탭 */
  activeTab: "doc" | "slides";
  setActiveTab: (t: "doc" | "slides") => void;

  /** A4 미리보기 추정 쪽수 (상태바 표시용) */
  pageCount: number;
  setPageCount: (n: number) => void;
```

구현부(`create<WorkspaceState>` 내부, `resetWorkspace` 위)에 추가:

```ts
  activeTab: "doc",
  setActiveTab: (t) => set({ activeTab: t }),

  pageCount: 0,
  setPageCount: (n) => set({ pageCount: n }),
```

`resetWorkspace`의 set 객체에 `activeTab: "doc", pageCount: 0,` 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/frontend && npx jest src/store/__tests__/workspace.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: DocumentTabs 컴포넌트 작성**

`apps/frontend/src/components/shell/DocumentTabs.tsx` 생성:

```tsx
"use client";

import { FileText, Presentation } from "lucide-react";
import { useWorkspace } from "@/store/workspace";

const TABS = [
  { id: "doc" as const, label: "문서", Icon: FileText },
  { id: "slides" as const, label: "슬라이드", Icon: Presentation },
];

export function DocumentTabs() {
  const activeTab = useWorkspace((s) => s.activeTab);
  const setActiveTab = useWorkspace((s) => s.setActiveTab);

  return (
    <div className="flex items-end gap-1 border-b border-neutral-200 px-3 pt-1 dark:border-neutral-800">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          className={`flex items-center gap-1.5 rounded-t-md border border-b-0 px-4 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === id
              ? "border-neutral-200 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              : "border-transparent text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          }`}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Workspace를 탭 셸로 재편**

`apps/frontend/src/components/Workspace.tsx` 전체 교체:

```tsx
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { Editor } from "@/components/editor/Editor";
import { PreviewPane } from "@/components/preview/PreviewPane";
import { RemoteControl } from "@/components/remote/RemoteControl";
import { DocumentTabs } from "@/components/shell/DocumentTabs";
import { TopBar } from "@/components/TopBar";
import { useWorkspace } from "@/store/workspace";

// Fabric.js SSR 불가 — 슬라이드 탭은 클라이언트 전용 로드
const SlideWorkspace = dynamic(
  () => import("@/components/slides/SlideWorkspace").then((m) => m.SlideWorkspace),
  { ssr: false, loading: () => <div className="p-8 text-sm text-neutral-400">슬라이드 로딩 중…</div> },
);

export function Workspace() {
  const [remoteCollapsed, setRemoteCollapsed] = useState(false);
  const activeTab = useWorkspace((s) => s.activeTab);

  return (
    <div className="flex h-[calc(100vh-300px)] min-h-[640px] flex-col">
      <TopBar />
      <DocumentTabs />
      {activeTab === "slides" ? (
        <div className="flex-1 overflow-auto p-3">
          <SlideWorkspace />
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-12 gap-3 overflow-hidden p-3">
          <section className="col-span-4 flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <Editor />
          </section>
          <section className="col-span-5 flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <PreviewPane />
          </section>
          <section
            className={`flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${
              remoteCollapsed ? "col-span-1" : "col-span-3"
            }`}
          >
            <RemoteControl
              collapsed={remoteCollapsed}
              onToggleCollapse={() => setRemoteCollapsed((v) => !v)}
            />
          </section>
        </div>
      )}
      <ChatPanel />
    </div>
  );
}
```

주의: `SlideWorkspace`는 Task 5에서 생성한다. 이 시점에는 임시 스텁을 만들어 빌드를 깨지 않는다 — `apps/frontend/src/components/slides/SlideWorkspace.tsx`:

```tsx
"use client";

export function SlideWorkspace() {
  return <div className="p-8 text-sm text-neutral-400">슬라이드 탭 — Task 5에서 통합</div>;
}
```

- [ ] **Step 7: 타입체크 + 전체 프론트 테스트**

Run: `cd apps/frontend && npx tsc --noEmit && npx jest --watchAll=false`
Expected: 타입 오류 0, 기존 테스트 + 신규 2건 PASS

- [ ] **Step 8: 커밋**

```bash
git add apps/frontend/src/store apps/frontend/src/components/shell apps/frontend/src/components/Workspace.tsx apps/frontend/src/components/slides/SlideWorkspace.tsx
git commit -m "feat(shell): 문서/슬라이드 탭 셸 + activeTab·pageCount 스토어"
```

---

### Task 2: CodeMirror 6 에디터 + editorCommands

**Files:**
- Modify: `apps/frontend/package.json` (의존성)
- Create: `apps/frontend/src/lib/editorCommands.ts`
- Create: `apps/frontend/src/components/editor/MarkdownEditor.tsx`
- Modify: `apps/frontend/src/components/editor/Editor.tsx:83-155` (textarea 영역)
- Modify: `apps/frontend/src/components/editor/InsertVisualBar.tsx:446-506` (onInsert prop)
- Test: `apps/frontend/src/lib/__tests__/editorCommands.test.ts`

- [ ] **Step 1: CodeMirror 의존성 설치**

Run: `cd apps/frontend && npm install @codemirror/state@^6 @codemirror/view@^6 @codemirror/language@^6 @codemirror/commands@^6 @codemirror/lang-markdown@^6`
Expected: package.json dependencies에 5개 패키지 추가.

- [ ] **Step 2: editorCommands 실패 테스트 작성**

`apps/frontend/src/lib/__tests__/editorCommands.test.ts` 생성. CodeMirror는 jsdom에서 EditorView 생성이 가능하다(측정 API는 안 쓰므로):

```ts
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  registerEditorView,
  wrapSelection,
  insertAtCursor,
  insertBlock,
  setHeadingLevel,
} from "../editorCommands";

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
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd apps/frontend && npx jest src/lib/__tests__/editorCommands.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 4: editorCommands 구현**

`apps/frontend/src/lib/editorCommands.ts` 생성:

```ts
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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd apps/frontend && npx jest src/lib/__tests__/editorCommands.test.ts`
Expected: PASS (7 tests)

jsdom에서 `EditorView` 생성 시 `document.createRange` 관련 오류가 나면 `jest.setup.ts`에 아래 폴리필 추가:

```ts
// CodeMirror in jsdom
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect;
}
```

- [ ] **Step 6: MarkdownEditor 컴포넌트 작성**

`apps/frontend/src/components/editor/MarkdownEditor.tsx` 생성:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

import { registerEditorView, wrapSelection } from "@/lib/editorCommands";
import { useWorkspace } from "@/store/workspace";

const formatKeymap = keymap.of([
  { key: "Mod-b", run: () => (wrapSelection("**"), true) },
  { key: "Mod-i", run: () => (wrapSelection("*"), true) },
  { key: "Mod-u", run: () => (wrapSelection("<u>", "</u>"), true) },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-scroller": { fontFamily: "var(--font-mono, ui-monospace, monospace)", lineHeight: "1.7" },
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
```

- [ ] **Step 7: Editor.tsx에서 textarea 교체**

`apps/frontend/src/components/editor/Editor.tsx` 수정:

1. import 추가: `import { MarkdownEditor } from "@/components/editor/MarkdownEditor";` / `import { insertBlock } from "@/lib/editorCommands";`
2. `const taRef = useRef<HTMLTextAreaElement>(null);` 삭제 (관련 import 정리).
3. `<InsertVisualBar textareaRef={taRef} />` → `<InsertVisualBar onInsert={insertBlock} />`
4. 디바운스 2500 → **1000** (`setTimeout(..., 1000)`).
5. textarea 블록(84~91행)을 다음으로 교체:

```tsx
        <MarkdownEditor placeholderText="① 템플릿 선택 → ② AI 채팅에 요청 → ③ 변환" />
```

빈 상태 안내 카드(`source.length === 0 && …`)는 그대로 유지 — CodeMirror 위 오버레이로 동작.

- [ ] **Step 8: InsertVisualBar에 onInsert prop 추가**

`apps/frontend/src/components/editor/InsertVisualBar.tsx` 수정:

```tsx
interface InsertVisualBarProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  /** v3: CodeMirror 등 외부 에디터로의 삽입 함수. 지정 시 textareaRef보다 우선. */
  onInsert?: (snippet: string) => void;
}

export function InsertVisualBar({ textareaRef, onInsert }: InsertVisualBarProps = {}) {
```

내부 `insertAtCursor(snippet: string)` 함수(505행 부근) 맨 앞에 추가:

```tsx
    if (onInsert) {
      onInsert(snippet);
      return;
    }
```

992행 부근의 `textareaRef?.current` 직접 사용부도 동일하게 `onInsert` 우선 분기를 적용한다 (해당 함수 상단에서 `if (onInsert) { onInsert(...); return; }`).

- [ ] **Step 9: 수동 확인 + 전체 테스트**

Run: `cd apps/frontend && npx tsc --noEmit && npx jest --watchAll=false`
Expected: PASS. 이어서 `npm run dev` 후 브라우저에서: 구문 강조 표시, Ctrl+B 굵게, 템플릿 로드 시 에디터 반영, 표 삽입 버튼 동작 확인.

- [ ] **Step 10: 커밋**

```bash
git add apps/frontend/package.json apps/frontend/package-lock.json apps/frontend/src/lib apps/frontend/src/components/editor apps/frontend/jest.setup.ts
git commit -m "feat(editor): CodeMirror 6 마크다운 에디터 + editorCommands 레지스트리"
```

---

### Task 3: 메뉴바 + 리본 툴바 + 내보내기 드롭다운

**Files:**
- Create: `apps/frontend/src/lib/download.ts`
- Create: `apps/frontend/src/components/shell/ExportMenu.tsx`
- Create: `apps/frontend/src/components/shell/MenuBar.tsx`
- Create: `apps/frontend/src/components/shell/RibbonToolbar.tsx`
- Modify: `apps/frontend/src/lib/api.ts:350` (downloadUrl)
- Modify: `apps/frontend/src/components/Workspace.tsx` (셸 배치)
- Test: `apps/frontend/src/lib/__tests__/download.test.ts`

- [ ] **Step 1: .md 다운로드 실패 테스트 작성**

`apps/frontend/src/lib/__tests__/download.test.ts` 생성:

```ts
import { downloadMarkdown } from "../download";

describe("downloadMarkdown", () => {
  it("Blob URL을 만들어 a[download]를 클릭한다", () => {
    const createObjectURL = jest.fn(() => "blob:fake");
    const revokeObjectURL = jest.fn();
    Object.defineProperty(window.URL, "createObjectURL", { value: createObjectURL, writable: true });
    Object.defineProperty(window.URL, "revokeObjectURL", { value: revokeObjectURL, writable: true });
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadMarkdown("# hello", "보고서");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/markdown;charset=utf-8");
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    click.mockRestore();
  });

  it("파일명이 비면 document.md", () => {
    const created: string[] = [];
    Object.defineProperty(window.URL, "createObjectURL", { value: () => "blob:x", writable: true });
    Object.defineProperty(window.URL, "revokeObjectURL", { value: () => {}, writable: true });
    let anchor: HTMLAnchorElement | null = null;
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      anchor = this;
    });
    downloadMarkdown("x", "");
    expect(anchor!.download).toBe("document.md");
    click.mockRestore();
    void created;
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/frontend && npx jest src/lib/__tests__/download.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: download.ts 구현**

`apps/frontend/src/lib/download.ts` 생성:

```ts
/** 현재 에디터 소스를 .md 파일로 즉시 다운로드 — 백엔드 불필요. */
export function downloadMarkdown(source: string, title: string): void {
  const name = (title || "document").trim().replace(/[\\/:*?"<>|]/g, "_") || "document";
  const blob = new Blob([source], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/frontend && npx jest src/lib/__tests__/download.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: downloadUrl에 hwp 추가**

`apps/frontend/src/lib/api.ts` 350행:

```ts
export function downloadUrl(documentId: string, fmt: "docx" | "hwpx" | "hwp" | "pdf") {
  return `${BASE}/render/${documentId}/${fmt}`;
}
```

- [ ] **Step 6: ExportMenu 작성**

`apps/frontend/src/components/shell/ExportMenu.tsx` 생성:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ChevronDown } from "lucide-react";

import { downloadUrl } from "@/lib/api";
import { downloadMarkdown } from "@/lib/download";
import { useWorkspace } from "@/store/workspace";

const BACKEND_FORMATS = [
  { fmt: "hwpx" as const, label: "한글 문서 (.hwpx)" },
  { fmt: "hwp" as const, label: "한글 97-2010 (.hwp) — 베타" },
  { fmt: "docx" as const, label: "Word 문서 (.docx)" },
  { fmt: "pdf" as const, label: "PDF (.pdf)" },
];

export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const preview = useWorkspace((s) => s.preview);
  const source = useWorkspace((s) => s.source);
  const title = useWorkspace((s) => s.title);
  const setActiveTab = useWorkspace((s) => s.setActiveTab);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const documentId = preview?.document_id ?? null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand/90"
      >
        <Download size={12} />
        내보내기
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {BACKEND_FORMATS.map(({ fmt, label }) => (
            <a
              key={fmt}
              href={documentId ? downloadUrl(documentId, fmt) : undefined}
              aria-disabled={!documentId}
              onClick={(e) => { if (!documentId) e.preventDefault(); setOpen(false); }}
              className={`block px-3 py-1.5 text-xs ${
                documentId
                  ? "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  : "cursor-not-allowed text-neutral-300 dark:text-neutral-600"
              }`}
              title={documentId ? undefined : "먼저 변환(Ctrl+Enter)을 실행하세요"}
            >
              {label}
            </a>
          ))}
          <button
            onClick={() => { downloadMarkdown(source, title); setOpen(false); }}
            disabled={!source.trim()}
            className="block w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-300 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            마크다운 (.md)
          </button>
          <button
            onClick={() => {
              try { sessionStorage.setItem("docuax_slide_prefill", source); } catch {}
              setActiveTab("slides");
              setOpen(false);
            }}
            disabled={!source.trim()}
            className="block w-full border-t border-neutral-100 px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-300 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            프레젠테이션 (.pptx) — 슬라이드 탭으로
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: MenuBar 작성**

`apps/frontend/src/components/shell/MenuBar.tsx` 생성. 메뉴는 클릭 시 열리는 드롭다운, 각 항목은 editorCommands 또는 기존 CustomEvent를 호출한다:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { undo, redo } from "@codemirror/commands";

import { getEditorView, insertBlock, setHeadingLevel, wrapSelection } from "@/lib/editorCommands";
import { downloadMarkdown } from "@/lib/download";
import { useWorkspace } from "@/store/workspace";
import { ExportMenu } from "./ExportMenu";

type MenuItem = { label: string; action: () => void } | "divider";

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const source = useWorkspace((s) => s.source);
  const title = useWorkspace((s) => s.title);
  const resetWorkspace = useWorkspace((s) => s.resetWorkspace);
  const setActiveTab = useWorkspace((s) => s.setActiveTab);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const withEditor = (fn: (v: NonNullable<ReturnType<typeof getEditorView>>) => void) => () => {
    const v = getEditorView();
    if (v) fn(v);
  };

  const MENUS: Record<string, MenuItem[]> = {
    파일: [
      { label: "새 문서", action: () => { if (confirm("에디터 내용을 초기화할까요?")) resetWorkspace(); } },
      { label: "마크다운으로 저장 (.md)", action: () => downloadMarkdown(source, title) },
    ],
    편집: [
      { label: "실행 취소 (Ctrl+Z)", action: withEditor((v) => undo(v)) },
      { label: "다시 실행 (Ctrl+Y)", action: withEditor((v) => redo(v)) },
    ],
    서식: [
      { label: "제목 1", action: () => setHeadingLevel(1) },
      { label: "제목 2", action: () => setHeadingLevel(2) },
      { label: "제목 3", action: () => setHeadingLevel(3) },
      { label: "본문", action: () => setHeadingLevel(0) },
      "divider",
      { label: "굵게 (Ctrl+B)", action: () => wrapSelection("**") },
      { label: "기울임 (Ctrl+I)", action: () => wrapSelection("*") },
      { label: "밑줄 (Ctrl+U)", action: () => wrapSelection("<u>", "</u>") },
    ],
    삽입: [
      { label: "표 (3×3)", action: () => insertBlock("| 항목 | 내용 | 비고 |\n|------|------|------|\n|      |      |      |\n|      |      |      |") },
      { label: "구분선", action: () => insertBlock("---") },
      { label: "인용", action: () => insertBlock("> 인용문") },
    ],
    도구: [
      { label: "변환 실행 (Ctrl+Enter)", action: () => window.dispatchEvent(new CustomEvent("docuax:auto-convert")) },
      { label: "슬라이드 탭으로", action: () => setActiveTab("slides") },
    ],
  };

  return (
    <div ref={ref} className="flex items-center gap-0.5 border-b border-neutral-200 bg-neutral-50 px-2 py-0.5 dark:border-neutral-800 dark:bg-neutral-950">
      {Object.entries(MENUS).map(([name, items]) => (
        <div key={name} className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === name ? null : name)}
            onMouseEnter={() => { if (openMenu) setOpenMenu(name); }}
            className={`rounded px-2.5 py-1 text-xs ${
              openMenu === name
                ? "bg-neutral-200 dark:bg-neutral-800"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            }`}
          >
            {name}
          </button>
          {openMenu === name && (
            <div className="absolute left-0 top-full z-40 mt-0.5 w-52 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
              {items.map((item, i) =>
                item === "divider" ? (
                  <div key={i} className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
                ) : (
                  <button
                    key={item.label}
                    onClick={() => { item.action(); setOpenMenu(null); }}
                    className="block w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    {item.label}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
      <div className="ml-auto">
        <ExportMenu />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: RibbonToolbar 작성**

`apps/frontend/src/components/shell/RibbonToolbar.tsx` 생성:

```tsx
"use client";

import {
  Bold, Italic, Underline, Strikethrough,
  Heading1, Heading2, Heading3, Pilcrow,
  List, ListOrdered, Quote, Minus, Table, Link as LinkIcon,
  Sparkles, Presentation,
} from "lucide-react";

import { insertBlock, setHeadingLevel, toggleListMarker, wrapSelection } from "@/lib/editorCommands";
import { useWorkspace } from "@/store/workspace";

function RibbonButton({ title, onClick, children }: {
  title: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />;
}

export function RibbonToolbar() {
  const source = useWorkspace((s) => s.source);
  const setActiveTab = useWorkspace((s) => s.setActiveTab);

  const toSlides = () => {
    try { sessionStorage.setItem("docuax_slide_prefill", source); } catch {}
    setActiveTab("slides");
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-neutral-200 bg-white px-2 py-1 dark:border-neutral-800 dark:bg-neutral-900">
      <RibbonButton title="제목 1" onClick={() => setHeadingLevel(1)}><Heading1 size={15} /></RibbonButton>
      <RibbonButton title="제목 2" onClick={() => setHeadingLevel(2)}><Heading2 size={15} /></RibbonButton>
      <RibbonButton title="제목 3" onClick={() => setHeadingLevel(3)}><Heading3 size={15} /></RibbonButton>
      <RibbonButton title="본문" onClick={() => setHeadingLevel(0)}><Pilcrow size={15} /></RibbonButton>
      <Divider />
      <RibbonButton title="굵게 (Ctrl+B)" onClick={() => wrapSelection("**")}><Bold size={15} /></RibbonButton>
      <RibbonButton title="기울임 (Ctrl+I)" onClick={() => wrapSelection("*")}><Italic size={15} /></RibbonButton>
      <RibbonButton title="밑줄 (Ctrl+U)" onClick={() => wrapSelection("<u>", "</u>")}><Underline size={15} /></RibbonButton>
      <RibbonButton title="취소선" onClick={() => wrapSelection("~~")}><Strikethrough size={15} /></RibbonButton>
      <Divider />
      <RibbonButton title="글머리 목록" onClick={() => toggleListMarker("- ")}><List size={15} /></RibbonButton>
      <RibbonButton title="번호 목록" onClick={() => toggleListMarker("1. ")}><ListOrdered size={15} /></RibbonButton>
      <RibbonButton title="인용" onClick={() => insertBlock("> 인용문")}><Quote size={15} /></RibbonButton>
      <RibbonButton title="구분선" onClick={() => insertBlock("---")}><Minus size={15} /></RibbonButton>
      <Divider />
      <RibbonButton
        title="표 삽입 (3×3)"
        onClick={() => insertBlock("| 항목 | 내용 | 비고 |\n|------|------|------|\n|      |      |      |\n|      |      |      |")}
      >
        <Table size={15} />
      </RibbonButton>
      <RibbonButton title="링크" onClick={() => wrapSelection("[", "](url)")}><LinkIcon size={15} /></RibbonButton>
      <Divider />
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("docuax:auto-convert"))}
        className="flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
      >
        <Sparkles size={12} /> AI 변환·검토
      </button>
      <button
        onClick={toSlides}
        className="flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
      >
        <Presentation size={12} /> 슬라이드로 변환
      </button>
    </div>
  );
}
```

참고: 기존 `InsertVisualBar`(표지·이미지·차트·다이어그램·수식)는 에디터 상단에 그대로 남는다 — 리본은 서식/기본 삽입, InsertVisualBar는 시각 요소 담당으로 역할이 겹치지 않는다.

- [ ] **Step 9: Workspace에 MenuBar·RibbonToolbar 배치**

`apps/frontend/src/components/Workspace.tsx`의 `<TopBar />`와 `<DocumentTabs />` 사이에 삽입:

```tsx
      <TopBar />
      <MenuBar />
      <DocumentTabs />
```

문서 탭 분기(`activeTab === "slides" ? … :`)의 에디터/미리보기 grid 바로 위(문서 탭일 때만)에 리본 추가 — grid를 flex-col로 감싼다:

```tsx
        <div className="flex flex-1 flex-col overflow-hidden">
          <RibbonToolbar />
          <div className="grid flex-1 grid-cols-12 gap-3 overflow-hidden p-3">
            {/* 기존 3개 section 그대로 */}
          </div>
        </div>
```

import 추가: `import { MenuBar } from "@/components/shell/MenuBar";` / `import { RibbonToolbar } from "@/components/shell/RibbonToolbar";`

- [ ] **Step 10: 타입체크·테스트·수동 확인**

Run: `cd apps/frontend && npx tsc --noEmit && npx jest --watchAll=false`
Expected: PASS. `npm run dev`로 메뉴 열림/닫힘, 리본 버튼 → 에디터 반영, 내보내기 드롭다운(변환 전 비활성) 확인.

- [ ] **Step 11: 커밋**

```bash
git add apps/frontend/src
git commit -m "feat(shell): 메뉴바·리본 툴바·내보내기 드롭다운(.md 다운로드 포함)"
```

---

### Task 4: A4 페이지 미리보기 + 상태바

**Files:**
- Create: `apps/frontend/src/components/preview/A4Sheet.tsx`
- Modify: `apps/frontend/src/components/preview/PreviewPane.tsx:1329-1382`
- Create: `apps/frontend/src/components/shell/StatusBar.tsx`
- Modify: `apps/frontend/src/components/Workspace.tsx`

- [ ] **Step 1: A4Sheet 작성**

A4 페이지 시뮬레이션: 콘텐츠를 A4 비율 종이 카드 위에 올리고, 페이지 경계선을 오버레이로 그린 뒤 총 쪽수를 스토어에 보고한다. (블록을 실제로 페이지별 분할하지 않는 근사 방식 — 설계서 3.3 참조.)

`apps/frontend/src/components/preview/A4Sheet.tsx` 생성:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useWorkspace } from "@/store/workspace";

/** A4 = 210×297mm. 화면 96dpi 기준 794×1123px. 상하 여백 각 60px 가정. */
const PAGE_HEIGHT = 1123;
const PAGE_CONTENT_HEIGHT = PAGE_HEIGHT - 120;

export function A4Sheet({ children }: { children: React.ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const setPageCount = useWorkspace((s) => s.setPageCount);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const pages = Math.max(1, Math.ceil(el.scrollHeight / PAGE_CONTENT_HEIGHT));
      setPageCount(pages);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [setPageCount]);

  return (
    <div className="flex justify-center bg-neutral-100 py-6 dark:bg-neutral-950">
      <div className="relative w-[794px] max-w-full bg-white shadow-md dark:bg-neutral-900">
        {/* 페이지 경계 가이드 — 콘텐츠 높이만큼 반복 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent, transparent calc(1123px - 1px), rgba(120,120,120,0.35) calc(1123px - 1px), rgba(120,120,120,0.35) 1123px)",
          }}
        />
        <div ref={innerRef} className="px-[60px] py-[60px]">
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: PreviewPane에 A4Sheet 적용**

`apps/frontend/src/components/preview/PreviewPane.tsx` 수정:

1. import 추가: `import { A4Sheet } from "./A4Sheet";`
2. 1329행 `<div className="h-full overflow-auto p-6">` → `<div className="h-full overflow-auto">` (패딩은 A4Sheet가 담당)
3. 1356행 부근 `{preview && (` 분기의 `<article>…</article>`를 A4Sheet로 감싼다:

```tsx
        {preview && (
          <A4Sheet>
            <article>
              {/* 기존 CoverPage·title·blocks.map 그대로 */}
            </article>
          </A4Sheet>
        )}
```

빈 상태 안내(`!preview && !busy`)와 `ConvertProgress`는 A4Sheet 밖(기존 위치)에 유지.

- [ ] **Step 3: StatusBar 작성**

`apps/frontend/src/components/shell/StatusBar.tsx` 생성:

```tsx
"use client";

import { useWorkspace } from "@/store/workspace";

const FORMATS = [".hwpx", ".hwp", ".docx", ".pdf", ".md", ".pptx"];

export function StatusBar() {
  const source = useWorkspace((s) => s.source);
  const pageCount = useWorkspace((s) => s.pageCount);
  const preview = useWorkspace((s) => s.preview);
  const busy = useWorkspace((s) => s.busy);

  return (
    <div className="flex items-center gap-3 border-t border-neutral-200 bg-neutral-50 px-3 py-1 text-[10px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
      <span>{source.length.toLocaleString()}자</span>
      {pageCount > 0 && <span>약 {pageCount}쪽</span>}
      {preview && <span>블록 {preview.blocks.length}개</span>}
      {busy && <span className="text-brand">변환 중…</span>}
      <span className="ml-auto flex gap-1">
        {FORMATS.map((f) => (
          <span key={f} className="rounded border border-neutral-200 px-1 py-px dark:border-neutral-700">{f}</span>
        ))}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Workspace에 StatusBar 배치**

`apps/frontend/src/components/Workspace.tsx`에서 `<ChatPanel />` 바로 위에 `<StatusBar />` 추가. import: `import { StatusBar } from "@/components/shell/StatusBar";`

- [ ] **Step 5: 확인 + 커밋**

Run: `cd apps/frontend && npx tsc --noEmit && npx jest --watchAll=false`
Expected: PASS. `npm run dev`에서: 변환 실행 → 미리보기가 흰 A4 종이 카드 위에 표시, 긴 문서에서 페이지 경계선 표시, 상태바에 "약 N쪽" 갱신.

```bash
git add apps/frontend/src/components/preview apps/frontend/src/components/shell/StatusBar.tsx apps/frontend/src/components/Workspace.tsx
git commit -m "feat(preview): A4 페이지 시뮬레이션 미리보기 + 상태바"
```

---

### Task 5: 슬라이드 탭 통합

**Files:**
- Modify: `apps/frontend/src/components/slides/SlideWorkspace.tssx` → 실제 구현으로 교체 (Task 1의 스텁)
- Modify: `apps/frontend/src/app/slides/page.tsx` → 얇은 래퍼로 축소

- [ ] **Step 1: app/slides/page.tsx 본문을 SlideWorkspace로 이동**

`apps/frontend/src/app/slides/page.tsx`의 `SlidesPage` 컴포넌트 본문(state·핸들러·JSX 전부)을 `apps/frontend/src/components/slides/SlideWorkspace.tsx`로 옮긴다. 파일 상단 구조:

```tsx
"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { SlideElement, SlideSchema } from "@/lib/slides/types";
import SlideGeneratorPanel from "@/components/slides/SlideGeneratorPanel";
import SlideThumbnails from "@/components/slides/SlideThumbnails";
import SlideToolbar from "@/components/slides/SlideToolbar";
import SlideExportButton from "@/components/slides/SlideExportButton";
import { saveSlide } from "@/lib/api";

const SlideEditor = dynamic(() => import("@/components/slides/SlideEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center bg-gray-100 rounded-lg text-sm text-gray-400" style={{ width: 960, height: 540 }}>
      에디터 로딩 중…
    </div>
  ),
});

// …(page.tsx의 EMPTY_SCHEMA·본문 로직 그대로)…

export function SlideWorkspace() {
  // page.tsx의 SlidesPage 본문 그대로
}
```

`apps/frontend/src/app/slides/page.tsx`는 하위 호환용 래퍼로 축소:

```tsx
"use client";

import { SlideWorkspace } from "@/components/slides/SlideWorkspace";

export default function SlidesPage() {
  return (
    <main className="p-4">
      <SlideWorkspace />
    </main>
  );
}
```

핵심: `SlideGeneratorPanel`은 마운트 시 `sessionStorage.getItem("docuax_slide_prefill")`을 읽어 문서 텍스트를 자동 채운다(기존 메커니즘, SlideGeneratorPanel.tsx:31-42). Workspace의 슬라이드 탭은 `activeTab === "slides"`일 때만 렌더되므로, 리본의 "슬라이드로 변환" → sessionStorage 기록 → 탭 전환 → 마운트 → 자동 채움이 그대로 성립한다.

- [ ] **Step 2: 탭 전환 시 문서 텍스트가 미리 채워지는지 수동 확인**

Run: `cd apps/frontend && npm run dev`
확인: 문서 탭에서 마크다운 입력 → 리본 "슬라이드로 변환" 클릭 → 슬라이드 탭으로 전환되고 생성 패널의 문서 텍스트란에 에디터 내용이 채워져 있음 → "생성" 클릭(백엔드 mock provider) → 슬라이드 표시 → PPTX 내보내기 버튼 동작.

- [ ] **Step 3: 타입체크·테스트·커밋**

Run: `cd apps/frontend && npx tsc --noEmit && npx jest --watchAll=false`
Expected: PASS

```bash
git add apps/frontend/src/components/slides apps/frontend/src/app/slides
git commit -m "feat(slides): 슬라이드 에디터를 워크스페이스 탭으로 통합"
```

---

### Task 6: HWP 5.0 바이너리 렌더러 (백엔드)

가장 위험도 높은 작업 — 다른 작업과 독립적. HWP 5.0은 OLE CFB 컨테이너 + zlib 압축 레코드 스트림 구조다. 참고 자료: 한컴 공개 스펙 「한글 문서 파일 형식 5.0」, `docs/legal/hwp-compatibility.md`의 정오표 27건, pyhwp 소스의 레코드 레이아웃.

**1차 지원 범위(설계서 3.5):** 문단·헤딩(굵기·크기로 표현)·굵게/기울임/밑줄·목록(마커 텍스트로)·기본 표(병합 없음). 이미지·차트·수식·다이어그램은 `[이미지: …]` 형태의 텍스트 대체로 강등. 강등 발생 시 렌더 결과는 유효 파일 + 경고 로그.

**검증 전략:** ① 자체 레코드 리더로 왕복 파싱, ② olefile로 CFB 구조 검증, ③ E2E에서 kordoc(프론트 HWP 파서)으로 열림 확인, ④ 한글 2020/2024 실기 확인(수동 체크리스트).

**Files:**
- Create: `apps/backend/app/renderers/hwp/__init__.py` (빈 파일)
- Create: `apps/backend/app/renderers/hwp/cfb_writer.py`
- Create: `apps/backend/app/renderers/hwp/records.py`
- Create: `apps/backend/app/renderers/hwp/docinfo.py`
- Create: `apps/backend/app/renderers/hwp/bodytext.py`
- Create: `apps/backend/app/renderers/hwp_renderer.py`
- Modify: `apps/backend/app/renderers/__init__.py`
- Test: `apps/backend/tests/test_cfb_writer.py`, `apps/backend/tests/test_hwp_renderer.py`

- [ ] **Step 1: CFB 라이터 실패 테스트 작성**

`apps/backend/tests/test_cfb_writer.py` 생성 (olefile은 이미 backend 의존성):

```python
import io

import olefile

from app.renderers.hwp.cfb_writer import CfbWriter


def _roundtrip(streams: dict[str, bytes]) -> olefile.OleFileIO:
    w = CfbWriter()
    for name, data in streams.items():
        w.add_stream(name, data)
    buf = io.BytesIO(w.build())
    return olefile.OleFileIO(buf)


def test_single_small_stream_roundtrip():
    ole = _roundtrip({"FileHeader": b"\x01" * 256})
    assert ole.exists("FileHeader")
    assert ole.openstream("FileHeader").read() == b"\x01" * 256


def test_large_stream_roundtrip():
    data = bytes(range(256)) * 64  # 16KiB — FAT 스트림 경로
    ole = _roundtrip({"BodyText/Section0": data})
    assert ole.openstream("BodyText/Section0").read() == data


def test_mixed_streams_and_storage():
    streams = {
        "FileHeader": b"H" * 256,           # < 4096 → ministream
        "DocInfo": b"D" * 5000,             # >= 4096 → FAT
        "BodyText/Section0": b"B" * 300,    # storage 하위 + ministream
    }
    ole = _roundtrip(streams)
    for name, data in streams.items():
        assert ole.openstream(name).read() == data


def test_empty_writer_is_valid_ole():
    ole = _roundtrip({})
    assert ole.listdir() == []
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/backend && python -m pytest tests/test_cfb_writer.py -x -q`
Expected: FAIL — `app.renderers.hwp` 모듈 없음.

- [ ] **Step 3: CFB 라이터 구현**

`apps/backend/app/renderers/hwp/__init__.py` 빈 파일 생성 후, `apps/backend/app/renderers/hwp/cfb_writer.py` 생성:

```python
"""최소 OLE CFB(Compound File Binary) 라이터.

HWP 5.0 컨테이너 생성 전용 — 범용 아님. 지원 범위:
- 512B 섹터, FAT/miniFAT, 1단계 스토리지(예: "BodyText/Section0")
- 4096B 미만 스트림은 ministream, 이상은 FAT 체인
olefile은 읽기 전용이라 직접 구현한다.
"""
from __future__ import annotations

import struct

SECTOR = 512
MINI_SECTOR = 64
MINI_CUTOFF = 4096
FREESECT = 0xFFFFFFFF
ENDOFCHAIN = 0xFFFFFFFE
FATSECT = 0xFFFFFFFD

RED = 0
BLACK = 1
TYPE_STORAGE = 1
TYPE_STREAM = 2
TYPE_ROOT = 5


class _Entry:
    def __init__(self, name: str, kind: int, data: bytes = b""):
        self.name = name
        self.kind = kind
        self.data = data
        self.children: dict[str, _Entry] = {}
        self.start = FREESECT
        self.size = 0
        # 디렉터리 트리 인덱스 (build 시 채움)
        self.index = -1
        self.left = 0xFFFFFFFF
        self.right = 0xFFFFFFFF
        self.child = 0xFFFFFFFF


class CfbWriter:
    def __init__(self) -> None:
        self.root = _Entry("Root Entry", TYPE_ROOT)

    def add_stream(self, path: str, data: bytes) -> None:
        parts = path.split("/")
        node = self.root
        for storage_name in parts[:-1]:
            node = node.children.setdefault(storage_name, _Entry(storage_name, TYPE_STORAGE))
        node.children[parts[-1]] = _Entry(parts[-1], TYPE_STREAM, data)

    # ── 내부 헬퍼 ────────────────────────────────────────────────
    @staticmethod
    def _pad(data: bytes, unit: int) -> bytes:
        rem = len(data) % unit
        return data if rem == 0 else data + b"\x00" * (unit - rem)

    def _collect(self) -> list[_Entry]:
        """디렉터리 엔트리를 평탄화. 각 storage의 child 포인터를 채운다."""
        entries: list[_Entry] = []

        def visit(e: _Entry) -> None:
            e.index = len(entries)
            entries.append(e)
            kids = sorted(e.children.values(), key=lambda k: (len(k.name), k.name.upper()))
            for k in kids:
                visit(k)
            if kids:
                # 단순화: 자식들을 오른쪽 편향 체인으로 연결 (red-black 불변식은 리더들이 강제하지 않음)
                e.child = kids[0].index
                for a, b in zip(kids, kids[1:]):
                    a.right = b.index

        visit(self.root)
        return entries

    def build(self) -> bytes:
        entries = self._collect()

        # 1) ministream 조립 (miniFAT 체인 포함)
        mini_data = bytearray()
        minifat: list[int] = []
        for e in entries:
            if e.kind == TYPE_STREAM and 0 < len(e.data) < MINI_CUTOFF:
                start = len(minifat)
                padded = self._pad(e.data, MINI_SECTOR)
                n = len(padded) // MINI_SECTOR
                mini_data += padded
                minifat.extend(list(range(start + 1, start + n)) + [ENDOFCHAIN])
                e.start, e.size = start, len(e.data)
            elif e.kind == TYPE_STREAM and len(e.data) == 0:
                e.start, e.size = ENDOFCHAIN, 0

        # 2) FAT 스트림 배치 계획: [big streams][ministream][miniFAT sectors][directory]
        big_streams = [e for e in entries if e.kind == TYPE_STREAM and len(e.data) >= MINI_CUTOFF]
        payload = bytearray()
        fat: list[int] = []

        def append_chain(data: bytes) -> int:
            padded = self._pad(data, SECTOR)
            n = len(padded) // SECTOR
            first = len(fat)
            payload.extend(padded)
            fat.extend(list(range(first + 1, first + n)) + [ENDOFCHAIN])
            return first

        for e in big_streams:
            e.start = append_chain(e.data)
            e.size = len(e.data)

        mini_bytes = bytes(mini_data)
        root_start = append_chain(mini_bytes) if mini_bytes else ENDOFCHAIN
        self.root.start, self.root.size = root_start, len(mini_bytes)

        minifat_bytes = b"".join(struct.pack("<I", v) for v in minifat)
        minifat_start = append_chain(minifat_bytes) if minifat else ENDOFCHAIN
        num_minifat_sectors = (len(self._pad(minifat_bytes, SECTOR)) // SECTOR) if minifat else 0

        dir_bytes = b"".join(self._dir_entry(e) for e in entries)
        dir_start = append_chain(dir_bytes)

        # 3) FAT 자체 섹터 배치 (FAT는 자기 자신도 FATSECT로 표기)
        # 반복 수렴: FAT 섹터 수가 안정될 때까지
        num_fat = 1
        while True:
            total_sectors = len(fat) + num_fat
            need = (total_sectors * 4 + SECTOR - 1) // SECTOR
            if need == num_fat:
                break
            num_fat = need
        fat_start = len(fat)
        full_fat = fat + [FATSECT] * num_fat
        fat_bytes = self._pad(b"".join(struct.pack("<I", v) for v in full_fat), SECTOR)
        # DIFAT(헤더 내 109개)로 충분한 크기만 지원
        if num_fat > 109:
            raise ValueError("stream too large for minimal CFB writer")

        # 4) 헤더
        header = struct.pack(
            "<8s16sHHHHHHIIIIIIIII",
            b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",  # signature
            b"\x00" * 16,                          # CLSID
            0x003E, 0x0003,                        # minor, major(3 = 512B)
            0xFFFE,                                # little-endian
            9, 6,                                  # sector shift 512, mini shift 64
            0,                                     # reserved
            0, 0,                                  # reserved, num dir sectors(v3=0)
            num_fat,                               # number of FAT sectors
            dir_start,                             # directory start sector
            0,                                     # transaction
            MINI_CUTOFF,                           # mini stream cutoff
            minifat_start if minifat else ENDOFCHAIN,
            num_minifat_sectors,
            ENDOFCHAIN,                            # DIFAT start
            0,                                     # number of DIFAT sectors
        )
        difat = [fat_start + i for i in range(num_fat)] + [FREESECT] * (109 - num_fat)
        header += b"".join(struct.pack("<I", v) for v in difat)
        assert len(header) == SECTOR

        return header + bytes(payload) + fat_bytes

    def _dir_entry(self, e: _Entry) -> bytes:
        name_utf16 = e.name.encode("utf-16-le") + b"\x00\x00"
        if len(name_utf16) > 64:
            raise ValueError(f"entry name too long: {e.name}")
        name_buf = name_utf16 + b"\x00" * (64 - len(name_utf16))
        return struct.pack(
            "<64sHBBIII16sIQQIIH2x",
            name_buf,
            len(name_utf16),
            e.kind,
            BLACK,
            e.left, e.right, e.child,
            b"\x00" * 16,   # CLSID
            0,              # state bits
            0, 0,           # 생성/수정 시간
            e.start if e.start != FREESECT else ENDOFCHAIN,
            e.size,
            0,
        )
```

주의: struct 포맷 문자열의 필드 수·바이트 수(디렉터리 엔트리 = 정확히 128B, 헤더 = 512B)는 테스트가 검증한다. `assert` 실패 시 포맷 문자열부터 확인할 것.

- [ ] **Step 4: CFB 테스트 통과까지 반복**

Run: `cd apps/backend && python -m pytest tests/test_cfb_writer.py -x -q`
Expected: PASS (4 tests). olefile이 파싱 오류를 내면 헤더 필드 순서/DIFAT/FAT 자기참조부터 점검.

- [ ] **Step 5: 커밋**

```bash
git add apps/backend/app/renderers/hwp apps/backend/tests/test_cfb_writer.py
git commit -m "feat(hwp): 최소 OLE CFB 컨테이너 라이터 + olefile 왕복 테스트"
```

- [ ] **Step 6: 레코드 인코딩 + 렌더러 실패 테스트 작성**

`apps/backend/tests/test_hwp_renderer.py` 생성:

```python
import io
import struct
import zlib
from pathlib import Path

import olefile
import pytest

from app.pipeline.ir import Block, BlockType, DocumentIR, InlineRun, Table, TableCell
from app.renderers.hwp.records import iter_records, record
from app.renderers.hwp_renderer import HwpRenderer


def _make_ir(blocks: list[Block]) -> DocumentIR:
    return DocumentIR(document_id="doc-test", title="테스트 문서", blocks=blocks)


def _render_to_ole(ir: DocumentIR, tmp_path: Path) -> olefile.OleFileIO:
    out = HwpRenderer().render(ir, tmp_path / "out.hwp")
    return olefile.OleFileIO(str(out))


def _decompress(raw: bytes) -> bytes:
    return zlib.decompress(raw, -15)


def test_record_header_roundtrip():
    payload = b"\x01\x02\x03"
    encoded = record(66, 0, payload)
    ((tag, level, data),) = list(iter_records(encoded))
    assert (tag, level, data) == (66, 0, payload)


def test_record_large_payload_uses_extended_size():
    payload = b"x" * 5000  # > 0xFFF → 확장 크기 필드
    encoded = record(67, 1, payload)
    ((tag, level, data),) = list(iter_records(encoded))
    assert (tag, level) == (67, 1)
    assert data == payload


def test_fileheader_signature_and_flags(tmp_path):
    ir = _make_ir([Block(id="blk-0001", type=BlockType.PARAGRAPH, runs=[InlineRun(text="안녕")])])
    ole = _render_to_ole(ir, tmp_path)
    fh = ole.openstream("FileHeader").read()
    assert fh[:17] == b"HWP Document File"
    assert len(fh) == 256
    flags = struct.unpack("<I", fh[36:40])[0]
    assert flags & 0x1  # 압축 플래그

def test_streams_exist_and_decompress(tmp_path):
    ir = _make_ir([Block(id="blk-0001", type=BlockType.PARAGRAPH, runs=[InlineRun(text="본문")])])
    ole = _render_to_ole(ir, tmp_path)
    for name in ("DocInfo", "BodyText/Section0"):
        assert ole.exists(name)
        assert len(_decompress(ole.openstream(name).read())) > 0


def test_paragraph_text_present_in_bodytext(tmp_path):
    ir = _make_ir([
        Block(id="blk-0001", type=BlockType.PARAGRAPH, runs=[InlineRun(text="첫 문단입니다")]),
        Block(id="blk-0002", type=BlockType.PARAGRAPH, runs=[InlineRun(text="둘째 문단", bold=True)]),
    ])
    ole = _render_to_ole(ir, tmp_path)
    body = _decompress(ole.openstream("BodyText/Section0").read())
    assert "첫 문단입니다".encode("utf-16-le") in body
    assert "둘째 문단".encode("utf-16-le") in body


def test_bold_run_creates_second_charshape(tmp_path):
    ir = _make_ir([Block(id="blk-0001", type=BlockType.PARAGRAPH,
                         runs=[InlineRun(text="일반 "), InlineRun(text="굵게", bold=True)])])
    ole = _render_to_ole(ir, tmp_path)
    doc = _decompress(ole.openstream("DocInfo").read())
    HWPTAG_CHAR_SHAPE = 0x15 + 6  # HWPTAG_BEGIN(16) + 5 = 21
    char_shapes = [r for r in iter_records(doc) if r[0] == 21]
    assert len(char_shapes) >= 2  # 기본 + 굵게


def test_unsupported_block_degrades_to_text(tmp_path):
    from app.pipeline.ir import EquationData
    ir = _make_ir([Block(id="blk-0001", type=BlockType.EQUATION,
                         equation=EquationData(latex="E=mc^2"))])
    renderer = HwpRenderer()
    out = renderer.render(ir, tmp_path / "eq.hwp")
    body = _decompress(olefile.OleFileIO(str(out)).openstream("BodyText/Section0").read())
    assert "[수식: E=mc^2]".encode("utf-16-le") in body
    assert renderer.warnings  # 강등 경고 기록


def test_basic_table_renders(tmp_path):
    table = Table(rows=[
        [TableCell(runs=[InlineRun(text="헤더1")]), TableCell(runs=[InlineRun(text="헤더2")])],
        [TableCell(runs=[InlineRun(text="값1")]), TableCell(runs=[InlineRun(text="값2")])],
    ])
    ir = _make_ir([Block(id="blk-0001", type=BlockType.TABLE, table=table)])
    ole = _render_to_ole(ir, tmp_path)
    body = _decompress(ole.openstream("BodyText/Section0").read())
    assert "헤더1".encode("utf-16-le") in body
    assert "값2".encode("utf-16-le") in body


def test_get_renderer_registers_hwp():
    from app.renderers import get_renderer
    r = get_renderer("hwp")
    assert r.extension == ".hwp"
    assert r.mime == "application/x-hwp"
```

주의: `test_bold_run_creates_second_charshape`의 `HWPTAG_CHAR_SHAPE` 라인은 상수 확인용 주석이 계산과 어긋난다 — 구현 시 records.py에 태그 상수를 정의하고 테스트에서 import하여 사용하도록 고친다 (`from app.renderers.hwp.records import HWPTAG_CHAR_SHAPE`).

- [ ] **Step 7: 테스트 실패 확인**

Run: `cd apps/backend && python -m pytest tests/test_hwp_renderer.py -x -q`
Expected: FAIL — records 모듈 없음.

- [ ] **Step 8: records.py 구현**

`apps/backend/app/renderers/hwp/records.py` 생성:

```python
"""HWP 5.0 레코드 인코딩/디코딩.

레코드 헤더 = uint32: tag(10bit) | level(10bit) | size(12bit).
size == 0xFFF 이면 뒤따르는 uint32가 실제 크기.
"""
from __future__ import annotations

import struct
from collections.abc import Iterator

HWPTAG_BEGIN = 0x010  # 16

# DocInfo
HWPTAG_DOCUMENT_PROPERTIES = HWPTAG_BEGIN + 0   # 16
HWPTAG_ID_MAPPINGS = HWPTAG_BEGIN + 1           # 17
HWPTAG_FACE_NAME = HWPTAG_BEGIN + 3             # 19
HWPTAG_BORDER_FILL = HWPTAG_BEGIN + 4           # 20
HWPTAG_CHAR_SHAPE = HWPTAG_BEGIN + 5            # 21
HWPTAG_TAB_DEF = HWPTAG_BEGIN + 6               # 22
HWPTAG_PARA_SHAPE = HWPTAG_BEGIN + 9            # 25
HWPTAG_STYLE = HWPTAG_BEGIN + 10                # 26

# BodyText
HWPTAG_PARA_HEADER = HWPTAG_BEGIN + 50          # 66
HWPTAG_PARA_TEXT = HWPTAG_BEGIN + 51            # 67
HWPTAG_PARA_CHAR_SHAPE = HWPTAG_BEGIN + 52      # 68
HWPTAG_PARA_LINE_SEG = HWPTAG_BEGIN + 53        # 69
HWPTAG_CTRL_HEADER = HWPTAG_BEGIN + 55          # 71
HWPTAG_LIST_HEADER = HWPTAG_BEGIN + 56          # 72
HWPTAG_PAGE_DEF = HWPTAG_BEGIN + 57             # 73
HWPTAG_FOOTNOTE_SHAPE = HWPTAG_BEGIN + 58       # 74
HWPTAG_PAGE_BORDER_FILL = HWPTAG_BEGIN + 59     # 75
HWPTAG_TABLE = HWPTAG_BEGIN + 61                # 77


def record(tag: int, level: int, payload: bytes) -> bytes:
    size = len(payload)
    if size < 0xFFF:
        header = struct.pack("<I", tag | (level << 10) | (size << 20))
        return header + payload
    header = struct.pack("<II", tag | (level << 10) | (0xFFF << 20), size)
    return header + payload


def iter_records(data: bytes) -> Iterator[tuple[int, int, bytes]]:
    pos = 0
    while pos + 4 <= len(data):
        (word,) = struct.unpack_from("<I", data, pos)
        pos += 4
        tag = word & 0x3FF
        level = (word >> 10) & 0x3FF
        size = (word >> 20) & 0xFFF
        if size == 0xFFF:
            (size,) = struct.unpack_from("<I", data, pos)
            pos += 4
        yield tag, level, data[pos : pos + size]
        pos += size
```

- [ ] **Step 9: 레코드 왕복 테스트 통과 확인**

Run: `cd apps/backend && python -m pytest tests/test_hwp_renderer.py::test_record_header_roundtrip tests/test_hwp_renderer.py::test_record_large_payload_uses_extended_size -q`
Expected: PASS (2 tests). 나머지는 여전히 FAIL(정상).

- [ ] **Step 10: docinfo.py 구현**

`apps/backend/app/renderers/hwp/docinfo.py` 생성. 대상 버전 5.0.3.0. 글꼴은 "함초롬바탕" 1종을 7개 언어 슬롯에 공유. CharShape는 IR의 (bold, italic, underline, font_size) 조합마다 1개씩 동적 생성:

```python
"""DocInfo 스트림 빌더 — 최소 레코드 셋.

CharShapeKey = (bold, italic, underline, size_pt) 튜플.
bodytext 빌더가 필요한 조합을 등록하면 등록 순서가 곧 charShapeId.
"""
from __future__ import annotations

import struct
from dataclasses import dataclass, field

from .records import (
    HWPTAG_BORDER_FILL,
    HWPTAG_CHAR_SHAPE,
    HWPTAG_DOCUMENT_PROPERTIES,
    HWPTAG_FACE_NAME,
    HWPTAG_ID_MAPPINGS,
    HWPTAG_PARA_SHAPE,
    HWPTAG_STYLE,
    HWPTAG_TAB_DEF,
    record,
)

FONT_NAME = "함초롬바탕"
CharShapeKey = tuple[bool, bool, bool, float]  # bold, italic, underline, size_pt
DEFAULT_KEY: CharShapeKey = (False, False, False, 10.0)


@dataclass
class DocInfoBuilder:
    char_shapes: list[CharShapeKey] = field(default_factory=lambda: [DEFAULT_KEY])

    def char_shape_id(self, key: CharShapeKey) -> int:
        if key not in self.char_shapes:
            self.char_shapes.append(key)
        return self.char_shapes.index(key)

    def build(self) -> bytes:
        out = bytearray()
        out += record(HWPTAG_DOCUMENT_PROPERTIES, 0, self._document_properties())
        out += record(HWPTAG_ID_MAPPINGS, 0, self._id_mappings())
        for _ in range(7):  # 한국어·영어·한자·일어·기타·기호·사용자 슬롯 공유
            out += record(HWPTAG_FACE_NAME, 1, self._face_name())
        out += record(HWPTAG_BORDER_FILL, 1, self._border_fill())
        for key in self.char_shapes:
            out += record(HWPTAG_CHAR_SHAPE, 1, self._char_shape(key))
        out += record(HWPTAG_TAB_DEF, 1, struct.pack("<IHH", 0, 0, 0))
        out += record(HWPTAG_PARA_SHAPE, 1, self._para_shape())
        out += record(HWPTAG_STYLE, 1, self._style())
        return bytes(out)

    @staticmethod
    def _document_properties() -> bytes:
        # 구역 수 1 + 시작 번호 6종 + 캐럿 위치(list/para/pos)
        return struct.pack("<H6H3I", 1, 1, 1, 1, 1, 1, 1, 0, 0, 0)

    def _id_mappings(self) -> bytes:
        counts = [
            0,                      # binData
            1, 1, 1, 1, 1, 1, 1,    # 글꼴 7개 언어
            1,                      # borderFill
            len(self.char_shapes),  # charShape
            1,                      # tabDef
            0,                      # numbering
            0,                      # bullet
            1,                      # paraShape
            1,                      # style
            0, 0, 0,                # memo, trackChange, trackChangeUser
        ]
        return b"".join(struct.pack("<I", c) for c in counts)

    @staticmethod
    def _face_name() -> bytes:
        name = FONT_NAME.encode("utf-16-le")
        return struct.pack("<BH", 0, len(FONT_NAME)) + name

    @staticmethod
    def _border_fill() -> bytes:
        # 테두리 4방향(type,width,color) + 대각선 + 채우기 없음
        side = struct.pack("<BBI", 0, 0, 0)
        return struct.pack("<H", 0) + side * 4 + struct.pack("<BBI", 0, 0, 0) + struct.pack("<I", 0)

    @staticmethod
    def _char_shape(key: CharShapeKey) -> bytes:
        bold, italic, underline, size_pt = key
        props = 0
        if italic:
            props |= 1 << 0
        if bold:
            props |= 1 << 1
        if underline:
            props |= 1 << 2  # 밑줄 종류: 아래(01)
        face_ids = struct.pack("<7H", *([0] * 7))
        ratios = struct.pack("<7B", *([100] * 7))
        spacings = struct.pack("<7b", *([0] * 7))
        rel_sizes = struct.pack("<7B", *([100] * 7))
        positions = struct.pack("<7b", *([0] * 7))
        base_size = struct.pack("<i", int(size_pt * 100))
        rest = struct.pack("<Ibb4I", props, 0, 0, 0x00000000, 0xFFFFFFFF, 0x00000000, 0x00000000)
        tail = struct.pack("<HI", 0, 0x00000000)  # borderFillId, strikeColor (5.0.2.1+)
        return face_ids + ratios + spacings + rel_sizes + positions + base_size + rest + tail

    @staticmethod
    def _para_shape() -> bytes:
        return struct.pack(
            "<IiiiiiiHHHhhhhIII",
            0x00000000,  # props1: 왼쪽 정렬·줄나눔 기본
            0, 0, 0, 0, 0,   # 여백·들여쓰기·문단 간격
            160,             # 줄 간격(%)
            0, 0, 0,         # tabDefId, numberingId, borderFillId
            0, 0, 0, 0,      # 테두리 여백 4방향
            0, 0, 0,         # props2, props3, 줄간격 종류(5.0.2.5+)
        )

    @staticmethod
    def _style() -> bytes:
        name = "바탕글".encode("utf-16-le")
        eng = b""
        return (
            struct.pack("<H", 3) + name
            + struct.pack("<H", 0) + eng
            + struct.pack("<BBHHHI", 0, 0, 0x0412, 0, 0, 0)
        )
```

- [ ] **Step 11: bodytext.py 구현**

`apps/backend/app/renderers/hwp/bodytext.py` 생성. 첫 문단에 구역 정의(secd)·단 정의(cold) 확장 컨트롤 필수:

```python
"""BodyText/Section0 스트림 빌더.

지원: 문단(runs, 굵게/기울임/밑줄/크기), 헤딩(크기+굵게로 표현),
목록(마커 텍스트), 기본 표(병합 없음). 그 외 블록은 to_plain_text()로 강등.
"""
from __future__ import annotations

import struct

from app.pipeline.ir import Block, BlockType, DocumentIR, InlineRun

from .docinfo import DocInfoBuilder
from .records import (
    HWPTAG_CTRL_HEADER,
    HWPTAG_FOOTNOTE_SHAPE,
    HWPTAG_LIST_HEADER,
    HWPTAG_PAGE_BORDER_FILL,
    HWPTAG_PAGE_DEF,
    HWPTAG_PARA_CHAR_SHAPE,
    HWPTAG_PARA_HEADER,
    HWPTAG_PARA_LINE_SEG,
    HWPTAG_TABLE,
    record,
)

HEADING_SIZES = {1: 16.0, 2: 14.0, 3: 12.0, 4: 11.0, 5: 10.5, 6: 10.0}
HWPUNIT_PER_PT = 100
A4_WIDTH = 59528   # HWPUNIT (210mm)
A4_HEIGHT = 84188  # 297mm
MARGIN = 8504      # 30mm

CTRL_SECD = int.from_bytes(b"dces", "little")
CTRL_COLD = int.from_bytes(b"dloc", "little")
CTRL_TABLE = int.from_bytes(b" lbt", "little")
EXTENDED_CTRL_CHAR = 2


def _ctrl_char(ctrl_id: int) -> str:
    """확장 컨트롤 문자 8 wchar: [2][ctrl_id 2 wchar][예약 4 wchar][2]"""
    body = struct.pack("<HI8xH", EXTENDED_CTRL_CHAR, ctrl_id, EXTENDED_CTRL_CHAR)
    return body.decode("utf-16-le")


class BodyTextBuilder:
    def __init__(self, docinfo: DocInfoBuilder):
        self.docinfo = docinfo
        self.warnings: list[str] = []

    # ── 문단 인코딩 ──────────────────────────────────────────────
    def _paragraph(
        self,
        runs: list[tuple[str, int]],  # (text, charShapeId)
        level: int = 0,
        ctrl_mask: int = 0,
        extra_records: bytes = b"",
        para_shape_id: int = 0,
    ) -> bytes:
        text = "".join(t for t, _ in runs)
        nchars = len(text.encode("utf-16-le")) // 2
        header = struct.pack(
            "<IIHBBHHHI",
            nchars,
            ctrl_mask,
            para_shape_id,
            0,      # styleId
            0,      # divide sort
            len(runs),
            0,      # range tag count
            1,      # line seg count
            0,      # instance id
        )
        out = bytearray()
        out += record(HWPTAG_PARA_HEADER, level, header)
        if nchars:
            out += record(HWPTAG_PARA_TEXT_TAG, level + 1, text.encode("utf-16-le"))
        shapes = bytearray()
        pos = 0
        for t, sid in runs:
            shapes += struct.pack("<II", pos, sid)
            pos += len(t.encode("utf-16-le")) // 2
        out += record(HWPTAG_PARA_CHAR_SHAPE, level + 1, bytes(shapes))
        # 라인 세그먼트 1개 (한글이 열 때 재계산)
        line_seg = struct.pack("<IiiiiiiiI", 0, 0, 1000, 800, 200, 1000, 0, A4_WIDTH - 2 * MARGIN, 0x00000000)
        out += record(HWPTAG_PARA_LINE_SEG, level + 1, line_seg)
        out += extra_records
        return bytes(out)

    # ── 구역 정의 (첫 문단 필수) ────────────────────────────────
    def _section_ctrl_records(self) -> bytes:
        out = bytearray()
        secd = struct.pack("<I", CTRL_SECD) + struct.pack(
            "<IHHHHIHHI", 0, 0, 0, 1, 1, 0, 0, 0, 0
        )
        out += record(HWPTAG_CTRL_HEADER, 1, secd)
        page_def = struct.pack(
            "<IIIIIIIII",
            A4_WIDTH, A4_HEIGHT,
            MARGIN, MARGIN, MARGIN, MARGIN,  # 좌·우·상·하
            4252, 4252,                       # 머리말·꼬리말
            0,                                # 제본 + 속성
        )
        out += record(HWPTAG_PAGE_DEF, 2, page_def)
        footnote = struct.pack("<I8xHHHHHHII", 0, 0, 0, 850, 567, 283, 0, 0, 0)
        out += record(HWPTAG_FOOTNOTE_SHAPE, 2, footnote)
        out += record(HWPTAG_FOOTNOTE_SHAPE, 2, footnote)
        pbf = struct.pack("<IHH", 0, 1, 0)
        for _ in range(3):
            out += record(HWPTAG_PAGE_BORDER_FILL, 2, pbf)
        cold = struct.pack("<I", CTRL_COLD) + struct.pack("<HHHH", 0, 1, 0, 0)
        out += record(HWPTAG_CTRL_HEADER, 1, cold)
        return bytes(out)

    # ── run 변환 ────────────────────────────────────────────────
    def _shape_runs(self, runs: list[InlineRun], size_override: float | None = None,
                    force_bold: bool = False) -> list[tuple[str, int]]:
        result: list[tuple[str, int]] = []
        for r in runs:
            size = size_override or r.font_size or 10.0
            sid = self.docinfo.char_shape_id((r.bold or force_bold, r.italic, r.underline, size))
            result.append((r.text, sid))
        return result or [("", 0)]

    # ── 블록 → 문단 ─────────────────────────────────────────────
    def _block_paragraphs(self, block: Block) -> bytes:
        if block.type == BlockType.HEADING:
            size = HEADING_SIZES.get(block.heading_level or 1, 12.0)
            return self._paragraph(self._shape_runs(block.runs, size_override=size, force_bold=True))
        if block.type == BlockType.LIST_ITEM and block.list_item:
            marker = block.list_item.bullet_marker + " "
            indent = "　" * getattr(block.list_item, "depth", 0)
            runs = [(indent + marker, 0)] + self._shape_runs(block.list_item.runs)
            return self._paragraph(runs)
        if block.type == BlockType.TABLE and block.table:
            return self._table_paragraph(block)
        if block.type in (BlockType.PARAGRAPH, BlockType.QUOTE, BlockType.CODE, BlockType.BOX):
            return self._paragraph(self._shape_runs(block.runs))
        # 이미지·차트·수식·다이어그램 → 텍스트 강등
        placeholder = block.to_plain_text()
        self.warnings.append(f"{block.id}: {block.type} 블록은 HWP에서 텍스트로 대체됨")
        sid = self.docinfo.char_shape_id((False, True, False, 9.0))
        return self._paragraph([(placeholder, sid)])

    # ── 표 ──────────────────────────────────────────────────────
    def _table_paragraph(self, block: Block) -> bytes:
        table = block.table
        assert table is not None
        n_rows, n_cols = table.row_count, table.col_count
        has_span = any(c.colspan > 1 or c.rowspan > 1 for row in table.rows for c in row)
        if has_span:
            self.warnings.append(f"{block.id}: 셀 병합 표는 텍스트로 대체됨")
            sid = self.docinfo.char_shape_id((False, False, False, 10.0))
            return self._paragraph([(block.to_plain_text(), sid)])

        cell_w = (A4_WIDTH - 2 * MARGIN) // max(1, n_cols)
        cell_h = 1000

        extra = bytearray()
        # CTRL_HEADER 'tbl ' — 공통 개체 속성
        obj = struct.pack(
            "<IIiiIIIIHHI",
            CTRL_TABLE,
            0x00000000,        # 속성: 글자처럼 취급 안 함(기본 흐름)
            0, 0,              # 세로/가로 오프셋
            cell_w * n_cols, cell_h * n_rows,
            0, 0,              # z-order·바깥 여백 상하
            0, 0, 0,           # 바깥 여백 좌우·instance id
        )
        extra += record(HWPTAG_CTRL_HEADER, 1, obj)
        # HWPTAG_TABLE
        tbl = struct.pack("<IHH", 0x00000000, n_rows, n_cols)
        tbl += struct.pack("<H", 100)          # cell spacing 0.1mm 단위? → 0
        tbl += struct.pack("<4H", 141, 141, 141, 141)  # 안쪽 여백
        tbl += struct.pack(f"<{n_rows}H", *([n_cols] * n_rows))
        tbl += struct.pack("<HH", 0, 0)        # border fill id, valid zone count
        extra += record(HWPTAG_TABLE, 2, tbl)
        # 각 셀: LIST_HEADER + 문단
        for ri, row in enumerate(table.rows):
            for ci, cell in enumerate(row):
                cell_runs = self._shape_runs(cell.runs)
                list_header = struct.pack(
                    "<hI HHHH HHHHH I",
                    1,              # 문단 수
                    0x00000000,     # 속성
                    ci, ri, 1, 1,   # col, row, colspan, rowspan
                    cell_w, cell_h,
                    141, 141, 141,  # 여백 좌·우·상
                    0,
                )
                extra += record(HWPTAG_LIST_HEADER, 2, list_header)
                extra += self._cell_paragraph(cell_runs)
        # 표 앵커 문단: 확장 컨트롤 문자 1개
        anchor_runs = [(_ctrl_char(CTRL_TABLE), 0)]
        return self._paragraph(anchor_runs, ctrl_mask=1 << 2, extra_records=bytes(extra))

    def _cell_paragraph(self, runs: list[tuple[str, int]]) -> bytes:
        return self._paragraph(runs, level=3)

    # ── 최종 빌드 ───────────────────────────────────────────────
    def build(self, ir: DocumentIR) -> bytes:
        out = bytearray()
        # 첫 문단: secd+cold 컨트롤 + 제목(있으면)
        first_text = _ctrl_char(CTRL_SECD) + _ctrl_char(CTRL_COLD)
        title_runs: list[tuple[str, int]] = [(first_text, 0)]
        if ir.title:
            sid = self.docinfo.char_shape_id((True, False, False, 16.0))
            title_runs.append((ir.title, sid))
        out += self._paragraph(title_runs, ctrl_mask=(1 << 2), extra_records=self._section_ctrl_records())
        for block in ir.blocks:
            out += self._block_paragraphs(block)
        return bytes(out)


# records.py의 PARA_TEXT 태그 별칭 (import 순환 회피용 지역 정의)
from .records import HWPTAG_PARA_TEXT as HWPTAG_PARA_TEXT_TAG  # noqa: E402
```

주의: 마지막 별칭 import는 파일 상단 import 블록으로 옮기고 `_paragraph`에서 직접 `HWPTAG_PARA_TEXT`를 사용하는 것으로 정리한다 (위 코드는 의도 표현 — 실제로는 상단에서 함께 import).

- [ ] **Step 12: hwp_renderer.py 구현 + 등록**

`apps/backend/app/renderers/hwp_renderer.py` 생성:

```python
"""HWP 5.0 바이너리(.hwp) 렌더러 — 1차 지원 범위는 설계서 3.5 참조.

한계: 이미지·차트·수식·다이어그램·셀 병합 표는 텍스트로 강등되며
warnings 리스트에 기록된다. 완전한 서식은 HWPX 사용 권장.
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

from app.pipeline.ir import DocumentIR
from app.renderers.base import Renderer
from app.renderers.hwp.bodytext import BodyTextBuilder
from app.renderers.hwp.cfb_writer import CfbWriter
from app.renderers.hwp.docinfo import DocInfoBuilder

SIGNATURE = b"HWP Document File"
VERSION = 0x05000300  # 5.0.3.0
FLAG_COMPRESSED = 0x1


def _compress(data: bytes) -> bytes:
    co = zlib.compressobj(level=6, wbits=-15)
    return co.compress(data) + co.flush()


class HwpRenderer(Renderer):
    extension = ".hwp"
    mime = "application/x-hwp"

    def __init__(self) -> None:
        self.warnings: list[str] = []

    def render(self, ir: DocumentIR, output_path: Path) -> Path:
        docinfo = DocInfoBuilder()
        body_builder = BodyTextBuilder(docinfo)
        body = body_builder.build(ir)       # 먼저 실행 — char shape 등록
        doc = docinfo.build()
        self.warnings = body_builder.warnings

        file_header = bytearray(256)
        file_header[0 : len(SIGNATURE)] = SIGNATURE
        file_header[32:36] = struct.pack("<I", VERSION)
        file_header[36:40] = struct.pack("<I", FLAG_COMPRESSED)

        writer = CfbWriter()
        writer.add_stream("FileHeader", bytes(file_header))
        writer.add_stream("DocInfo", _compress(doc))
        writer.add_stream("BodyText/Section0", _compress(body))

        output_path = output_path.with_suffix(".hwp")
        output_path.write_bytes(writer.build())
        return output_path
```

`apps/backend/app/renderers/__init__.py` 수정:

```python
from app.renderers.base import Renderer
from app.renderers.docx_renderer import DocxRenderer
from app.renderers.hwp_renderer import HwpRenderer
from app.renderers.hwpx_renderer import HwpxRenderer
from app.renderers.pdf_renderer import PdfRenderer

__all__ = ["DocxRenderer", "HwpRenderer", "HwpxRenderer", "PdfRenderer", "Renderer", "get_renderer"]


def get_renderer(fmt: str) -> Renderer:
    fmt = fmt.lower()
    if fmt == "docx":
        return DocxRenderer()
    if fmt == "hwpx":
        return HwpxRenderer()
    if fmt == "hwp":
        return HwpRenderer()
    if fmt == "pdf":
        return PdfRenderer()
    raise ValueError(f"지원하지 않는 포맷: {fmt}")
```

- [ ] **Step 13: 테스트 통과까지 반복 (핵심 단계)**

Run: `cd apps/backend && python -m pytest tests/test_hwp_renderer.py -x -q`
Expected: PASS (8 tests). struct 크기 불일치·레코드 파싱 실패가 나오면 records/iter_records로 왕복하며 바이트 레이아웃을 조정한다. **여기서 레이아웃이 확정되지 않으면 표 지원(_table_paragraph)을 텍스트 강등으로 임시 전환하고 진행 — 표는 후속 커밋으로.**

- [ ] **Step 14: 실기 검증 체크리스트 작성 + 전체 백엔드 테스트**

Run: `cd apps/backend && python -m pytest tests/ -q`
Expected: 기존 스위트 + 신규 전체 PASS.

`docs/superpowers/plans/hwp-manual-checklist.md` 생성:

```markdown
# HWP 바이너리 실기 검증 체크리스트
- [ ] 한글 2020/2024에서 생성 .hwp 열림 (오류 대화상자 없음)
- [ ] 제목·본문·굵게/기울임/밑줄 표시
- [ ] 기본 표 렌더링
- [ ] 프론트 HwpDropZone(kordoc)으로 재가져오기 성공
- 실패 시: UI 경고 + HWPX 대체 안내 확인
```

- [ ] **Step 15: 커밋**

```bash
git add apps/backend/app/renderers apps/backend/tests docs/superpowers/plans/hwp-manual-checklist.md
git commit -m "feat(hwp): HWP 5.0 바이너리 렌더러 — 문단·서식·기본 표, 미지원 요소 텍스트 강등"
```

---

### Task 7: 통합 검증 (E2E)

**Files:**
- Create: `apps/frontend/e2e/word-processor.spec.ts` (Playwright가 설정되어 있지 않으면 `npx playwright install chromium` + 최소 `playwright.config.ts` 추가)

- [ ] **Step 1: 백엔드·프론트 기동**

```bash
cd apps/backend && set LLM_PROVIDER=mock && uvicorn app.main:app --port 8000
cd apps/frontend && npm run dev
```

- [ ] **Step 2: E2E 시나리오 작성**

`apps/frontend/e2e/word-processor.spec.ts` 생성:

```ts
import { test, expect } from "@playwright/test";

test("입력 → 변환 → 미리보기 → 내보내기 6종", async ({ page }) => {
  await page.goto("http://localhost:3000");

  // 1. 에디터 입력 (CodeMirror)
  await page.locator(".cm-content").click();
  await page.keyboard.type("# 통합 테스트 문서\n\n본문 문단입니다.\n");

  // 2. 리본 굵게 버튼 동작
  await page.keyboard.type("굵은 텍스트");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.getByTitle("굵게 (Ctrl+B)").click();
  await expect(page.locator(".cm-content")).toContainText("**굵은 텍스트**");

  // 3. 변환 실행 → A4 미리보기
  await page.getByRole("button", { name: /AI 변환/ }).click();
  await expect(page.locator("article")).toContainText("통합 테스트 문서", { timeout: 30000 });

  // 4. 백엔드 포맷 4종 다운로드
  for (const fmt of ["hwpx", "hwp", "docx", "pdf"]) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /내보내기/ }).click();
    await page.getByText(new RegExp(`\\.${fmt}\\)`)).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(`.${fmt}`);
  }

  // 5. .md 다운로드
  const mdPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /내보내기/ }).click();
  await page.getByText("마크다운 (.md)").click();
  expect((await mdPromise).suggestedFilename()).toMatch(/\.md$/);

  // 6. 슬라이드 탭 전환 + 프리필
  await page.getByRole("button", { name: /슬라이드로 변환/ }).click();
  await expect(page.getByText("슬라이드 생성")).toBeVisible();
  await expect(page.locator("textarea").first()).toContainText("통합 테스트 문서");
});
```

- [ ] **Step 3: E2E 실행**

Run: `cd apps/frontend && npx playwright test e2e/word-processor.spec.ts`
Expected: PASS. 실패 시 셀렉터·타이밍 조정 (기능 회귀라면 해당 Task로 복귀).

- [ ] **Step 4: 생성된 .hwp를 kordoc으로 검증**

E2E에서 다운로드된 `.hwp` 파일을 프론트 HwpDropZone에 드래그하여 재가져오기 성공 확인 (수동), 또는:

```bash
cd apps/frontend && node -e "const k=require('kordoc'); k.parse(require('fs').readFileSync(process.argv[1])).then(d=>console.log('OK', d.text?.slice(0,50)))" <다운로드된.hwp>
```

Expected: 파싱 성공 + 텍스트 추출. 실패하면 Task 6 Step 13으로 복귀해 레이아웃 수정.

- [ ] **Step 5: 최종 검증 + 커밋**

Run:
- `cd apps/frontend && npx tsc --noEmit && npx jest --watchAll=false && npm run build`
- `cd apps/backend && python -m pytest tests/ -q`

Expected: 전부 PASS.

```bash
git add apps/frontend/e2e apps/frontend/playwright.config.ts
git commit -m "test(e2e): 워드프로세서 통합 시나리오 — 입력·변환·내보내기 6종·슬라이드 연결"
```

---

## Self-Review 결과

- **스펙 커버리지**: 설계서 §3.1(셸)→Task 1·3, §3.2(에디터)→Task 2, §3.3(미리보기)→Task 4, §3.4(내보내기)→Task 3, §3.5(HWP)→Task 6, §3.6(PPT)→Task 5, §6(테스트)→각 Task+7. 누락 없음.
- **주의 지점**: Task 6의 HWP 바이트 레이아웃은 스펙 문서 기반 최선 구현이며, 테스트 왕복(Step 13)과 kordoc 검증(Task 7 Step 4)에서 조정될 수 있다. 표가 막히면 텍스트 강등으로 우선 출시하고 후속 커밋 — 이 강등 경로 자체가 설계서의 정식 오류 정책이다.
- **타입 일관성**: `activeTab: "doc" | "slides"`(store↔DocumentTabs↔ExportMenu↔RibbonToolbar), `downloadUrl` fmt 유니언, `CharShapeKey` 등록 순서 = ID 규약(docinfo↔bodytext) 일치 확인.
