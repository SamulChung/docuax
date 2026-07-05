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
      {preview && pageCount > 0 && <span>약 {pageCount}쪽</span>}
      {preview && <span>블록 {preview.blocks.length}개</span>}
      {/* 감지된 양식 종류 — WorkerConvertPanel 의 '양식' 표시와 동일 필드 */}
      {preview?.template_applied && <span>{preview.template_applied}</span>}
      {busy && <span className="text-brand">변환 중…</span>}
      <span className="ml-auto flex gap-1">
        {FORMATS.map((f) => (
          <span key={f} className="rounded border border-neutral-200 px-1 py-px dark:border-neutral-700">{f}</span>
        ))}
      </span>
    </div>
  );
}
