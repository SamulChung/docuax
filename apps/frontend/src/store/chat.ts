// 채팅 글로벌 상태 — ChatDock(에디터 하단 인라인) + ChatPanel(우측 확장) 가 공유한다.
// 박사님 의도: 문서 작성 흐름 중 AI 와의 대화는 끊김 없이 유지되어야 한다.
import { create } from "zustand";

import { sendChat, type ChatMsg, type ChatProvider } from "@/lib/api";
import { stripChatActions, stripMetaPhrases } from "@/lib/chatActions";
import { useWorkspace } from "@/store/workspace";

export type ProviderChoice = ChatProvider | "auto";

export interface ChatMessage extends ChatMsg {
  ts: number;
  provider?: string;
  model_id?: string;
  latency_ms?: number;
}

interface ChatState {
  /** 모든 대화 메시지 (system 자동 주입은 백엔드가 처리 — 여기엔 user/assistant 만) */
  messages: ChatMessage[];
  /** 현재 선택된 provider — "auto" 면 백엔드 활성 provider 사용 */
  provider: ProviderChoice;
  /** LLM 응답 대기 중 */
  busy: boolean;
  /** 마지막 에러 (배지·툴팁용) */
  error: string | null;
  /** ChatPanel(확장 모드) 열림 여부 */
  expanded: boolean;
  /**
   * AI 응답을 받자마자 자동으로 에디터에 추가 + 변환 트리거.
   * 박사님의 "문서의 AI화" 흐름: 채팅 → 입력 → 변환결과 까지 자동 전파.
   * true 면 사용자가 [에디터에 추가] 누르지 않아도 답변이 즉시 본문에 들어가고 변환됨.
   */
  autoApply: boolean;

  setProvider: (p: ProviderChoice) => void;
  setExpanded: (v: boolean) => void;
  setAutoApply: (v: boolean) => void;

  /** 메시지 전송 — store 가 자동으로 user 추가·assistant 추가·busy 토글 */
  send: (text: string) => Promise<void>;
  clear: () => void;
}

export const useChat = create<ChatState>((set, get) => ({
  messages: [],
  provider: "auto",
  busy: false,
  error: null,
  expanded: false,
  // 자동반영 — AI 응답을 즉시 에디터·변환결과까지 전파.
  // 기본 OFF (이전 ON 이었으나 채팅·에디터·변환 3중 표시가 혼란스럽다는 피드백).
  // 필요 시 채팅 상단의 [자동반영] 토글로 ON 전환 가능.
  autoApply: false,

  setProvider: (p) => set({ provider: p }),
  setExpanded: (v) => set({ expanded: v }),
  setAutoApply: (v) => set({ autoApply: v }),

  send: async (text) => {
    const content = text.trim();
    if (!content || get().busy) return;
    const userMsg: ChatMessage = { role: "user", content, ts: Date.now() };
    const nextMsgs = [...get().messages, userMsg];
    set({ messages: nextMsgs, busy: true, error: null });
    try {
      const cleanMsgs: ChatMsg[] = nextMsgs.map(({ role, content }) => ({ role, content }));
      const provider = get().provider;
      // 워크스페이스 store 에서 에디터 + 변환결과 컨텍스트 모두 자동 주입
      const ws = useWorkspace.getState();
      // 변환결과 블록 요약 — 한 줄당 "blk-ID type 텍스트(80자)"
      const previewSummary = ws.preview?.blocks
        ? ws.preview.blocks
            .map((b) => {
              const text = (b.text || "").replace(/\s+/g, " ").trim().slice(0, 80);
              return `${b.id} ${b.type} ${text}`;
            })
            .join("\n")
        : "";
      const r = await sendChat({
        messages: cleanMsgs,
        provider: provider === "auto" ? undefined : provider,
        source_markdown: ws.source,
        source_title: ws.title,
        preview_summary: previewSummary,
        selected_block_ids: ws.selectedBlockIds || [],
      });
      set({
        messages: [
          ...get().messages,
          {
            role: "assistant",
            content: r.message,
            ts: Date.now(),
            provider: r.provider,
            model_id: r.model_id,
            latency_ms: r.latency_ms,
          },
        ],
        busy: false,
      });

      // ✨ 자동 반영 ON — AI 응답이 즉시 에디터 + 변환결과까지 전파.
      // 자동 변환은 forceFast=true → LLM 단계 2·4 skip (이미 채팅 응답이 LLM 거친 결과라 중복).
      // 일반 ~4~10초 변환이 < 5ms 로 단축 → 자동 흐름이 끊김 없이 매끄러움.
      if (get().autoApply) {
        // 1) 액션 태그 제거 ([블록교체:...] 등)
        // 2) 메타 회화체 제거 ("다음은 ~입니다", "~필요하시면 말씀…" 등)
        const cleanBody = stripMetaPhrases(stripChatActions(r.message)).trim();
        if (cleanBody) {
          appendToEditor(cleanBody);
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("docuax:trigger-convert", { detail: { forceFast: true } }),
            );
          }, 60);
        }
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      let friendly = m;
      if (m.includes("429")) {
        friendly = "요청이 너무 많습니다. 잠시 후 다시 시도하세요.";
      } else if (m.includes("502") || m.includes("503")) {
        friendly = "선택한 LLM 이 응답할 수 없습니다. 다른 provider 를 선택하세요.";
      } else if (m.includes("400")) {
        friendly = m.replace(/^400:\s*/, "");
      }
      set({ busy: false, error: friendly });
    }
  },

  clear: () => set({ messages: [], error: null }),
}));

// ─── 채팅 응답 → 에디터 직접 연결 헬퍼 ─────────────────────────────────────
// 박사님 의도: AI 응답이 본문에 반영되어야 변환 결과에도 영향을 준다.

/** AI 답변 텍스트를 현재 마크다운 본문 끝에 추가. 변환 자동 실행은 안 함 (사용자가 명시적으로). */
export function appendToEditor(text: string): void {
  const ws = useWorkspace.getState();
  const current = ws.source;
  // 연결 — 빈 줄 2개로 분리해 다음 변환 파이프라인이 새 블록으로 인식
  const sep = current.trim() && !current.endsWith("\n\n") ? "\n\n" : "";
  ws.setSource(current + sep + text.trim() + "\n");
}

/** AI 답변으로 본문 전체를 교체. 기존 내용은 손실 — 사용자 확인 후 호출 권장. */
export function replaceEditor(text: string): void {
  useWorkspace.getState().setSource(text.trim() + "\n");
}
