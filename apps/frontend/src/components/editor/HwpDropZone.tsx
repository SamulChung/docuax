"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { useWorkspace } from "@/store/workspace";
import { docxFileToMarkdown } from "@/lib/docxImport";

export function HwpDropZone() {
  const setSource = useWorkspace((s) => s.setSource);
  const setTitle = useWorkspace((s) => s.setTitle);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parseFile = async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const isDocx = /\.docx$/i.test(file.name);
      if (isDocx) {
        const md = await docxFileToMarkdown(file);
        setSource(md);
      } else {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/parse-hwp", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "파싱 실패");
        setSource(data.markdown ?? "");
        if (data.title && setTitle) setTitle(data.title);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일 처리 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = "";
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex items-center gap-2 rounded border border-dashed px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
        dragging
          ? "border-brand bg-brand/5 text-brand"
          : "border-neutral-300 text-neutral-500 hover:border-brand hover:text-brand dark:border-neutral-700"
      }`}
      onClick={() => inputRef.current?.click()}
      title="HWP/HWPX/DOCX 파일을 드래그하거나 클릭해서 열기"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".hwp,.hwpx,.docx"
        className="hidden"
        onChange={handleChange}
      />
      {loading ? (
        <>
          <Loader2 size={12} className="animate-spin" />
          <span>파싱 중…</span>
        </>
      ) : (
        <>
          <FileUp size={12} />
          <span>HWP·DOCX 열기</span>
        </>
      )}
      {error && (
        <span className="ml-1 text-rose-500 cursor-help" title={error}>⚠</span>
      )}
    </div>
  );
}
