"use client";

import { useState } from "react";
import { MousePointer2, Sparkles, Zap } from "lucide-react";

import type { MacroDescriptor } from "@/lib/api";
import { useWorkspace } from "@/store/workspace";

interface Props {
  macros: MacroDescriptor[];
  onExecute: (id: string, params?: Record<string, unknown>) => void;
}

const CATEGORY_COLOR: Record<string, string> = {
  T: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  S: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  B: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  G: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  N: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  R: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  P: "bg-neutral-50 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
};

// 카테고리별 사용법 한 줄 안내
const CATEGORY_HINTS: Record<string, string> = {
  T: "표 매크로 — T1~T4는 새 표 생성, T5~T25는 선택한 표에 적용",
  S: "표 셀 — 셀 배경/글자색/정렬 (헤비유저 핵심)",
  B: "블록 — 글머리·번호·이동·복사",
  G: "글자 — 굵게·기울임·크기·서식 복사",
  N: "이동 — 빨강·파랑·노랑 검토 점프 (워커 핵심)",
  R: "검토 — AI 재검토·맞춤법·기관 양식 일치도",
  P: "편리 — 자동저장·되돌리기·공유 링크",
};

export function MacroGrid({ macros, onExecute }: Props) {
  const [filter, setFilter] = useState("");
  const selectedCount = useWorkspace((s) => s.selectedBlockIds.length);
  const visible = filter
    ? macros.filter(
        (m) =>
          m.id.toLowerCase().includes(filter.toLowerCase()) ||
          m.name.toLowerCase().includes(filter.toLowerCase())
      )
    : macros;

  // 노출된 카테고리 모음
  const cats = Array.from(new Set(macros.map((m) => m.category)));
  const hint = cats.map((c) => CATEGORY_HINTS[c]).filter(Boolean).join(" · ");

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 p-2 dark:border-neutral-800">
        {hint && (
          <div className="mb-1.5 rounded bg-brand/5 px-2 py-1 text-[10px] text-brand">
            ⓘ {hint}
          </div>
        )}
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`매크로 검색 (${macros.length}개)`}
          className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-xs focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className={`mt-1.5 flex items-center gap-1 text-[10px] ${selectedCount > 0 ? "text-brand font-semibold" : "text-neutral-500"}`}>
          <MousePointer2 size={10} />
          {selectedCount > 0 ? (
            <span>{selectedCount}개 블록 선택됨 — 매크로 적용 대상</span>
          ) : (
            <span>미리보기 블록 클릭해 선택 (Ctrl+클릭 다중)</span>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {visible.map((m) => (
          <button
            key={m.id}
            onClick={() => onExecute(m.id)}
            className="group flex w-full items-center justify-between rounded border border-transparent bg-white px-2 py-1.5 text-left text-xs hover:border-brand/30 hover:bg-brand/5 dark:bg-neutral-900 dark:hover:bg-brand/10"
            title={m.description}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-block min-w-[28px] rounded px-1.5 py-0.5 text-center font-mono text-[9px] font-bold ${
                  CATEGORY_COLOR[m.category]
                }`}
              >
                {m.id}
              </span>
              <span className="truncate font-medium">{m.name}</span>
              {m.ai_powered && (
                <Sparkles size={10} className="text-brand" />
              )}
              {m.auto && (
                <Zap size={10} className="text-emerald-500" />
              )}
            </div>
            {m.shortcut?.win && (
              <span className="hidden font-mono text-[9px] text-neutral-400 group-hover:inline">
                {m.shortcut.win}
              </span>
            )}
          </button>
        ))}
        {visible.length === 0 && (
          <div className="py-8 text-center text-xs text-neutral-400">
            매크로가 없습니다
          </div>
        )}
      </div>
    </div>
  );
}
