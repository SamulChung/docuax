"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import { listMacros, executeMacro } from "@/lib/api";
import { filterCommands, getStaticCommands } from "@/lib/commands";
import type { Command } from "@/lib/commands";
import { useWorkspace } from "@/store/workspace";

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [macroCmds, setMacroCmds] = useState<Command[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = useWorkspace((s) => s.preview);

  // 매크로 101종 lazy 병합 — 변환 결과가 있어야 실행 가능
  useEffect(() => {
    listMacros()
      .then((macros) =>
        setMacroCmds(
          macros.map((m) => ({
            id: `macro.${m.id}`,
            label: `${m.id} — ${m.name}`,
            keywords: `macro 매크로 ${m.description ?? ""}`,
            run: () => {
              const s = useWorkspace.getState();
              if (!s.preview) { alert("먼저 변환(Ctrl+Enter)을 실행하세요"); return; }
              void executeMacro({ document_id: s.preview.document_id, macro_id: m.id })
                .then((r) => s.setPreview(r.preview))
                .catch(() => alert("매크로 실행에 실패했습니다"));
            },
          })),
        ),
      )
      .catch(() => {});
  }, []);

  const all = useMemo(() => [...getStaticCommands(), ...macroCmds], [macroCmds]);
  const results = useMemo(() => filterCommands(all, query).slice(0, 12), [all, query]);

  useEffect(() => setSelected(0), [query]);

  const runAt = (i: number) => {
    const cmd = results[i];
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[15vh]" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <Search size={14} className="text-neutral-400" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSelected((v) => Math.min(v + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSelected((v) => Math.max(v - 1, 0)); }
              if (e.key === "Enter") runAt(selected);
              if (e.key === "Escape") onClose();
            }}
            placeholder="명령 검색… (서식·삽입·매크로·내보내기)"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <div className="max-h-72 overflow-auto py-1">
          {results.length === 0 && <p className="px-4 py-3 text-xs text-neutral-400">일치하는 명령이 없습니다</p>}
          {results.map((c, i) => (
            <button
              key={c.id}
              onClick={() => runAt(i)}
              onMouseEnter={() => setSelected(i)}
              className={`block w-full px-4 py-1.5 text-left text-xs ${
                i === selected ? "bg-brand/10 text-brand" : "text-neutral-700 dark:text-neutral-300"
              } ${c.id.startsWith("macro.") && !preview ? "opacity-50" : ""}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="border-t border-neutral-100 px-3 py-1.5 text-[10px] text-neutral-400 dark:border-neutral-800">
          ↑↓ 이동 · Enter 실행 · Esc 닫기
        </div>
      </div>
    </div>
  );
}
