"use client";

import { useState } from "react";
import useSWR from "swr";
import { Building2, Cog, Eye, Loader2 } from "lucide-react";

import { OrganizationAdminModal } from "@/components/organizations/OrganizationAdminModal";
import { listOrganizations, type OrganizationProfile } from "@/lib/api";

/**
 * 관리자 콘솔의 "조직 양식" 섹션.
 *
 * - 등록된 조직 양식 미리보기 (카드)
 * - "양식 추가·수정" 버튼 → OrganizationAdminModal
 */
export function AdminOrganizations() {
  const [modalOpen, setModalOpen] = useState(false);
  const { data: orgs = [], mutate, isLoading } = useSWR(
    "admin:orgs",
    () => listOrganizations({ public_only: false }),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          회사·기관별 문서 양식을 등록하면 변환 시 자동으로 해당 양식이 적용됩니다.
        </p>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1 rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90"
        >
          <Cog size={12} />
          양식 추가·수정
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-neutral-500">
          <Loader2 size={14} className="animate-spin" /> 불러오는 중…
        </div>
      ) : orgs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 py-12 text-center dark:border-neutral-700">
          <Building2 size={32} className="mx-auto mb-3 text-neutral-300" />
          <p className="text-sm font-medium">아직 등록된 조직 양식이 없습니다.</p>
          <p className="mt-1 text-xs text-neutral-500">
            "양식 추가·수정"을 눌러 첫 회사 양식을 등록하세요.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orgs.map((o) => (
            <OrgCard key={o.id} org={o} onEdit={() => setModalOpen(true)} />
          ))}
        </div>
      )}

      {modalOpen && (
        <OrganizationAdminModal
          onClose={() => setModalOpen(false)}
          onChange={() => mutate()}
        />
      )}
    </div>
  );
}

function OrgCard({ org, onEdit }: { org: OrganizationProfile; onEdit: () => void }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span
            className="inline-block h-4 w-4 rounded"
            style={{ background: org.brand_color_hex }}
          />
          {org.name}
        </span>
        {org.is_public && (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            공개
          </span>
        )}
      </div>
      <dl className="space-y-1 text-[11px] text-neutral-600 dark:text-neutral-400">
        <Row label="slug" value={<code className="font-mono">{org.slug}</code>} />
        <Row label="브랜드 색" value={<code className="font-mono">{org.brand_color_hex}</code>} />
        <Row label="한글 폰트" value={org.font_korean} />
        <Row label="페이지" value={`${org.page_size} · 여백 ${org.margin_top_mm}mm`} />
        {org.header_text && <Row label="헤더" value={org.header_text} />}
        {org.prompt_label && <Row label="프롬프트 라벨" value={org.prompt_label} />}
      </dl>
      <button
        onClick={onEdit}
        className="mt-2 flex items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-[11px] font-semibold text-neutral-600 hover:border-brand hover:text-brand dark:border-neutral-700"
      >
        <Eye size={10} /> 상세·편집
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-neutral-400">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}
