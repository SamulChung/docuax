"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  RotateCcw,
  Sigma,
  X,
} from "lucide-react";

import { CodeTextarea, type CodeTextareaHandle } from "@/components/editor/CodeTextarea";
import {
  EQUATION_TEMPLATES,
  PALETTE,
  composeEquationLatex,
  composeEquationSnippet,
  extractEquationTag,
  type EquationCategory,
  type EquationTemplate,
} from "@/lib/equationTemplates";

const CATEGORIES: EquationCategory[] = [
  "기초", "대수", "미적분", "통계·확률", "선형대수", "물리·공학", "경제·재무", "정렬·정의",
];

interface Props {
  initialTemplateId?: string;
  onClose: () => void;
  onInsert: (mathMarkdown: string) => void;
}

/**
 * 수식 편집 다이얼로그 — 3패널 + LaTeX 심볼/패턴 팔레트.
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ 헤더 — Σ 수식 편집기 [현재 템플릿 배지]                       [X]│
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │ 옵션 바 — [식 번호 \tag{}] [너비▾] [정렬▾] [초기화] [미리보기▾] │
 *   ├──────────┬──────────────────────────────┬──────────────────────┤
 *   │  좌      │  가운데                      │  우(미리보기·치트시트) │
 *   │  템플릿  │  팔레트(그리스·연산자·구조)  │                       │
 *   │  35종    │  LaTeX 편집기 (CodeTextarea)│                       │
 *   ├──────────┴──────────────────────────────┴──────────────────────┤
 *   │ 💡 \tag{X} 로 식 번호 자동 우측 표시                  [취소][삽입]│
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * - 식 번호(\tag{X})는 본문에서 분리해 별도 input 으로 노출 → 합성 시 자동 부착.
 * - 팔레트 항목 클릭하면 CodeTextarea 의 imperative API 로 커서 위치 삽입.
 *   `{}` 가 있는 항목은 첫 중괄호 안으로 커서 이동.
 */
export function EquationDialog({ initialTemplateId, onClose, onInsert }: Props) {
  const initial = useMemo(
    () =>
      EQUATION_TEMPLATES.find((t) => t.id === initialTemplateId) ??
      EQUATION_TEMPLATES[0],
    [initialTemplateId],
  );

  const [tplId, setTplId] = useState(initial.id);
  const tpl: EquationTemplate = useMemo(
    () => EQUATION_TEMPLATES.find((t) => t.id === tplId) ?? EQUATION_TEMPLATES[0],
    [tplId],
  );

  // 초기 latex 에서 \tag{X} 추출 — body / tag 분리
  const initialExtract = extractEquationTag(initial.latex);
  const [body, setBody] = useState(initialExtract.latex);
  const [tag, setTag] = useState(initialExtract.tag);
  const [width, setWidth] = useState(initial.defaultWidth);
  const [align, setAlign] = useState<"left" | "center" | "right">(initial.defaultAlign);

  const [dirty, setDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const taRef = useRef<CodeTextareaHandle>(null);

  // 템플릿 전환
  const selectTemplate = (id: string) => {
    if (dirty && id !== tplId) {
      const ok = confirm("현재 편집 중인 수식이 폐기됩니다. 다른 템플릿으로 변경할까요?");
      if (!ok) return;
    }
    const t = EQUATION_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const ext = extractEquationTag(t.latex);
    setTplId(id);
    setBody(ext.latex);
    setTag(ext.tag);
    setWidth(t.defaultWidth);
    setAlign(t.defaultAlign);
    setDirty(false);
  };

  const resetTemplate = () => {
    const ext = extractEquationTag(tpl.latex);
    setBody(ext.latex);
    setTag(ext.tag);
    setWidth(tpl.defaultWidth);
    setAlign(tpl.defaultAlign);
    setDirty(false);
  };

  // 최종 스니펫
  const snippet = useMemo(() => {
    const latex = composeEquationLatex(body, tag);
    return composeEquationSnippet({ latex, width, align });
  }, [body, tag, width, align]);

  // Esc 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 컬럼 폭
  const centerColClass = showPreview ? "col-span-6" : "col-span-9";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-2.5 dark:border-neutral-800">
          <div className="flex min-w-0 items-center gap-2">
            <Sigma size={16} className="shrink-0 text-brand" />
            <h2 className="text-base font-semibold">수식 편집기</h2>
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

        {/* 컴팩트 옵션 바 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50/60 px-4 py-2 dark:border-neutral-800 dark:bg-neutral-950/40">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-semibold uppercase text-neutral-500">식 번호</span>
            <input
              type="text"
              value={tag}
              onChange={(e) => { setTag(e.target.value); setDirty(true); }}
              placeholder="\tag{...} (선택)"
              className="w-32 rounded border border-neutral-300 px-2 py-1 text-xs focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
              title="식 번호 — 비워두면 \tag 없이, 입력하면 \tag{X} 자동 부착"
            />
          </div>
          <select
            value={width}
            onChange={(e) => { setWidth(e.target.value); setDirty(true); }}
            className="shrink-0 rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            title="너비"
          >
            <option value="40%">너비 40%</option>
            <option value="50%">너비 50%</option>
            <option value="60%">너비 60%</option>
            <option value="70%">너비 70%</option>
            <option value="80%">너비 80%</option>
            <option value="100%">너비 100%</option>
          </select>
          <select
            value={align}
            onChange={(e) => { setAlign(e.target.value as "left" | "center" | "right"); setDirty(true); }}
            className="shrink-0 rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            title="정렬"
          >
            <option value="left">왼쪽</option>
            <option value="center">가운데</option>
            <option value="right">오른쪽</option>
          </select>

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
            title={showPreview ? "미리보기 패널 숨기기" : "미리보기 패널 보이기"}
          >
            {showPreview ? <EyeOff size={10} /> : <Eye size={10} />}
            {showPreview ? "미리보기 숨김" : "미리보기 보임"}
          </button>
        </div>

        {/* 3패널 본문 */}
        <div className="grid flex-1 grid-cols-12 overflow-hidden">
          {/* 좌측 — 템플릿 사이드바 */}
          <div className="col-span-3 flex flex-col overflow-hidden border-r border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-950/40">
            <div className="sticky top-0 border-b border-neutral-200 bg-neutral-100/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/80">
              템플릿 ({EQUATION_TEMPLATES.length}종)
            </div>
            <div className="flex-1 overflow-y-auto">
              {CATEGORIES.map((cat) => {
                const items = EQUATION_TEMPLATES.filter((t) => t.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat}>
                    <div className="bg-brand/5 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-brand">
                      {cat}
                    </div>
                    {items.map((t) => {
                      const active = t.id === tplId;
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
                          <div className={`text-xs ${active ? "font-bold" : "font-semibold text-neutral-800 dark:text-neutral-200"}`}>
                            {t.label}
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

          {/* 가운데 — 팔레트 + LaTeX 편집기 */}
          <div className={`${centerColClass} flex flex-col overflow-hidden`}>
            {/* 심볼·패턴 팔레트 */}
            <div className="border-b border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-950/40">
              <div className="max-h-[200px] overflow-y-auto px-3 py-2">
                {PALETTE.map((group) => (
                  <div key={group.name} className="mb-2 last:mb-0">
                    <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-neutral-500">
                      {group.name}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {group.items.map((it, i) => (
                        <button
                          key={`${group.name}-${i}`}
                          type="button"
                          onClick={() => {
                            taRef.current?.insertAtCursor(it.insert, {
                              focusInsideBraces: it.focusInsideBraces ?? true,
                            });
                            setDirty(true);
                          }}
                          className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-neutral-700 transition-all hover:border-brand hover:bg-brand/5 hover:text-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                          title={it.title || it.insert}
                        >
                          {it.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* LaTeX 편집기 */}
            <div className="flex flex-1 flex-col p-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                LaTeX 본문 ({tpl.label})
              </div>
              <CodeTextarea
                ref={taRef}
                value={body}
                onChange={(next) => { setBody(next); setDirty(true); }}
                placeholder="LaTeX 수식을 직접 입력하세요. 위 팔레트 버튼 클릭으로 심볼/패턴 삽입."
                minHeight="280px"
                className="flex-1"
              />
            </div>
          </div>

          {/* 우측 — 미리보기 + 치트시트 (선택적) */}
          {showPreview && (
            <div className="col-span-3 flex flex-col overflow-hidden border-l border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-950/40">
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="border-b border-neutral-200 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                  삽입될 스니펫
                </div>
                <pre className="flex-1 overflow-auto px-3 py-2 font-mono text-[10px] leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {snippet}
                </pre>
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setCheatsheetOpen((v) => !v)}
                  className="flex w-full items-center justify-between border-b border-neutral-200 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500 hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-900"
                >
                  <span className="flex items-center gap-1">💡 LaTeX 치트시트</span>
                  {cheatsheetOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </button>
                {cheatsheetOpen && (
                  <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[10px] leading-relaxed text-neutral-700 dark:text-neutral-300">
{`기본
  ^{지수}        — 위첨자
  _{인덱스}       — 아래첨자
  \\frac{a}{b}   — 분수
  \\sqrt{x}      — 제곱근
  \\sqrt[n]{x}   — n제곱근

큰 연산자
  \\sum_{i=1}^{n}    — 합
  \\prod_{i=1}^{n}   — 곱
  \\int_{a}^{b}      — 적분
  \\lim_{x \\to 0}    — 극한

괄호 (자동 크기)
  \\left( ... \\right)
  \\left[ ... \\right]
  \\left\\{ ... \\right\\}

서식
  \\mathbf{A}        — 굵게
  \\mathcal{F}       — 손글씨
  \\mathbb{R}        — 칠판굵게 (집합)
  \\text{한글 가능}    — 텍스트 모드

식 번호
  \\tag{1}            — 임의 번호 (위 옵션 바 사용 권장)`}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-2.5 dark:border-neutral-800">
          <div className="text-[11px] text-neutral-500">
            💡 변환 시 백엔드가 LaTeX → 이미지로 렌더 — 미리보기는 소스만 표시
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
              수식 삽입
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
