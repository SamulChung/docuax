"use client";

import { useEffect, useRef } from "react";
import { useWorkspace } from "@/store/workspace";

/** A4 = 210×297mm. 화면 96dpi 기준 794×1123px. 상하 여백 각 60px. */
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const PAGE_MARGIN = 60;
const PAGE_CONTENT_HEIGHT = PAGE_HEIGHT - PAGE_MARGIN * 2;

/* 페이지 경계 가이드 — PAGE_HEIGHT 주기로 1px 라인 반복 (상수에서 파생) */
const PAGE_GUIDE_GRADIENT = `repeating-linear-gradient(to bottom, transparent, transparent ${PAGE_HEIGHT - 1}px, rgba(120,120,120,0.35) ${PAGE_HEIGHT - 1}px, rgba(120,120,120,0.35) ${PAGE_HEIGHT}px)`;

export function A4Sheet({ children }: { children: React.ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const setPageCount = useWorkspace((s) => s.setPageCount);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const pages = Math.max(1, Math.ceil(el.scrollHeight / PAGE_CONTENT_HEIGHT));
      setPageCount(pages);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [setPageCount]);

  return (
    <div className="print-root flex justify-center bg-neutral-100 py-6 dark:bg-neutral-950">
      {/* 용지는 항상 흰색 — .preview 텍스트 색(text-neutral-900)이 라이트 전용이므로
          다크 모드에서도 dark: 배경 변형을 두지 않음 (Word/한글의 다크 UI와 동일한 방식) */}
      <div
        className="print-sheet relative max-w-full bg-white shadow-md"
        style={{ width: PAGE_WIDTH }}
      >
        <div
          aria-hidden
          className="page-guide pointer-events-none absolute inset-0 z-10"
          style={{ backgroundImage: PAGE_GUIDE_GRADIENT }}
        />
        <div ref={innerRef} style={{ padding: PAGE_MARGIN }}>
          {children}
        </div>
      </div>
    </div>
  );
}
