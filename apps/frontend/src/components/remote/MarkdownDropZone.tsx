"use client";

import { useCallback, useRef, useState } from "react";
import { FileDown, Upload } from "lucide-react";

import { sanitizeString } from "@/lib/sanitize";
import { useWorkspace } from "@/store/workspace";

const MAX_BYTES = 1_000_000;
const ACCEPTED_EXT = [".md", ".markdown", ".txt"];

/** H1(#) 한 줄을 제목으로 추출하고 본문에서 그 줄을 제거. */
function splitTitle(text: string): { title: string; body: string } {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i];
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (m) {
      const before = lines.slice(0, i);
      const after = lines.slice(i + 1);
      return { title: m[1].trim(), body: [...before, ...after].join("\n").trimStart() };
    }
    if (line.trim() && !line.startsWith("#")) break;
  }
  return { title: "", body: text };
}

export interface MarkdownDropZoneProps {
  /** 짧은(워커) 또는 큰(헤비) 변형 — 시각 강도만 다름 */
  variant?: "compact" | "prominent";
  /** 드롭/선택 후 자동 변환 트리거 */
  onAfterLoad?: () => void;
}

export function MarkdownDropZone({ variant = "compact", onAfterLoad }: MarkdownDropZoneProps) {
  const setSource = useWorkspace((s) => s.setSource);
  const setTitle = useWorkspace((s) => s.setTitle);
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);

  const accept = ACCEPTED_EXT.join(",");

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      const file = list[0];
      const nameLower = file.name.toLowerCase();
      const ok = ACCEPTED_EXT.some((ext) => nameLower.endsWith(ext));
      if (!ok) {
        alert(`마크다운(.md, .markdown) 또는 .txt 만 지원합니다.\n받은 파일: ${file.name}`);
        return;
      }
      if (file.size > MAX_BYTES) {
        alert(`파일이 너무 큽니다 (${(file.size / 1024).toFixed(0)}KB). 최대 1MB.`);
        return;
      }
      try {
        const raw = await file.text();
        const { title, body } = splitTitle(sanitizeString(raw));
        setSource(body);
        if (title) setTitle(title);
        setFilename(file.name);
        if (list.length > 1) {
          // eslint-disable-next-line no-console
          console.warn(`다중 파일 드롭: ${list.length}개 중 첫 번째(${file.name})만 사용`);
        }
        onAfterLoad?.();
      } catch (e) {
        alert(`파일 읽기 실패: ${(e as Error).message}`);
      }
    },
    [setSource, setTitle, onAfterLoad],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setHover(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        void handleFiles(files);
      }
    },
    [handleFiles],
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hover) setHover(true);
  }, [hover]);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setHover(false);
  }, []);

  const padding = variant === "prominent" ? "py-6" : "py-3";
  const iconSize = variant === "prominent" ? 22 : 14;
  const titleSize = variant === "prominent" ? "text-sm font-semibold" : "text-[11px] font-semibold";
  const subSize = variant === "prominent" ? "text-[11px]" : "text-[10px]";

  return (
    <label
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-3 transition-all ${padding} ${
        hover
          ? "border-brand bg-brand/10 text-brand"
          : "border-neutral-300 bg-neutral-50 text-neutral-600 hover:border-brand/60 hover:bg-brand/5 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
      }`}
      title=".md / .markdown / .txt 파일 드롭 또는 클릭"
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />
      {filename ? (
        <>
          <FileDown size={iconSize} className="text-emerald-600" />
          <span className={`${titleSize} text-emerald-700 dark:text-emerald-300`}>
            {filename}
          </span>
          <span className={`${subSize} text-neutral-500`}>다시 드롭하면 교체</span>
        </>
      ) : (
        <>
          <Upload size={iconSize} />
          <span className={titleSize}>
            {variant === "prominent" ? ".md 파일을 드롭하세요" : ".md 드롭 · 클릭"}
          </span>
          <span className={`${subSize} text-neutral-500`}>
            {variant === "prominent"
              ? "또는 클릭해서 선택 · 자동으로 DOCX 변환"
              : ".markdown · .txt 가능"}
          </span>
        </>
      )}
    </label>
  );
}
