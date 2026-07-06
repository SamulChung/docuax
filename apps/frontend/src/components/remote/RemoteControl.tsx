"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";

import { LogoSymbol } from "@/components/Logo";
import { downloadUrl, listMacros } from "@/lib/api";
import { CHANNEL_PRESETS, exportToChannel } from "@/lib/channelPresets";
import { performConvert } from "@/lib/convert";
import { AUTO_CONVERT_EVENT } from "@/lib/events";
import { executeMacroAction, NEEDS_CONVERT_MSG } from "@/lib/macroActions";
import { useWorkspace } from "@/store/workspace";

import { HeavyConvertPanel } from "./HeavyConvertPanel";
import { MacroGrid } from "./MacroGrid";
import { MACRO_PARAM_SCHEMAS, MacroParamDialog, MacroParamSchema } from "./MacroParamDialog";
import { WorkerConvertPanel } from "./WorkerConvertPanel";

const TABS = [
  { id: "convert", label: "변환", short: "변환" },
  { id: "table", label: "표", short: "표", filter: ["T", "S"] },
  { id: "glyph", label: "글자", short: "글자", filter: ["B", "G"] },
  { id: "navigate", label: "이동", short: "이동", filter: ["N", "R"] },
  { id: "output", label: "출력", short: "출력", filter: ["P"] },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function RemoteControl({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const persona = useWorkspace((s) => s.persona);
  // 페르소나 모드에 따라 기본 탭 다름 (PRD 5.1)
  const [activeTab, setActiveTab] = useState<TabId>(persona === "heavy" ? "table" : "convert");
  const [pendingDialog, setPendingDialog] = useState<MacroParamSchema | null>(null);
  // 페르소나 변경 시 기본 탭 자동 전환
  useEffect(() => {
    setActiveTab(persona === "heavy" ? "table" : "convert");
  }, [persona]);
  const preview = useWorkspace((s) => s.preview);
  const busy = useWorkspace((s) => s.busy);

  const { data: macros = [] } = useSWR("macros", () => listMacros(), {
    revalidateOnFocus: false,
  });

  // 변환 실행 로직은 lib/convert.ts 로 추출 — 메뉴·리본·팔레트가 동일 로직 공유.
  const handleConvert = useCallback(async (opts?: { forceFast?: boolean }) => {
    await performConvert(opts);
  }, []);

  // 실행부는 lib/macroActions.ts 로 추출 — 파라미터 다이얼로그 판단만 UI 레이어(여기)에 유지.
  const handleMacroExecute = useCallback(
    async (macroId: string, params?: Record<string, unknown>) => {
      if (!preview?.document_id) {
        alert(NEEDS_CONVERT_MSG);
        return;
      }
      // 선택된 블록 ID 자동 첨부 — 미리보기에서 클릭으로 고른 블록들
      const selectedIds = useWorkspace.getState().selectedBlockIds;
      if (selectedIds.length > 0 && (!params || !params.selected_block_ids)) {
        params = { ...(params ?? {}), selected_block_ids: selectedIds };
      }
      // 파라미터 입력이 필요한 매크로는 다이얼로그 먼저 띄움
      // (선택된 블록만 있을 때는 다이얼로그 X — 그냥 실행)
      const hasOnlySelection = params && Object.keys(params).length === 1 && "selected_block_ids" in params;
      if (MACRO_PARAM_SCHEMAS[macroId] && (!params || hasOnlySelection)) {
        // 알려진 위험 수용 — MenuBar 도 자체 다이얼로그를 마운트해 이론상 동시 오픈 가능.
        // 스택 시 MenuBar 쪽(z-[60])이 위로 오도록 결정적 순서를 부여해 둠.
        setPendingDialog(MACRO_PARAM_SCHEMAS[macroId]);
        return;
      }
      await executeMacroAction(macroId, params);
    },
    [preview]
  );

  // 채널 내보내기 로직은 lib/channelPresets 로 추출 — 상단 출력 메뉴와 공유.

  // 전역 단축키
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        handleConvert();
      } else if (mod && e.shiftKey && (e.key === "M" || e.key === "m")) {
        e.preventDefault();
        useWorkspace.getState().togglePersona();
      } else if (e.altKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        handleMacroExecute("N1");
      } else if (e.altKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        handleMacroExecute("N2");
      } else if (e.altKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        handleMacroExecute("N3");
      } else if (mod && e.shiftKey && (e.key === "D" || e.key === "d")) {
        // DOCX 다운로드 단축키
        if (preview?.document_id) {
          e.preventDefault();
          window.open(downloadUrl(preview.document_id, "docx"), "_blank");
        }
      } else if (mod && e.shiftKey && (e.key === "H" || e.key === "h")) {
        if (preview?.document_id) {
          e.preventDefault();
          window.open(downloadUrl(preview.document_id, "hwpx"), "_blank");
        }
      } else if (mod && e.shiftKey && (e.key === "P" || e.key === "p")) {
        if (preview?.document_id) {
          e.preventDefault();
          window.open(downloadUrl(preview.document_id, "pdf"), "_blank");
        }
      }
    };
    window.addEventListener("keydown", onKey);

    // AI 액션 [변환실행] / 자동반영 이벤트 — ChatDock 또는 chat store 가 디스패치.
    // detail.forceFast=true 면 LLM 분석·검토 단계 모두 skip → 즉시 변환 (~5ms).
    // (채팅에서 이미 LLM 응답을 받은 직후 자동 변환이므로 중복 호출 방지)
    const onAiConvert = (e: Event) => {
      const detail = (e as CustomEvent<{ forceFast?: boolean }>).detail || {};
      handleConvert({ forceFast: detail.forceFast });
    };
    window.addEventListener("docuax:trigger-convert", onAiConvert);

    // AUTO_CONVERT_EVENT — RibbonToolbar(AI 변환·검토)·Editor(1초 debounce)가 dispatch.
    // (상단 검토 메뉴는 performConvert 를 직접 호출하므로 이 이벤트를 쓰지 않는다.)
    // 예전에는 WorkerConvertPanel 에만 리스너가 있어 헤비유저 모드·리모컨 접힘·타 탭에서
    // 무시됐다 — legacy trigger-convert 와 같은 위치(여기)에서 상시 listen 한다.
    // detail.forceFast 미지정 시 fastConvert store 플래그가 fast/full 을 결정.
    const onAutoConvert = (e: Event) => {
      const detail = (e as CustomEvent<{ forceFast?: boolean }>).detail || {};
      // 신구대조표(diff) 기준 소스 기록 — 기존 WorkerConvertPanel 리스너 동작 유지
      const s = useWorkspace.getState();
      s.setPrevSource(s.source);
      handleConvert({ forceFast: detail.forceFast });
    };
    window.addEventListener(AUTO_CONVERT_EVENT, onAutoConvert);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("docuax:trigger-convert", onAiConvert);
      window.removeEventListener(AUTO_CONVERT_EVENT, onAutoConvert);
    };
  }, [handleConvert, handleMacroExecute, preview]);

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-3 py-3">
        <button
          onClick={onToggleCollapse}
          className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <ChevronLeft size={16} />
        </button>
        <LogoSymbol size={20} />
        <div className="text-[10px] font-bold text-brand">리모컨</div>
      </div>
    );
  }

  const activeTabDef = TABS.find((t) => t.id === activeTab);
  const activeMacroFilter = activeTabDef && "filter" in activeTabDef ? activeTabDef.filter : undefined;
  const filteredMacros = activeMacroFilter
    ? macros.filter((m) => (activeMacroFilter as readonly string[]).includes(m.category))
    : [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <div className="flex items-center gap-1.5">
          <LogoSymbol size={18} />
          <span className="text-xs font-bold">리모컨</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
              persona === "worker"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
            }`}
            title={
              persona === "worker"
                ? "워커 모드 — 변환·검토 중심. 마크다운→DOCX 빠른 출력."
                : "헤비유저 모드 — 표·글자 매크로 중심. HWPX 정밀 편집."
            }
          >
            {persona === "worker" ? "워커" : "헤비유저"}
          </span>
        </div>
        <button
          onClick={onToggleCollapse}
          className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* 5탭 — PRD 5.1 */}
      <div className="flex border-b border-neutral-200 text-[11px] dark:border-neutral-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 border-b-2 py-2 transition-all ${
              activeTab === tab.id
                ? "border-brand font-semibold text-brand"
                : "border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "convert" && (
          persona === "worker" ? (
            <WorkerConvertPanel onConvert={handleConvert} onMacro={handleMacroExecute} busy={busy} />
          ) : (
            <HeavyConvertPanel onConvert={handleConvert} onMacro={handleMacroExecute} busy={busy} />
          )
        )}

        {activeTab !== "convert" && activeTab !== "output" && (
          <MacroGrid macros={filteredMacros} onExecute={handleMacroExecute} />
        )}

        {activeTab === "output" && (
          <div className="space-y-2 p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              다운로드
            </div>
            {(["docx", "hwpx", "pdf"] as const).map((fmt) => (
              <a
                key={fmt}
                href={preview ? downloadUrl(preview.document_id, fmt) : "#"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (!preview) {
                    e.preventDefault();
                    alert(NEEDS_CONVERT_MSG);
                  }
                }}
                className={`flex items-center justify-between rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm transition-all dark:border-neutral-800 dark:bg-neutral-900 ${
                  preview ? "hover:border-brand hover:bg-brand/5" : "opacity-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText size={14} />
                  <span className="font-semibold uppercase">{fmt}</span>
                </div>
                <Download size={14} />
              </a>
            ))}

            <div className="pt-3 text-[10px] text-neutral-500">
              {persona === "heavy"
                ? "헤비유저 모드 — HWPX 권장. 한컴 한글에서 결재선 추가."
                : "워커 모드 — DOCX 또는 PDF 권장. 메일 첨부에 적합."}
            </div>
            {persona === "worker" && (
              <div className="rounded bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                ⓘ 한컴 HWPX는 한국 공문 표준이라 색상·강조가 보수적입니다. 시각 디자인을 살리려면 DOCX·PDF가 더 멋집니다.
              </div>
            )}

            {/* 1:N 채널 내보내기 프리셋 */}
            <div className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                채널 내보내기
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {CHANNEL_PRESETS.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => void exportToChannel(ch.id)}
                    disabled={!preview}
                    className={`flex flex-col items-start rounded-md border px-2.5 py-2 text-left transition-all disabled:opacity-40 ${
                      preview
                        ? "border-neutral-200 bg-white hover:border-brand hover:bg-brand/5 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-brand"
                        : "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950"
                    }`}
                  >
                    <span className="text-sm">{ch.emoji}</span>
                    <span className="mt-0.5 text-[11px] font-semibold text-neutral-800 dark:text-neutral-200">
                      {ch.label}
                    </span>
                    <span className="text-[9px] text-neutral-500">{ch.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 border-t border-neutral-200 pt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
              편리 매크로 (P1~P5)
            </div>
            <MacroGrid
              macros={macros.filter((m) => m.category === "P")}
              onExecute={handleMacroExecute}
            />
          </div>
        )}
      </div>

      {pendingDialog && (
        <MacroParamDialog
          schema={pendingDialog}
          onCancel={() => setPendingDialog(null)}
          onConfirm={(params) => {
            const macroId = pendingDialog.macroId;
            setPendingDialog(null);
            void handleMacroExecute(macroId, params);
          }}
        />
      )}
    </div>
  );
}
