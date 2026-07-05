/** localStorage 임시 저장 — 새로고침·탭 닫기로 인한 작업 유실 방지. */
export const DRAFT_KEY = "guelzip_draft";

export interface Draft {
  source: string;
  title: string;
  savedAt: number;
  /** 연결된 서버 문서 id — 없으면 순수 로컬 draft (기존 draft와 하위호환) */
  docId?: string | null;
}

export function saveDraft(d: { source: string; title: string; docId?: string | null }): void {
  try {
    if (!d.source.trim()) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    const draft: Draft = { ...d, savedAt: Date.now() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // 사파리 프라이빗 등 접근 불가 시 무시 (기존 패턴)
  }
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return typeof d.source === "string" && typeof d.savedAt === "number" ? d : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}
