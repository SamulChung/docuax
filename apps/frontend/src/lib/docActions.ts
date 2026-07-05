/** 문서 저장/열기 액션 — MenuBar·팔레트·Ctrl+S가 공유. */
import { createDocument, updateDocument } from "@/lib/api";
import { useWorkspace } from "@/store/workspace";

/** Ctrl+S / 파일>저장. currentDocId 있으면 PUT, 없으면 제목 확인 후 POST. */
export async function saveCurrentDocument(): Promise<void> {
  const s = useWorkspace.getState();
  if (!s.source.trim()) return;
  try {
    if (s.currentDocId) {
      await updateDocument(s.currentDocId, { title: s.title, source_md: s.source });
    } else {
      const title = s.title || prompt("문서 제목을 입력하세요", "제목 없음") || "";
      if (title === "") return; // 취소
      s.setTitle(title);
      const doc = await createDocument({ title, source_md: s.source });
      s.setCurrentDocId(doc.id);
    }
    s.setDirty(false);
    s.setSaveState({ kind: "saved", at: Date.now() });
  } catch {
    s.setSaveState({ kind: "error", at: Date.now() });
  }
}

/** 다른 이름으로 저장 — 항상 새 문서 생성. */
export async function saveAsNewDocument(): Promise<void> {
  const s = useWorkspace.getState();
  if (!s.source.trim()) return;
  const title = prompt("새 문서 제목", s.title || "제목 없음");
  if (title === null) return;
  try {
    const doc = await createDocument({ title, source_md: s.source });
    s.setCurrentDocId(doc.id);
    s.setTitle(title);
    s.setDirty(false);
    s.setSaveState({ kind: "saved", at: Date.now() });
  } catch {
    s.setSaveState({ kind: "error", at: Date.now() });
  }
}
