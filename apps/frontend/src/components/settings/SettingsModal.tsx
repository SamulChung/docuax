"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, X } from "lucide-react";

import {
  getLLMSettings,
  type LLMProviderId,
  type LLMSettingsUpdate,
  resetLLMSettings,
  testLLMSettings,
  updateLLMSettings,
} from "@/lib/api";

interface Props {
  onClose: () => void;
}

const PROVIDER_OPTIONS: { id: LLMProviderId; label: string; description: string }[] = [
  {
    id: "tenos",
    label: "TenOS (vLLM·자체 호스팅)",
    description: "운영용 — vLLM·HF Endpoint·로컬 GPU 등 OpenAI 호환 endpoint",
  },
  {
    id: "tenos_hf",
    label: "TenOS (HF Inference)",
    description: "HF Serverless. 28B는 무료 한도 초과 — Endpoint URL을 TenOS로 권장",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "백업·임시 검증용",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "백업·임시 검증용",
  },
  {
    id: "mock",
    label: "Mock (테스트)",
    description: "LLM 호출 없이 정규식 기반 결정적 응답",
  },
  {
    id: "chain",
    label: "Chain (폴백)",
    description: "여러 provider를 순서대로 시도",
  },
];

/** 어떤 provider일 때 어떤 필드를 보여줄지. */
const PROVIDER_FIELDS: Record<LLMProviderId, { key: keyof LLMSettingsUpdate; label: string; placeholder?: string; secret?: boolean; type?: "text" | "number" }[]> = {
  tenos: [
    { key: "tenos_base_url", label: "Base URL", placeholder: "http://localhost:8001/v1" },
    { key: "tenos_model", label: "모델 ID", placeholder: "honey90/TenOS-Ko-28B" },
    { key: "tenos_api_key", label: "API Key (선택)", placeholder: "no-auth", secret: true },
    { key: "tenos_timeout_s", label: "타임아웃 (초)", type: "number" },
  ],
  tenos_hf: [
    { key: "tenos_model", label: "HF 모델 ID", placeholder: "honey90/TenOS-Ko-28B" },
    { key: "hf_api_token", label: "HF API Token", placeholder: "hf_...", secret: true },
    { key: "tenos_timeout_s", label: "타임아웃 (초)", type: "number" },
  ],
  openai: [
    { key: "openai_api_key", label: "API Key", placeholder: "sk-...", secret: true },
    { key: "openai_model", label: "모델", placeholder: "gpt-4o-mini" },
    { key: "openai_base_url", label: "Base URL", placeholder: "https://api.openai.com/v1" },
  ],
  anthropic: [
    { key: "anthropic_api_key", label: "API Key", placeholder: "sk-ant-...", secret: true },
    { key: "anthropic_model", label: "모델", placeholder: "claude-haiku-4-5-20251001" },
  ],
  mock: [],
  chain: [
    { key: "llm_chain", label: "체인 (쉼표 구분)", placeholder: "tenos,openai" },
  ],
};

export function SettingsModal({ onClose }: Props) {
  const { data, mutate, isLoading } = useSWR("settings-llm", getLLMSettings, {
    revalidateOnFocus: false,
  });

  const [provider, setProvider] = useState<LLMProviderId>("mock");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // 데이터 로드 시 폼 초기화
  useEffect(() => {
    if (!data) return;
    const cur = data.fields["llm_provider"]?.value as LLMProviderId | undefined;
    if (cur) setProvider(cur);
  }, [data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleField = (key: string, val: string) =>
    setDraft((d) => ({ ...d, [key]: val }));

  const buildPayload = useCallback((): LLMSettingsUpdate => {
    const payload: LLMSettingsUpdate = { llm_provider: provider };
    for (const f of PROVIDER_FIELDS[provider]) {
      const v = draft[f.key as string];
      if (v !== undefined && v !== "") {
        if (f.type === "number") {
          const n = Number(v);
          if (!Number.isNaN(n)) (payload as Record<string, unknown>)[f.key] = n;
        } else {
          (payload as Record<string, unknown>)[f.key] = v;
        }
      }
    }
    return payload;
  }, [provider, draft]);

  const handleTest = async () => {
    setBusy(true);
    setTestResult(null);
    try {
      const res = await testLLMSettings(buildPayload());
      setTestResult({
        ok: res.ok,
        msg: res.ok
          ? `연결 OK — ${res.provider} · ${res.model_id} (${res.health.latency_ms?.toFixed(0) ?? "?"}ms)`
          : `연결 실패 — ${res.health.error ?? "원인 불명"}`,
      });
    } catch (e) {
      setTestResult({ ok: false, msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await updateLLMSettings(buildPayload());
      await mutate();
      setDraft({});
      setTestResult({ ok: true, msg: "저장 완료 — provider 즉시 교체" });
    } catch (e) {
      setTestResult({ ok: false, msg: `저장 실패: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("저장된 runtime 설정을 모두 삭제하고 .env 기본값으로 복귀할까요?")) return;
    setBusy(true);
    try {
      await resetLLMSettings();
      await mutate();
      setDraft({});
      setTestResult({ ok: true, msg: "초기화 완료" });
    } finally {
      setBusy(false);
    }
  };

  const fields = PROVIDER_FIELDS[provider];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[640px] max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-brand" />
            <h2 className="text-sm font-bold">LLM 설정 — 두뇌 교체</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X size={16} />
          </button>
        </header>

        <div className="space-y-5 p-5">
          {/* 현재 상태 */}
          {data && (
            <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs dark:bg-neutral-950">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">현재 활성 provider</span>
                <span className="font-mono font-semibold">{data.current.provider}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-neutral-500">모델 ID</span>
                <span className="font-mono text-[11px]">{data.current.model_id}</span>
              </div>
            </div>
          )}

          {/* Provider 선택 */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">
              Provider
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDER_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => {
                    setProvider(o.id);
                    setTestResult(null);
                  }}
                  className={`rounded-lg border p-2 text-left text-xs transition-all ${
                    provider === o.id
                      ? "border-brand bg-brand/5 ring-1 ring-brand"
                      : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
                  }`}
                >
                  <div className="font-semibold">{o.label}</div>
                  <div className="mt-0.5 text-[10px] text-neutral-500">{o.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 필드 입력 */}
          {fields.length > 0 && (
            <div>
              <label className="mb-2 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                설정값
              </label>
              <div className="space-y-2">
                {fields.map((f) => {
                  const current = data?.fields[f.key as string];
                  return (
                    <div key={f.key as string}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] text-neutral-600 dark:text-neutral-400">
                          {f.label}
                        </span>
                        {f.secret && current?.is_set && (
                          <span className="font-mono text-[10px] text-neutral-400">
                            현재: {current.value as string}
                          </span>
                        )}
                        {!f.secret && current?.is_set && (
                          <span className="font-mono text-[10px] text-neutral-400">
                            현재: {String(current.value)}
                          </span>
                        )}
                      </div>
                      <input
                        type={f.secret ? "password" : f.type === "number" ? "number" : "text"}
                        value={draft[f.key as string] ?? ""}
                        placeholder={f.placeholder ?? (f.secret ? "변경 시에만 입력" : "")}
                        onChange={(e) => handleField(f.key as string, e.target.value)}
                        autoComplete="off"
                        className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm font-mono focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
                      />
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-neutral-500">
                ⓘ 비밀 키는 백엔드 로컬 파일에 저장되며 다시 평문으로 조회되지 않습니다.
                빈 칸은 변경 없음 / 기존 값 유지.
              </p>
            </div>
          )}

          {/* 테스트 결과 */}
          {testResult && (
            <div
              className={`flex items-start gap-2 rounded-lg p-3 text-xs ${
                testResult.ok
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
              }`}
            >
              {testResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              <span className="flex-1">{testResult.msg}</span>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <button
            onClick={handleReset}
            disabled={busy}
            className="text-xs text-neutral-500 hover:text-rose-600 disabled:opacity-50"
          >
            기본값으로 초기화
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTest}
              disabled={busy || isLoading}
              className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-semibold hover:border-brand hover:text-brand disabled:opacity-50 dark:border-neutral-700"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              연결 테스트
            </button>
            <button
              onClick={handleSave}
              disabled={busy || isLoading}
              className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-soft disabled:opacity-50"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              저장 및 적용
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
