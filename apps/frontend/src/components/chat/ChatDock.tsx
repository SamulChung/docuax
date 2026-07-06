"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Expand,
  FileInput,
  FileText,
  Loader2,
  MessageCircle,
  PlayCircle,
  Send,
  Sparkles,
  Trash2,
  User as UserIcon,
  Wand2,
  Zap,
} from "lucide-react";

import { ProviderSelector } from "@/components/chat/ProviderSelector";
import { editBlock as apiEditBlock } from "@/lib/api";
import { type ChatAction, actionShortLabel, parseChatActions, stripChatActions, stripMetaPhrases } from "@/lib/chatActions";
import { appendToEditor, replaceEditor, useChat } from "@/store/chat";
import { useWorkspace } from "@/store/workspace";

// 박사님 요청: 에디터 입력 밑으로 5줄 정도 공간 — 컴팩트 dock
// 메시지 영역 ~140px (약 5턴) + 입력 ~40px + 헤더 ~28px = 약 208px

export function ChatDock() {
  const messages = useChat((s) => s.messages);
  const provider = useChat((s) => s.provider);
  const busy = useChat((s) => s.busy);
  const error = useChat((s) => s.error);
  const autoApply = useChat((s) => s.autoApply);
  const setProvider = useChat((s) => s.setProvider);
  const setExpanded = useChat((s) => s.setExpanded);
  const setAutoApply = useChat((s) => s.setAutoApply);
  const send = useChat((s) => s.send);
  const clear = useChat((s) => s.clear);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 메시지 영역 접기 — 기본 접힘(에디터 세로 공간 확보). 전송·prefill 시 자동 펼침.
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem("guelzip_chatdock_open") === "true"; } catch { return false; }
  });
  const toggleOpen = () => {
    setOpen((v) => {
      try { localStorage.setItem("guelzip_chatdock_open", String(!v)); } catch {}
      return !v;
    });
  };

  // 새 메시지 시 자동 스크롤
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  // 변환결과 → 채팅 prefill 이벤트 (PreviewPane 의 [AI에 묻기] 버튼이 발사)
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail?.text;
      if (text && taRef.current) {
        taRef.current.value = text;
        taRef.current.focus();
        // 커서를 맨 끝에 + 입력란을 살짝 키워 가시성
        taRef.current.setSelectionRange(text.length, text.length);
      }
    };
    window.addEventListener("docuax:chat-prefill", onPrefill);
    return () => window.removeEventListener("docuax:chat-prefill", onPrefill);
  }, []);

  const onSend = async () => {
    const ta = taRef.current;
    if (!ta) return;
    const v = ta.value;
    if (!v.trim() || busy) return;
    ta.value = "";
    // 응답을 볼 수 있도록 접힘 상태면 자동 펼침
    if (!open) toggleOpen();
    await send(v);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 전송 / Shift+Enter 줄바꿈 / Ctrl+Enter 도 전송
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="no-print flex flex-col border-t border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
      {/* 헤더 — provider 탭 + 확대·정리 액션. 좁은 폭에서 깨지지 않도록 모든 라벨 whitespace-nowrap. */}
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
        {/* 좌측 — 라벨·배지: 줄바꿈 절대 금지 */}
        <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <MessageCircle size={11} className="shrink-0 text-brand" />
          <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-neutral-500">
            AI&nbsp;채팅
          </span>
          {messages.length > 0 && (
            <span className="whitespace-nowrap rounded bg-neutral-200 px-1 py-0.5 text-[9px] font-semibold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
              {messages.length}턴
            </span>
          )}
          <ContextBadge />
        </div>

        {/* 우측 — 자동반영 토글 + provider 드롭다운 + 액션 */}
        <div className="flex shrink-0 items-center gap-1">
          {/* ⚡ 자동 반영 — AI 응답을 받자마자 에디터+변환결과까지 자동 전파 */}
          <button
            type="button"
            onClick={() => setAutoApply(!autoApply)}
            className={`flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold transition-all ${
              autoApply
                ? "bg-amber-500 text-white shadow-sm hover:bg-amber-600"
                : "border border-neutral-300 bg-white text-neutral-600 hover:border-amber-500 hover:text-amber-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
            }`}
            title={
              autoApply
                ? "자동 반영 ON — AI 응답이 즉시 에디터에 추가되고 변환됩니다. 클릭하여 OFF"
                : "자동 반영 OFF — AI 응답이 채팅창에만 머무릅니다. 클릭하여 ON (응답이 자동으로 에디터+변환결과까지 전파)"
            }
          >
            <Zap size={10} />
            자동반영
            {autoApply ? " ON" : ""}
          </button>
          <ProviderSelector value={provider} onChange={setProvider} size="sm" />
          <span className="mx-0.5 h-3 w-px shrink-0 bg-neutral-300 dark:bg-neutral-700" />
          {messages.length > 0 && (
            <button
              onClick={() => {
                if (confirm("대화를 모두 지울까요?")) clear();
              }}
              className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-rose-600 dark:hover:bg-neutral-700"
              title="대화 초기화"
            >
              <Trash2 size={11} />
            </button>
          )}
          <button
            onClick={() => setExpanded(true)}
            className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-brand dark:hover:bg-neutral-700"
            title="확대 — 우측 패널로 띄우기"
          >
            <Expand size={11} />
          </button>
          <button
            onClick={toggleOpen}
            className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-brand dark:hover:bg-neutral-700"
            title={open ? "메시지 영역 접기 — 에디터 공간 확보" : "메시지 영역 펼치기"}
          >
            {open ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
          </button>
        </div>
      </div>

      {/* 메시지 영역 — 약 5줄 분량 (140px). 접힘 시 숨김(입력줄은 유지) */}
      {open && (
      <div
        ref={listRef}
        className="overflow-y-auto bg-white px-2.5 py-1.5 dark:bg-neutral-950"
        style={{ height: 140 }}
      >
        {messages.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-2">
            {messages.map((m, i) => (
              <Bubble
                key={i}
                role={m.role}
                content={m.content}
                meta={
                  m.role === "assistant" && m.provider
                    ? `${m.provider}·${m.latency_ms?.toFixed(0)}ms`
                    : undefined
                }
              />
            ))}
            {busy && (
              <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
                <Loader2 size={10} className="animate-spin text-brand" />
                생각 중…
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="bg-rose-50 px-2.5 py-1 text-[10px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* 입력 */}
      <div className="flex items-center gap-1.5 border-t border-neutral-200 px-2 py-1.5 dark:border-neutral-800">
        <textarea
          ref={taRef}
          onKeyDown={onKey}
          rows={1}
          placeholder="AI 에게 물어보기  ·  Enter 전송 / Shift+Enter 줄바꿈"
          className="flex-1 resize-none rounded border border-neutral-200 bg-white px-2 py-1 text-xs focus:border-brand focus:outline-none disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
          disabled={busy}
        />
        <button
          onClick={onSend}
          disabled={busy}
          className="flex h-7 w-7 items-center justify-center rounded bg-brand text-white hover:bg-brand/90 disabled:opacity-50"
          title="전송"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
        </button>
      </div>
    </div>
  );
}

function Bubble({
  role,
  content,
  meta,
}: {
  role: "user" | "assistant" | "system";
  content: string;
  meta?: string;
}) {
  const isUser = role === "user";
  const Icon = isUser ? UserIcon : Sparkles;
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  // AI 응답이면 액션 태그 분리
  const actions = !isUser ? parseChatActions(content) : [];
  const displayText = !isUser && actions.length > 0 ? stripChatActions(content) : content;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  // 회화체 메타 문구도 함께 정리 → 깨끗한 본문만 에디터로
  const cleanForEditor = stripMetaPhrases(displayText);

  const handleAppend = () => {
    appendToEditor(cleanForEditor);
  };

  const handleReplace = () => {
    if (
      confirm(
        "현재 에디터 본문 전체를 AI 답변으로 교체합니다. 진행할까요?\n(되돌릴 수 있도록 변환 후 다운로드 권장)",
      )
    ) {
      replaceEditor(cleanForEditor);
    }
  };

  const runAction = async (a: ChatAction) => {
    if (busyAction) return;
    setBusyAction(true);
    try {
      const ws = useWorkspace.getState();
      if (a.type === "replace_editor" && a.payload) {
        ws.setSource(a.payload);
      } else if (a.type === "append_editor" && a.payload) {
        appendToEditor(a.payload);
      } else if (a.type === "convert") {
        // 워크스페이스의 convert 트리거 — 단축키와 동일 경로
        const evt = new CustomEvent("docuax:trigger-convert");
        window.dispatchEvent(evt);
      } else if (a.type === "replace_block" && a.blockId && a.payload != null) {
        if (!ws.preview?.document_id) {
          alert("변환 결과가 없습니다. 먼저 한번 변환해주세요.");
          return;
        }
        const res = await apiEditBlock({
          document_id: ws.preview.document_id,
          block_id: a.blockId,
          text: a.payload,
        });
        ws.setPreview(res.preview);
        ws.setRecentlyChanged([a.blockId]);
      } else if (a.type === "append_after_block" && a.blockId && a.payload != null) {
        // append_after 는 별도 API 없으니 에디터 본문 끝에 추가 + 변환 권장
        appendToEditor("\n\n" + a.payload);
        alert(`${a.blockId} 뒤에 추가했습니다 (에디터 끝에 붙여넣음).\n변환 다시 실행해주세요.`);
      }
    } catch (e) {
      alert(`액션 실행 실패: ${(e as Error).message}`);
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <div className="group flex gap-1.5 text-[11px] leading-snug">
      <Icon
        size={10}
        className={`mt-0.5 shrink-0 ${
          isUser ? "text-brand" : "text-emerald-600 dark:text-emerald-400"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap break-words">{displayText}</p>
        {/* AI 액션 태그 — 한 번 클릭으로 실행 */}
        {!isUser && actions.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1 rounded-md border border-brand/40 bg-brand/5 px-1.5 py-1">
            <Wand2 size={10} className="text-brand" />
            <span className="text-[9px] font-bold uppercase tracking-wide text-brand">
              AI 액션
            </span>
            {actions.map((a, idx) => (
              <button
                key={idx}
                disabled={busyAction}
                onClick={() => runAction(a)}
                className="flex items-center gap-0.5 rounded bg-brand px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-brand/80 disabled:opacity-50"
                title={
                  a.type === "replace_block"      ? `${a.blockId} 블록을 새 내용으로 교체` :
                  a.type === "append_after_block" ? `${a.blockId} 뒤에 새 내용 추가` :
                  a.type === "replace_editor"     ? "에디터 전체를 새 내용으로 교체" :
                  a.type === "append_editor"      ? "에디터 끝에 추가" :
                                                     "변환 실행"
                }
              >
                {a.type === "convert" ? <PlayCircle size={9} /> : <Zap size={9} />}
                {actionShortLabel(a)}
                {a.blockId && <span className="ml-0.5 font-mono text-[8px] opacity-80">{a.blockId.replace("blk-", "#")}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="mt-0.5 flex items-center gap-2">
          {meta && <span className="text-[9px] text-neutral-400">{meta}</span>}
          {/* AI 응답에만 액션 버튼 (호버 시 강조) */}
          {!isUser && displayText.trim() && (
            <div className="flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
              <button
                onClick={handleAppend}
                className="flex items-center gap-0.5 rounded bg-brand/10 px-1.5 py-0.5 text-[9px] font-semibold text-brand hover:bg-brand/20"
                title="에디터 본문 끝에 추가 — 변환 결과에 반영됨"
              >
                <FileInput size={9} />
                에디터에 추가
              </button>
              <button
                onClick={handleReplace}
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium text-neutral-500 hover:bg-neutral-200 hover:text-rose-600 dark:hover:bg-neutral-700"
                title="에디터 본문 전체를 이 응답으로 교체"
              >
                <FileText size={9} />
                교체
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                title="클립보드 복사"
              >
                <ClipboardCopy size={9} />
                {copied ? "복사됨" : "복사"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <Sparkles size={14} className="text-brand opacity-60" />
      <p className="mt-1 text-[10px] text-neutral-500">
        문서 작성 중 궁금한 점을 바로 물어보세요
      </p>
      <p className="text-[9px] text-neutral-400">
        AI 응답은 [에디터에 추가] 로 본문에 넣어 변환에 반영할 수 있습니다
      </p>
    </div>
  );
}

/** 현재 에디터 본문이 AI 컨텍스트로 전달되고 있음을 알리는 배지. */
function ContextBadge() {
  const sourceLen = useWorkspace((s) => s.source.length);
  const previewBlocks = useWorkspace((s) => s.preview?.blocks?.length ?? 0);
  const selectedCount = useWorkspace((s) => s.selectedBlockIds.length);

  if (sourceLen < 5 && previewBlocks === 0) return null;

  // 우선순위: 선택된 블록 > 변환결과 > 에디터만
  if (selectedCount > 0) {
    return (
      <span
        className="flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200"
        title={`${selectedCount}개 선택 블록을 AI 가 우선 인지합니다. '이 블록' 질문에 정확히 답합니다.`}
      >
        🎯&nbsp;{selectedCount}블록&nbsp;집중
      </span>
    );
  }
  if (previewBlocks > 0) {
    return (
      <span
        className="flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
        title={`에디터 + 변환결과 ${previewBlocks}블록을 AI 가 함께 인지합니다. '이 블록' 'blk-XXXX' 등 정확한 지시 가능.`}
      >
        📎&nbsp;에디터·변환&nbsp;인식
      </span>
    );
  }
  return (
    <span
      className="flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
      title="현재 에디터 본문이 AI 컨텍스트로 자동 전달됩니다. '이 문서', '여기에' 같이 질문하면 AI 가 인식합니다."
    >
      📎&nbsp;에디터&nbsp;인식
    </span>
  );
}
