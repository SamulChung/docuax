"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { Editor } from "@/components/editor/Editor";
import { PreviewPane } from "@/components/preview/PreviewPane";
import { RemoteControl } from "@/components/remote/RemoteControl";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { DocumentTabs } from "@/components/shell/DocumentTabs";
import { MenuBar } from "@/components/shell/MenuBar";
import { OutlinePanel } from "@/components/shell/OutlinePanel";
import { RibbonToolbar } from "@/components/shell/RibbonToolbar";
import { StatusBar } from "@/components/shell/StatusBar";
import { TopBar } from "@/components/TopBar";
import { saveCurrentDocument } from "@/lib/docActions";
import { loadDraft } from "@/lib/draft";
import { useWorkspace } from "@/store/workspace";

// Fabric.js SSR 불가 — 슬라이드 탭은 클라이언트 전용 로드
const SlideWorkspace = dynamic(
  () => import("@/components/slides/SlideWorkspace").then((m) => m.SlideWorkspace),
  { ssr: false, loading: () => <div className="p-8 text-sm text-neutral-400">슬라이드 로딩 중…</div> },
);

export function Workspace() {
  const [remoteCollapsed, setRemoteCollapsed] = useState(false);
  const activeTab = useWorkspace((s) => s.activeTab);
  const outlineOpen = useWorkspace((s) => s.outlineOpen);
  const paletteOpen = useWorkspace((s) => s.paletteOpen);
  const setPaletteOpen = useWorkspace((s) => s.setPaletteOpen);

  // 임시 저장 복구 — 에디터가 비어 있을 때만 (마운트 1회)
  useEffect(() => {
    const { source, setSource, setTitle } = useWorkspace.getState();
    if (source.trim()) return;
    const draft = loadDraft();
    if (draft?.source) {
      setSource(draft.source);
      setTitle(draft.title);
      if (draft.docId) useWorkspace.getState().setCurrentDocId(draft.docId);
      useWorkspace.getState().setSaveState({ kind: "draft", at: draft.savedAt });
    }
  }, []);

  // 서버 자동 저장 — 서버 문서 연결 + 변경 존재 시 30초마다
  useEffect(() => {
    const timer = setInterval(() => {
      const s = useWorkspace.getState();
      if (s.currentDocId && s.dirty && s.source.trim()) void saveCurrentDocument();
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  // Ctrl+K 명령 팔레트 — 에디터 밖 포커스에서도 동작
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useWorkspace.getState().setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-[calc(100vh-300px)] min-h-[640px] flex-col print-root">
      <TopBar />
      <MenuBar />
      <DocumentTabs />
      {activeTab === "slides" ? (
        <div className="flex-1 overflow-auto p-3">
          <SlideWorkspace />
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden print-root">
          <RibbonToolbar />
          <div className="grid flex-1 grid-cols-12 gap-3 overflow-hidden p-3 print-root">
            {/* 리모컨 접힘 시 에디터·미리보기가 남는 폭을 나눠 가짐 (12칸 합 유지) */}
            <section
              className={`no-print flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${
                remoteCollapsed ? "col-span-6" : "col-span-5"
              }`}
            >
              <div className="flex h-full min-h-0">
                {outlineOpen && <OutlinePanel />}
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                  <Editor />
                </div>
              </div>
            </section>
            <section className={`flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 print-root ${remoteCollapsed ? "col-span-5" : "col-span-4"}`}>
              <PreviewPane />
            </section>
            <section
              className={`no-print flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${
                remoteCollapsed ? "col-span-1" : "col-span-3"
              }`}
            >
              <RemoteControl
                collapsed={remoteCollapsed}
                onToggleCollapse={() => setRemoteCollapsed((v) => !v)}
              />
            </section>
          </div>
        </div>
      )}

      <StatusBar />

      {/* 글로벌 채팅 확장 패널 — store 의 expanded=true 일 때만 표시 */}
      <ChatPanel />

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
