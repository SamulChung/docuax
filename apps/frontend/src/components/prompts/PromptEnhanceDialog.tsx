"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";

import {
  TASK_TYPE_COLOR,
  TASK_TYPE_KO,
  enhancePrompt,
  updatePrompt,
  type EnhancePromptResult,
  type PromptItem,
  type PromptTaskType,
} from "@/lib/api";

/**
 * 기존 프롬프트의 자유 텍스트 content 를 LLM 으로 분석해
 * 역관목조분 + 요정분생설 구조 필드를 제안 → 사용자 확인 후 저장.
 *
 * 흐름:
 *  1) 모달 열림 → 자동으로 enhancePrompt(id) 호출
 *  2) 제안된 5축·task_type·재조립된 content 를 좌우 비교(원본 vs 제안)
 *  3) [적용] 누르면 PATCH /prompts/{id} 로 5축 + task_type + content 갱신
 *
 * 원본 content 는 백엔드가 [유형]·5축 헤더 뒤에 그대로 보존하므로 무손실.
 */

interface Props {
  prompt: PromptItem;
  onClose: () => void;
  onApplied: (updated: PromptItem) => void;
}

export function PromptEnhanceDialog({ prompt, onClose, onApplied }: Props) {
  const [result, setResult] = useState<EnhancePromptResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // 사용자가 편집 가능 — 제안값 그대로 받지 않고 수정 후 적용 가능
  const [role, setRole] = useState("");
  const [field, setField] = useState("");
  const [purpose, setPurpose] = useState("");
  const [conditions, setConditions] = useState("");
  const [length, setLength] = useState("");
  const [taskType, setTaskType] = useState<PromptTaskType>("");
  const [newContent, setNewContent] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    enhancePrompt(prompt.id)
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setRole(r.suggested_role);
        setField(r.suggested_field);
        setPurpose(r.suggested_purpose);
        setConditions(r.suggested_conditions);
        setLength(r.suggested_length);
        setTaskType(r.suggested_task_type);
        setNewContent(r.suggested_content);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [prompt.id]);

  // Esc 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const apply = async () => {
    setApplying(true);
    setErr(null);
    try {
      const updated = await updatePrompt(prompt.id, {
        role,
        field,
        purpose,
        conditions,
        length,
        task_type: taskType,
        content: newContent,
      });
      onApplied(updated);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-brand" />
            <h2 className="text-base font-semibold">AI 고도화 — 역관목조분 + 요정분생설</h2>
            <span className="text-xs text-neutral-500">
              [{prompt.title}] · LLM 이 5축·task_type 을 추출 → 검토 후 적용
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={16} />
          </button>
        </div>

        {loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-neutral-500">
            <Loader2 size={20} className="animate-spin text-brand" />
            <p>LLM 이 프롬프트를 분석 중…</p>
            <p className="text-[11px]">자유 텍스트 → 5축 추출 + task_type 분류</p>
          </div>
        )}

        {err && !loading && (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-md rounded border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              <p className="font-semibold">고도화 실패</p>
              <p className="mt-1 text-xs">{err}</p>
            </div>
          </div>
        )}

        {!loading && !err && result && (
          <>
            {/* 본문 — 좌(원본) / 우(제안 + 편집 가능) */}
            <div className="grid flex-1 grid-cols-12 overflow-hidden">
              {/* 원본 */}
              <div className="col-span-5 flex flex-col overflow-hidden border-r border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-950/40">
                <div className="border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                    원본 (변경 없음)
                  </h3>
                </div>
                <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {prompt.content}
                </pre>
              </div>

              {/* 제안 — 편집 가능 */}
              <div className="col-span-7 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                    AI 제안 (편집 가능)
                  </h3>
                  <span className="text-[10px] text-neutral-400">
                    {result.model_version} · {result.latency_ms.toFixed(0)}ms
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {result.rationale && (
                    <div className="mb-3 rounded border border-brand/30 bg-brand/5 p-2 text-[11px] text-brand">
                      💡 {result.rationale}
                    </div>
                  )}

                  {/* task_type 라디오 */}
                  <section className="mb-3">
                    <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                      요정분생설 (task_type)
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      <TypeChip current={taskType} value="" label="미지정" onSelect={setTaskType} />
                      {(["summary", "organization", "analysis", "generation", "explanation"] as const).map((k) => (
                        <TypeChip
                          key={k}
                          current={taskType}
                          value={k}
                          label={TASK_TYPE_KO[k]}
                          onSelect={setTaskType}
                        />
                      ))}
                    </div>
                  </section>

                  {/* 역관목조분 5축 */}
                  <section>
                    <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                      역관목조분 (5축)
                    </h4>
                    <div className="grid gap-1.5 text-xs">
                      <FieldRow label="역할" value={role} onChange={setRole} />
                      <FieldRow label="관련분야" value={field} onChange={setField} />
                      <FieldRow label="목적" value={purpose} onChange={setPurpose} />
                      <FieldRow label="조건" value={conditions} onChange={setConditions} />
                      <FieldRow label="분량" value={length} onChange={setLength} />
                    </div>
                  </section>

                  {/* 재조립된 content — 편집 가능 */}
                  <section className="mt-3">
                    <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                      재조립된 content (저장될 내용)
                    </h4>
                    <textarea
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      rows={10}
                      className="w-full rounded border border-neutral-200 p-2 font-mono text-[11px] leading-relaxed dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </section>
                </div>
              </div>
            </div>

            {/* 푸터 */}
            <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
              <div className="text-[11px] text-neutral-500">
                💾 적용하면 원본 content + 5축 + task_type 이 모두 갱신됩니다 (원본은 새 content 안에 그대로 보존)
              </div>
              <div className="flex items-center gap-2">
                {err && <p className="text-xs text-rose-600">{err}</p>}
                <button
                  onClick={onClose}
                  className="rounded border border-neutral-200 px-3 py-1.5 text-xs hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                >
                  취소
                </button>
                <button
                  onClick={apply}
                  disabled={applying || !newContent.trim()}
                  className="flex items-center gap-1 rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
                >
                  {applying ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  적용
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-16 shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-center text-[10px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="(원본에 명시 안 됨)"
        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-xs focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
      />
    </label>
  );
}

function TypeChip({
  current,
  value,
  label,
  onSelect,
}: {
  current: PromptTaskType;
  value: PromptTaskType;
  label: string;
  onSelect: (v: PromptTaskType) => void;
}) {
  const active = current === value;
  const color = value && TASK_TYPE_COLOR[value as Exclude<PromptTaskType, "">];
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
        active
          ? color || "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100"
          : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400"
      }`}
    >
      {label}
    </button>
  );
}
