"use client";

import { useCallback, useEffect } from "react";
import { Download, FileText, Zap } from "lucide-react";

import { downloadUrl } from "@/lib/api";
import { AUTO_CONVERT_EVENT } from "@/lib/events";
import { useWorkspace } from "@/store/workspace";

import { MarkdownDropZone } from "./MarkdownDropZone";
import { ReviewJump } from "./ReviewJump";

export interface WorkerConvertPanelProps {
  onConvert: (opts?: { forceFast?: boolean }) => void;
  onMacro: (id: string) => void;
  busy: boolean;
}

/**
 * 워커 모드 변환 패널 — 마크다운 → DOCX 빠른 출력에 특화.
 * - 큰 드래그&드롭존, '한 번에 변환' 큰 버튼
 * - 빠른 변환 항상 ON (LLM 분석·검토 생략, ~5ms)
 * - 다운로드는 DOCX 강조, HWPX/PDF 는 작게
 */
export function WorkerConvertPanel({ onConvert, onMacro, busy }: WorkerConvertPanelProps) {
  const source = useWorkspace((s) => s.source);
  const preview = useWorkspace((s) => s.preview);
  const setPrevSource = useWorkspace((s) => s.setPrevSource);

  const handleDocxDirect = useCallback(() => {
    // 드롭 직후 자동 변환 — 빠른 변환 강제
    setPrevSource(source);
    onConvert({ forceFast: true });
  }, [onConvert, setPrevSource, source]);

  useEffect(() => {
    const handler = () => { if (!busy) { setPrevSource(source); onConvert({ forceFast: true }); } };
    window.addEventListener(AUTO_CONVERT_EVENT, handler);
    return () => window.removeEventListener(AUTO_CONVERT_EVENT, handler);
  }, [busy, onConvert, setPrevSource, source]);

  return (
    <div className="space-y-3 p-3">
      {/* 드롭존 — 워커는 크고 두드러지게 */}
      <MarkdownDropZone variant="prominent" onAfterLoad={handleDocxDirect} />

      {/* 한 번에 변환 버튼 — 워커의 메인 동작 */}
      <button
        onClick={() => { setPrevSource(source); onConvert({ forceFast: true }); }}
        disabled={busy || source.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-brand py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
        title={source.length === 0 ? "에디터에 마크다운을 입력하거나 .md 파일을 드롭하세요" : "마크다운 → DOCX 즉시 변환"}
      >
        <Zap size={14} />
        한 번에 변환
        <span className="ml-1 text-[10px] opacity-70">~5ms · Ctrl+Enter</span>
      </button>

      <div className="rounded bg-emerald-50 px-2.5 py-1.5 text-[10px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        💼 워커 모드 — 빠른 변환(LLM 분석·검토 생략)으로 즉시 DOCX 출력. 검토 태그는 표시되지 않습니다.
      </div>

      {preview && (
        <>
          <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between text-[10px] text-neutral-500">
              <span>변환 시간</span>
              <span className="font-mono">{(preview.latency_ms ?? 0).toFixed(0)}ms</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-500">
              <span>양식</span>
              <span>{preview.template_applied}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-500">
              <span>모델</span>
              <span className="font-mono">{preview.model_version}</span>
            </div>
          </div>

          {/* 다운로드 — DOCX 강조 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              <span>다운로드</span>
              <span className="font-normal normal-case text-neutral-400">DOCX 권장</span>
            </div>
            <a
              href={downloadUrl(preview.document_id, "docx")}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-1.5 flex items-center justify-between rounded-md border-2 border-brand bg-brand/10 px-3 py-2.5 text-sm font-semibold text-brand transition-all hover:bg-brand/15"
            >
              <span className="flex items-center gap-2">
                <FileText size={16} />
                DOCX 다운로드
              </span>
              <Download size={14} />
            </a>
            <div className="grid grid-cols-2 gap-1.5">
              {(["pdf", "hwpx"] as const).map((fmt) => (
                <a
                  key={fmt}
                  href={downloadUrl(preview.document_id, fmt)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 rounded border border-neutral-200 bg-white px-2 py-1.5 text-[11px] text-neutral-600 transition-all hover:border-brand hover:text-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                >
                  <Download size={11} />
                  <span className="font-semibold uppercase">{fmt}</span>
                </a>
              ))}
            </div>
          </div>

          {/* 점프 — 워커도 사용할 수 있게 유지 (빠른 변환 시 태그는 없지만 정밀 재변환하면 활성) */}
          <ReviewJump onJump={onMacro} />

          <div className="rounded-md bg-emerald-50 p-2.5 text-[10px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <div className="mb-1.5 font-semibold">💼 워커 모드 워크플로우</div>
            <ol className="ml-3 list-decimal space-y-0.5">
              <li>.md 파일 드롭(또는 에디터 입력) → 자동 DOCX</li>
              <li>
                <kbd className="rounded bg-white/60 px-1">Ctrl+Shift+D</kbd> 로 다운로드
              </li>
              <li>메일 첨부 → 끝</li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
