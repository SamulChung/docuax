"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Check, ChevronDown, Cpu, Loader2, Lock } from "lucide-react";

import { KeySetupHint } from "@/components/chat/KeySetupHint";
import {
  getHealth,
  getMe,
  listProviders,
  updateLLMSettings,
  type HealthResponse,
  type LLMProviderId,
} from "@/lib/api";
import { sortProviders } from "@/lib/providerOrder";

/**
 * 상단 두뇌 상태 칩 — 관리자에게는 드롭다운으로 LLM provider 즉시 전환 제공.
 *
 * 일반 사용자: 정보 표시만 (클릭 불가)
 * 관리자: 클릭 → /providers 동적 정렬 드롭다운 → 즉시 변경
 *
 * 정렬: 키 있는 외부 LLM(Claude/GPT) 가 키 없는 것보다 앞, TenOS 항상 표시, Mock 마지막.
 */
export function BrainDropdown() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<LLMProviderId | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState<{ id: string; name: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const { data: me } = useSWR("me", () => getMe().catch(() => null), {
    shouldRetryOnError: false,
  });
  const { data: health, mutate } = useSWR<HealthResponse>("health", getHealth, {
    refreshInterval: 30000,
  });
  const { data: providersData, mutate: mutateProviders } = useSWR(
    "providers",
    listProviders,
    { refreshInterval: 30000 },
  );
  const sorted = providersData ? sortProviders(providersData.items) : [];

  const isAdmin = Boolean(me?.is_admin);
  const currentProvider = health?.llm.provider ?? "—";
  const currentModel = health?.llm.model ?? "loading";
  const available = health?.llm.available ?? false;

  // 외부 클릭으로 닫기
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const handlePick = async (id: LLMProviderId) => {
    if (busy) return;
    setBusy(id);
    setErr(null);
    try {
      await updateLLMSettings({ llm_provider: id });
      await Promise.all([mutate(), mutateProviders()]);
      setOpen(false);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m.includes("403")) {
        setErr("관리자만 변경 가능합니다.");
      } else if (m.includes("키") || m.includes("api_key")) {
        setErr(`${id} 키 미설정 — LLM 설정에서 키를 먼저 입력하세요.`);
      } else {
        setErr(m);
      }
    } finally {
      setBusy(null);
    }
  };

  const chipCls = `flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
    available
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
  }`;
  const inner = (
    <>
      <Cpu size={12} />
      <span className="font-medium">{currentProvider}</span>
      <span className="text-neutral-400">·</span>
      <span className="max-w-[140px] truncate">{currentModel}</span>
      {isAdmin && <ChevronDown size={11} className="opacity-60" />}
    </>
  );

  // 비admin — 정보 칩만
  if (!isAdmin) {
    return (
      <div className={chipCls} title={`두뇌: ${currentModel} (관리자만 변경 가능)`}>
        {inner}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`${chipCls} cursor-pointer transition-all hover:ring-2 hover:ring-brand/40`}
        title="두뇌 변경 (관리자 전용)"
      >
        {inner}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
          <div className="border-b border-neutral-200 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
            LLM Provider 즉시 전환
          </div>
          <div className="py-1">
            {sorted.map((p) => {
              const isCurrent = currentProvider === p.id;
              const isBusy = busy === (p.id as LLMProviderId);
              const disabled = !p.configured;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    if (disabled) {
                      // alert/err 대신 친화적 안내 모달
                      setHint({ id: p.id, name: p.name });
                      setOpen(false);
                      return;
                    }
                    handlePick(p.id as LLMProviderId);
                  }}
                  disabled={isBusy || isCurrent}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-xs transition-all hover:bg-neutral-100 disabled:cursor-default dark:hover:bg-neutral-800 ${
                    isCurrent ? "bg-brand/5" : ""
                  } ${disabled ? "opacity-70" : ""}`}
                >
                  <span className="text-base">{p.emoji}</span>
                  <div className="flex-1">
                    <p className="font-semibold">
                      {p.name}
                      {disabled && <Lock size={9} className="ml-1 inline opacity-60" />}
                    </p>
                    <p className="text-[10px] text-neutral-500">
                      {disabled ? p.reason : p.tagline}
                    </p>
                  </div>
                  {isCurrent && <Check size={12} className="text-brand" />}
                  {isBusy && <Loader2 size={12} className="animate-spin text-brand" />}
                </button>
              );
            })}
          </div>
          {err && (
            <p className="border-t border-rose-200 bg-rose-50 px-3 py-2 text-[10px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {err}
            </p>
          )}
          <div className="border-t border-neutral-200 bg-neutral-50 px-3 py-2 text-[10px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950">
            🔒 항목 클릭 시 키 발급·등록 안내 ·{" "}
            <a href="/admin" className="text-brand hover:underline">
              /admin → LLM 설정
            </a>
          </div>
        </div>
      )}

      {/* 키 등록 안내 모달 */}
      {hint && (
        <KeySetupHint
          providerId={hint.id as "openai" | "anthropic" | "tenos" | "tenos_hf" | "mock" | "chain"}
          providerName={hint.name}
          onClose={() => setHint(null)}
        />
      )}
    </div>
  );
}
