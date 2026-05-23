"use client";

import { useState } from "react";
import useSWR from "swr";
import { Building2, Loader2, Sparkles } from "lucide-react";

import { PromptLibrary } from "@/components/prompts/PromptLibrary";
import { listPromptOrganizations } from "@/lib/api";

/**
 * 관리자 콘솔의 "프롬프트" 섹션.
 *
 * - 라벨별 프롬프트 수 미리보기
 * - "프롬프트 라이브러리 열기" 버튼 → PromptLibrary 모달
 */
export function AdminPrompts() {
  const [modalOpen, setModalOpen] = useState(false);
  const { data: orgs = [], isLoading } = useSWR(
    "admin:prompt-orgs",
    listPromptOrganizations,
  );

  const total = orgs.reduce((s, o) => s + o.count, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          회사·기관별 프롬프트 치트시트를 관리하고, 결과를 양식으로 만들어 자동 등록할 수 있습니다.
        </p>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1 rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90"
        >
          <Sparkles size={12} />
          프롬프트 라이브러리 열기
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-neutral-500">
          <Loader2 size={14} className="animate-spin" /> 불러오는 중…
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              누적 프롬프트
            </p>
            <p className="mt-1 text-2xl font-bold">{total.toLocaleString()}건</p>
            <p className="mt-0.5 text-[10px] text-neutral-500">
              {orgs.length}개 회사·기관 라벨에 분포
            </p>
          </div>

          {orgs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 py-12 text-center dark:border-neutral-700">
              <Sparkles size={32} className="mx-auto mb-3 text-neutral-300" />
              <p className="text-sm font-medium">아직 등록된 프롬프트가 없습니다.</p>
              <p className="mt-1 text-xs text-neutral-500">
                위 버튼을 눌러 HTML 핸드북을 임포트하거나 직접 등록하세요.
              </p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {orgs.map((o) => (
                <div
                  key={o.label}
                  className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-sm font-semibold">
                      <Building2 size={11} className="text-brand" />
                      {o.label}
                    </span>
                    <span className="font-mono text-xs text-neutral-500">{o.count}건</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {modalOpen && <PromptLibrary onClose={() => setModalOpen(false)} />}
    </div>
  );
}
