"use client";

import { useEffect, useState } from "react";
import { FileText, Trash2, X } from "lucide-react";

import { deleteDocument, getDocument, listDocuments } from "@/lib/api";
import type { DocumentListItem } from "@/lib/api";
import { useWorkspace } from "@/store/workspace";

export function DocumentPicker({ onClose }: { onClose: () => void }) {
  const [docs, setDocs] = useState<DocumentListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = () =>
    listDocuments()
      .then(setDocs)
      .catch(() => setError("문서 목록을 불러오지 못했습니다. 로그인 상태를 확인해주세요."));

  useEffect(() => { load(); }, []);

  // Esc로 닫기 — 다른 모달(PromptLibrary 등)과 동일한 UX
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const open = async (id: string) => {
    const s = useWorkspace.getState();
    if (s.dirty && s.source.trim() && !confirm("저장하지 않은 변경이 있습니다. 계속할까요?")) return;
    try {
      const doc = await getDocument(id);
      s.setSource(doc.source_md);
      s.setTitle(doc.title);
      s.setCurrentDocId(doc.id);
      s.setDirty(false);
      s.setSaveState({ kind: "saved", at: Date.now() });
      onClose();
    } catch {
      // stale 목록에서 이미 삭제된 문서 등 — 모달은 닫지 않고 목록만 동기화
      setError("문서를 여는 데 실패했습니다. 목록을 새로고침합니다.");
      load();
    }
  };

  const remove = async (id: string) => {
    if (!confirm("이 문서를 삭제할까요? 되돌릴 수 없습니다.")) return;
    try {
      await deleteDocument(id);
      if (useWorkspace.getState().currentDocId === id) useWorkspace.getState().setCurrentDocId(null);
    } catch {
      setError("삭제에 실패했습니다.");
    }
    load();
  };

  const filtered = (docs ?? []).filter(
    (d) => !query || d.title.includes(query) || d.preview.includes(query),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 className="text-sm font-bold">문서 열기</h2>
          <button onClick={onClose} aria-label="닫기"><X size={16} /></button>
        </div>
        <div className="px-4 py-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목·내용 검색"
            className="w-full rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>
        <div className="flex-1 overflow-auto px-2 pb-2">
          {error && <p className="p-4 text-xs text-red-500">{error}</p>}
          {docs && filtered.length === 0 && !error && (
            <p className="p-4 text-xs text-neutral-400">저장된 문서가 없습니다. Ctrl+S로 저장해보세요.</p>
          )}
          {filtered.map((d) => (
            <div key={d.id} className="group flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800">
              <button onClick={() => open(d.id)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                <FileText size={14} className="mt-0.5 shrink-0 text-neutral-400" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">{d.title || "제목 없음"}</span>
                  <span className="block truncate text-[10px] text-neutral-400">{d.preview}</span>
                  <span className="block text-[10px] text-neutral-400">{new Date(d.updated_at).toLocaleString()}</span>
                </span>
              </button>
              <button
                onClick={() => remove(d.id)}
                className="invisible p-1 text-neutral-400 hover:text-red-500 group-hover:visible"
                aria-label="삭제"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
