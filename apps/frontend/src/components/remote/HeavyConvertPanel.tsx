"use client";

import { Download, FileText, Sparkles, Zap } from "lucide-react";

import { downloadUrl } from "@/lib/api";
import { OrganizationPicker } from "@/components/organizations/OrganizationPicker";
import { useWorkspace } from "@/store/workspace";

import { ReviewJump } from "./ReviewJump";

export interface HeavyConvertPanelProps {
  onConvert: (opts?: { forceFast?: boolean }) => void;
  onMacro: (id: string) => void;
  busy: boolean;
}

/**
 * 헤비유저 모드 변환 패널 — 한국 공문/보고서 정밀 변환에 특화.
 * - 조직 양식 선택 → LLM 분석·검토 풀단계 → HWPX 강조
 * - 빠른 변환 토글은 옵션 (기본 OFF — 검토 태그 활용)
 * - 검토 점프(N1·N2·N3) + 매크로 워크플로우 안내
 */
export function HeavyConvertPanel({ onConvert, onMacro, busy }: HeavyConvertPanelProps) {
  const preview = useWorkspace((s) => s.preview);
  const fastConvert = useWorkspace((s) => s.fastConvert);
  const setFastConvert = useWorkspace((s) => s.setFastConvert);
  const source = useWorkspace((s) => s.source);
  const setPrevSource = useWorkspace((s) => s.setPrevSource);

  return (
    <div className="space-y-3 p-3">
      {/* 조직 양식 — 헤비의 핵심 */}
      <OrganizationPicker />

      {/* 드롭존은 에디터로 통합 (드롭존 통합) — 여기서는 안내만 */}
      <p className="rounded border border-dashed border-neutral-300 px-2.5 py-1.5 text-[10px] text-neutral-500 dark:border-neutral-700">
        파일은 왼쪽 에디터에 드롭하세요 (HWP·DOCX·MD)
      </p>

      <button
        onClick={() => { setPrevSource(source); onConvert(); }}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-brand py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-soft disabled:opacity-50"
        title="조직 양식 적용 · LLM 분석·검토 풀단계 변환"
      >
        <Zap size={14} />
        정밀 변환 (HWPX)
        <span className="ml-1 text-[10px] opacity-70">Ctrl+Enter</span>
      </button>

      {/* ⚡ 빠른 변환 토글 — 헤비에서는 옵션. ON이면 검토 태그 표시 안 됨 */}
      <label
        className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-xs transition-all ${
          fastConvert
            ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
            : "border-neutral-200 bg-white hover:border-amber-400 dark:border-neutral-700 dark:bg-neutral-900"
        }`}
        title={
          fastConvert
            ? "빠른 변환 ON — LLM 분석·검토 생략 (~5ms). 검토 태그 표시 안 됨."
            : "빠른 변환 OFF — LLM 분석·검토 풀단계 (2~10s). 빨강·파랑·노랑 검토 태그 표시."
        }
      >
        <span className="flex items-center gap-1.5">
          <Zap size={12} className={fastConvert ? "text-amber-600" : "text-neutral-400"} />
          <span className="font-semibold">⚡ 빠른 변환</span>
          <span className="text-[10px] text-neutral-500">
            {fastConvert ? "LLM 단계 생략 · ~5ms" : "LLM 분석·검토 포함 · 2~10s"}
          </span>
        </span>
        <input
          type="checkbox"
          checked={fastConvert}
          onChange={(e) => setFastConvert(e.target.checked)}
          className="h-3.5 w-3.5 cursor-pointer accent-amber-500"
        />
      </label>

      {preview && (
        <>
          <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mb-2 flex items-center justify-between text-[10px] text-neutral-500">
              <span>모델</span>
              <span className="font-mono">{preview.model_version}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-neutral-500">
              <span>지연시간</span>
              <span>{(preview.latency_ms ?? 0).toFixed(0)}ms</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-500">
              <span>양식</span>
              <span>{preview.template_applied}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 border-t border-neutral-200 pt-2 text-[10px] dark:border-neutral-800">
              <div className="flex items-center justify-between gap-1 text-red-600">
                <span>● 빨강</span>
                <span className="font-mono">{preview.review_counts?.red ?? 0}</span>
              </div>
              <div className="flex items-center justify-between gap-1 text-blue-600">
                <span>● 파랑</span>
                <span className="font-mono">{preview.review_counts?.blue ?? 0}</span>
              </div>
              <div className="flex items-center justify-between gap-1 text-amber-600">
                <span>● 노랑</span>
                <span className="font-mono">{preview.review_counts?.yellow ?? 0}</span>
              </div>
            </div>
          </div>

          {/* 다운로드 — HWPX 강조 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              <span>다운로드</span>
              <span className="font-normal normal-case text-neutral-400">HWPX 권장</span>
            </div>
            <a
              href={downloadUrl(preview.document_id, "hwpx")}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-1.5 flex items-center justify-between rounded-md border-2 border-brand bg-brand/10 px-3 py-2.5 text-sm font-semibold text-brand transition-all hover:bg-brand/15"
            >
              <span className="flex items-center gap-2">
                <FileText size={16} />
                HWPX 다운로드
                <span className="text-[10px] font-normal opacity-70">한컴</span>
              </span>
              <Download size={14} />
            </a>
            <div className="grid grid-cols-2 gap-1.5">
              {(["docx", "pdf"] as const).map((fmt) => (
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

          {/* 공문 원클릭 정돈 — T5+T16+S12+S13+B20 순차 실행 */}
          <button
            onClick={() => onMacro("GONGMUN_POLISH")}
            disabled={busy}
            className="flex w-full items-center justify-between rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-xs transition-all hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/70"
            title="T5 셀병합·T16 줄간격·S12 들여쓰기·S13 행간·B20 범피스제거 순차 적용"
          >
            <span className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
              <Sparkles size={13} />
              공문 원클릭 정돈
            </span>
            <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
              범피스 없이 농협 표준 공문으로
            </span>
          </button>

          {/* 검토 점프 — 헤비의 핵심 */}
          <ReviewJump onJump={onMacro} />

          <div className="rounded-md bg-amber-50 p-2.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <div className="mb-1.5 font-semibold">📋 헤비유저 모드 워크플로우</div>
            <ol className="ml-3 list-decimal space-y-0.5">
              <li>조직 양식 선택 → 에디터/드롭 → 정밀 변환</li>
              <li>
                미리보기 블록 클릭 → <strong>표·글자 탭의 매크로</strong>로 정밀 보정
              </li>
              <li>
                <kbd className="rounded bg-white/60 px-1">Alt+R/B/N</kbd> 으로 빨강·파랑·노랑 점프 검토
              </li>
              <li>
                <kbd className="rounded bg-white/60 px-1">Ctrl+Shift+H</kbd> HWPX 다운로드 → 한컴에서 결재선·인장
              </li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
