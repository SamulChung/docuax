"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, Download, X } from "lucide-react";

interface FileItem {
  file: File;
  status: "pending" | "done" | "error";
}

export default function BatchPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [format, setFormat] = useState<"hwpx" | "docx" | "pdf">("hwpx");
  const [loading, setLoading] = useState(false);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (newFiles: FileList) => {
    const items = Array.from(newFiles)
      .filter((f) => f.name.endsWith(".md") || f.name.endsWith(".txt"))
      .map((f): FileItem => ({ file: f, status: "pending" }));
    setFiles((prev) => [...prev, ...items]);
  };

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const handleConvert = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setZipUrl(null);
    try {
      const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
      const fd = new FormData();
      files.forEach((item) => fd.append("files", item.file));
      fd.append("output_format", format);
      const res = await fetch(`${API}/api/v1/batch/convert`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      setZipUrl(URL.createObjectURL(blob));
      setFiles((prev) => prev.map((f) => ({ ...f, status: "done" })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">배치 변환</h1>
      <p className="mb-6 text-sm text-neutral-500">
        마크다운(.md) 또는 텍스트(.txt) 파일을 여러 개 올려 한 번에 변환합니다.
      </p>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 py-10 hover:border-brand dark:border-neutral-700"
      >
        <FileUp size={32} className="mb-2 text-neutral-400" />
        <p className="text-sm font-medium text-neutral-500">파일을 드래그하거나 클릭해서 선택</p>
        <p className="text-xs text-neutral-400">.md, .txt 파일 최대 20개</p>
        <input ref={inputRef} type="file" accept=".md,.txt" multiple className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>
      {files.length > 0 && (
        <ul className="mb-4 space-y-1">
          {files.map((item, i) => (
            <li key={i} className="flex items-center justify-between rounded border border-neutral-100 px-3 py-1.5 text-sm dark:border-neutral-800">
              <span className="truncate">{item.file.name}</span>
              <div className="flex items-center gap-2">
                {item.status === "done" && <span className="text-emerald-500 text-xs">✓</span>}
                <button onClick={() => removeFile(i)}><X size={12} className="text-neutral-400 hover:text-rose-500" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)}
          className="rounded border border-neutral-200 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900">
          <option value="hwpx">HWPX (한글)</option>
          <option value="docx">DOCX (Word)</option>
          <option value="pdf">PDF</option>
        </select>
        <button onClick={handleConvert} disabled={loading || files.length === 0}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          {loading ? "변환 중…" : `${files.length}개 파일 변환`}
        </button>
        {zipUrl && (
          <a href={zipUrl} download="docuax_batch.zip"
            className="flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:border-brand hover:text-brand dark:border-neutral-700">
            <Download size={14} /> ZIP 다운로드
          </a>
        )}
      </div>
    </div>
  );
}
