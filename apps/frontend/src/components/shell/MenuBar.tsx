"use client";

import { useEffect, useRef, useState } from "react";
import { undo, redo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";

import { getEditorView, insertBlock, setHeadingLevel, wrapSelection } from "@/lib/editorCommands";
import { saveAsNewDocument, saveCurrentDocument } from "@/lib/docActions";
import { downloadMarkdown } from "@/lib/download";
import { dispatchAutoConvert } from "@/lib/events";
import { useWorkspace } from "@/store/workspace";
import { DocumentPicker } from "./DocumentPicker";
import { ExportMenu } from "./ExportMenu";

type MenuItem = { label: string; action: () => void } | "divider";

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const source = useWorkspace((s) => s.source);
  const title = useWorkspace((s) => s.title);
  const resetWorkspace = useWorkspace((s) => s.resetWorkspace);
  const setActiveTab = useWorkspace((s) => s.setActiveTab);

  // 메뉴가 열려 있는 동안에만 outside-click 리스너 부착 (BrainDropdown 컨벤션)
  useEffect(() => {
    if (!openMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openMenu]);

  const withEditor = (fn: (v: NonNullable<ReturnType<typeof getEditorView>>) => void) => () => {
    const v = getEditorView();
    if (v) fn(v);
  };

  const MENUS: Record<string, MenuItem[]> = {
    파일: [
      { label: "새 문서", action: () => { if (confirm("에디터 내용을 초기화할까요?")) resetWorkspace(); } },
      { label: "열기… (내 문서)", action: () => setPickerOpen(true) },
      "divider",
      { label: "저장 (Ctrl+S)", action: () => void saveCurrentDocument() },
      { label: "다른 이름으로 저장", action: () => void saveAsNewDocument() },
      "divider",
      { label: "마크다운으로 저장 (.md)", action: () => downloadMarkdown(source, title) },
      { label: "인쇄 (Ctrl+P)", action: () => window.print() },
    ],
    편집: [
      { label: "실행 취소 (Ctrl+Z)", action: withEditor((v) => undo(v)) },
      { label: "다시 실행 (Ctrl+Y)", action: withEditor((v) => redo(v)) },
      "divider",
      { label: "찾기 (Ctrl+F)", action: withEditor((v) => openSearchPanel(v)) },
      { label: "바꾸기 (Ctrl+H)", action: withEditor((v) => openSearchPanel(v)) },
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
      { label: "변환 실행 (Ctrl+Enter)", action: dispatchAutoConvert },
      { label: "슬라이드 탭으로", action: () => setActiveTab("slides") },
    ],
  };

  return (
    <div ref={ref} className="no-print flex items-center gap-0.5 border-b border-neutral-200 bg-neutral-50 px-2 py-0.5 dark:border-neutral-800 dark:bg-neutral-950">
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
      {pickerOpen && <DocumentPicker onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
