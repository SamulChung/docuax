"use client";

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from "react";

/**
 * 코드 친화적 textarea — 다이어그램 소스 / chart JSON / 수식 등에 공통 사용.
 *
 * 기능:
 *   - Tab: 4공백 들여쓰기 (선택 영역이 있으면 줄별 일괄 들여쓰기)
 *   - Shift+Tab: 역 들여쓰기 (줄 시작 4공백 또는 1개 탭 제거)
 *   - Enter: 이전 줄의 들여쓰기 자동 유지
 *   - 라인·문자 카운터 표시
 *   - monospace + 적절한 line-height
 *
 * Mermaid 키워드 하이라이트는 textarea 한계로 어려움 — overlay 방식이 필요한데
 * 본 컴포넌트는 단순화 우선. 향후 react-textarea-autosize 같은 라이브러리 도입 시 확장.
 */

const TAB_SIZE = 4;
const TAB_STR = " ".repeat(TAB_SIZE);

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** 최소 높이 — 부모가 flex 로 줄 때는 무시되고 채워짐 */
  minHeight?: string;
  /** 추가 className (외부 wrapper) */
  className?: string;
  /** textarea 자체에 추가 className */
  textareaClassName?: string;
  /** 우상단에 라인/문자 카운터 표시 (기본 true) */
  showCounter?: boolean;
  /** spellCheck off (코드용) */
  spellCheck?: boolean;
}

/** 외부에서 imperative 하게 호출할 수 있는 메서드. ref 로 노출. */
export interface CodeTextareaHandle {
  /**
   * 커서 위치에 텍스트 삽입.
   * - 영역 선택돼 있으면 선택을 교체
   * - 첫 번째 `{}` 안으로 커서를 옮길 수 있음 (focusInsideBraces=true)
   */
  insertAtCursor: (text: string, opts?: { focusInsideBraces?: boolean }) => void;
  focus: () => void;
}

export const CodeTextarea = forwardRef<CodeTextareaHandle, Props>(function CodeTextarea(
  {
    value,
    onChange,
    placeholder,
    minHeight = "300px",
    className = "",
    textareaClassName = "",
    showCounter = true,
    spellCheck = false,
  }: Props,
  externalRef,
) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // imperative API — 부모(EquationDialog 등)가 팔레트 버튼에서 호출
  useImperativeHandle(externalRef, () => ({
    insertAtCursor(text: string, opts) {
      const ta = ref.current;
      if (!ta) return;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      const v = ta.value;
      const next = v.slice(0, start) + text + v.slice(end);
      onChange(next);
      // 삽입 후 커서 위치 — 옵션에 따라 첫 `{}` 안 또는 끝
      requestAnimationFrame(() => {
        const t = ref.current;
        if (!t) return;
        t.focus();
        if (opts?.focusInsideBraces) {
          // text 안의 첫 번째 `{}` 위치를 찾아 그 사이로 커서 이동
          const idx = text.indexOf("{}");
          if (idx >= 0) {
            const pos = start + idx + 1; // `{`와 `}` 사이
            t.setSelectionRange(pos, pos);
            return;
          }
          // `{` 만 있으면 그 뒤로
          const open = text.indexOf("{");
          if (open >= 0) {
            const pos = start + open + 1;
            t.setSelectionRange(pos, pos);
            return;
          }
        }
        const pos = start + text.length;
        t.setSelectionRange(pos, pos);
      });
    },
    focus() {
      ref.current?.focus();
    },
  }), [onChange]);

  const { lineCount, charCount } = useMemo(() => {
    if (!value) return { lineCount: 1, charCount: 0 };
    const lines = value.split("\n").length;
    return { lineCount: lines, charCount: value.length };
  }, [value]);

  /**
   * value 와 새 selection 을 적용. setSelectionRange 는 React state 가 flush 된 뒤에
   * 적용해야 정상 동작 — requestAnimationFrame 사용.
   */
  const apply = useCallback(
    (next: string, selStart: number, selEnd?: number) => {
      onChange(next);
      requestAnimationFrame(() => {
        const ta = ref.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(selStart, selEnd ?? selStart);
      });
    },
    [onChange],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;
      const { selectionStart: start, selectionEnd: end } = ta;
      const v = ta.value;

      // ── Tab / Shift+Tab — 들여쓰기 ────────────────────────────
      if (e.key === "Tab") {
        e.preventDefault();
        if (start === end) {
          // 단일 커서 — 4공백 삽입
          if (e.shiftKey) {
            // 역 들여쓰기 — 커서 바로 앞이 공백 4개면 제거
            const lineStart = v.lastIndexOf("\n", start - 1) + 1;
            const lineHead = v.slice(lineStart, start);
            if (lineHead.endsWith(TAB_STR)) {
              const next = v.slice(0, start - TAB_SIZE) + v.slice(start);
              apply(next, start - TAB_SIZE);
              return;
            }
            // 탭 문자 1개 제거 시도
            if (lineHead.endsWith("\t")) {
              const next = v.slice(0, start - 1) + v.slice(start);
              apply(next, start - 1);
              return;
            }
            return;
          }
          const next = v.slice(0, start) + TAB_STR + v.slice(end);
          apply(next, start + TAB_SIZE);
          return;
        }
        // 영역 선택 — 줄별 일괄 들여쓰기
        const lineStart = v.lastIndexOf("\n", start - 1) + 1;
        const lineEndCandidate = v.indexOf("\n", end);
        const lineEnd = lineEndCandidate === -1 ? v.length : lineEndCandidate;
        const selectedBlock = v.slice(lineStart, lineEnd);
        const lines = selectedBlock.split("\n");
        let newBlock: string;
        let delta = 0;
        if (e.shiftKey) {
          newBlock = lines
            .map((ln) => {
              if (ln.startsWith(TAB_STR)) {
                delta -= TAB_SIZE;
                return ln.slice(TAB_SIZE);
              }
              if (ln.startsWith("\t")) {
                delta -= 1;
                return ln.slice(1);
              }
              return ln;
            })
            .join("\n");
        } else {
          newBlock = lines.map((ln) => TAB_STR + ln).join("\n");
          delta = TAB_SIZE * lines.length;
        }
        const next = v.slice(0, lineStart) + newBlock + v.slice(lineEnd);
        // 새 selection — 변경된 영역을 그대로 유지
        const newStart = lineStart;
        const newEnd = lineStart + newBlock.length;
        apply(next, newStart, newEnd);
        // 사실 delta 를 직접 쓰지는 않지만 (선택은 블록 전체 재선택) lint 무시.
        void delta;
        return;
      }

      // ── Enter — 이전 줄 들여쓰기 자동 유지 ─────────────────────
      if (e.key === "Enter") {
        const lineStart = v.lastIndexOf("\n", start - 1) + 1;
        const lineHead = v.slice(lineStart, start);
        const indentMatch = /^[\t ]*/.exec(lineHead);
        const indent = indentMatch ? indentMatch[0] : "";
        if (indent.length === 0) return; // 들여쓰기 없으면 기본 동작
        e.preventDefault();
        const inserted = "\n" + indent;
        const next = v.slice(0, start) + inserted + v.slice(end);
        apply(next, start + inserted.length);
        return;
      }
    },
    [apply],
  );

  return (
    <div className={`relative flex flex-col ${className}`}>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={spellCheck}
        placeholder={placeholder}
        style={{ minHeight, tabSize: TAB_SIZE }}
        className={`flex-1 w-full resize-none rounded border border-neutral-300 bg-neutral-50 p-3 font-mono text-[12px] leading-relaxed focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950 ${textareaClassName}`}
      />
      {showCounter && (
        <div
          className="pointer-events-none absolute right-2 top-2 select-none rounded bg-white/85 px-1.5 py-0.5 text-[9px] font-medium text-neutral-500 shadow-sm dark:bg-neutral-900/85 dark:text-neutral-400"
          title="라인 · 문자 수"
        >
          {lineCount}줄 · {charCount.toLocaleString()}자
        </div>
      )}
    </div>
  );
});
