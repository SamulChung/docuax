"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Building2, Loader2, Plus, Save, Trash2, X } from "lucide-react";

import {
  createOrganization,
  deleteOrganization,
  listOrganizations,
  type OrganizationProfile,
  updateOrganization,
} from "@/lib/api";

interface Props {
  onClose: () => void;
  onChange?: () => void;
}

const DEFAULT_NEW: Partial<OrganizationProfile> = {
  name: "",
  brand_color_hex: "#1E2761",
  accent_color_hex: "#1F5BAF",
  table_header_bg_hex: "#F2F2F2",
  font_korean: "함초롬바탕",
  font_korean_heading: "함초롬돋움",
  body_font_size_pt: 10,
  h1_font_size_pt: 20,
  h2_font_size_pt: 16,
  h3_font_size_pt: 14,
  page_size: "A4",
  margin_top_mm: 25,
  margin_bottom_mm: 25,
  margin_left_mm: 25,
  margin_right_mm: 25,
  header_text: "",
  footer_text: "",
  prompt_label: "",
  is_public: false,
  notes: "",
};

/**
 * 관리자 전용 모달 — 회사·기관 양식 CRUD.
 *
 * 좌측: 목록 + 새 양식 추가
 * 우측: 선택된 양식의 편집 폼 (색·서체·페이지·헤더/푸터)
 */
export function OrganizationAdminModal({ onClose, onChange }: Props) {
  const { data: orgs = [], mutate, isLoading } = useSWR("organizations:admin", () =>
    listOrganizations({ public_only: false }),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<OrganizationProfile>>({});
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // 첫 진입 시 첫 항목 자동 선택
  useEffect(() => {
    if (!selectedId && orgs.length > 0 && !isNew) {
      setSelectedId(orgs[0].id);
      setDraft({ ...orgs[0] });
    }
  }, [orgs, selectedId, isNew]);

  // Esc 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSelect = (id: string) => {
    const o = orgs.find((x) => x.id === id);
    if (!o) return;
    setSelectedId(id);
    setDraft({ ...o });
    setIsNew(false);
    setErr(null);
    setMsg(null);
  };

  const handleNew = () => {
    setIsNew(true);
    setSelectedId(null);
    setDraft({ ...DEFAULT_NEW });
    setErr(null);
    setMsg(null);
  };

  const handleSave = async () => {
    if (!draft.name?.trim()) {
      setErr("이름은 필수입니다.");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (isNew) {
        const created = await createOrganization({
          name: draft.name!.trim(),
          ...draft,
        });
        setIsNew(false);
        setSelectedId(created.id);
        setDraft({ ...created });
        setMsg(`등록됨: ${created.name}`);
      } else if (selectedId) {
        const updated = await updateOrganization(selectedId, draft);
        setDraft({ ...updated });
        setMsg(`저장됨: ${updated.name}`);
      }
      await mutate();
      onChange?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || isNew) return;
    if (!confirm(`"${draft.name}" 조직 양식을 삭제할까요?`)) return;
    setBusy(true);
    try {
      await deleteOrganization(selectedId);
      setSelectedId(null);
      setDraft({});
      await mutate();
      onChange?.();
      setMsg("삭제됨");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const update = <K extends keyof OrganizationProfile>(key: K, value: OrganizationProfile[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-brand" />
            <h2 className="text-base font-semibold">조직 양식 관리 (관리자)</h2>
            <span className="text-xs text-neutral-500">
              한 번 등록해두면 그 기관의 모든 변환이 이 양식대로 출력됩니다.
            </span>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X size={16} />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-12 overflow-hidden">
          {/* 좌측 — 목록 */}
          <aside className="col-span-3 flex flex-col border-r border-neutral-200 dark:border-neutral-800">
            <button
              onClick={handleNew}
              className="m-2 flex items-center justify-center gap-1 rounded border border-dashed border-neutral-300 py-1.5 text-xs font-medium text-neutral-600 hover:border-brand hover:text-brand dark:border-neutral-700"
            >
              <Plus size={12} />새 조직 양식
            </button>
            <div className="flex-1 overflow-y-auto px-2 pb-2 text-xs">
              {isLoading && (
                <p className="px-2 py-3 text-neutral-500">
                  <Loader2 size={12} className="mr-1 inline animate-spin" />
                  불러오는 중…
                </p>
              )}
              {!isLoading && orgs.length === 0 && (
                <p className="px-2 py-3 text-neutral-500">등록된 양식이 없습니다.</p>
              )}
              {orgs.map((o) => (
                <button
                  key={o.id}
                  onClick={() => handleSelect(o.id)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${
                    selectedId === o.id && !isNew
                      ? "bg-brand/10 text-brand"
                      : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  }`}
                >
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded"
                    style={{ background: o.brand_color_hex }}
                  />
                  <span className="flex-1 truncate font-medium">{o.name}</span>
                  {o.is_public && (
                    <span className="rounded bg-emerald-50 px-1 py-0.5 text-[8px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      공개
                    </span>
                  )}
                </button>
              ))}
            </div>
          </aside>

          {/* 우측 — 편집 폼 */}
          <main className="col-span-9 flex flex-col overflow-hidden">
            {!isNew && !selectedId ? (
              <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
                좌측에서 조직 양식을 선택하거나 "새 조직 양식"을 누르세요.
              </div>
            ) : (
              <>
                <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
                  <Section title="기본 정보">
                    <Field label="기관·회사명 *">
                      <input
                        value={draft.name ?? ""}
                        onChange={(e) => update("name", e.target.value)}
                        className="w-full rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                      />
                    </Field>
                    <Field label="공개 (비로그인도 선택 가능)">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(draft.is_public)}
                          onChange={(e) => update("is_public", e.target.checked)}
                        />
                        <span>모든 사용자에게 노출</span>
                      </label>
                    </Field>
                    <Field label="프롬프트 라이브러리 라벨 (선택)">
                      <input
                        value={draft.prompt_label ?? ""}
                        placeholder="예: 경인지방데이터청"
                        onChange={(e) => update("prompt_label", e.target.value)}
                        className="w-full rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                      />
                    </Field>
                  </Section>

                  <Section title="시각 정체성">
                    <ColorField
                      label="브랜드 컬러 (H1·H2·제목)"
                      value={draft.brand_color_hex ?? "#1E2761"}
                      onChange={(v) => update("brand_color_hex", v)}
                    />
                    <ColorField
                      label="악센트 컬러 (H3 이하)"
                      value={draft.accent_color_hex ?? "#1F5BAF"}
                      onChange={(v) => update("accent_color_hex", v)}
                    />
                    <ColorField
                      label="표 헤더 배경"
                      value={draft.table_header_bg_hex ?? "#F2F2F2"}
                      onChange={(v) => update("table_header_bg_hex", v)}
                    />
                  </Section>

                  <Section title="서체">
                    <Field label="본문 폰트 (한글)">
                      <input
                        value={draft.font_korean ?? ""}
                        placeholder="예: 함초롬바탕, 맑은 고딕, 나눔명조"
                        onChange={(e) => update("font_korean", e.target.value)}
                        className="w-full rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                      />
                    </Field>
                    <Field label="제목 폰트 (한글)">
                      <input
                        value={draft.font_korean_heading ?? ""}
                        placeholder="예: 함초롬돋움, 맑은 고딕 Bold"
                        onChange={(e) => update("font_korean_heading", e.target.value)}
                        className="w-full rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                      />
                    </Field>
                    <div className="grid grid-cols-4 gap-2">
                      <NumField label="본문 (pt)" value={draft.body_font_size_pt ?? 10} onChange={(v) => update("body_font_size_pt", v)} />
                      <NumField label="H1 (pt)" value={draft.h1_font_size_pt ?? 20} onChange={(v) => update("h1_font_size_pt", v)} />
                      <NumField label="H2 (pt)" value={draft.h2_font_size_pt ?? 16} onChange={(v) => update("h2_font_size_pt", v)} />
                      <NumField label="H3 (pt)" value={draft.h3_font_size_pt ?? 14} onChange={(v) => update("h3_font_size_pt", v)} />
                    </div>
                  </Section>

                  <Section title="페이지">
                    <Field label="용지">
                      <select
                        value={draft.page_size ?? "A4"}
                        onChange={(e) => update("page_size", e.target.value)}
                        className="w-full rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                      >
                        <option value="A4">A4</option>
                        <option value="Letter">Letter</option>
                        <option value="A3">A3</option>
                      </select>
                    </Field>
                    <div className="grid grid-cols-4 gap-2">
                      <NumField label="상 (mm)" value={draft.margin_top_mm ?? 25} onChange={(v) => update("margin_top_mm", v)} />
                      <NumField label="하 (mm)" value={draft.margin_bottom_mm ?? 25} onChange={(v) => update("margin_bottom_mm", v)} />
                      <NumField label="좌 (mm)" value={draft.margin_left_mm ?? 25} onChange={(v) => update("margin_left_mm", v)} />
                      <NumField label="우 (mm)" value={draft.margin_right_mm ?? 25} onChange={(v) => update("margin_right_mm", v)} />
                    </div>
                  </Section>

                  <Section title="헤더 / 푸터">
                    <Field label="페이지 상단 텍스트 (헤더)">
                      <input
                        value={draft.header_text ?? ""}
                        placeholder="예: 경인지방데이터청"
                        onChange={(e) => update("header_text", e.target.value)}
                        className="w-full rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                      />
                    </Field>
                    <Field label="페이지 하단 텍스트 (푸터)">
                      <input
                        value={draft.footer_text ?? ""}
                        placeholder="예: 2026 회계연도"
                        onChange={(e) => update("footer_text", e.target.value)}
                        className="w-full rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                      />
                    </Field>
                  </Section>

                  <Section title="관리자 메모">
                    <textarea
                      value={draft.notes ?? ""}
                      onChange={(e) => update("notes", e.target.value)}
                      rows={3}
                      className="w-full rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </Section>

                  {(err || msg) && (
                    <div
                      className={`rounded p-2 ${
                        err
                          ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      }`}
                    >
                      {err || msg}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
                  {!isNew && selectedId ? (
                    <button
                      onClick={handleDelete}
                      disabled={busy}
                      className="flex items-center gap-1 rounded border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 size={12} />삭제
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    onClick={handleSave}
                    disabled={busy}
                    className="flex items-center gap-1 rounded bg-brand px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    {isNew ? "등록" : "저장"}
                  </button>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 border-b border-neutral-200 pb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-medium text-neutral-600 dark:text-neutral-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        step="0.5"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
      />
    </Field>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-7 w-10 cursor-pointer rounded border border-neutral-200 dark:border-neutral-700"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded border border-neutral-200 px-2 py-1 font-mono dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>
    </Field>
  );
}
