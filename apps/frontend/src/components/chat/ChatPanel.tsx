"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  FileInput,
  FileText,
  LayoutTemplate,
  Loader2,
  MessageCircle,
  Minimize2,
  Send,
  Sparkles,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";

import { ProviderSelector } from "@/components/chat/ProviderSelector";
import { appendToEditor, replaceEditor, useChat } from "@/store/chat";
import { useWorkspace } from "@/store/workspace";

const SUGGESTIONS_FRESH = [
  "이번 주 업무 보고를 마크다운으로 정리해줘",
  "공공기관 협조 요청 공문 양식을 작성해줘",
  "월간 실적 보고서 표 양식을 만들어줘",
  "회의록 표준 양식을 한국 공문 글머리로 작성해줘",
];

const SUGGESTIONS_WITH_CONTEXT = [
  "이 문서를 더 보강할 부분이 있을까?",
  "이 문서에 일정·예산 표를 추가해줘",
  "이 문서의 결재선·수신자 양식을 추가해줘",
  "이 문서를 한국 공문 4단계 글머리로 다시 정리해줘",
];

// ── 요정분생설 5대 출력 모드 ────────────────────────────────────────────────
const OUTPUT_MODES = [
  { id: "요", label: "要 요약", hint: "핵심만 압축", color: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300" },
  { id: "정", label: "精 정리", hint: "체계적으로 정돈", color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300" },
  { id: "분", label: "分 분석", hint: "원인·구조 분석", color: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300" },
  { id: "생", label: "生 생성", hint: "새 콘텐츠 만들기", color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300" },
  { id: "설", label: "說 설명", hint: "개념·과정 풀이", color: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300" },
] as const;

type OutputModeId = (typeof OUTPUT_MODES)[number]["id"] | null;

// ── 역관목조분 5요소 ─────────────────────────────────────────────────────────
const YOGMCP_FIELDS = [
  { key: "role",       label: "役 역할", char: "役", placeholder: "10년 경력 농협 홍보 담당자" },
  { key: "domain",     label: "關 분야", char: "關", placeholder: "뉴스레터 / 공문 / 보도자료" },
  { key: "purpose",    label: "目 목적", char: "目", placeholder: "조합원 출자배당 신청 유도" },
  { key: "conditions", label: "條 조건", char: "條", placeholder: "60대 톤 · 정치 금지 · 600자" },
  { key: "volume",     label: "分 분량", char: "分", placeholder: "5섹션 구조 · 표 포함" },
] as const;

type YogmcpKey = (typeof YOGMCP_FIELDS)[number]["key"];
type YogmcpFields = Record<YogmcpKey, string>;

function composeYogmcpPrompt(fields: YogmcpFields, outputMode: OutputModeId): string {
  const lines: string[] = [];
  for (const f of YOGMCP_FIELDS) {
    const val = fields[f.key].trim();
    if (val) lines.push(`[${f.char} ${f.label.split(" ")[1]}] ${val}`);
  }
  if (lines.length === 0) return "";
  const modeLabel = outputMode
    ? `\n\n출력 모드: ${outputMode}(${OUTPUT_MODES.find((m) => m.id === outputMode)?.hint ?? ""})`
    : "";
  return lines.join("\n") + modeLabel;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export function ChatPanel() {
  const messages = useChat((s) => s.messages);
  const provider = useChat((s) => s.provider);
  const busy = useChat((s) => s.busy);
  const error = useChat((s) => s.error);
  const expanded = useChat((s) => s.expanded);
  const setProvider = useChat((s) => s.setProvider);
  const setExpanded = useChat((s) => s.setExpanded);
  const send = useChat((s) => s.send);
  const clear = useChat((s) => s.clear);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 요정분생설 출력 모드 — null 이면 기본(모드 없음)
  const [outputMode, setOutputMode] = useState<OutputModeId>(null);
  // 역관목조분 빌더 열림 여부
  const [showBuilder, setShowBuilder] = useState(false);
  const [yogmcpFields, setYogmcpFields] = useState<YogmcpFields>({
    role: "", domain: "", purpose: "", conditions: "", volume: "",
  });

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, setExpanded]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy, expanded]);

  if (!expanded) return null;

  const onSend = async (text?: string) => {
    const ta = taRef.current;
    const raw = text ?? ta?.value ?? "";
    if (!raw.trim() || busy) return;
    if (ta) ta.value = "";
    // 요정분생설 모드 prefix 자동 주입
    const modeObj = OUTPUT_MODES.find((m) => m.id === outputMode);
    const prefix = modeObj ? `[출력 모드: ${modeObj.id}(${modeObj.hint})] ` : "";
    await send(prefix + raw);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onSend();
    }
  };

  // 역관목조분 빌더 → textarea에 채워넣기
  const onBuildPrompt = () => {
    const composed = composeYogmcpPrompt(yogmcpFields, outputMode);
    if (!composed) return;
    if (taRef.current) {
      taRef.current.value = composed;
      taRef.current.focus();
    }
    setShowBuilder(false);
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex" onClick={() => setExpanded(false)}>
      <div className="flex-1 bg-black/40" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-xl flex-col border-l border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <MessageCircle size={16} className="text-brand" />
            <h2 className="text-sm font-semibold">AI 채팅 (확대)</h2>
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              {messages.length}턴
            </span>
            <ContextBadgeLg />
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={() => { if (confirm("대화를 모두 지울까요?")) clear(); }}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-rose-600 dark:hover:bg-neutral-800"
                title="대화 초기화"
              >
                <Trash2 size={13} />
              </button>
            )}
            <button
              onClick={() => setExpanded(false)}
              className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              title="축소 — 에디터 하단으로"
            >
              <Minimize2 size={13} />
            </button>
            <button
              onClick={() => setExpanded(false)}
              className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              title="닫기 (Esc)"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Provider 드롭다운 */}
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 text-xs dark:border-neutral-800">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            AI 모델
          </span>
          <ProviderSelector value={provider} onChange={setProvider} size="md" />
        </div>

        {/* ── 역관목조분 빌더 ──────────────────────────────────────────────── */}
        <div className="border-b border-neutral-200 dark:border-neutral-800">
          <button
            onClick={() => setShowBuilder((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-900"
          >
            <span className="flex items-center gap-1.5">
              <LayoutTemplate size={12} className="text-brand" />
              역관목조분 프롬프트 빌더
              <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[9px] font-bold text-brand">
                役關目條分
              </span>
            </span>
            {showBuilder ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {showBuilder && (
            <div className="border-t border-neutral-100 bg-neutral-50 px-3 pb-3 pt-2 dark:border-neutral-800 dark:bg-neutral-900/60">
              <p className="mb-2 text-[10px] text-neutral-500">
                5칸을 채우면 AI가 농협다운 문서를 만듭니다.
              </p>
              <div className="space-y-2">
                {YOGMCP_FIELDS.map((f) => (
                  <div key={f.key} className="flex items-start gap-2">
                    <span className="mt-1.5 w-14 shrink-0 rounded bg-brand/10 px-1.5 py-0.5 text-center text-[10px] font-bold text-brand">
                      {f.label}
                    </span>
                    <input
                      type="text"
                      value={yogmcpFields[f.key]}
                      onChange={(e) =>
                        setYogmcpFields((prev) => ({ ...prev, [f.key]: e.target.value }))
                      }
                      placeholder={f.placeholder}
                      className="flex-1 rounded border border-neutral-200 bg-white px-2 py-1 text-xs placeholder-neutral-400 focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={onBuildPrompt}
                  className="flex-1 rounded bg-brand py-1.5 text-xs font-semibold text-white hover:bg-brand/90"
                >
                  프롬프트 생성 → 입력창에 채우기
                </button>
                <button
                  onClick={() => setYogmcpFields({ role: "", domain: "", purpose: "", conditions: "", volume: "" })}
                  className="rounded px-2 py-1.5 text-[10px] text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800"
                  title="초기화"
                >
                  초기화
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 메시지 리스트 */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <EmptyState onPick={(s) => onSend(s)} />
          ) : (
            <div className="space-y-4">
              {messages.map((m, i) => (
                <Bubble
                  key={i}
                  role={m.role}
                  content={m.content}
                  provider={m.provider}
                  modelId={m.model_id}
                  latencyMs={m.latency_ms}
                />
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <Loader2 size={12} className="animate-spin text-brand" />
                  생각 중…
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* ── 입력 영역 ────────────────────────────────────────────────────── */}
        <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
          {/* 요정분생설 출력 모드 칩 */}
          <div className="mb-2 flex flex-wrap gap-1">
            <span className="self-center text-[10px] font-semibold text-neutral-400">출력 모드</span>
            {OUTPUT_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setOutputMode(outputMode === m.id ? null : m.id)}
                title={m.hint}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-all ${
                  outputMode === m.id
                    ? m.color + " ring-1 ring-offset-1 ring-current"
                    : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900"
                }`}
              >
                {m.label}
              </button>
            ))}
            {outputMode && (
              <button
                onClick={() => setOutputMode(null)}
                className="self-center text-[10px] text-neutral-400 hover:text-rose-500"
                title="모드 해제"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-end gap-2">
            <textarea
              ref={taRef}
              onKeyDown={onKey}
              rows={2}
              disabled={busy}
              placeholder={
                outputMode
                  ? `[${outputMode} 모드] 메시지를 입력하세요. Ctrl+Enter 전송.`
                  : "메시지를 입력하세요. Ctrl+Enter 로 전송."
              }
              className="flex-1 resize-none rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:border-brand focus:outline-none disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button
              onClick={() => onSend()}
              disabled={busy}
              className="flex h-9 w-9 items-center justify-center rounded bg-brand text-white hover:bg-brand/90 disabled:opacity-50"
              title="전송 (Ctrl+Enter)"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-neutral-400">
            대화는 변환·매크로 한도와 동일한 분당 30회 제한이 적용됩니다.
          </p>
        </div>
      </aside>
    </div>
  );
}

// ── 메시지 버블 ───────────────────────────────────────────────────────────────
function Bubble({
  role, content, provider, modelId, latencyMs,
}: {
  role: "system" | "user" | "assistant";
  content: string;
  provider?: string;
  modelId?: string;
  latencyMs?: number;
}) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard unavailable */ }
  };

  const handleAppend = () => appendToEditor(content);
  const handleReplace = () => {
    if (confirm("현재 에디터 본문 전체를 AI 답변으로 교체합니다. 진행할까요?"))
      replaceEditor(content);
  };

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-brand text-white"
            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
        }`}
      >
        {isUser ? <UserIcon size={13} /> : <Sparkles size={13} />}
      </div>
      <div className={`flex-1 ${isUser ? "text-right" : ""}`}>
        <div
          className={`inline-block max-w-full whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
            isUser
              ? "bg-brand/10 text-neutral-900 dark:text-neutral-100"
              : "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
          }`}
        >
          {content}
        </div>
        {!isUser && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {provider && (
              <span className="text-[10px] text-neutral-400">
                {provider} · <span className="font-mono">{modelId}</span>
                {latencyMs != null && ` · ${latencyMs.toFixed(0)}ms`}
              </span>
            )}
            {content.trim() && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleAppend}
                  className="flex items-center gap-1 rounded bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand hover:bg-brand/20"
                  title="에디터 본문 끝에 추가 — 변환 결과에 반영됨"
                >
                  <FileInput size={10} />
                  에디터에 추가
                </button>
                <button
                  onClick={handleReplace}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-rose-600 dark:hover:bg-neutral-800"
                  title="에디터 본문 전체 교체"
                >
                  <FileText size={10} />
                  교체
                </button>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  title="복사"
                >
                  <ClipboardCopy size={10} />
                  {copied ? "복사됨" : "복사"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 빈 상태 ───────────────────────────────────────────────────────────────────
function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  const hasContext = useWorkspace((s) => s.source.length) > 50;
  const suggestions = hasContext ? SUGGESTIONS_WITH_CONTEXT : SUGGESTIONS_FRESH;
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <Sparkles size={32} className="text-brand opacity-60" />
      <h3 className="mt-3 text-sm font-semibold">
        {hasContext ? "현재 문서에 대해 물어보세요" : "무엇이든 물어보세요"}
      </h3>
      <p className="mt-1 text-xs text-neutral-500">
        {hasContext
          ? "AI 가 에디터 본문을 인식하고 있습니다. '에디터에 추가'로 답변을 본문에 반영하세요."
          : "한국 문서 작성·양식·검토 — 응답은 에디터로 바로 보낼 수 있습니다"}
      </p>
      <div className="mt-6 grid w-full max-w-md gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded border border-neutral-200 px-3 py-2 text-left text-xs text-neutral-700 hover:border-brand hover:bg-brand/5 hover:text-brand dark:border-neutral-700 dark:text-neutral-300"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 확대 모드 헤더용 컨텍스트 인식 배지. */
function ContextBadgeLg() {
  const sourceLen = useWorkspace((s) => s.source.length);
  if (sourceLen < 5) return null;
  return (
    <span
      className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
      title={`AI 가 현재 에디터 본문(${sourceLen.toLocaleString()}자) 을 컨텍스트로 인식하고 있습니다.`}
    >
      📎 에디터 인식 ({sourceLen.toLocaleString()}자)
    </span>
  );
}
