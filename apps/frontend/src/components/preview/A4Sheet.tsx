"use client";

import { useEffect, useRef } from "react";
import { useWorkspace } from "@/store/workspace";

/** A4 = 210×297mm. 화면 96dpi 기준 794×1123px. 상하 여백 각 60px 가정. */
const PAGE_HEIGHT = 1123;
const PAGE_CONTENT_HEIGHT = PAGE_HEIGHT - 120;

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
    <div className="flex justify-center bg-neutral-100 py-6 dark:bg-neutral-950">
      {/* 용지는 항상 흰색 — .preview 텍스트 색(text-neutral-900)이 라이트 전용이므로
          다크 모드에서도 dark: 배경 변형을 두지 않음 (Word/한글의 다크 UI와 동일한 방식) */}
      <div className="relative w-[794px] max-w-full bg-white shadow-md">
        {/* 페이지 경계 가이드 — 콘텐츠 높이만큼 반복 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent, transparent calc(1123px - 1px), rgba(120,120,120,0.35) calc(1123px - 1px), rgba(120,120,120,0.35) 1123px)",
          }}
        />
        <div ref={innerRef} className="px-[60px] py-[60px]">
          {children}
        </div>
      </div>
    </div>
  );
}
