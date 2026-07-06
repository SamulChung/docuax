"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { useWorkspace } from "@/store/workspace";
import { docxFileToMarkdown } from "@/lib/docxImport";
import { splitTitle } from "@/lib/mdImport";
import { sanitizeString } from "@/lib/sanitize";

const MD_MAX_BYTES = 1_000_000;

/**
 * 파일 → 에디터 가져오기 공용 로직 (HWP·HWPX·DOCX·MD·TXT).
 * 버튼(HwpDropZone)과 에디터 전체 드롭 타겟(Editor)이 공유.
 * 실패 시 Error throw — 호출부가 UI 안내를 담당.
 */
export async function importFileToEditor(file: File): Promise<void> {
  const { setSource, setTitle } = useWorkspace.getState();
  // 사용자가 이미 제목을 입력했다면 가져오기가 덮어쓰지 않음 (전 포맷 공통).
  const titleEmpty = !useWorkspace.getState().title.trim();
  const isDocx = /\.docx$/i.test(file.name);
  const isMd = /\.(md|markdown|txt)$/i.test(file.name);
  if (isDocx) {
    const md = await docxFileToMarkdown(file);
    setSource(md);
    if (titleEmpty) {
      // 첫 H1을 제목으로, 없으면 파일명(확장자 제거)으로 파생.
      const h1 = md.match(/^#\s+(.+)$/m);
      setTitle(h1 ? h1[1].trim() : file.name.replace(/\.docx$/i, ""));
    }
  } else if (isMd) {
    if (file.size > MD_MAX_BYTES) {
      throw new Error(`파일이 너무 큽니다 (${(file.size / 1024).toFixed(0)}KB). 최대 1MB.`);
    }
    const raw = await file.text();
    const { title, body } = splitTitle(sanitizeString(raw));
    setSource(body);
    if (titleEmpty) {
      // 첫 H1을 제목으로, 없으면 파일명(확장자 제거)으로 파생 — docx 분기와 동일 규칙.
      setTitle(title || file.name.replace(/\.(md|markdown|txt)$/i, ""));
    }
  } else {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/parse-hwp", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "파싱 실패");
    setSource(data.markdown ?? "");
    if (data.title && titleEmpty) setTitle(data.title);
  }
  // 가져온 파일은 새 문서 — 열려 있던 서버 문서를 덮어쓰지 않도록 연결 해제
  useWorkspace.getState().setCurrentDocId(null);
}

export function HwpDropZone() {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parseFile = async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      await importFileToEditor(file);
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
      title="HWP·HWPX·DOCX·MD 파일을 드래그하거나 클릭해서 열기"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".hwp,.hwpx,.docx,.md,.txt,.markdown"
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
          <span>파일 열기</span>
        </>
      )}
      {error && (
        <span className="ml-1 text-rose-500 cursor-help" title={error}>⚠</span>
      )}
    </div>
  );
}
