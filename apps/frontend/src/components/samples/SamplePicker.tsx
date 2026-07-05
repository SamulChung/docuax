"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { BookOpen, FileText, Loader2, Share2, Tag, Trash2, Upload, X } from "lucide-react";

import {
  deleteMyTemplate,
  getMyTemplate,
  getSample,
  listMyTemplates,
  listSamples,
  type SampleMeta,
  type TemplateScope,
  type UploadedTemplate,
  updateMyTemplate,
  uploadTemplate,
} from "@/lib/api";
import { getOrganizationId, getOwnerId, setOrganizationId } from "@/lib/user";
import { useWorkspace } from "@/store/workspace";

interface Props {
  onClose: () => void;
}

const PERSONA_BADGE: Record<SampleMeta["persona"], { label: string; cls: string }> = {
  worker: { label: "워커 추천", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  heavy: { label: "헤비유저 추천", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  any: { label: "공통", cls: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" },
};

const FORMAT_BADGE: Record<string, { label: string; cls: string }> = {
  docx: { label: "DOCX", cls: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  hwpx: { label: "HWPX", cls: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
  hwp: { label: "HWP", cls: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
  pdf: { label: "PDF", cls: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
  html: { label: "HTML", cls: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  htm: { label: "HTML", cls: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  md: { label: "MD", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
};

const CATEGORIES = ["사업기획", "보고서", "제안서", "공문", "회의록", "메모", "기타"] as const;

type Tab = "builtin" | "mine" | "shared";

export function SamplePicker({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("builtin");
  const [selectedCategory, setSelectedCategory] = useState<string>("전체");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);

  const [formCategory, setFormCategory] = useState<string>("");
  const [formTags, setFormTags] = useState("");
  const [formShare, setFormShare] = useState(false);

  const [orgId, setOrgIdLocal] = useState<string | null>(null);
  useEffect(() => {
    setOrgIdLocal(getOrganizationId());
    const onChange = () => setOrgIdLocal(getOrganizationId());
    window.addEventListener("docuax:org-changed", onChange);
    return () => window.removeEventListener("docuax:org-changed", onChange);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: samples = [], isLoading: samplesLoading } = useSWR("samples", listSamples, {
    revalidateOnFocus: false,
  });

  const myScope: TemplateScope = "mine";
  const sharedScope: TemplateScope = "shared";

  const { data: myUploads = [], mutate: refetchMy, isLoading: myLoading } = useSWR(
    ["my-templates", "mine", orgId ?? ""],
    () => listMyTemplates({ organization_id: orgId ?? undefined, scope: myScope }),
    { revalidateOnFocus: false }
  );

  const { data: sharedUploads = [], mutate: refetchShared, isLoading: sharedLoading } = useSWR(
    orgId ? ["my-templates", "shared", orgId] : null,
    () => listMyTemplates({ organization_id: orgId!, scope: sharedScope }),
    { revalidateOnFocus: false }
  );

  const setSource = useWorkspace((s) => s.setSource);
  const setTitle = useWorkspace((s) => s.setTitle);
  const setPersona = useWorkspace((s) => s.setPersona);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filteredSamples = useMemo(
    () => samples.filter((s) => selectedCategory === "전체" || s.category === selectedCategory),
    [samples, selectedCategory]
  );
  const myFiltered = useMemo(
    () => myUploads.filter((u) => selectedCategory === "전체" || u.category === selectedCategory),
    [myUploads, selectedCategory]
  );
  const sharedFiltered = useMemo(
    () => sharedUploads.filter((u) => selectedCategory === "전체" || u.category === selectedCategory),
    [sharedUploads, selectedCategory]
  );

  const handleLoadSample = async (sample: SampleMeta) => {
    setLoadingId(sample.id);
    try {
      const detail = await getSample(sample.id);
      setSource(detail.content);
      setTitle("");
      if (detail.persona !== "any") setPersona(detail.persona);
      onClose();
    } catch (e) {
      alert(`템플릿 로드 실패: ${(e as Error).message}`);
    } finally {
      setLoadingId(null);
    }
  };

  const handleLoadUpload = async (item: UploadedTemplate) => {
    setLoadingId(item.id);
    try {
      const detail = await getMyTemplate(item.id);
      if (!detail.content.trim()) {
        alert("이 파일은 본문 텍스트가 비어있습니다. HWPX로 변환해 재업로드해 보세요.");
        return;
      }
      setSource(detail.content);
      setTitle(detail.title);
      onClose();
    } catch (e) {
      alert(`로드 실패: ${(e as Error).message}`);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDeleteUpload = async (id: string) => {
    if (!confirm("이 양식을 삭제하시겠습니까?")) return;
    try {
      await deleteMyTemplate(id);
      await refetchMy();
    } catch (e) {
      alert(`삭제 실패: ${(e as Error).message}`);
    }
  };

  const handleToggleShare = async (item: UploadedTemplate) => {
    if (!item.organization_id && !item.shared_with_org && !orgId) {
      alert("공유하려면 먼저 상단의 조직 ID를 입력하세요.");
      return;
    }
    try {
      await updateMyTemplate(item.id, { shared_with_org: !item.shared_with_org });
      await refetchMy();
      await refetchShared();
    } catch (e) {
      alert(`공유 설정 실패: ${(e as Error).message}`);
    }
  };

  const handleUpdateCategory = async (item: UploadedTemplate, category: string) => {
    try {
      await updateMyTemplate(item.id, { category });
      await refetchMy();
    } catch (e) {
      alert(`수정 실패: ${(e as Error).message}`);
    }
  };

  const submitUpload = useCallback(async () => {
    if (!pendingUpload) return;
    setUploading(true);
    setUploadMessage(null);
    try {
      const tagList = formTags.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await uploadTemplate({
        file: pendingUpload,
        category: formCategory,
        tags: tagList,
        organization_id: orgId ?? undefined,
        shared_with_org: formShare && !!orgId,
        auto_index_rag: formShare && !!orgId,
      });
      await refetchMy();
      if (orgId) await refetchShared();
      const warnings = res.template.warnings ?? [];
      setUploadMessage({
        ok: true,
        msg: `업로드 완료: ${res.template.title}` + (warnings.length ? `\n경고: ${warnings.join("; ")}` : ""),
      });
      setTab("mine");
      setPendingUpload(null);
      setFormCategory("");
      setFormTags("");
      setFormShare(false);
    } catch (e) {
      setUploadMessage({ ok: false, msg: `업로드 실패: ${(e as Error).message}` });
    } finally {
      setUploading(false);
    }
  }, [pendingUpload, formCategory, formTags, formShare, orgId, refetchMy, refetchShared]);

  const onPickFiles = (files: FileList | File[] | null | undefined) => {
    if (!files) return;
    const file = Array.from(files)[0];
    if (file) setPendingUpload(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    onPickFiles(e.dataTransfer.files);
  };

  const ownerId = typeof window !== "undefined" ? getOwnerId() : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[85vh] w-[880px] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-brand" />
            <h2 className="text-sm font-bold">템플릿 라이브러리</h2>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-neutral-500">
            <span title={`내 ID: ${ownerId}`}>👤 {ownerId.slice(0, 8)}</span>
            <input
              value={orgId ?? ""}
              onChange={(e) => setOrganizationId(e.target.value || null)}
              placeholder="조직 ID (선택)"
              className="w-32 rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
              title="같은 ID를 입력한 사용자끼리 공유한 양식을 볼 수 있습니다"
            />
            <button onClick={onClose} className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="flex items-center gap-1 border-b border-neutral-200 px-5 dark:border-neutral-800">
          <button
            onClick={() => setTab("builtin")}
            className={`border-b-2 px-3 py-2 text-xs font-semibold transition-all ${
              tab === "builtin" ? "border-brand text-brand" : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            기본 템플릿 ({samples.length})
          </button>
          <button
            onClick={() => setTab("mine")}
            className={`border-b-2 px-3 py-2 text-xs font-semibold transition-all ${
              tab === "mine" ? "border-brand text-brand" : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            내 양식 ({myUploads.length})
          </button>
          <button
            onClick={() => setTab("shared")}
            disabled={!orgId}
            title={!orgId ? "조직 ID를 먼저 입력하세요" : undefined}
            className={`border-b-2 px-3 py-2 text-xs font-semibold transition-all disabled:opacity-40 ${
              tab === "shared" ? "border-brand text-brand" : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            조직 공유 ({sharedUploads.length})
          </button>
          <div className="ml-auto">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-soft disabled:opacity-50"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {uploading ? "업로드 중" : "양식 업로드"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.hwpx,.hwp,.pdf,.html,.htm"
              hidden
              onChange={(e) => {
                onPickFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1 border-b border-neutral-200 px-5 py-2 text-xs dark:border-neutral-800">
          {(["전체", ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              onClick={() => setSelectedCategory(c)}
              className={`rounded-full px-2.5 py-1 transition-all ${
                selectedCategory === c ? "bg-brand text-white" : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div
          className="relative flex-1 overflow-y-auto p-5"
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          {isDragging && (
            <div className="pointer-events-none absolute inset-3 z-10 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-brand bg-brand/10">
              <Upload size={32} className="mb-2 text-brand" />
              <div className="text-sm font-bold text-brand">파일을 놓으면 업로드</div>
              <div className="text-[10px] text-neutral-500">.docx, .hwpx, .hwp, .pdf, .html</div>
            </div>
          )}

          {uploadMessage && (
            <div className={`mb-3 rounded-md p-3 text-xs whitespace-pre-line ${uploadMessage.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"}`}>
              {uploadMessage.msg}
            </div>
          )}

          {tab === "builtin" && (
            <BuiltinSamples samples={filteredSamples} loading={samplesLoading} loadingId={loadingId} onLoad={handleLoadSample} />
          )}
          {tab === "mine" && (
            <MyUploads
              items={myFiltered}
              loading={myLoading}
              loadingId={loadingId}
              orgId={orgId}
              ownerId={ownerId}
              onLoad={handleLoadUpload}
              onDelete={handleDeleteUpload}
              onToggleShare={handleToggleShare}
              onCategoryChange={handleUpdateCategory}
              isEmpty={myUploads.length === 0}
            />
          )}
          {tab === "shared" && (
            <SharedUploads items={sharedFiltered} loading={sharedLoading} loadingId={loadingId} orgId={orgId} onLoad={handleLoadUpload} />
          )}
        </div>

        <footer className="border-t border-neutral-200 px-5 py-2 text-[10px] text-neutral-500 dark:border-neutral-800">
          <div>ⓘ 업로드 한도 20MB · 스캔 PDF는 OCR provider 활성화 시 자동 추출 · 조직 ID가 같은 사용자끼리 공유 양식을 볼 수 있습니다.</div>
          <div className="mt-1 text-[9px] text-neutral-400">
            한컴 상표 면책: &quot;한글&quot;·&quot;한컴&quot;·&quot;HWP&quot;·&quot;HWPX&quot;는 (주)한글과컴퓨터의 등록 상표. 글집는 한컴과 제휴·후원·승인 관계 없는 독립 프로젝트로, 본인 소유 파일의 합법적 호환성 처리만 수행합니다.
          </div>
        </footer>
      </div>

      {pendingUpload && (
        <UploadMetaForm
          file={pendingUpload}
          category={formCategory}
          tags={formTags}
          share={formShare}
          orgId={orgId}
          uploading={uploading}
          onCategory={setFormCategory}
          onTags={setFormTags}
          onShare={setFormShare}
          onCancel={() => setPendingUpload(null)}
          onSubmit={submitUpload}
        />
      )}
    </div>
  );
}

function BuiltinSamples({ samples, loading, loadingId, onLoad }: {
  samples: SampleMeta[]; loading: boolean; loadingId: string | null; onLoad: (s: SampleMeta) => void;
}) {
  if (loading) return <Loader />;
  if (samples.length === 0) return <Empty msg="해당 카테고리 템플릿 없음" />;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {samples.map((s) => (
        <button
          key={s.id}
          onClick={() => onLoad(s)}
          disabled={loadingId !== null}
          className="group flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-left transition-all hover:border-brand hover:bg-brand/5 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <div className="text-2xl">{s.icon}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">{s.title}</div>
              {loadingId === s.id && <Loader2 size={12} className="animate-spin text-brand" />}
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-500 line-clamp-2">{s.description}</div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${PERSONA_BADGE[s.persona].cls}`}>
                {PERSONA_BADGE[s.persona].label}
              </span>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                {s.category}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function MyUploads({
  items, loading, loadingId, orgId, ownerId, isEmpty,
  onLoad, onDelete, onToggleShare, onCategoryChange,
}: {
  items: UploadedTemplate[]; loading: boolean; loadingId: string | null; orgId: string | null; ownerId: string; isEmpty: boolean;
  onLoad: (u: UploadedTemplate) => void;
  onDelete: (id: string) => void;
  onToggleShare: (u: UploadedTemplate) => void;
  onCategoryChange: (u: UploadedTemplate, c: string) => void;
}) {
  if (loading) return <Loader />;
  if (isEmpty) {
    return (
      <Empty
        msg={"회사 양식을 업로드하세요 — .docx · .hwpx · .hwp · .pdf 지원\n드래그 앤 드롭 또는 우측 상단 [양식 업로드]"}
        icon={<Upload size={32} className="text-neutral-400" />}
      />
    );
  }
  if (items.length === 0) return <Empty msg="해당 카테고리에 양식 없음" />;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((u) => (
        <div
          key={u.id}
          className="group flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-3 transition-all hover:border-brand hover:bg-brand/5 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <button
            onClick={() => onLoad(u)}
            disabled={loadingId !== null}
            className="flex flex-1 items-start gap-3 text-left disabled:opacity-50"
          >
            <FileText size={20} className="mt-0.5 shrink-0 text-neutral-400 group-hover:text-brand" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate text-sm font-semibold">{u.title}</div>
                {loadingId === u.id && <Loader2 size={12} className="animate-spin text-brand" />}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-neutral-500">{u.filename}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${FORMAT_BADGE[u.format].cls}`}>
                  {FORMAT_BADGE[u.format].label}
                </span>
                <span className="text-[10px] text-neutral-400">{(u.size_bytes / 1024).toFixed(1)}KB</span>
                {u.shared_with_org && (
                  <span className="flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <Share2 size={9} /> 공유 중
                  </span>
                )}
                {u.tags.slice(0, 3).map((t) => (
                  <span key={t} className="flex items-center gap-0.5 rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                    <Tag size={8} /> {t}
                  </span>
                ))}
              </div>
              {u.warnings.length > 0 && <div className="mt-1 text-[10px] text-amber-600">⚠ {u.warnings[0]}</div>}
            </div>
          </button>
          <div className="flex flex-col items-end gap-1">
            <select
              value={u.category}
              onChange={(e) => onCategoryChange(u, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="rounded border border-neutral-200 bg-white px-1 py-0.5 text-[10px] focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
              title="카테고리 변경"
            >
              <option value="">분류 없음</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => onToggleShare(u)}
                disabled={!orgId && !u.shared_with_org}
                className={`rounded p-1 transition-all disabled:opacity-30 ${
                  u.shared_with_org ? "text-emerald-600 hover:bg-emerald-50" : "text-neutral-400 hover:bg-neutral-100"
                }`}
                title={u.shared_with_org ? "공유 끄기" : "조직에 공유"}
              >
                <Share2 size={12} />
              </button>
              <button
                onClick={() => onDelete(u.id)}
                disabled={u.owner_id !== ownerId && u.owner_id !== "" && u.owner_id !== "anonymous"}
                className="rounded p-1 text-neutral-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 dark:hover:bg-rose-950"
                title="삭제"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SharedUploads({ items, loading, loadingId, orgId, onLoad }: {
  items: UploadedTemplate[]; loading: boolean; loadingId: string | null; orgId: string | null; onLoad: (u: UploadedTemplate) => void;
}) {
  if (!orgId) {
    return (
      <Empty
        msg={"조직 ID를 상단에 입력하세요\n같은 ID를 입력한 동료의 공유 양식을 볼 수 있습니다"}
        icon={<Share2 size={32} className="text-neutral-400" />}
      />
    );
  }
  if (loading) return <Loader />;
  if (items.length === 0) return <Empty msg={`조직 "${orgId}"에 공유된 양식 없음`} />;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((u) => (
        <button
          key={u.id}
          onClick={() => onLoad(u)}
          disabled={loadingId !== null}
          className="group flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-left transition-all hover:border-brand hover:bg-brand/5 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <FileText size={20} className="mt-0.5 shrink-0 text-neutral-400 group-hover:text-brand" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-semibold">{u.title}</div>
              {loadingId === u.id && <Loader2 size={12} className="animate-spin text-brand" />}
            </div>
            <div className="mt-0.5 text-[10px] text-neutral-500">
              {u.owner_id.slice(0, 8)} 공유 · {u.category || "분류 없음"}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${FORMAT_BADGE[u.format].cls}`}>
                {FORMAT_BADGE[u.format].label}
              </span>
              {u.tags.slice(0, 2).map((t) => (
                <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function UploadMetaForm({
  file, category, tags, share, orgId, uploading,
  onCategory, onTags, onShare, onCancel, onSubmit,
}: {
  file: File; category: string; tags: string; share: boolean; orgId: string | null; uploading: boolean;
  onCategory: (v: string) => void;
  onTags: (v: string) => void;
  onShare: (v: boolean) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-96 rounded-xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <h3 className="mb-1 text-sm font-bold">양식 정보 입력</h3>
        <div className="mb-4 truncate text-[11px] text-neutral-500">
          📄 {file.name} ({(file.size / 1024).toFixed(1)}KB)
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] text-neutral-600 dark:text-neutral-400">카테고리</label>
            <select
              value={category}
              onChange={(e) => onCategory(e.target.value)}
              className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
            >
              <option value="">분류 없음</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-neutral-600 dark:text-neutral-400">태그 (쉼표 구분)</label>
            <input
              value={tags}
              onChange={(e) => onTags(e.target.value)}
              placeholder="예: 공공, 협조 요청, 분기보고"
              className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
            />
          </div>
          {orgId && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={share} onChange={(e) => onShare(e.target.checked)} className="accent-brand" />
              <span>
                조직 <strong>{orgId}</strong>에 공유 + RAG 학습 (R9 매크로 활용)
              </span>
            </label>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} disabled={uploading} className="rounded px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800">
            취소
          </button>
          <button onClick={onSubmit} disabled={uploading} className="flex items-center gap-1 rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-soft disabled:opacity-50">
            {uploading && <Loader2 size={12} className="animate-spin" />}
            업로드
          </button>
        </div>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-500">
      <Loader2 size={14} className="animate-spin" /> 로딩 중...
    </div>
  );
}

function Empty({ msg, icon }: { msg: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-neutral-300 px-6 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
      {icon}
      <div className="whitespace-pre-line">{msg}</div>
    </div>
  );
}
