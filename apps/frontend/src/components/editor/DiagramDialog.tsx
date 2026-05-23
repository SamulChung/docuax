"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Eye,
  EyeOff,
  GitBranch,
  RotateCcw,
  Wand2,
  X,
} from "lucide-react";

import { CodeTextarea } from "@/components/editor/CodeTextarea";
import { FlowchartBuilder } from "@/components/editor/FlowchartBuilder";
import {
  DIAGRAM_TEMPLATES,
  composeDiagramSnippet,
  composeDiagramSource,
  extractDiagramTitle,
  stripDiagramFrontmatter,
  type DiagramCategory,
  type DiagramTemplate,
} from "@/lib/diagramTemplates";

/** 시각 빌더가 지원하는 다이어그램 종류. 현재는 flowchart 계열만. */
const VISUAL_BUILDER_IDS = new Set(["flowchart", "flowchart_td"]);

const CATEGORIES: DiagramCategory[] = [
  "프로세스", "구조", "동작", "데이터", "프로젝트", "기획",
];

interface Props {
  /** 초기 선택 템플릿. 미지정 시 첫 번째 (flowchart). */
  initialTemplateId?: string;
  onClose: () => void;
  /** [삽입] 클릭 시 합성된 ` ```mermaid ... ``` ` 스니펫 전달. */
  onInsert: (diagramMarkdown: string) => void;
}

/**
 * 다이어그램 편집 다이얼로그 — 3패널 구조.
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ 헤더 — 제목 + 현재 템플릿 배지 + 닫기                              │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │ 컴팩트 옵션 바 — 이름 · 너비 · 정렬 · 모드 탭 · 초기화           │
 *   ├──────────┬──────────────────────────┬──────────────────────────┤
 *   │  좌      │  가운데                  │  우(미리보기 + 치트시트)  │
 *   │  템플릿  │  편집기(소스 / 시각)     │  접이식 패널              │
 *   │  사이드  │  넓은 작업 공간          │                          │
 *   │  바      │                          │                          │
 *   ├──────────┴──────────────────────────┴──────────────────────────┤
 *   │ 푸터 — 취소 / 삽입 + 미리보기 토글                              │
 *   └─────────────────────────────────────────────────────────────────┘
 */
export function DiagramDialog({ initialTemplateId, onClose, onInsert }: Props) {
  const initial = useMemo(
    () =>
      DIAGRAM_TEMPLATES.find((t) => t.id === initialTemplateId) ??
      DIAGRAM_TEMPLATES[0],
    [initialTemplateId],
  );

  const [tplId, setTplId] = useState(initial.id);
  const tpl: DiagramTemplate = useMemo(
    () => DIAGRAM_TEMPLATES.find((t) => t.id === tplId) ?? DIAGRAM_TEMPLATES[0],
    [tplId],
  );

  const [title, setTitle] = useState(extractDiagramTitle(initial.source));
  const [body, setBody] = useState(stripDiagramFrontmatter(initial.source));
  const [width, setWidth] = useState(initial.defaultWidth);
  const [align, setAlign] = useState<"left" | "center" | "right">(initial.defaultAlign);

  // flowchart 계열만 visual 지원
  const supportsVisual = VISUAL_BUILDER_IDS.has(tplId);
  const [mode, setMode] = useState<"source" | "visual">(supportsVisual ? "visual" : "source");

  // 우측 미리보기 패널 표시 여부 — 좁은 화면이거나 편집 공간을 더 원할 때 접기
  const [showPreview, setShowPreview] = useState(true);
  // 치트시트 접이식
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  // visual 빌더가 만든 소스를 받아 body 에 반영
  const handleVisualSource = useCallback((mermaidBody: string) => {
    setBody(mermaidBody);
  }, []);

  // 템플릿 전환 — dirty 면 confirm
  const [dirty, setDirty] = useState(false);
  const selectTemplate = (id: string) => {
    if (dirty && id !== tplId) {
      const ok = confirm(
        "현재 편집 중인 다이어그램이 폐기됩니다. 다른 템플릿으로 변경할까요?",
      );
      if (!ok) return;
    }
    const t = DIAGRAM_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setTplId(id);
    setTitle(extractDiagramTitle(t.source));
    setBody(stripDiagramFrontmatter(t.source));
    setWidth(t.defaultWidth);
    setAlign(t.defaultAlign);
    setDirty(false);
    setMode(VISUAL_BUILDER_IDS.has(id) ? "visual" : "source");
  };

  const resetTemplate = () => {
    setTitle(extractDiagramTitle(tpl.source));
    setBody(stripDiagramFrontmatter(tpl.source));
    setWidth(tpl.defaultWidth);
    setAlign(tpl.defaultAlign);
    setDirty(false);
  };

  const snippet = useMemo(() => {
    const source = composeDiagramSource(title, body);
    return composeDiagramSnippet({ source, width, align });
  }, [title, body, width, align]);

  // Esc 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 가운데/우측 컬럼 폭 — showPreview 에 따라 동적 (Tailwind JIT 위해 명시 클래스)
  const centerColClass = showPreview ? "col-span-6" : "col-span-9";
  const rightColClass = "col-span-3"; // 미리보기는 항상 3 (showPreview=false 면 통째 숨김)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        {/* ─── 헤더 ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-2.5 dark:border-neutral-800">
          <div className="flex min-w-0 items-center gap-2">
            <GitBranch size={16} className="shrink-0 text-brand" />
            <h2 className="text-base font-semibold">다이어그램 편집기</h2>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">
              {tpl.label}
            </span>
            <span className="hidden truncate text-xs text-neutral-500 md:inline">
              · {tpl.description}
            </span>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={16} />
          </button>
        </div>

        {/* ─── 컴팩트 옵션 바 ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50/60 px-4 py-2 dark:border-neutral-800 dark:bg-neutral-950/40">
          <input
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            placeholder="다이어그램 이름 (비우면 제목 없음)"
            className="min-w-[200px] flex-1 rounded border border-neutral-300 px-2.5 py-1 text-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
          />
          <select
            value={width}
            onChange={(e) => { setWidth(e.target.value); setDirty(true); }}
            className="shrink-0 rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            title="너비"
          >
            <option value="50%">너비 50%</option>
            <option value="60%">너비 60%</option>
            <option value="70%">너비 70%</option>
            <option value="80%">너비 80%</option>
            <option value="90%">너비 90%</option>
            <option value="100%">너비 100%</option>
          </select>
          <select
            value={align}
            onChange={(e) => { setAlign(e.target.value as "left" | "center" | "right"); setDirty(true); }}
            className="shrink-0 rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            title="정렬"
          >
            <option value="left">왼쪽 정렬</option>
            <option value="center">가운데 정렬</option>
            <option value="right">오른쪽 정렬</option>
          </select>

          {/* 모드 탭 */}
          <div className="flex shrink-0 overflow-hidden rounded border border-neutral-200 dark:border-neutral-700">
            <button
              type="button"
              onClick={() => setMode("source")}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold transition-all ${
                mode === "source"
                  ? "bg-brand text-white"
                  : "bg-white text-neutral-600 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-300"
              }`}
              title="Mermaid 소스 직접 작성"
            >
              <Code2 size={10} /> 소스
            </button>
            <button
              type="button"
              onClick={() => {
                if (!supportsVisual) {
                  alert(
                    `시각 빌더는 현재 flowchart 계열만 지원합니다.\n[${tpl.label}] 은 소스 모드만 가능.`,
                  );
                  return;
                }
                if (mode === "source") {
                  const ok = confirm(
                    "시각 빌더로 전환하면 기본 노드/엣지 구조에서 시작합니다.\n" +
                      "현재 소스에 직접 작성한 내용은 폐기됩니다. 계속할까요?",
                  );
                  if (!ok) return;
                }
                setMode("visual");
              }}
              disabled={!supportsVisual}
              className={`flex items-center gap-1 border-l border-neutral-200 px-2 py-1 text-[10px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 ${
                mode === "visual"
                  ? "bg-brand text-white"
                  : "bg-white text-neutral-600 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-300"
              }`}
              title={
                supportsVisual
                  ? "노드·연결 폼으로 시각적 작성 (flowchart 계열 전용)"
                  : "이 종류는 소스 모드만 지원"
              }
            >
              <Wand2 size={10} /> 시각 빌더
            </button>
          </div>

          <button
            type="button"
            onClick={resetTemplate}
            className="shrink-0 flex items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            title="현재 템플릿 기본값으로 되돌리기"
          >
            <RotateCcw size={10} />
            초기화
          </button>

          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="shrink-0 flex items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            title={showPreview ? "미리보기 패널 숨기기 (편집 공간 확대)" : "미리보기 패널 보이기"}
          >
            {showPreview ? <EyeOff size={10} /> : <Eye size={10} />}
            {showPreview ? "미리보기 숨김" : "미리보기 보임"}
          </button>
        </div>

        {/* ─── 3패널 본문 ─────────────────────────────────────────── */}
        <div className="grid flex-1 grid-cols-12 overflow-hidden">
          {/* 좌측: 카테고리별 템플릿 사이드바 */}
          <div className="col-span-3 flex flex-col overflow-hidden border-r border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-950/40">
            <div className="sticky top-0 border-b border-neutral-200 bg-neutral-100/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/80">
              템플릿 ({DIAGRAM_TEMPLATES.length}종)
            </div>
            <div className="flex-1 overflow-y-auto">
              {CATEGORIES.map((cat) => {
                const items = DIAGRAM_TEMPLATES.filter((t) => t.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat}>
                    <div className="bg-brand/5 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-brand">
                      {cat}
                    </div>
                    {items.map((t) => {
                      const active = t.id === tplId;
                      const isVisual = VISUAL_BUILDER_IDS.has(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => selectTemplate(t.id)}
                          className={`block w-full px-3 py-1.5 text-left transition-all ${
                            active
                              ? "bg-brand/15 text-brand"
                              : "hover:bg-brand/5"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs ${active ? "font-bold" : "font-semibold text-neutral-800 dark:text-neutral-200"}`}>
                              {t.label}
                            </span>
                            {isVisual && (
                              <span className="rounded-full bg-emerald-100 px-1 py-0 text-[8px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" title="시각 빌더 지원">
                                🪄
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                            {t.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 가운데: 편집기 */}
          <div className={`${centerColClass} flex flex-col overflow-hidden`}>
            <div className="flex flex-1 flex-col overflow-y-auto p-4">
              {mode === "source" ? (
                <CodeTextarea
                  value={body}
                  onChange={(next) => { setBody(next); setDirty(true); }}
                  placeholder="Mermaid 소스를 직접 작성하세요. Tab 으로 들여쓰기, Enter 로 자동 들여쓰기 유지. 우측 미리보기에서 합성 결과 확인."
                  minHeight="420px"
                  className="flex-1"
                />
              ) : (
                <div className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
                  <FlowchartBuilder onSourceChange={handleVisualSource} />
                </div>
              )}
            </div>
          </div>

          {/* 우측: 미리보기 + 치트시트 (선택적) */}
          {showPreview && (
            <div className={`${rightColClass} flex flex-col overflow-hidden border-l border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-950/40`}>
              {/* 스니펫 미리보기 */}
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="border-b border-neutral-200 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                  삽입될 스니펫
                </div>
                <pre className="flex-1 overflow-auto px-3 py-2 font-mono text-[10px] leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {snippet}
                </pre>
              </div>

              {/* 치트시트 — 접이식 */}
              <div className="border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setCheatsheetOpen((v) => !v)}
                  className="flex w-full items-center justify-between border-b border-neutral-200 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500 hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-900"
                >
                  <span className="flex items-center gap-1">
                    💡 {tpl.label} 치트시트
                  </span>
                  {cheatsheetOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </button>
                {cheatsheetOpen && (
                  <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[10px] leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {tpl.cheatsheet}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── 푸터 ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-2.5 dark:border-neutral-800">
          <div className="text-[11px] text-neutral-500">
            💡 변환 시 백엔드 Mermaid 렌더러가 SVG 로 그립니다 — 미리보기는 소스만 표시
            {dirty && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                ● 편집됨
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded border border-neutral-200 px-3 py-1.5 text-xs hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              취소
            </button>
            <button
              onClick={() => onInsert(snippet)}
              disabled={body.trim().length === 0}
              className="flex items-center gap-1 rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
            >
              <Check size={11} />
              다이어그램 삽입
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
