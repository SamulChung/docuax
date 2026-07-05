"use client";

import { SlideWorkspace } from "@/components/slides/SlideWorkspace";

export default function SlidesPage() {
  return (
    // 스탠드얼론 라우트는 기존처럼 한 화면 고정 + 내부 스크롤 (Footer 밀림 방지).
    // 탭 임베드(Workspace)에서는 부모가 높이를 소유하므로 이 래퍼를 거치지 않는다.
    <main className="flex h-screen flex-col overflow-hidden p-4">
      <SlideWorkspace />
    </main>
  );
}
