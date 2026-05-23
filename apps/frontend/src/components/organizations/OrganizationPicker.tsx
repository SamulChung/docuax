"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Building2, Cog, Plus } from "lucide-react";

import { OrganizationAdminModal } from "@/components/organizations/OrganizationAdminModal";
import { getMe, listOrganizations, type OrganizationProfile } from "@/lib/api";
import { getOrganizationId, setOrganizationId } from "@/lib/user";

/**
 * 변환 시 출력에 적용할 회사·기관 양식 선택.
 *
 * - 일반 사용자: 공개된 프로파일 목록만 보고 고를 수 있음
 * - 관리자: 관리 톱니로 등록/수정/삭제 모달 진입
 */
export function OrganizationPicker() {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    setCurrentId(getOrganizationId());
    const onChange = () => setCurrentId(getOrganizationId());
    window.addEventListener("docuax:org-changed", onChange);
    return () => window.removeEventListener("docuax:org-changed", onChange);
  }, []);

  const { data: me } = useSWR("me", () => getMe().catch(() => null), {
    shouldRetryOnError: false,
  });
  const isAdmin = Boolean(me?.is_admin);

  const { data: orgs = [], mutate } = useSWR<OrganizationProfile[]>(
    "organizations",
    () => listOrganizations(),
  );

  const handleSelect = (id: string | null) => {
    setOrganizationId(id);
    setCurrentId(id);
  };

  const current = orgs.find((o) => o.id === currentId);

  return (
    <div className="rounded border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        <span className="flex items-center gap-1">
          <Building2 size={10} />
          출력 양식 (회사·기관)
        </span>
        {isAdmin && (
          <button
            onClick={() => setAdminOpen(true)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium normal-case text-neutral-500 transition-all hover:bg-neutral-100 hover:text-brand dark:hover:bg-neutral-800"
            title="관리자 — 조직 양식 등록/수정"
          >
            <Cog size={10} />
            관리
          </button>
        )}
      </div>
      <select
        value={currentId ?? ""}
        onChange={(e) => handleSelect(e.target.value || null)}
        className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-xs focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
      >
        <option value="">기본 (DocuAX)</option>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {current && (
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-neutral-500">
          <span
            className="inline-block h-3 w-3 rounded"
            style={{ background: current.brand_color_hex }}
          />
          <span className="font-mono">{current.brand_color_hex}</span>
          <span>·</span>
          <span>{current.font_korean}</span>
          {current.header_text && (
            <>
              <span>·</span>
              <span className="truncate" title={current.header_text}>
                {current.header_text}
              </span>
            </>
          )}
        </div>
      )}
      {!orgs.length && isAdmin && (
        <button
          onClick={() => setAdminOpen(true)}
          className="mt-1.5 flex w-full items-center justify-center gap-1 rounded border border-dashed border-neutral-300 py-1 text-[10px] font-medium text-neutral-500 transition-all hover:border-brand hover:text-brand dark:border-neutral-700"
        >
          <Plus size={10} />첫 회사 양식 등록
        </button>
      )}
      {adminOpen && (
        <OrganizationAdminModal
          onClose={() => setAdminOpen(false)}
          onChange={() => mutate()}
        />
      )}
    </div>
  );
}
