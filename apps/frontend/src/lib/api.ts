// 백엔드 API 클라이언트.

import { sanitizeString } from "./sanitize";
import { getOwnerId } from "./user";

const BASE = "/api/v1";

function ownerHeader(): Record<string, string> {
  try {
    return { "X-Owner-Id": getOwnerId() };
  } catch {
    return {};
  }
}

export type PersonaMode = "worker" | "heavy";

export interface ReviewTag {
  rel_start: number;
  rel_end: number;
  color: "red" | "blue" | "yellow";
  reason: string;
  confidence: number;
}

export interface InlineRunPayload {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  code?: boolean;
  color?: string;
  background?: string;
  font_family?: string;
  font_size?: number;
  link?: string;
}

export interface TableCellPayload {
  runs: InlineRunPayload[];
  colspan: number;
  rowspan: number;
  align: "left" | "center" | "right";
  background: string | null;
  border: "default" | "none" | "thick" | "dashed";
  rotate: number;
}

export interface TablePayload {
  rows: TableCellPayload[][];
  header_row: boolean;
  border_style: string;
  column_widths: number[] | null;
  align: "left" | "center" | "right";
}

export interface ListItemPayload {
  depth: number;
  bullet_marker: string;
  ordered: boolean;
  index: number;
  order_format: string;
  runs: InlineRunPayload[];
}

export interface ImagePayload {
  src: string;
  url: string;
  alt: string;
  caption: string;
  align: "left" | "center" | "right";
  width?: string;   // "70%", "400px", "120mm", "300pt"
  height?: string;
  width_pt?: number | null;
  image_url?: string;
}

export interface DiagramPayload {
  engine: "mermaid" | "plantuml";
  source: string;
  caption: string;
  align: "left" | "center" | "right";
  width?: string;
  height?: string;
  image_url?: string;
}

export interface ChartPayload {
  spec: Record<string, unknown>;
  caption: string;
  align: "left" | "center" | "right";
  width?: string;
  height?: string;
  image_url?: string;
}

export interface EquationPayload {
  latex: string;
  display: boolean;
  align: "left" | "center" | "right";
  width?: string;
  image_url?: string;
}

export interface CoverPayload {
  title: string;
  subtitle: string;
  author: string;
  organization: string;
  department: string;
  date: string;
  document_number: string;
  classification: string;
  logo_path: string;
  template?:
    | "modern" | "classic" | "gongmun" | "proposal" | "research"
    | "executive" | "annual_report" | "government" | "whitepaper" | "minimal";
  accent_color?: string;
}

export interface PreviewBlock {
  id: string;
  type: string;
  text: string;
  heading_level: number;
  tags: ReviewTag[];
  // 매크로 효과 시각화 — 백엔드가 IR 변경 후 풍부한 속성 전달
  runs?: InlineRunPayload[];
  list_item?: ListItemPayload;
  table?: TablePayload;
  // 시각 요소
  image?: ImagePayload;
  diagram?: DiagramPayload;
  chart?: ChartPayload;
  equation?: EquationPayload;
}

export interface GlobalTag {
  global_start: number;
  global_end: number;
  color: "red" | "blue" | "yellow";
  reason: string;
  confidence: number;
  block_id: string | null;
}

export interface ConvertPreview {
  document_id: string;
  title: string;
  document_class: string;
  template_applied: string;
  persona_mode: PersonaMode;
  cover?: CoverPayload | null;
  plain_text: string;
  blocks: PreviewBlock[];
  review_counts: { red: number; blue: number; yellow: number };
  all_tags?: GlobalTag[];
  last_macro_log?: Record<string, unknown> | null;
  model_version: string;
  latency_ms: number;
}

export interface ConvertResponse {
  document_id: string;
  preview: ConvertPreview;
  timings_ms: Record<string, number>;
  total_ms: number;
  model_version: string;
}

export interface MacroDescriptor {
  id: string;
  category: "T" | "S" | "B" | "G" | "N" | "R" | "P";
  name: string;
  description: string;
  ai_powered: boolean;
  auto: boolean;
  shortcut: { win?: string; mac?: string };
}

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  llm: { available: boolean; provider: string; model: string; latency_ms?: number; error?: string };
  macros: Record<string, number>;
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("docuax.access_token");
}

export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  // Secure 속성은 HTTPS(프로덕션)에서만 적용, HTTP(개발) 환경에서는 제외
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  if (token) {
    localStorage.setItem("docuax.access_token", token);
    // middleware가 서버에서 읽을 수 있도록 쿠키에도 동기화
    document.cookie = `docuax_token=${token}; path=/; max-age=86400; SameSite=Lax${secure}`;
  } else {
    localStorage.removeItem("docuax.access_token");
    document.cookie = `docuax_token=; path=/; max-age=0; SameSite=Lax${secure}`;
  }
  window.dispatchEvent(new CustomEvent("docuax:auth-changed"));
}

async function http<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined ?? {}),
  };
  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  // 깨진 유니코드(lone surrogate) 정제 — 서버 JSON 디코드 실패 방지
  // body가 이미 JSON 문자열인 경우 한 번 더 정제 (사용자 입력에서 paste된 손상 문자 대비)
  let body = opts.body;
  if (typeof body === "string") {
    body = sanitizeString(body);
  }
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    body,
    credentials: "include",
    headers,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getHealth() {
  return http<HealthResponse>("/health");
}

export async function listMacros(category?: string) {
  const q = category ? `?category=${category}` : "";
  return http<MacroDescriptor[]>(`/macros${q}`);
}

export async function convertDocument(input: {
  source: string;
  title?: string;
  persona_mode: PersonaMode;
  organization_id?: string;
  document_id?: string;
  /** ⚡ 빠른 변환 — LLM 분석 단계 생략 (1~2s 절약) */
  skip_analyze?: boolean;
  /** ⚡ 빠른 변환 — LLM 검토 태그 단계 생략 (1~2s 절약). 검토 태그 표시 안 됨. */
  skip_review?: boolean;
}) {
  return http<ConvertResponse>("/convert", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface MacroExecuteResult {
  success: boolean;
  macro_id: string;
  preview: ConvertPreview;
  message: string;
  result: Record<string, unknown>;
}

export async function executeMacro(input: {
  macro_id: string;
  document_id: string;
  params?: Record<string, unknown>;
}) {
  return http<MacroExecuteResult>("/macros/execute", {
    method: "POST",
    body: JSON.stringify({ params: {}, ...input }),
  });
}

export function downloadUrl(documentId: string, fmt: "docx" | "hwpx" | "pdf") {
  return `${BASE}/render/${documentId}/${fmt}`;
}

// ─── 직접 편집 ──────────────────────────────────────────────────────────────

export async function editCell(input: {
  document_id: string;
  block_id: string;
  row: number;
  col: number;
  text: string;
}) {
  return http<{ success: boolean; preview: ConvertPreview; message: string }>("/edit/cell", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function editBlock(input: {
  document_id: string;
  block_id: string;
  text: string;
}) {
  return http<{ success: boolean; preview: ConvertPreview; message: string }>("/edit/block", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  plan: "free" | "pro" | "team" | "enterprise";
  persona_mode: string;
  organization_id: string | null;
  is_admin?: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export async function register(email: string, password: string, name: string = "") {
  const res = await http<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
  setAuthToken(res.access_token);
  return res;
}

export async function login(email: string, password: string) {
  const res = await http<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setAuthToken(res.access_token);
  return res;
}

export async function requestPasswordReset(email: string) {
  return http<{ ok: boolean; message: string }>("/auth/password/request-reset", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function confirmPasswordReset(token: string, new_password: string) {
  return http<{ ok: boolean; message: string }>("/auth/password/reset", {
    method: "POST",
    body: JSON.stringify({ token, new_password }),
  });
}

export async function logout(): Promise<void> {
  try {
    await http<void>("/auth/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
  setAuthToken(null);
  // 쿠키가 지워졌으므로 랜딩으로 이동
  if (typeof window !== "undefined") {
    window.location.href = "/";
  }
}

export async function getMe() {
  return http<AuthUser & { created_at: string }>("/auth/me");
}

// ─── Settings ──────────────────────────────────────────────────────────────

export type LLMProviderId = "tenos" | "tenos_hf" | "openai" | "anthropic" | "mock" | "chain";

export interface SettingField {
  value: string | number | boolean;
  is_set: boolean;
  source: "overlay" | "env";
}

export interface LLMSettingsResponse {
  current: { provider: string; model_id: string };
  fields: Record<string, SettingField>;
  allowed_fields: string[];
}

export interface LLMSettingsUpdate {
  llm_provider?: LLMProviderId;
  llm_chain?: string;
  tenos_base_url?: string;
  tenos_model?: string;
  tenos_api_key?: string;
  tenos_timeout_s?: number;
  hf_api_token?: string;
  openai_api_key?: string;
  openai_model?: string;
  openai_base_url?: string;
  anthropic_api_key?: string;
  anthropic_model?: string;
}

export async function getLLMSettings() {
  return http<LLMSettingsResponse>("/settings/llm");
}

export async function updateLLMSettings(update: LLMSettingsUpdate) {
  return http<LLMSettingsResponse>("/settings/llm", {
    method: "POST",
    body: JSON.stringify(update),
  });
}

export async function testLLMSettings(overrides: LLMSettingsUpdate = {}) {
  return http<{
    ok: boolean;
    provider: string;
    model_id: string;
    health: {
      available: boolean;
      provider: string;
      model: string;
      latency_ms?: number;
      error?: string;
    };
  }>("/settings/llm/test", {
    method: "POST",
    body: JSON.stringify({ overrides }),
  });
}

export async function resetLLMSettings() {
  return http<LLMSettingsResponse>("/settings/llm/reset", { method: "POST" });
}

// ─── Samples ───────────────────────────────────────────────────────────────

export interface SampleMeta {
  id: string;
  title: string;
  category: "공문" | "보고서" | "제안서" | "회의록" | "메모" | "사업기획" | "기타";
  description: string;
  persona: "worker" | "heavy" | "any";
  icon: string;
  tags: string[];
}

export interface SampleDetail extends SampleMeta {
  content: string;
}

export async function listSamples() {
  return http<SampleMeta[]>("/samples");
}

export async function getSample(id: string) {
  return http<SampleDetail>(`/samples/${id}`);
}

// ─── User Uploads ──────────────────────────────────────────────────────────

export interface UploadedTemplate {
  id: string;
  title: string;
  description: string;
  filename: string;
  format: "docx" | "hwpx" | "hwp" | "pdf" | "html" | "htm" | "md";
  organization_id: string | null;
  rag_indexed: boolean;
  warnings: string[];
  size_bytes: number;
  uploaded_at: number;
  category: "" | "공문" | "보고서" | "제안서" | "회의록" | "메모" | "기타";
  tags: string[];
  owner_id: string;
  shared_with_org: boolean;
}

export interface UploadedTemplateDetail extends UploadedTemplate {
  content: string;
}

export interface UploadResponse {
  template: UploadedTemplate;
  extracted_preview: string;
}

export type TemplateScope = "mine" | "shared" | "org" | "all";

export async function listMyTemplates(opts: {
  organization_id?: string;
  scope?: TemplateScope;
} = {}) {
  const params = new URLSearchParams();
  if (opts.organization_id) params.set("organization_id", opts.organization_id);
  if (opts.scope) params.set("scope", opts.scope);
  const q = params.toString() ? `?${params.toString()}` : "";
  return http<UploadedTemplate[]>(`/uploads/templates${q}`);
}

export async function getMyTemplate(id: string) {
  return http<UploadedTemplateDetail>(`/uploads/templates/${id}`);
}

export async function updateMyTemplate(
  id: string,
  patch: { category?: string; tags?: string[]; description?: string; shared_with_org?: boolean }
) {
  return http<UploadedTemplate>(`/uploads/templates/${id}`, {
    method: "PATCH",
    headers: ownerHeader(),
    body: JSON.stringify(patch),
  });
}

export async function deleteMyTemplate(id: string) {
  return http<{ ok: boolean; deleted_id: string }>(`/uploads/templates/${id}`, {
    method: "DELETE",
    headers: ownerHeader(),
  });
}

// ─── Admin (관리자 전용) ────────────────────────────────────────────────────

export interface AdminDashboard {
  generated_at: string;
  users_total: number;
  users_active_7d: number;
  users_new_7d: number;
  users_by_plan: Record<string, number>;
  conversions_total: number;
  conversions_7d: number;
  conversions_today: number;
  macro_executions_7d: number;
  org_profiles_count: number;
  prompts_count: number;
  templates_count: number;
  estimated_mrr_krw: number;
  signups_timeseries: { date: string; count: number }[];
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  plan: string;
  persona_mode: string;
  organization_id: string | null;
  opt_in_training: boolean;
  created_at: string;
  last_login: string | null;
  conversion_count: number;
}

export interface AdminUsersResponse {
  total: number;
  page: number;
  page_size: number;
  items: AdminUser[];
}

export interface AdminAuditLog {
  id: string;
  at: string;
  user_id: string | null;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  status: string;
  ip: string;
}

export interface AdminConversionStats {
  last_n_days: number;
  conversions_by_day: { date: string; count: number }[];
  top_macros: { macro_id: string; usage_count: number }[];
}

export async function getAdminDashboard() {
  return http<AdminDashboard>("/admin/dashboard");
}

export async function listAdminUsers(opts: {
  q?: string;
  plan?: string;
  page?: number;
  page_size?: number;
} = {}) {
  const p = new URLSearchParams();
  if (opts.q) p.set("q", opts.q);
  if (opts.plan) p.set("plan", opts.plan);
  if (opts.page) p.set("page", String(opts.page));
  if (opts.page_size) p.set("page_size", String(opts.page_size));
  const q = p.toString() ? `?${p.toString()}` : "";
  return http<AdminUsersResponse>(`/admin/users${q}`);
}

export async function updateAdminUser(
  id: string,
  patch: Partial<{ plan: string; organization_id: string | null; opt_in_training: boolean }>
) {
  return http<AdminUser>(`/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function listAdminAuditLogs(opts: {
  action?: string;
  status?: string;
  limit?: number;
} = {}) {
  const p = new URLSearchParams();
  if (opts.action) p.set("action", opts.action);
  if (opts.status) p.set("status", opts.status);
  if (opts.limit) p.set("limit", String(opts.limit));
  const q = p.toString() ? `?${p.toString()}` : "";
  return http<AdminAuditLog[]>(`/admin/audit-logs${q}`);
}

export async function getAdminConversionStats(days = 14) {
  return http<AdminConversionStats>(`/admin/conversions/stats?days=${days}`);
}

// ─── LLM Providers (가용성·구성 상태) ────────────────────────────────────────

export interface ProviderStatus {
  id: "tenos" | "tenos_hf" | "openai" | "anthropic" | "mock" | "chain";
  name: string;
  tagline: string;
  emoji: string;
  configured: boolean;
  /** 본인(BYOK) 키 등록 여부. true 면 시스템 키 없어도 사용 가능 */
  own_configured?: boolean;
  /** 본인 키의 마지막 4자리 (UI 표시용) */
  own_last_4?: string;
  reason: string;
  model_id: string;
}

export interface ProvidersResponse {
  default: string;
  items: ProviderStatus[];
}

export async function listProviders() {
  return http<ProvidersResponse>("/providers");
}

// ─── BYOK — 본인 API 키 등록 ─────────────────────────────────────────────────

export interface MyApiKey {
  provider: string;
  masked: string;
  last_4: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

export async function listMyApiKeys() {
  return http<MyApiKey[]>("/me/api-keys");
}

export async function setMyApiKey(
  provider: "openai" | "anthropic",
  api_key: string,
) {
  return http<MyApiKey>(`/me/api-keys/${provider}`, {
    method: "PUT",
    body: JSON.stringify({ api_key }),
  });
}

export async function deleteMyApiKey(provider: "openai" | "anthropic") {
  return http<{ ok: boolean; deleted_provider: string }>(`/me/api-keys/${provider}`, {
    method: "DELETE",
  });
}

// ─── AI Chat (자유 대화) ─────────────────────────────────────────────────────

export type ChatProvider = "tenos" | "tenos_hf" | "openai" | "anthropic" | "mock" | "chain";

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  message: string;
  provider: string;
  model_id: string;
  latency_ms: number;
}

export async function sendChat(input: {
  messages: ChatMsg[];
  provider?: ChatProvider;
  temperature?: number;
  max_tokens?: number;
  /** 현재 에디터 본문 — AI 가 컨텍스트로 인지 */
  source_markdown?: string;
  /** 현재 에디터 제목 (선택) */
  source_title?: string;
  /** 현재 변환결과 블록 요약 (blk-XXXX · type · 텍스트) */
  preview_summary?: string;
  /** 사용자가 변환결과에서 선택한 블록 ID 목록 */
  selected_block_ids?: string[];
  /** 조직 프로파일 ID — ai_system_prompt 주입용 */
  organization_id?: string | null;
}): Promise<ChatResult> {
  return http<ChatResult>("/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: input.messages,
      provider: input.provider ?? null,
      temperature: input.temperature ?? 0.7,
      max_tokens: input.max_tokens ?? 1024,
      source_markdown: input.source_markdown ?? "",
      source_title: input.source_title ?? "",
      preview_summary: input.preview_summary ?? "",
      selected_block_ids: input.selected_block_ids ?? [],
      organization_id: input.organization_id ?? null,
    }),
  });
}

export async function adminCleanupAuditLogs(days = 90) {
  return http<{ deleted: number; retention_days: number }>(
    `/compliance/audit-cleanup?days=${days}`,
    { method: "POST" },
  );
}

// ─── Billing (결제) ──────────────────────────────────────────────────────

export interface PlanInfo {
  id: string;
  name: string;
  price_krw_monthly: number | null;
  daily_conversions: number;
  max_uploaded_templates: number;
  can_share_with_org: boolean;
  can_use_rag: boolean;
  can_use_on_premise: boolean;
}

export interface BillingStatus {
  plan: string;
  limits: {
    daily_conversions: number;
    max_uploaded_templates: number;
    can_share_with_org: boolean;
    can_use_rag: boolean;
    can_use_on_premise: boolean;
  };
  usage_today: number;
  stripe_enabled: boolean;
}

export async function listPlans() {
  return http<PlanInfo[]>("/billing/plans");
}

export async function getBillingStatus() {
  return http<BillingStatus>("/billing/status");
}

export async function createCheckoutSession(plan: "pro" | "team") {
  return http<{ checkout_url: string }>("/billing/checkout-session", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
}

// ─── Organization Profile (회사·기관별 문서 양식) ──────────────────────────

export interface OrganizationProfile {
  id: string;
  slug: string;
  name: string;
  brand_color_hex: string;
  accent_color_hex: string;
  table_header_bg_hex: string;
  font_korean: string;
  font_korean_heading: string;
  body_font_size_pt: number;
  h1_font_size_pt: number;
  h2_font_size_pt: number;
  h3_font_size_pt: number;
  page_size: string;
  margin_top_mm: number;
  margin_bottom_mm: number;
  margin_left_mm: number;
  margin_right_mm: number;
  header_text: string;
  footer_text: string;
  logo_data_url: string;
  prompt_label: string;
  default_template_id: string | null;
  db_organization_id: string | null;
  ai_persona_name: string;
  ai_system_prompt: string;
  is_public: boolean;
  notes: string;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export type OrganizationProfileUpdate = Partial<Omit<OrganizationProfile, "id" | "slug" | "created_at" | "updated_at" | "created_by">>;

export async function listOrganizations(opts: { public_only?: boolean } = {}): Promise<OrganizationProfile[]> {
  const q = opts.public_only ? "?public_only=true" : "";
  return http<OrganizationProfile[]>(`/organizations${q}`);
}

export async function getOrganization(id: string): Promise<OrganizationProfile> {
  return http<OrganizationProfile>(`/organizations/${id}`);
}

export async function createOrganization(input: Partial<OrganizationProfile> & { name: string }): Promise<OrganizationProfile> {
  return http<OrganizationProfile>("/organizations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateOrganization(id: string, patch: OrganizationProfileUpdate): Promise<OrganizationProfile> {
  return http<OrganizationProfile>(`/organizations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteOrganization(id: string): Promise<{ ok: boolean; deleted_id: string }> {
  return http<{ ok: boolean; deleted_id: string }>(`/organizations/${id}`, {
    method: "DELETE",
  });
}

// ─── Prompt Library (회사별 프롬프트 치트시트) ──────────────────────────────

/**
 * 요정분생설 — 프롬프트가 LLM 에게 시키는 일의 종류 (5종 중 하나).
 * "" 면 미지정. 백엔드는 한글 라벨도 정규화해 받음.
 */
export type PromptTaskType = "" | "summary" | "organization" | "analysis" | "generation" | "explanation";

export const TASK_TYPE_KO: Record<Exclude<PromptTaskType, "">, string> = {
  summary: "요약",
  organization: "정리",
  analysis: "분석",
  generation: "생성",
  explanation: "설명",
};

/** 카드/필터 칩 색상 — task_type 별 시각 구분. */
export const TASK_TYPE_COLOR: Record<Exclude<PromptTaskType, "">, string> = {
  summary: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  organization: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  analysis: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  generation: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  explanation: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

export interface PromptItem {
  id: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  organization_label: string;
  organization_id: string | null;
  owner_id: string;
  source_filename: string | null;
  shared_with_org: boolean;
  created_at: number;
  updated_at: number;
  // 역관목조분 + 요정분생설 (구조화 필드)
  role?: string;
  field?: string;
  purpose?: string;
  conditions?: string;
  length?: string;
  task_type?: PromptTaskType;
}

export interface OrganizationStat {
  label: string;
  count: number;
}

export interface PromptImportResponse {
  imported: number;
  detected_label: string;
  warnings: string[];
  prompts: PromptItem[];
}

export type PromptScope = "mine" | "shared" | "org" | "all";

export async function listPrompts(opts: {
  organization_label?: string;
  scope?: PromptScope;
} = {}): Promise<PromptItem[]> {
  const params = new URLSearchParams();
  if (opts.organization_label) params.set("organization_label", opts.organization_label);
  if (opts.scope) params.set("scope", opts.scope);
  const q = params.toString() ? `?${params.toString()}` : "";
  return http<PromptItem[]>(`/prompts${q}`, { headers: ownerHeader() });
}

export async function listPromptOrganizations(): Promise<OrganizationStat[]> {
  return http<OrganizationStat[]>("/prompts/organizations", { headers: ownerHeader() });
}

export async function createPrompt(input: {
  title: string;
  content: string;
  description?: string;
  category?: string;
  tags?: string[];
  organization_label?: string;
  shared_with_org?: boolean;
  // 역관목조분 + 요정분생설
  role?: string;
  field?: string;
  purpose?: string;
  conditions?: string;
  length?: string;
  task_type?: PromptTaskType;
}): Promise<PromptItem> {
  return http<PromptItem>("/prompts", {
    method: "POST",
    headers: ownerHeader(),
    body: JSON.stringify(input),
  });
}

export async function updatePrompt(id: string, patch: Partial<{
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  organization_label: string;
  shared_with_org: boolean;
  role: string;
  field: string;
  purpose: string;
  conditions: string;
  length: string;
  task_type: PromptTaskType;
}>): Promise<PromptItem> {
  return http<PromptItem>(`/prompts/${id}`, {
    method: "PATCH",
    headers: ownerHeader(),
    body: JSON.stringify(patch),
  });
}

export async function deletePrompt(id: string): Promise<{ ok: boolean; deleted_id: string }> {
  return http<{ ok: boolean; deleted_id: string }>(`/prompts/${id}`, {
    method: "DELETE",
    headers: ownerHeader(),
  });
}

export async function deletePromptsByOrganization(
  organization_label: string,
  owner_only = true,
): Promise<{ ok: boolean; deleted: number; organization_label: string }> {
  const params = new URLSearchParams({ organization_label, owner_only: String(owner_only) });
  return http<{ ok: boolean; deleted: number; organization_label: string }>(
    `/prompts?${params.toString()}`,
    { method: "DELETE", headers: ownerHeader() },
  );
}

export async function importPromptHtml(input: {
  file: File;
  organization_label?: string;
  organization_id?: string;
  shared_with_org?: boolean;
}): Promise<PromptImportResponse> {
  const form = new FormData();
  form.append("file", input.file);
  if (input.organization_label) form.append("organization_label", input.organization_label);
  if (input.organization_id) form.append("organization_id", input.organization_id);
  if (input.shared_with_org) form.append("shared_with_org", "true");
  const res = await fetch(`${BASE}/prompts/import-html`, {
    method: "POST",
    body: form,
    headers: ownerHeader(),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── 역관목조분 + 요정분생설 ────────────────────────────────────────────────

export interface ComposeAxesInput {
  role?: string;
  field?: string;
  purpose?: string;
  conditions?: string;
  length?: string;
  task_type?: PromptTaskType;
  body?: string;
}

export interface ComposeAxesResult {
  content: string;
  normalized_task_type: PromptTaskType;
  task_type_ko: string;
}

/** 마법사 미리보기 — 5축 + task_type + body 를 합쳐 content 생성 (LLM 안 씀). */
export async function composeAxes(input: ComposeAxesInput): Promise<ComposeAxesResult> {
  return http<ComposeAxesResult>("/prompts/compose-axes", {
    method: "POST",
    headers: ownerHeader(),
    body: JSON.stringify({
      role: input.role ?? "",
      field: input.field ?? "",
      purpose: input.purpose ?? "",
      conditions: input.conditions ?? "",
      length: input.length ?? "",
      task_type: input.task_type ?? "",
      body: input.body ?? "",
    }),
  });
}

export interface EnhancePromptResult {
  prompt_id: string;
  suggested_role: string;
  suggested_field: string;
  suggested_purpose: string;
  suggested_conditions: string;
  suggested_length: string;
  suggested_task_type: PromptTaskType;
  suggested_task_type_ko: string;
  suggested_content: string;
  rationale: string;
  model_version: string;
  latency_ms: number;
}

/** 기존 프롬프트를 LLM 으로 분석해 역관목조분/요정분생설 제안. 저장하지 않음. */
export async function enhancePrompt(id: string): Promise<EnhancePromptResult> {
  return http<EnhancePromptResult>(`/prompts/${id}/enhance`, {
    method: "POST",
    headers: ownerHeader(),
    body: JSON.stringify({}),
  });
}

export interface PromptRunResult {
  prompt_id: string;
  prompt_title: string;
  rendered_prompt: string;
  result_markdown: string;
  model_version: string;
  latency_ms: number;
}

export async function runPrompt(id: string, input: {
  variables?: Record<string, string>;
  user_input?: string;
  temperature?: number;
  max_tokens?: number;
} = {}): Promise<PromptRunResult> {
  return http<PromptRunResult>(`/prompts/${id}/run`, {
    method: "POST",
    headers: ownerHeader(),
    body: JSON.stringify({
      variables: input.variables ?? {},
      user_input: input.user_input ?? "",
      temperature: input.temperature ?? 0.4,
      max_tokens: input.max_tokens ?? 2048,
    }),
  });
}

export interface PromptSaveAsTemplateResult {
  template: UploadedTemplate;
  linked_organization_ids: string[];
}

export async function savePromptAsTemplate(id: string, input: {
  content: string;
  title?: string;
  category?: string;
  tags?: string[];
  description?: string;
  shared_with_org?: boolean;
  auto_link_to_organization?: boolean;
}): Promise<PromptSaveAsTemplateResult> {
  return http<PromptSaveAsTemplateResult>(`/prompts/${id}/save-as-template`, {
    method: "POST",
    headers: ownerHeader(),
    body: JSON.stringify({
      content: input.content,
      title: input.title ?? "",
      category: input.category ?? "",
      tags: input.tags ?? [],
      description: input.description ?? "",
      shared_with_org: input.shared_with_org ?? true,
      auto_link_to_organization: input.auto_link_to_organization ?? true,
    }),
  });
}

export function promptMarkdownExportUrl(organization_label?: string): string {
  const q = organization_label
    ? `?organization_label=${encodeURIComponent(organization_label)}`
    : "";
  return `${BASE}/prompts/export/markdown${q}`;
}

export async function uploadTemplate(input: {
  file: File;
  description?: string;
  organization_id?: string;
  auto_index_rag?: boolean;
  category?: string;
  tags?: string[];
  shared_with_org?: boolean;
}): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", input.file);
  if (input.description) form.append("description", input.description);
  if (input.organization_id) form.append("organization_id", input.organization_id);
  if (input.auto_index_rag) form.append("auto_index_rag", "true");
  if (input.category) form.append("category", input.category);
  if (input.tags && input.tags.length) form.append("tags", input.tags.join(","));
  if (input.shared_with_org) form.append("shared_with_org", "true");
  const res = await fetch(`${BASE}/uploads/template`, {
    method: "POST",
    body: form,
    headers: ownerHeader(),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}
