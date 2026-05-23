"use client";

import { useState } from "react";
import useSWR from "swr";
import { Cog, Cpu, Loader2 } from "lucide-react";

import { SettingsModal } from "@/components/settings/SettingsModal";
import { getHealth } from "@/lib/api";

/**
 * 관리자 콘솔의 "LLM 설정" 섹션.
 *
 * - 현재 LLM provider·model·상태 표시
 * - "LLM 설정 열기" 버튼 → 기존 SettingsModal
 */
export function AdminLLMSettings() {
  const [modalOpen, setModalOpen] = useState(false);
  const { data: health, mutate, isLoading } = useSWR("admin:health", getHealth, {
    refreshInterval: 30000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          LLM Provider, 모델, API 키 등을 변경할 수 있습니다. 변경 즉시 모든 사용자에게 반영됩니다.
        </p>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1 rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90"
        >
          <Cog size={12} />
          LLM 설정 열기
        </button>
      </div>

      {isLoading || !health ? (
        <div className="flex items-center gap-2 py-12 text-sm text-neutral-500">
          <Loader2 size={14} className="animate-spin" /> 불러오는 중…
        </div>
      ) : (
        <div className="space-y-4">
          {/* 현재 상태 카드 */}
          <div
            className={`rounded-lg border p-4 ${
              health.llm.available
                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
                : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu size={16} className={health.llm.available ? "text-emerald-600" : "text-amber-600"} />
                <div>
                  <p className="text-sm font-semibold">
                    {health.llm.provider} · {health.llm.model}
                  </p>
                  <p className="text-[10px] text-neutral-500">
                    상태: {health.llm.available ? "정상 가동" : "응답 없음"}
                    {health.llm.latency_ms != null && ` · ${health.llm.latency_ms.toFixed(0)}ms`}
                  </p>
                </div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  health.llm.available
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                }`}
              >
                {health.llm.available ? "ONLINE" : "DEGRADED"}
              </span>
            </div>
            {health.llm.error && (
              <p className="mt-2 rounded bg-white/50 p-2 text-[11px] text-rose-700 dark:bg-black/30 dark:text-rose-300">
                {health.llm.error}
              </p>
            )}
          </div>

          {/* 시스템 정보 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                매크로 로드 상태
              </p>
              <p className="mt-1 text-xl font-bold">
                {health.macros.total ?? 0} / 100
              </p>
              <p className="mt-0.5 text-[10px] text-neutral-500">
                AI 강화 {health.macros.ai_powered ?? 0}종
              </p>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                전체 시스템 상태
              </p>
              <p className="mt-1 text-xl font-bold uppercase">
                {health.status}
              </p>
              <p className="mt-0.5 text-[10px] text-neutral-500">버전 {health.version}</p>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <SettingsModal
          onClose={() => {
            setModalOpen(false);
            mutate();
          }}
        />
      )}
    </div>
  );
}
