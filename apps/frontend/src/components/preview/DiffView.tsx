"use client";

import { useMemo } from "react";
import * as Diff from "diff";

interface Props {
  oldText: string;
  newText: string;
}

export function DiffView({ oldText, newText }: Props) {
  const parts = useMemo(
    () => Diff.diffLines(oldText, newText, { ignoreWhitespace: false }),
    [oldText, newText]
  );

  const added = parts.filter((p) => p.added).length;
  const removed = parts.filter((p) => p.removed).length;

  return (
    <div className="h-full overflow-auto p-4 font-mono text-[12px]">
      <div className="mb-3 flex gap-3 text-[11px]">
        <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          +{added} 추가
        </span>
        <span className="rounded bg-rose-100 px-2 py-0.5 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          -{removed} 삭제
        </span>
      </div>
      <div className="space-y-0.5">
        {parts.map((part, i) => (
          <pre
            key={i}
            className={`whitespace-pre-wrap rounded px-2 py-0.5 leading-relaxed ${
              part.added
                ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
                : part.removed
                ? "bg-rose-50 text-rose-900 line-through opacity-60 dark:bg-rose-950/50 dark:text-rose-300"
                : "text-neutral-700 dark:text-neutral-300"
            }`}
          >
            {part.added ? "+ " : part.removed ? "- " : "  "}
            {part.value}
          </pre>
        ))}
      </div>
    </div>
  );
}
