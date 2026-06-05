"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useWorkspace } from "@/store/workspace";

// Detect: {필드명}, ___(label), 〇〇(label)
const FIELD_REGEX = /\{([^}]{1,30})\}|_{3,}(?:\(([^)]+)\))?|〇{2,}(?:\(([^)]+)\))?/g;

function extractFields(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  let m: RegExpExecArray | null;
  const regex = new RegExp(FIELD_REGEX.source, FIELD_REGEX.flags);
  while ((m = regex.exec(text)) !== null) {
    const name = m[1] ?? m[2] ?? m[3] ?? `필드${result.length + 1}`;
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

export function FormFillPanel() {
  const source = useWorkspace((s) => s.source);
  const setSource = useWorkspace((s) => s.setSource);
  const [values, setValues] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);

  const fields = useMemo(() => extractFields(source), [source]);

  // Auto-show when fields detected
  useEffect(() => {
    if (fields.length > 0) setOpen(true);
  }, [fields.length]);

  if (fields.length === 0) return null;

  const handleFill = () => {
    let filled = source;
    Object.entries(values).forEach(([field, value]) => {
      if (!value) return;
      filled = filled
        .replaceAll(`{${field}}`, value)
        .replace(new RegExp(`_{3,}(?:\\(${field}\\))?`, "g"), value)
        .replace(new RegExp(`〇{2,}(?:\\(${field}\\))?`, "g"), value);
    });
    setSource(filled);
    setValues({});
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded border border-neutral-200 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 hover:border-brand hover:text-brand dark:border-neutral-700 dark:text-neutral-400"
      >
        📝 {fields.length}개 필드
      </button>
    );
  }

  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
          📝 양식 자동 채우기 — {fields.length}개 필드 감지
        </span>
        <button onClick={() => setOpen(false)}>
          <X size={12} className="text-neutral-400 hover:text-neutral-700" />
        </button>
      </div>
      <div className="space-y-1.5">
        {fields.map((field) => (
          <div key={field} className="flex items-center gap-2">
            <label className="w-24 shrink-0 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              {field}
            </label>
            <input
              value={values[field] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
              placeholder={`{${field}} 값 입력`}
              className="flex-1 rounded border border-neutral-200 bg-white px-2 py-0.5 text-[11px] dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleFill}
        disabled={Object.values(values).every((v) => !v)}
        className="mt-2 rounded bg-amber-600 px-3 py-1 text-[10px] font-semibold text-white hover:bg-amber-700 disabled:opacity-40"
      >
        채우기 적용
      </button>
    </div>
  );
}
