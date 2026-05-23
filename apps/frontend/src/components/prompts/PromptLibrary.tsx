"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  Building2,
  Check,
  ClipboardCopy,
  Download,
  FileText,
  Loader2,
  PlusCircle,
  Search,
  Send,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";

import { PromptEnhanceDialog } from "@/components/prompts/PromptEnhanceDialog";
import { PromptStructureWizard } from "@/components/prompts/PromptStructureWizard";
import { PromptToTemplateDialog } from "@/components/prompts/PromptToTemplateDialog";

import {
  TASK_TYPE_COLOR,
  TASK_TYPE_KO,
  deletePrompt,
  deletePromptsByOrganization,
  getMe,
  importPromptHtml,
  listPromptOrganizations,
  listPrompts,
  promptMarkdownExportUrl,
  runPrompt,
  type PromptItem,
  type PromptTaskType,
} from "@/lib/api";
import { useChat } from "@/store/chat";
import { useWorkspace } from "@/store/workspace";

interface Props {
  onClose: () => void;
}

export function PromptLibrary({ onClose }: Props) {
  const [selectedLabel, setSelectedLabel] = useState<string>("__all__");
  const [filter, setFilter] = useState("");
  // task_type 필터 — "__all__"(전체), ""(미지정만), 또는 PromptTaskType 키 5개
  const [taskFilter, setTaskFilter] = useState<"__all__" | PromptTaskType>("__all__");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [importLabel, setImportLabel] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [makeTemplateOf, setMakeTemplateOf] = useState<PromptItem | null>(null);
  const [enhanceOf, setEnhanceOf] = useState<PromptItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const source = useWorkspace((s) => s.source);
  const setSource = useWorkspace((s) => s.setSource);

  const { data: me } = useSWR("me", () => getMe().catch(() => null), {
    shouldRetryOnError: false,
  });
  const isAdmin = Boolean(me?.is_admin);

  const orgsKey = "prompt-orgs";
  const { data: orgs = [], mutate: mutateOrgs } = useSWR(orgsKey, listPromptOrganizations);
  const labelArg = selectedLabel === "__all__" ? undefined : selectedLabel;
  const listKey = `prompts:${selectedLabel}`;
  const { data: prompts = [], mutate: mutateList, isLoading } = useSWR(listKey, () =>
    listPrompts({ organization_label: labelArg, scope: "all" }),
  );

  // 카테고리 그룹화 — 텍스트 필터 + task_type 필터 적용
  const byCategory = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = prompts.filter((p) => {
      // 텍스트 필터
      if (q) {
        const hit =
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q));
        if (!hit) return false;
      }
      // task_type 필터
      if (taskFilter !== "__all__") {
        const pt = (p.task_type ?? "") as PromptTaskType;
        if (pt !== taskFilter) return false;
      }
      return true;
    });
    const map = new Map<string, PromptItem[]>();
    for (const p of filtered) {
      const cat = p.category || "(분류 없음)";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return Array.from(map.entries());
  }, [prompts, filter, taskFilter]);

  // 전체 목록 기준 task_type 별 카운트 — 필터 칩에 표시
  const taskCounts = useMemo(() => {
    const c: Record<string, number> = { "": 0, summary: 0, organization: 0, analysis: 0, generation: 0, explanation: 0 };
    for (const p of prompts) {
      const k = (p.task_type ?? "") as string;
      if (k in c) c[k]++;
    }
    return c;
  }, [prompts]);

  const handleCopy = async (p: PromptItem) => {
    try {
      await navigator.clipboard.writeText(p.content);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = p.content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  const handleInsertToEditor = (p: PromptItem) => {
    const block = `\n\n> **프롬프트 — ${p.title}**${p.description ? `\n> ${p.description}` : ""}\n\n\`\`\`\n${p.content}\n\`\`\`\n\n`;
    setSource(source + block);
    onClose();
  };

  /**
   * 프롬프트 카드의 메인 동작 — runPrompt(id) 로 LLM 에 직접 실행.
   *
   * 흐름:
   *   1) 라이브러리 모달 닫기
   *   2) runPrompt() 호출 → result_markdown
   *   3) editor source 를 결과로 교체
   *   4) docuax:trigger-convert 이벤트 (forceFast=true) → 변환 결과 창에 문서 표시
   *
   * 채팅은 건드리지 않음 (이전 흐름 복원).
   */
  const handleRunPrompt = async (p: PromptItem) => {
    onClose();
    // 모달 닫힘 직후 실행 — 사용자가 변환 진행 UI 를 보게
    setTimeout(async () => {
      try {
        const res = await runPrompt(p.id, {});
        useWorkspace.getState().setSource(res.result_markdown);
        // forceFast=true → LLM 분석·검토 단계 skip (이미 LLM 거친 결과라 중복).
        window.dispatchEvent(
          new CustomEvent("docuax:trigger-convert", { detail: { forceFast: true } }),
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("403")) {
          alert(
            "프롬프트 실행은 관리자만 가능합니다.\n" +
              "관리자로 로그인하시거나 [복사] → 외부 도구에서 사용하세요.",
          );
        } else {
          alert(`프롬프트 실행 실패: ${msg}`);
        }
      }
    }, 100);
  };

  /**
   * 프롬프트를 AI 채팅 입력란에 채워넣기 — 보조 동작.
   * - immediate=false: 입력란에 prefill (사용자가 검토 후 Enter)
   * - immediate=true:  즉시 send() 호출 → 응답까지 자동 진행
   */
  const handleSendToChat = (p: PromptItem, immediate = false) => {
    // 라이브러리 모달만 닫고, 채팅은 작은 ChatDock 에서 진행.
    // 확대(ChatPanel)는 박사님이 명시적으로 ⤢ 클릭할 때만 노출.
    onClose();

    const text = p.content.trim();
    if (immediate) {
      // 즉시 전송 — useChat.send() 호출 (배경 setTimeout 으로 모달 닫힘 애니메이션 후)
      setTimeout(() => {
        useChat.getState().send(text);
      }, 100);
    } else {
      // 입력란에 prefill — ChatDock 이 docuax:chat-prefill 이벤트 리스닝 중
      setTimeout(() => {
        const evt = new CustomEvent("docuax:chat-prefill", { detail: { text } });
        window.dispatchEvent(evt);
      }, 100);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const res = await importPromptHtml({
        file: f,
        organization_label: importLabel || undefined,
      });
      setUploadMsg({
        ok: true,
        text: `${res.imported}건 임포트 — ${res.detected_label}${res.warnings.length ? ` (경고 ${res.warnings.length})` : ""}`,
      });
      // 새 라벨 자동 선택
      const newLabel = importLabel || res.detected_label;
      setSelectedLabel(newLabel);
      setImportLabel("");
      mutateOrgs();
      mutateList();
    } catch (err: unknown) {
      setUploadMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (p: PromptItem) => {
    if (!confirm(`"${p.title}" 프롬프트를 삭제할까요?`)) return;
    await deletePrompt(p.id);
    mutateList();
    mutateOrgs();
  };

  const handleDeleteAll = async () => {
    if (selectedLabel === "__all__") return;
    const stat = orgs.find((o) => o.label === selectedLabel);
    if (!stat) return;
    if (!confirm(`"${selectedLabel}"의 내 프롬프트 ${stat.count}건을 모두 삭제할까요?`)) return;
    const res = await deletePromptsByOrganization(selectedLabel, true);
    setUploadMsg({ ok: true, text: `${res.deleted}건 삭제됨` });
    setSelectedLabel("__all__");
    mutateOrgs();
    mutateList();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-brand" />
            <h2 className="text-base font-semibold">프롬프트 라이브러리</h2>
            <span className="text-xs text-neutral-500">
              회사·기관별 프롬프트 치트시트 — 강의·컨설팅 자료를 클릭 한 번에 재사용
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={16} />
          </button>
        </div>

        {/* 조직 라벨 칩 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-5 py-2 dark:border-neutral-800">
          <Building2 size={12} className="text-neutral-500" />
          <button
            onClick={() => setSelectedLabel("__all__")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
              selectedLabel === "__all__"
                ? "bg-brand text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            전체 ({orgs.reduce((s, o) => s + o.count, 0)})
          </button>
          {orgs.map((o) => (
            <button
              key={o.label}
              onClick={() => setSelectedLabel(o.label)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                selectedLabel === o.label
                  ? "bg-brand text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
              }`}
            >
              {o.label}{" "}
              <span className="opacity-60">({o.count})</span>
            </button>
          ))}
          {orgs.length === 0 && (
            <span className="text-xs text-neutral-500">
              아직 등록된 회사가 없습니다. 아래 "HTML 임포트"로 핸드북을 업로드해 보세요.
            </span>
          )}
        </div>

        {/* 요정분생설 — task_type 필터 칩 */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-200 px-5 py-2 dark:border-neutral-800">
          <Sparkles size={12} className="text-neutral-500" />
          <span className="mr-1 text-[10px] uppercase tracking-wide text-neutral-500">
            요정분생설
          </span>
          <button
            onClick={() => setTaskFilter("__all__")}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
              taskFilter === "__all__"
                ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            전체
          </button>
          {(["summary", "organization", "analysis", "generation", "explanation"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTaskFilter(k)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
                taskFilter === k
                  ? TASK_TYPE_COLOR[k]
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
              }`}
              title={`${TASK_TYPE_KO[k]} 타입만 보기`}
            >
              {TASK_TYPE_KO[k]} <span className="opacity-60">({taskCounts[k] || 0})</span>
            </button>
          ))}
          <button
            onClick={() => setTaskFilter("")}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
              taskFilter === ""
                ? "bg-neutral-300 text-neutral-800 dark:bg-neutral-600 dark:text-neutral-100"
                : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400"
            }`}
            title="아직 task_type 이 지정되지 않은 프롬프트 — 'AI 고도화' 대상"
          >
            미지정 <span className="opacity-60">({taskCounts[""] || 0})</span>
          </button>
        </div>

        {/* 툴바: 검색·임포트·export */}
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-5 py-2 dark:border-neutral-800">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="제목·본문·태그 검색"
              className="w-full rounded border border-neutral-200 bg-white py-1 pl-7 pr-2 text-xs focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>
          {isAdmin && (
            <>
              <input
                type="text"
                value={importLabel}
                onChange={(e) => setImportLabel(e.target.value)}
                placeholder="회사/기관 라벨 (예: 문구조합)"
                className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm"
                onChange={handleUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 rounded border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-600 transition-all hover:border-brand hover:text-brand disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                title="prompt-card 클래스가 있는 HTML 핸드북을 자동 추출"
              >
                {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                HTML 임포트
              </button>
            </>
          )}
          {/* 마법사 버튼 — 비관리자도 미리 사용 가능 (저장 시도 시 백엔드가 403).
              관리자 권한이 없는 손님도 흐름·UI 를 체험할 수 있게. */}
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1 rounded bg-brand px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-all hover:bg-brand/90"
            title={
              isAdmin
                ? "역관목조분 + 요정분생설 구조화 마법사로 새 프롬프트 작성"
                : "마법사 미리보기 — 저장하려면 관리자 권한 필요"
            }
          >
            <Wand2 size={11} />새 프롬프트 (마법사)
          </button>
          <a
            href={promptMarkdownExportUrl(labelArg)}
            download={`prompts_${selectedLabel === "__all__" ? "all" : selectedLabel}.md`}
            className="flex items-center gap-1 rounded border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-600 transition-all hover:border-brand hover:text-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            title="마크다운 핸드북으로 다운로드"
          >
            <Download size={11} />MD 다운로드
          </a>
          {isAdmin && selectedLabel !== "__all__" && (
            <button
              onClick={handleDeleteAll}
              className="flex items-center gap-1 rounded border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-600 transition-all hover:bg-rose-50 dark:border-rose-900 dark:bg-neutral-900 dark:text-rose-400"
              title="이 라벨의 프롬프트 일괄 삭제"
            >
              <Trash2 size={11} />라벨 삭제
            </button>
          )}
          {!isAdmin && (
            <span className="ml-auto rounded bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              읽기 전용 — 관리자에게 등록 요청
            </span>
          )}
        </div>

        {/* 업로드 결과 메시지 */}
        {uploadMsg && (
          <div
            className={`border-b px-5 py-2 text-xs ${
              uploadMsg.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
            }`}
          >
            {uploadMsg.text}
          </div>
        )}

        {/* 본문 — 카드 목록 */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500">
              <Loader2 size={14} className="mr-2 animate-spin" />
              불러오는 중…
            </div>
          ) : byCategory.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-sm text-neutral-500">
              <FileText size={32} className="mb-3 opacity-40" />
              <p className="font-medium">
                {prompts.length === 0
                  ? "아직 프롬프트가 없습니다."
                  : "현재 필터에 맞는 프롬프트가 없습니다."}
              </p>
              <p className="mt-1 text-xs">
                {prompts.length === 0
                  ? "HTML 핸드북을 업로드하거나 [새 프롬프트 (마법사)] 로 직접 추가하세요."
                  : "요정분생설 필터를 [전체] 로 바꾸거나 검색어를 비워보세요."}
              </p>
              {isAdmin && prompts.length === 0 && (
                <button
                  onClick={() => setCreateOpen(true)}
                  className="mt-4 flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand/90"
                >
                  <Wand2 size={12} />
                  구조화 마법사로 시작하기
                </button>
              )}
            </div>
          ) : (
            byCategory.map(([cat, items]) => (
              <section key={cat} className="mb-6">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">
                  {cat}{" "}
                  <span className="font-normal text-neutral-400">({items.length})</span>
                </h3>
                <div className="grid gap-2">
                  {items.map((p) => (
                    <PromptCard
                      key={p.id}
                      prompt={p}
                      copied={copiedId === p.id}
                      canDelete={isAdmin}
                      canMakeTemplate={isAdmin}
                      canEnhance={isAdmin}
                      onCopy={() => handleCopy(p)}
                      onInsert={() => handleInsertToEditor(p)}
                      onRunPrompt={() => handleRunPrompt(p)}
                      onSendToChat={(immediate) => handleSendToChat(p, immediate)}
                      onDelete={() => handleDelete(p)}
                      onMakeTemplate={() => setMakeTemplateOf(p)}
                      onEnhance={() => setEnhanceOf(p)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      {createOpen && (
        <PromptStructureWizard
          defaultLabel={selectedLabel === "__all__" ? "" : selectedLabel}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            mutateList();
            mutateOrgs();
            setCreateOpen(false);
          }}
        />
      )}
      {makeTemplateOf && (
        <PromptToTemplateDialog
          prompt={makeTemplateOf}
          onClose={() => setMakeTemplateOf(null)}
          onSaved={(_tid, linked) => {
            setUploadMsg({
              ok: true,
              text: linked > 0
                ? `양식 등록 완료 — ${linked}개 조직 프로파일에 자동 연결됨`
                : "양식 등록 완료 (양식 라이브러리에서 조회 가능)",
            });
          }}
        />
      )}
      {enhanceOf && (
        <PromptEnhanceDialog
          prompt={enhanceOf}
          onClose={() => setEnhanceOf(null)}
          onApplied={(updated) => {
            setEnhanceOf(null);
            setUploadMsg({
              ok: true,
              text: `[${updated.title}] 고도화 적용 — ${
                updated.task_type
                  ? `유형: ${updated.task_type}`
                  : "5축만 갱신"
              }`,
            });
            mutateList();
          }}
        />
      )}
    </div>
  );
}

function PromptCard({
  prompt,
  copied,
  canDelete,
  canMakeTemplate,
  canEnhance,
  onCopy,
  onInsert,
  onRunPrompt,
  onSendToChat,
  onDelete,
  onMakeTemplate,
  onEnhance,
}: {
  prompt: PromptItem;
  copied: boolean;
  canDelete: boolean;
  canMakeTemplate: boolean;
  canEnhance: boolean;
  onCopy: () => void;
  onInsert: () => void;
  /** 메인 — runPrompt 로 LLM 실행 → 변환 결과 창에 문서 출력 (채팅 안 거침) */
  onRunPrompt: () => void;
  /** 보조 — 채팅 워크플로우. immediate=false: 입력란에 채움 / true: 즉시 전송 */
  onSendToChat: (immediate: boolean) => void;
  onDelete: () => void;
  onMakeTemplate: () => void;
  onEnhance: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm transition-all hover:border-brand/40 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase text-brand">
              {prompt.organization_label || "라벨 없음"}
            </span>
            {prompt.task_type && (
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                  TASK_TYPE_COLOR[prompt.task_type as Exclude<PromptTaskType, "">]
                }`}
                title="요정분생설 — LLM 이 시킬 일의 종류"
              >
                {TASK_TYPE_KO[prompt.task_type as Exclude<PromptTaskType, "">]}
              </span>
            )}
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {prompt.title}
            </h4>
          </div>
          {/* 역관목조분 요약 — 5축 중 채워진 것만 1줄 요약 */}
          {(prompt.role || prompt.field || prompt.purpose || prompt.conditions || prompt.length) && (
            <div className="mt-1 flex flex-wrap gap-1 text-[9px] text-neutral-500">
              {prompt.role && <span title="역할">역: {prompt.role.slice(0, 24)}</span>}
              {prompt.field && <span title="관련분야">관: {prompt.field.slice(0, 24)}</span>}
              {prompt.purpose && <span title="목적">목: {prompt.purpose.slice(0, 24)}</span>}
              {prompt.conditions && <span title="조건">조: {prompt.conditions.slice(0, 24)}</span>}
              {prompt.length && <span title="분량">분: {prompt.length.slice(0, 24)}</span>}
            </div>
          )}
          {prompt.description && (
            <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
              {prompt.description}
            </p>
          )}
          {prompt.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Tag size={9} className="text-neutral-400" />
              {prompt.tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* 메인 — LLM 실행 → 결과를 변환 결과 창에 문서로.
              채팅을 거치지 않음 (이전 흐름). */}
          <button
            onClick={onRunPrompt}
            className="flex items-center gap-1 rounded bg-brand px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-all hover:bg-brand/90"
            title="이 프롬프트를 LLM 에 실행 → 결과 문서가 변환 결과 창에 표시 (채팅 거치지 않음)"
          >
            <FileText size={11} />
            실행 → 문서
          </button>
          {/* 보조 — 채팅 워크플로우 (변수 채워서 보내고 싶을 때) */}
          <button
            onClick={(e) => onSendToChat(!e.shiftKey ? true : false)}
            className="flex items-center gap-0.5 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-1 text-[10px] font-semibold text-emerald-700 transition-all hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
            title="채팅으로 보내기 (대화 흐름). Shift+클릭 = 입력란에 채움만"
          >
            <Send size={10} />
            채팅
          </button>
          <button
            onClick={onCopy}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-all ${
              copied
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
            title="OS 클립보드에 복사 — 외부 도구(ChatGPT 웹·Notion 등)로 옮길 때"
          >
            {copied ? <Check size={11} /> : <ClipboardCopy size={11} />}
            {copied ? "복사됨" : "복사"}
          </button>
          <button
            onClick={onInsert}
            className="rounded border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-600 hover:border-brand hover:text-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
            title="에디터 본문에 인용 박스로 삽입 — 문서 안에 프롬프트를 기록할 때"
          >
            에디터로
          </button>
          {canEnhance && (
            <button
              onClick={onEnhance}
              className="flex items-center gap-1 rounded border border-violet-300 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
              title="역관목조분(역할·관련분야·목적·조건·분량) + 요정분생설(요약·정리·분석·생성·설명) 구조로 LLM 이 재작성"
            >
              <Sparkles size={11} />고도화
            </button>
          )}
          {canMakeTemplate && (
            <button
              onClick={onMakeTemplate}
              className="flex items-center gap-1 rounded border border-brand/30 bg-brand/5 px-2 py-1 text-[11px] font-semibold text-brand hover:bg-brand/10"
              title="LLM 실행 → 결과를 회사 양식으로 저장 + 조직 프로파일에 자동 연결"
            >
              <Wand2 size={11} />양식 만들기
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              className="rounded p-1 text-neutral-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
              title="삭제"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>
      <div className="mt-2">
        <pre
          onClick={() => setExpanded((v) => !v)}
          className={`cursor-pointer whitespace-pre-wrap rounded bg-neutral-50 p-2 font-mono text-[11px] leading-relaxed text-neutral-800 transition-all dark:bg-neutral-950/60 dark:text-neutral-200 ${
            expanded ? "" : "line-clamp-4"
          }`}
          title="클릭하면 펼치기/접기"
        >
          {prompt.content}
        </pre>
      </div>
    </div>
  );
}

// CreatePromptDialog → PromptStructureWizard 로 대체됨 (역관목조분 + 요정분생설 구조화 마법사)
