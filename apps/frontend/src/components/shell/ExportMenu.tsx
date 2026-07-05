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

  // 드롭다운이 열려 있는 동안에만 outside-click 리스너 부착 (BrainDropdown 컨벤션)
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

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
