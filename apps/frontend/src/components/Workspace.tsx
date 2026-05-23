"use client";

import { useState } from "react";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { Editor } from "@/components/editor/Editor";
import { PreviewPane } from "@/components/preview/PreviewPane";
import { RemoteControl } from "@/components/remote/RemoteControl";
import { TopBar } from "@/components/TopBar";

export function Workspace() {
  const [remoteCollapsed, setRemoteCollapsed] = useState(false);

  return (
    <div className="flex h-[calc(100vh-300px)] min-h-[640px] flex-col">
      <TopBar />
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

      {/* 글로벌 채팅 확장 패널 — store 의 expanded=true 일 때만 표시 */}
      <ChatPanel />
    </div>
  );
}
