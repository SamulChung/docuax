"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Loader2, Wand2, X } from "lucide-react";

import {
  TASK_TYPE_COLOR,
  TASK_TYPE_KO,
  composeAxes,
  createPrompt,
  type PromptTaskType,
} from "@/lib/api";

/**
 * 역관목조분 5축 + 요정분생설 task_type 으로 구조화된 신규 프롬프트 마법사.
 *
 * - 5필드(역할/관련분야/목적/조건/분량) 입력 → 백엔드 /prompts/compose-axes 가
 *   표준 포맷으로 합쳐 content 미리보기 반환 (300ms debounce).
 * - 사용자가 본문(=task 지시)을 추가로 자유 입력하면 [유형]·5축 헤더 뒤에 붙음.
 * - task_type 라디오 (5색칩) — 빈 값(미지정) 도 허용.
 */

const TASK_OPTIONS: { key: PromptTaskType; ko: string; tagline: string }[] = [
  { key: "summary", ko: "요약", tagline: "긴 글 → 핵심" },
  { key: "organization", ko: "정리", tagline: "흐트러진 정보 → 구조" },
  { key: "analysis", ko: "분석", tagline: "원인·비교·평가" },
  { key: "generation", ko: "생성", tagline: "초안·작성·창작" },
  { key: "explanation", ko: "설명", tagline: "개념·이유 풀이" },
];

interface Props {
  /** 미리 채울 회사/기관 라벨 (라이브러리에서 현재 선택된 라벨) */
  defaultLabel: string;
  onClose: () => void;
  onCreated: () => void;
}

export function PromptStructureWizard({ defaultLabel, onClose, onCreated }: Props) {
  // 메타 — 카드 표시 용도
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [organizationLabel, setOrganizationLabel] = useState(defaultLabel);

  // 역관목조분 5축
  const [role, setRole] = useState("");
  const [field, setField] = useState("");
  const [purpose, setPurpose] = useState("");
  const [conditions, setConditions] = useState("");
  const [length, setLength] = useState("");
  // 요정분생설 task_type
  const [taskType, setTaskType] = useState<PromptTaskType>("");
  // 본문 — 5축 뒤에 추가될 자유 지시문
  const [body, setBody] = useState("");

  // 합성된 content (서버가 만들어 줌 — 포맷 변경 시 한 곳만 고침)
  const [preview, setPreview] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 입력이 변할 때마다 300ms 후 서버에 미리보기 요청
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPreviewBusy(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await composeAxes({
          role,
          field,
          purpose,
          conditions,
          length,
          task_type: taskType,
          body,
        });
        setPreview(res.content);
      } catch {
        // 미리보기 실패는 무시 — 사용자가 저장 시도하면 거기서 에러 표시
      } finally {
        setPreviewBusy(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [role, field, purpose, conditions, length, taskType, body]);

  const canSave = useMemo(() => {
    return title.trim().length > 0 && preview.trim().length > 0;
  }, [title, preview]);

  const submit = async () => {
    if (!canSave) {
      setErr("제목과 본문/축 중 하나 이상이 필요합니다.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await createPrompt({
        title,
        content: preview,
        description,
        category,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        organization_label: organizationLabel,
        role,
        field,
        purpose,
        conditions,
        length,
        task_type: taskType,
      });
      onCreated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // 403 = 관리자 권한 필요 — 비로그인/일반 사용자가 시연할 때 명확한 안내.
      if (msg.includes("403") || msg.includes("관리자")) {
        setErr(
          "저장하려면 관리자 권한이 필요합니다. 관리자 계정으로 로그인하시거나, " +
            "조립된 본문을 [복사] 해서 외부 도구로 옮겨 쓰세요.",
        );
      } else {
        setErr(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // Esc 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Wand2 size={16} className="text-brand" />
            <h2 className="text-base font-semibold">새 프롬프트 — 구조화 마법사</h2>
            <span className="text-xs text-neutral-500">
              역관목조분 (역할·관련분야·목적·조건·분량) + 요정분생설 (요약·정리·분석·생성·설명)
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={16} />
          </button>
        </div>

        {/* 본문 — 좌우 분할: 좌(입력) / 우(미리보기) */}
        <div className="grid flex-1 grid-cols-12 overflow-hidden">
          <div className="col-span-7 overflow-y-auto border-r border-neutral-200 p-5 dark:border-neutral-800">
            {/* 메타 — 라이브러리 카드에 표시될 정보 */}
            <section className="mb-4">
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                카드 정보
              </h3>
              <div className="grid gap-2 text-xs">
                <input
                  placeholder="제목 * (예: 병원장 미팅 자료 초안)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="회사/기관 라벨"
                    value={organizationLabel}
                    onChange={(e) => setOrganizationLabel(e.target.value)}
                    className="rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                  />
                  <input
                    placeholder="카테고리"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </div>
                <input
                  placeholder="태그 (쉼표 구분)"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                />
                <input
                  placeholder="설명 (선택)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                />
              </div>
            </section>

            {/* 요정분생설 — task_type 선택 */}
            <section className="mb-4">
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                요정분생설 — 시킬 일의 종류
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setTaskType("")}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    taskType === ""
                      ? "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100"
                      : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  미지정
                </button>
                {TASK_OPTIONS.map((o) => {
                  const active = taskType === o.key;
                  const color = o.key && TASK_TYPE_COLOR[o.key as Exclude<PromptTaskType, "">];
                  return (
                    <button
                      type="button"
                      key={o.key}
                      onClick={() => setTaskType(o.key)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                        active ? color : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400"
                      }`}
                      title={o.tagline}
                    >
                      {o.ko}
                      <span className="ml-1 opacity-60">{o.tagline}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 역관목조분 — 5축 */}
            <section>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                역관목조분 — 답안 설계 5축
              </h3>
              <div className="grid gap-2 text-xs">
                <AxisInput
                  label="역할"
                  hint="누가 답하는가 (예: 의료 AI 영업 전문가)"
                  value={role}
                  onChange={setRole}
                />
                <AxisInput
                  label="관련분야"
                  hint="어떤 영역의 지식 (예: 산부인과 SaaS)"
                  value={field}
                  onChange={setField}
                />
                <AxisInput
                  label="목적"
                  hint="왜 답하는가 (예: 병원장 미팅 자료 준비)"
                  value={purpose}
                  onChange={setPurpose}
                />
                <AxisInput
                  label="조건"
                  hint="제약 사항 (예: 근거 인용 · 추측 금지)"
                  value={conditions}
                  onChange={setConditions}
                />
                <AxisInput
                  label="분량"
                  hint="길이/형식 (예: A4 한 쪽 · 4단락)"
                  value={length}
                  onChange={setLength}
                />
              </div>
            </section>

            <section className="mt-4">
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                추가 지시 (선택)
              </h3>
              <textarea
                placeholder="5축으로 충분치 않을 때 자유 입력 — 예시·금지사항·출력 형식 등"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                className="w-full rounded border border-neutral-200 px-2 py-1 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
              />
            </section>
          </div>

          {/* 미리보기 — 실제 LLM 에 보낼 content */}
          <div className="col-span-5 flex flex-col overflow-hidden bg-neutral-50/60 dark:bg-neutral-950/40">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
              <h3 className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                <ChevronRight size={12} />
                실제 LLM 입력 미리보기
              </h3>
              {previewBusy && <Loader2 size={11} className="animate-spin text-neutral-400" />}
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-[11px] leading-relaxed text-neutral-800 dark:text-neutral-200">
              {preview || "(축을 채우거나 추가 지시를 입력하세요)"}
            </pre>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <div className="text-[11px] text-neutral-500">
            💡 빈 축은 자동으로 생략 — 헤더가 짧을수록 LLM 이 따르기 쉬움
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
              onClick={submit}
              disabled={saving || !canSave}
              className="flex items-center gap-1 rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
            >
              {saving && <Loader2 size={11} className="animate-spin" />}
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AxisInput({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-start gap-2">
      <span className="mt-1 shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-xs focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
      />
    </label>
  );
}
