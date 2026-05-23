"use client";

import { useWorkspace } from "@/store/workspace";

interface Props {
  onJump: (id: string) => void;
}

export function ReviewJump({ onJump }: Props) {
  const preview = useWorkspace((s) => s.preview);

  if (!preview) return null;

  const { red, blue, yellow } = preview.review_counts;
  const total = red + blue + yellow;

  return (
    <div className="rounded border border-neutral-200 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        <span>검토 점프</span>
        <span className="font-mono text-neutral-400">시그니처</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={() => onJump("N1")}
          className="rounded-md bg-review-red/10 px-2 py-2 text-xs font-medium text-review-red hover:bg-review-red/20"
          title="다음 빨강 (Alt+R) — AI 사전 표시 순회"
        >
          <div className="text-base font-bold">{red}</div>
          <div className="text-[9px] uppercase">수정</div>
        </button>
        <button
          onClick={() => onJump("N2")}
          className="rounded-md bg-review-blue/10 px-2 py-2 text-xs font-medium text-review-blue hover:bg-review-blue/20"
          title="다음 파랑 (Alt+B) — 핵심 강조"
        >
          <div className="text-base font-bold">{blue}</div>
          <div className="text-[9px] uppercase">핵심</div>
        </button>
        <button
          onClick={() => onJump("N3")}
          className="rounded-md bg-review-yellow/15 px-2 py-2 text-xs font-medium text-amber-700 hover:bg-review-yellow/25"
          title="다음 숫자 (Alt+N)"
        >
          <div className="text-base font-bold">{yellow}</div>
          <div className="text-[9px] uppercase">숫자</div>
        </button>
      </div>
      <div className="mt-2 text-center text-[10px] text-neutral-400">
        총 {total}개 — AI가 표시하고, 사용자는 점프한다
      </div>
    </div>
  );
}
