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
    <div className="no-print flex items-end gap-1 border-b border-neutral-200 px-3 pt-1 dark:border-neutral-800">
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
