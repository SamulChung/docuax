"use client";

import { List } from "lucide-react";

import { scrollToLine } from "@/lib/editorCommands";
import { parseOutline } from "@/lib/outline";
import { useWorkspace } from "@/store/workspace";

export function OutlinePanel() {
  const source = useWorkspace((s) => s.source);
  const items = parseOutline(source);

  return (
    <div className="no-print flex h-full w-44 shrink-0 flex-col overflow-auto border-r border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-neutral-500">
        <List size={11} /> 목차
      </div>
      {items.length === 0 && <p className="px-1 text-[10px] text-neutral-400">제목(#)을 입력하면 목차가 생깁니다</p>}
      {items.map((it, i) => (
        <button
          key={`${it.line}-${i}`}
          onClick={() => scrollToLine(it.line)}
          className="truncate rounded px-1 py-0.5 text-left text-[11px] text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          style={{ paddingLeft: `${(it.level - 1) * 10 + 4}px` }}
        >
          {it.text}
        </button>
      ))}
    </div>
  );
}
