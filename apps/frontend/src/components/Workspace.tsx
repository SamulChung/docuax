"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { Editor } from "@/components/editor/Editor";
import { PreviewPane } from "@/components/preview/PreviewPane";
import { RemoteControl } from "@/components/remote/RemoteControl";
import { DocumentTabs } from "@/components/shell/DocumentTabs";
import { MenuBar } from "@/components/shell/MenuBar";
import { RibbonToolbar } from "@/components/shell/RibbonToolbar";
import { StatusBar } from "@/components/shell/StatusBar";
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
      <MenuBar />
      <DocumentTabs />
      {activeTab === "slides" ? (
        <div className="flex-1 overflow-auto p-3">
          <SlideWorkspace />
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <RibbonToolbar />
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
        </div>
      )}

      <StatusBar />

      {/* 글로벌 채팅 확장 패널 — store 의 expanded=true 일 때만 표시 */}
      <ChatPanel />
    </div>
  );
}
