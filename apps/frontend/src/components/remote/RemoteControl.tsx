"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";

import { LogoSymbol } from "@/components/Logo";
import { convertDocument, downloadUrl, executeMacro, listMacros } from "@/lib/api";
import { getOrganizationId } from "@/lib/user";
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
  const setPreview = useWorkspace((s) => s.setPreview);
  const busy = useWorkspace((s) => s.busy);

  const { data: macros = [] } = useSWR("macros", () => listMacros(), {
    revalidateOnFocus: false,
  });

  const handleConvert = useCallback(async (opts?: { forceFast?: boolean }) => {
    // 드롭존에서 setSource(...) 직후 동기적으로 호출되는 경로가 있어
    // selector closure 가 stale 한 빈 source 를 캡처할 수 있음 — store snapshot 으로 직독.
    const s = useWorkspace.getState();
    if (s.busy) return;
    if (!s.source || s.source.trim().length === 0) {
      alert("변환할 마크다운이 비어 있습니다. 에디터에 입력하거나 .md 파일을 드롭하세요.");
      return;
    }
    s.setBusy(true);
    try {
      const orgId = getOrganizationId();
      // ⚡ 빠른 변환 — fastConvert ON 또는 자동반영 이벤트(forceFast=true) 시
      //   LLM 단계 2(분석)·4(검토) 모두 skip → 1~2ms 변환
      const fast = !!opts?.forceFast || s.fastConvert;
      const res = await convertDocument({
        source: s.source,
        title: s.title || undefined,
        persona_mode: s.persona,
        organization_id: orgId ?? undefined,
        skip_analyze: fast,
        skip_review: fast,
      });
      s.setPreview(res.preview);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      const msg = (e as Error).message;
      if (msg.includes("429")) {
        alert("요청이 너무 많아 잠시 대기가 필요합니다.\n잠시 후 다시 시도하거나, 일일 한도가 충분한 플랜으로 업그레이드하세요.");
      } else if (msg.includes("429") || msg.includes("일일 한도") || msg.includes("daily")) {
        alert("오늘 변환 한도를 초과했습니다.\n상단 요금제에서 플랜을 업그레이드하실 수 있습니다.");
      } else {
        alert(`변환 실패: ${msg}`);
      }
    } finally {
      useWorkspace.getState().setBusy(false);
    }
  }, []);

  const handleMacroExecute = useCallback(
    async (macroId: string, params?: Record<string, unknown>) => {
      if (!preview?.document_id) {
        alert("먼저 변환을 실행하세요 (Ctrl+Enter)");
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
        setPendingDialog(MACRO_PARAM_SCHEMAS[macroId]);
        return;
      }
      // N1/N2/N3는 백엔드 호출 없이 프론트 스토어에서 직접 점프 — 즉각 반응
      if (macroId === "N1" || macroId === "N2" || macroId === "N3") {
        const color = macroId === "N1" ? "red" : macroId === "N2" ? "blue" : "yellow";
        useWorkspace.getState().jumpToNext(color);
        return;
      }
      // T1~T4 표 생성 — 에디터의 source 끝에 마크다운 표 골격 추가
      // 사용자가 마크다운 에디터에서 셀을 채우게 함. 그리고 자동 재변환.
      if (["T1", "T2", "T3", "T4"].includes(macroId)) {
        const rows = (params?.rows as number) ?? 3;
        const cols = (params?.cols as number) ?? 3;
        const cur = useWorkspace.getState().source;
        const header = "| " + Array.from({ length: cols }, (_, i) => `열 ${i + 1}`).join(" | ") + " |";
        const sep = "| " + Array.from({ length: cols }, () => "---").join(" | ") + " |";
        const body = Array.from({ length: rows - 1 }, () =>
          "| " + Array.from({ length: cols }, () => "  ").join(" | ") + " |"
        ).join("\n");
        const tableMd = `\n\n${header}\n${sep}\n${body}\n`;
        useWorkspace.getState().setSource(cur + tableMd);
        // 즉시 재변환
        setTimeout(() => handleConvert(), 50);
        return;
      }
      // B11(복사)·B12(잘라내기)는 브라우저 Clipboard API로 처리
      if (macroId === "B11" || macroId === "B12") {
        try {
          // 변환 결과 전체 텍스트를 클립보드에 — 운영에서는 선택 영역만
          await navigator.clipboard.writeText(preview.plain_text);
        } catch {
          alert("클립보드 권한이 필요합니다");
          return;
        }
        if (macroId === "B12") {
          // 잘라내기는 백엔드도 호출 (블록 제거)
          try {
            const res = await executeMacro({
              macro_id: macroId,
              document_id: preview.document_id,
              params,
            });
            setPreview(res.preview);
          } catch {
            /* 백엔드 실패는 무시 — 클립보드 복사는 성공 */
          }
        }
        return;
      }
      // B14 평문 붙임 — 브라우저 클립보드에서 읽어 백엔드에 전달
      if (macroId === "B14") {
        try {
          const text = await navigator.clipboard.readText();
          const res = await executeMacro({
            macro_id: macroId,
            document_id: preview.document_id,
            params: { ...params, plain_text: text },
          });
          setPreview(res.preview);
        } catch {
          alert("클립보드 읽기 권한이 필요합니다");
        }
        return;
      }
      try {
        const res = await executeMacro({
          macro_id: macroId,
          document_id: preview.document_id,
          params,
        });
        setPreview(res.preview);
        // 변경된 블록 표시 — 선택된 블록을 잠깐 강조
        const changedIds = (params?.selected_block_ids as string[] | undefined) ?? [];
        if (changedIds.length > 0) {
          useWorkspace.getState().setRecentlyChanged(changedIds);
        }
        // R9 결과는 alert로 일단 노출 (추후 사이드 패널로)
        if (macroId === "R9" && res.result?.score !== undefined) {
          const score = res.result.score as number;
          const suggestions = (res.result.suggestions as string[] | undefined) ?? [];
          alert(
            `기관 양식 일치도: ${(score * 100).toFixed(0)}점\n\n` +
              (suggestions.length ? `개선 제안:\n- ${suggestions.join("\n- ")}` : "개선 사항 없음")
          );
        }
      } catch (e) {
        alert(`매크로 실행 실패: ${(e as Error).message}`);
      }
    },
    [preview, setPreview]
  );

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

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("docuax:trigger-convert", onAiConvert);
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
                    alert("먼저 변환을 실행하세요");
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
