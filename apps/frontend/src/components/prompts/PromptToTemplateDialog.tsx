"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Save, Sparkles, Wand2, X } from "lucide-react";

import {
  runPrompt,
  savePromptAsTemplate,
  type PromptItem,
  type PromptRunResult,
} from "@/lib/api";

interface Props {
  prompt: PromptItem;
  onClose: () => void;
  onSaved?: (templateId: string, linkedOrgs: number) => void;
}

const CATEGORIES = ["", "공문", "보고서", "제안서", "회의록", "메모", "기타"] as const;

/**
 * 프롬프트 → LLM 실행 → 결과를 양식으로 저장 + 조직 프로파일 자동 연결.
 *
 * 흐름:
 *   1) 변수가 있으면 채우고
 *   2) "실행" 버튼 → LLM 호출 → 결과 마크다운 표시
 *   3) 메타(제목·카테고리·태그) 확인
 *   4) "양식으로 저장" → template_library 등록 + 같은 라벨의 조직 프로파일에 자동 연결
 */
export function PromptToTemplateDialog({ prompt, onClose, onSaved }: Props) {
  // 1. 변수 추출 — {{var}} 패턴
  const variableNames = Array.from(
    new Set((prompt.content.match(/\{\{(\w+)\}\}/g) ?? []).map((m) => m.slice(2, -2))),
  );
  const [variables, setVariables] = useState<Record<string, string>>(
    Object.fromEntries(variableNames.map((v) => [v, ""])),
  );
  const [userInput, setUserInput] = useState("");
  const [temperature, setTemperature] = useState(0.4);

  // 2. 실행 결과
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PromptRunResult | null>(null);
  const [resultEditable, setResultEditable] = useState("");
  const [runErr, setRunErr] = useState<string | null>(null);

  // 3. 저장 메타
  const [saveTitle, setSaveTitle] = useState(`[${prompt.organization_label || "양식"}] ${prompt.title}`);
  const [saveCategory, setSaveCategory] = useState<string>(
    inferCategory(prompt) ?? "",
  );
  const [saveTags, setSaveTags] = useState((prompt.tags ?? []).join(", "));
  const [saveDescription, setSaveDescription] = useState(
    `프롬프트 [${prompt.title}] 실행 결과 — ${prompt.organization_label || "회사 양식"}용`,
  );
  const [autoLink, setAutoLink] = useState(true);
  const [shared, setShared] = useState(true);

  // 4. 저장 상태
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleRun = async () => {
    setRunning(true);
    setRunErr(null);
    setSaveResult(null);
    try {
      const r = await runPrompt(prompt.id, {
        variables,
        user_input: userInput,
        temperature,
      });
      setResult(r);
      setResultEditable(r.result_markdown);
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const handleSave = async () => {
    if (!resultEditable.trim()) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const r = await savePromptAsTemplate(prompt.id, {
        content: resultEditable,
        title: saveTitle.trim(),
        category: saveCategory,
        tags: saveTags.split(",").map((t) => t.trim()).filter(Boolean),
        description: saveDescription,
        shared_with_org: shared,
        auto_link_to_organization: autoLink,
      });
      const linkedCount = r.linked_organization_ids.length;
      setSaveResult({
        ok: true,
        msg: linkedCount > 0
          ? `양식 등록됨 — ${linkedCount}개 조직 프로파일의 기본 양식으로 자동 연결`
          : "양식 등록됨 — 양식 라이브러리에서 조회 가능",
      });
      onSaved?.(r.template.id, linkedCount);
    } catch (e) {
      setSaveResult({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Wand2 size={16} className="text-brand" />
            <h2 className="text-base font-semibold">프롬프트 → 양식 만들기</h2>
            <span className="text-xs text-neutral-500">
              {prompt.organization_label && (
                <>
                  <span className="font-medium text-brand">{prompt.organization_label}</span> ·{" "}
                </>
              )}
              {prompt.title}
            </span>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X size={16} />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-12 overflow-hidden">
          {/* 좌측 — 입력 */}
          <section className="col-span-5 flex flex-col gap-3 overflow-y-auto border-r border-neutral-200 p-4 text-xs dark:border-neutral-800">
            <div>
              <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                프롬프트 원문
              </h3>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-neutral-50 p-2 font-mono text-[11px] text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                {prompt.content}
              </pre>
            </div>

            {variableNames.length > 0 && (
              <div>
                <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                  변수 채우기 ({"{{var}}"} 자동 인식)
                </h3>
                <div className="space-y-1.5">
                  {variableNames.map((v) => (
                    <label key={v} className="block">
                      <span className="block text-[10px] font-medium text-neutral-600 dark:text-neutral-400">
                        {v}
                      </span>
                      <input
                        value={variables[v] ?? ""}
                        onChange={(e) => setVariables((d) => ({ ...d, [v]: e.target.value }))}
                        className="w-full rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                        placeholder={`{{${v}}} 값`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                추가 입력 (선택)
              </h3>
              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                rows={4}
                placeholder="실제 데이터·맥락 추가 (예: 2026년 수치, 특정 부서 정보 등)"
                className="w-full rounded border border-neutral-200 px-2 py-1 font-mono dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>

            <div>
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                  창의도 (temperature) = {temperature.toFixed(2)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full"
                />
                <span className="text-[9px] text-neutral-400">
                  낮을수록 결정적 (양식엔 0.2~0.5 권장), 높을수록 다양한 표현
                </span>
              </label>
            </div>

            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center justify-center gap-2 rounded bg-brand py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand/90 disabled:opacity-50"
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {running ? "LLM 실행 중…" : result ? "다시 실행" : "LLM 실행"}
            </button>

            {runErr && (
              <p className="rounded bg-rose-50 p-2 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                {runErr}
              </p>
            )}
          </section>

          {/* 우측 — 결과 + 저장 메타 */}
          <section className="col-span-7 flex flex-col overflow-hidden">
            {!result ? (
              <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
                좌측에서 "LLM 실행"을 누르면 결과가 여기에 표시됩니다.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 text-[10px] text-neutral-500 dark:border-neutral-800">
                  <span>
                    <span className="font-mono">{result.model_version}</span>
                    {" · "}
                    {result.latency_ms.toFixed(0)}ms
                    {" · "}
                    {resultEditable.length.toLocaleString()}자
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(resultEditable)}
                    className="flex items-center gap-1 rounded px-2 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <Copy size={10} />복사
                  </button>
                </div>
                <textarea
                  value={resultEditable}
                  onChange={(e) => setResultEditable(e.target.value)}
                  className="flex-1 resize-none bg-transparent p-4 font-mono text-[12px] leading-relaxed text-neutral-900 outline-none dark:text-neutral-100"
                  placeholder="LLM 결과 — 필요 시 직접 편집 후 저장"
                />

                <div className="border-t border-neutral-200 p-4 dark:border-neutral-800">
                  <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                    양식으로 저장 메타
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="col-span-2">
                      <span className="text-[10px] text-neutral-500">제목</span>
                      <input
                        value={saveTitle}
                        onChange={(e) => setSaveTitle(e.target.value)}
                        className="w-full rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                      />
                    </label>
                    <label>
                      <span className="text-[10px] text-neutral-500">카테고리</span>
                      <select
                        value={saveCategory}
                        onChange={(e) => setSaveCategory(e.target.value)}
                        className="w-full rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c || "(미지정)"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="text-[10px] text-neutral-500">태그 (쉼표)</span>
                      <input
                        value={saveTags}
                        onChange={(e) => setSaveTags(e.target.value)}
                        className="w-full rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                      />
                    </label>
                    <label className="col-span-2">
                      <span className="text-[10px] text-neutral-500">설명</span>
                      <input
                        value={saveDescription}
                        onChange={(e) => setSaveDescription(e.target.value)}
                        className="w-full rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                      />
                    </label>
                    <label className="col-span-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoLink}
                        onChange={(e) => setAutoLink(e.target.checked)}
                      />
                      <span>
                        같은 라벨(<span className="font-mono text-brand">{prompt.organization_label || "—"}</span>)의 조직
                        프로파일에 <strong>기본 양식으로 자동 연결</strong>
                      </span>
                    </label>
                    <label className="col-span-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={shared}
                        onChange={(e) => setShared(e.target.checked)}
                      />
                      <span>조직 내 공유 (동료가 볼 수 있음)</span>
                    </label>
                  </div>

                  {saveResult && (
                    <p
                      className={`mt-2 rounded p-2 text-xs ${
                        saveResult.ok
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      }`}
                    >
                      {saveResult.ok ? <Check size={11} className="mr-1 inline" /> : null}
                      {saveResult.msg}
                    </p>
                  )}

                  <button
                    onClick={handleSave}
                    disabled={saving || !resultEditable.trim()}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-brand py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand/90 disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    양식으로 저장 + 조직 자동 연결
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** 프롬프트 카테고리·태그 텍스트에서 양식 카테고리 추정. */
function inferCategory(p: PromptItem): string | null {
  const haystack = `${p.category} ${p.title} ${p.tags.join(" ")}`;
  if (/공문|공고|안내문/.test(haystack)) return "공문";
  if (/보고|월보|주보/.test(haystack)) return "보고서";
  if (/제안|입찰|기획서/.test(haystack)) return "제안서";
  if (/회의록|회의 기록/.test(haystack)) return "회의록";
  if (/메모|전언/.test(haystack)) return "메모";
  return null;
}
