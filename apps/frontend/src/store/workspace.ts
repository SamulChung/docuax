// Zustand store — 워크스페이스 전역 상태.
import { create } from "zustand";

import type { ConvertPreview, PersonaMode } from "@/lib/api";
import { sanitizeString } from "@/lib/sanitize";

export interface JumpTarget {
  blockId: string;
  /** 블록 텍스트 내부 상대 위치 */
  relStart: number;
  relEnd: number;
  color: "red" | "blue" | "yellow";
  reason: string;
  /** 동일 좌표 점프 시에도 효과를 다시 트리거하기 위한 시퀀스 */
  seq: number;
}

interface WorkspaceState {
  source: string;
  setSource: (s: string) => void;

  title: string;
  setTitle: (t: string) => void;

  persona: PersonaMode;
  setPersona: (p: PersonaMode) => void;
  togglePersona: () => void;

  preview: ConvertPreview | null;
  setPreview: (p: ConvertPreview | null) => void;

  busy: boolean;
  setBusy: (b: boolean) => void;

  /** 매크로 적용 대상 — 미리보기에서 클릭으로 선택된 블록들 */
  selectedBlockIds: string[];
  toggleBlockSelection: (id: string, options?: { multi?: boolean }) => void;
  clearSelection: () => void;
  selectAll: () => void;

  /** 매크로 적용 후 강조 표시 (잠깐 깜빡임)용 */
  recentlyChangedIds: string[];
  setRecentlyChanged: (ids: string[]) => void;

  jumpIndex: { red: number; blue: number; yellow: number };
  jumpTarget: JumpTarget | null;
  jumpToNext: (color: "red" | "blue" | "yellow") => void;
  jumpToPrev: () => void;
  clearJump: () => void;

  /**
   * ⚡ 빠른 변환 — LLM 단계 2(분석)·4(검토 태그)를 skip.
   * 일반 변환 4~10초 → < 5ms 로 단축. 검토 태그(빨강·파랑·노랑)는 표시 안 됨.
   * 자동반영 흐름에서는 강제 ON (채팅 응답이 이미 LLM 거친 결과).
   */
  fastConvert: boolean;
  setFastConvert: (v: boolean) => void;

  /** 자동 변환 — 입력 후 2.5초 debounce 로 자동 변환 */
  autoConvert: boolean;
  setAutoConvert: (v: boolean) => void;

  /** 첫화면으로 — 에디터·변환결과·선택 모두 초기화. 채팅 대화는 별도 store 라 유지됨. */
  resetWorkspace: () => void;
}

// 첫 진입 시 에디터는 빈 상태로 — Editor.tsx 의 안내 카드가 표시되며
// 사용자가 [📖 템플릿] 으로 시작하도록 자연스럽게 유도.
// 데모 콘텐츠는 SamplePicker 의 기본 템플릿에 이미 포함되어 있음.
const DEFAULT_SOURCE = "";

let jumpSeq = 0;

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  source: DEFAULT_SOURCE,
  // 들어오는 모든 source 텍스트를 한 번에 정제 — paste된 깨진 유니코드(lone surrogate) 차단
  setSource: (s) => set({ source: sanitizeString(s) }),

  title: "",
  setTitle: (t) => set({ title: sanitizeString(t) }),

  persona: "worker",
  setPersona: (p) => set({ persona: p }),
  togglePersona: () => set((s) => ({ persona: s.persona === "worker" ? "heavy" : "worker" })),

  preview: null,
  setPreview: (p) =>
    set({
      preview: p,
      jumpIndex: { red: 0, blue: 0, yellow: 0 },
      jumpTarget: null,
      selectedBlockIds: [],
    }),

  busy: false,
  setBusy: (b) => set({ busy: b }),

  selectedBlockIds: [],
  toggleBlockSelection: (id, options = {}) => {
    const { multi = false } = options;
    set((s) => {
      const has = s.selectedBlockIds.includes(id);
      if (multi) {
        return {
          selectedBlockIds: has
            ? s.selectedBlockIds.filter((b) => b !== id)
            : [...s.selectedBlockIds, id],
        };
      }
      // 단일 선택 — 이미 선택돼 있으면 해제
      return { selectedBlockIds: has && s.selectedBlockIds.length === 1 ? [] : [id] };
    });
  },
  clearSelection: () => set({ selectedBlockIds: [] }),
  selectAll: () =>
    set((s) => ({
      selectedBlockIds: s.preview?.blocks.map((b) => b.id) ?? [],
    })),

  recentlyChangedIds: [],
  setRecentlyChanged: (ids) => {
    set({ recentlyChangedIds: ids });
    if (ids.length > 0) {
      setTimeout(() => {
        set((s) =>
          s.recentlyChangedIds === ids ? { recentlyChangedIds: [] } : {}
        );
      }, 1500);
    }
  },

  jumpIndex: { red: 0, blue: 0, yellow: 0 },
  jumpTarget: null,

  jumpToNext: (color) => {
    const { preview, jumpIndex } = get();
    if (!preview) return;
    const matching = (preview.all_tags ?? []).filter((t) => t.color === color);
    if (matching.length === 0) return;
    const i = jumpIndex[color] % matching.length;
    const tag = matching[i];
    if (!tag.block_id) return;
    // 블록 내부 상대 위치 계산
    const block = preview.blocks.find((b) => b.id === tag.block_id);
    if (!block) return;
    const blockTextStart = preview.plain_text.indexOf(block.text);
    const relStart = blockTextStart >= 0 ? tag.global_start - blockTextStart : 0;
    const relEnd = blockTextStart >= 0 ? tag.global_end - blockTextStart : block.text.length;
    set({
      jumpIndex: { ...jumpIndex, [color]: i + 1 },
      jumpTarget: {
        blockId: tag.block_id,
        relStart: Math.max(0, relStart),
        relEnd: Math.min(block.text.length, relEnd),
        color: tag.color,
        reason: tag.reason,
        seq: ++jumpSeq,
      },
    });
  },
  jumpToPrev: () => {
    // 단순화: 마지막 점프 인덱스를 -2 (다시 +1해서 -1)
    const { jumpIndex } = get();
    set({
      jumpIndex: {
        red: Math.max(0, jumpIndex.red - 2),
        blue: Math.max(0, jumpIndex.blue - 2),
        yellow: Math.max(0, jumpIndex.yellow - 2),
      },
    });
  },
  clearJump: () => set({ jumpTarget: null }),

  fastConvert: false,
  setFastConvert: (v) => set({ fastConvert: v }),

  autoConvert: (() => {
    try { return localStorage.getItem("docuax_auto_convert") === "true"; } catch { return false; }
  })(),
  setAutoConvert: (v) => {
    set({ autoConvert: v });
    try { localStorage.setItem("docuax_auto_convert", String(v)); } catch {}
  },

  resetWorkspace: () =>
    set({
      source: DEFAULT_SOURCE,        // ""
      title: "",
      preview: null,
      busy: false,
      selectedBlockIds: [],
      recentlyChangedIds: [],
      jumpIndex: { red: 0, blue: 0, yellow: 0 },
      jumpTarget: null,
    }),
}));
