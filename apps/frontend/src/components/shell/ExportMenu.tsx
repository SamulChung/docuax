"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ChevronDown, X } from "lucide-react";

import { downloadUrl } from "@/lib/api";
import { downloadMarkdown } from "@/lib/download";
import { downloadHwpWithWarnings } from "@/lib/exportActions";
import { NEEDS_CONVERT_MSG } from "@/lib/macroActions";
import { useWorkspace } from "@/store/workspace";

const BACKEND_FORMATS = [
  { fmt: "hwpx" as const, label: "한글 문서 (.hwpx)" },
  { fmt: "hwp" as const, label: "한글 97-2010 (.hwp) — 베타" },
  { fmt: "docx" as const, label: "Word 문서 (.docx)" },
  { fmt: "pdf" as const, label: "PDF (.pdf)" },
];

type HwpNotice =
  | { kind: "warn"; warnings: string[] }
  | { kind: "error" };

export function ExportMenu() {
  const [open, setOpen] = useState(false);
  // HWP 강등 경고/실패 안내 배너 (설계문서 §3.5·§5) — 컴포넌트 로컬, X 로 닫음
  const [hwpNotice, setHwpNotice] = useState<HwpNotice | null>(null);
  const [hwpBusy, setHwpBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const preview = useWorkspace((s) => s.preview);
  const source = useWorkspace((s) => s.source);
  const title = useWorkspace((s) => s.title);
  const setActiveTab = useWorkspace((s) => s.setActiveTab);

  // 드롭다운이 열려 있는 동안에만 outside-click 리스너 부착 (BrainDropdown 컨벤션)
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const documentId = preview?.document_id ?? null;

  // HWP 다운로드·경고 파싱은 lib/exportActions 로 추출 (상단 출력 메뉴와 공유) —
  // 여기서는 경고 배열을 받아 배너 UI 로만 표시한다.
  const handleHwpDownload = async () => {
    if (!documentId || hwpBusy) return;
    setHwpNotice(null);
    setHwpBusy(true);
    try {
      const warnings = await downloadHwpWithWarnings(documentId, title);
      if (warnings.length > 0) setHwpNotice({ kind: "warn", warnings });
    } catch {
      setHwpNotice({ kind: "error" });
    } finally {
      setHwpBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand/90"
      >
        <Download size={12} />
        내보내기
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {BACKEND_FORMATS.map(({ fmt, label }) =>
            fmt === "hwp" ? (
              <button
                key={fmt}
                onClick={() => {
                  if (!documentId) return;
                  setOpen(false);
                  void handleHwpDownload();
                }}
                disabled={!documentId || hwpBusy}
                className={`block w-full px-3 py-1.5 text-left text-xs ${
                  documentId
                    ? "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    : "cursor-not-allowed text-neutral-300 dark:text-neutral-600"
                }`}
                title={documentId ? undefined : NEEDS_CONVERT_MSG}
              >
                {hwpBusy ? "HWP 생성 중…" : label}
              </button>
            ) : (
              <a
                key={fmt}
                href={documentId ? downloadUrl(documentId, fmt) : undefined}
                aria-disabled={!documentId}
                onClick={(e) => { if (!documentId) e.preventDefault(); setOpen(false); }}
                className={`block px-3 py-1.5 text-xs ${
                  documentId
                    ? "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    : "cursor-not-allowed text-neutral-300 dark:text-neutral-600"
                }`}
                title={documentId ? undefined : NEEDS_CONVERT_MSG}
              >
                {label}
              </a>
            ),
          )}
          <button
            onClick={() => { downloadMarkdown(source, title); setOpen(false); }}
            disabled={!source.trim()}
            className="block w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-300 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            마크다운 (.md)
          </button>
          <button
            onClick={() => {
              try { sessionStorage.setItem("docuax_slide_prefill", source); } catch {}
              setActiveTab("slides");
              setOpen(false);
            }}
            disabled={!source.trim()}
            className="block w-full border-t border-neutral-100 px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-300 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            프레젠테이션 (.pptx) — 슬라이드 탭으로
          </button>
        </div>
      )}

      {/* HWP 강등 경고 / 실패 안내 — 내보내기 버튼 아래 배너, X 로 닫음 */}
      {hwpNotice && (
        <div
          role="alert"
          className={`absolute right-0 top-full z-40 mt-1 w-72 rounded-lg border p-2.5 text-[11px] shadow-lg ${
            hwpNotice.kind === "warn"
              ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              {hwpNotice.kind === "warn" ? (
                <>
                  <div className="font-semibold">
                    일부 요소가 텍스트로 대체되었습니다 ({hwpNotice.warnings.length}건). 완전한 서식은 HWPX 권장
                  </div>
                  <ul className="mt-1 max-h-24 list-disc space-y-0.5 overflow-y-auto pl-4 opacity-80">
                    {hwpNotice.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="font-semibold">HWP 생성 실패 — HWPX 형식을 사용해주세요</div>
              )}
              {documentId && (
                <a
                  href={downloadUrl(documentId, "hwpx")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 font-semibold underline"
                >
                  <Download size={11} />
                  HWPX로 다운로드
                </a>
              )}
            </div>
            <button
              onClick={() => setHwpNotice(null)}
              aria-label="경고 닫기"
              className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
