"use client";

import useSWR from "swr";
import {
  Building2,
  FileText,
  Loader2,
  Sparkles,
  TrendingUp,
  Users as UsersIcon,
  Zap,
} from "lucide-react";

import { getAdminConversionStats, getAdminDashboard } from "@/lib/api";

const PLAN_COLORS: Record<string, string> = {
  free: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  pro: "bg-brand/15 text-brand",
  team: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  enterprise: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

const KRW = new Intl.NumberFormat("ko-KR");

export function AdminDashboardSection() {
  const { data: dash, isLoading: dashLoading } = useSWR(
    "admin:dashboard",
    getAdminDashboard,
    { refreshInterval: 30000 },
  );
  const { data: stats } = useSWR("admin:conv-stats", () => getAdminConversionStats(14), {
    refreshInterval: 60000,
  });

  if (dashLoading || !dash) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-neutral-500">
        <Loader2 size={14} className="mr-2 animate-spin" />
        대시보드 불러오는 중…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 핵심 지표 카드 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          icon={UsersIcon}
          label="총 사용자"
          value={dash.users_total.toLocaleString()}
          sub={`최근 7일 신규 +${dash.users_new_7d}`}
        />
        <Card
          icon={Zap}
          label="오늘 변환"
          value={dash.conversions_today.toLocaleString()}
          sub={`7일 누적 ${dash.conversions_7d.toLocaleString()}건`}
        />
        <Card
          icon={TrendingUp}
          label="추정 MRR"
          value={`₩${KRW.format(dash.estimated_mrr_krw)}`}
          sub="플랜 단가 × 인원 기준"
        />
        <Card
          icon={Sparkles}
          label="7일 매크로 실행"
          value={dash.macro_executions_7d.toLocaleString()}
          sub="모든 사용자 누적"
        />
      </div>

      {/* 두 번째 줄 — 자산 */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card icon={Building2} label="조직 양식" value={dash.org_profiles_count.toLocaleString()} sub="등록된 OrganizationProfile" />
        <Card icon={Sparkles} label="프롬프트" value={dash.prompts_count.toLocaleString()} sub="라이브러리 누적" />
        <Card icon={FileText} label="업로드 템플릿" value={dash.templates_count.toLocaleString()} sub=".md/docx/hwpx 등" />
      </div>

      {/* 플랜별 분포 */}
      <section className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 text-sm font-semibold">플랜별 사용자 분포</h2>
        <div className="space-y-2">
          {Object.entries(dash.users_by_plan).map(([plan, count]) => {
            const total = Object.values(dash.users_by_plan).reduce((a, b) => a + b, 0) || 1;
            const pct = (count / total) * 100;
            return (
              <div key={plan} className="flex items-center gap-3 text-xs">
                <span className={`w-20 rounded px-2 py-1 text-center font-semibold uppercase ${PLAN_COLORS[plan] ?? PLAN_COLORS.free}`}>
                  {plan}
                </span>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
                  <div
                    className="absolute inset-y-0 left-0 bg-brand/70"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-20 text-right font-mono">{count.toLocaleString()}명</span>
                <span className="w-12 text-right text-neutral-500">{pct.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 신규 가입 시계열 */}
      <section className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 text-sm font-semibold">최근 14일 신규 가입</h2>
        <SparkBars data={dash.signups_timeseries} />
      </section>

      {/* 변환 시계열 */}
      {stats && (
        <section className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="mb-3 text-sm font-semibold">
            최근 {stats.last_n_days}일 변환 실행
          </h2>
          <SparkBars data={stats.conversions_by_day} />
        </section>
      )}

      {/* 매크로 TOP10 */}
      {stats && stats.top_macros.length > 0 && (
        <section className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="mb-3 text-sm font-semibold">매크로 사용 TOP 10 (최근 14일)</h2>
          <div className="space-y-1">
            {stats.top_macros.map((m, i) => {
              const max = stats.top_macros[0]?.usage_count || 1;
              const pct = (m.usage_count / max) * 100;
              return (
                <div key={m.macro_id} className="flex items-center gap-3 text-xs">
                  <span className="w-6 text-right text-neutral-400">{i + 1}.</span>
                  <span className="w-16 font-mono font-semibold">{m.macro_id}</span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
                    <div
                      className="absolute inset-y-0 left-0 bg-brand/60"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-16 text-right font-mono">{m.usage_count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="text-[10px] text-neutral-400">
        마지막 갱신: {new Date(dash.generated_at).toLocaleString("ko-KR")} · 30초마다 자동 새로고침
      </p>
    </div>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof UsersIcon;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        <span>{label}</span>
        <Icon size={12} className="text-brand" />
      </div>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="mt-0.5 text-[10px] text-neutral-500">{sub}</p>
    </div>
  );
}

function SparkBars({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-1" style={{ height: 80 }}>
      {data.map((d) => {
        const h = (d.count / max) * 100;
        return (
          <div
            key={d.date}
            className="flex flex-1 flex-col items-center gap-1"
            title={`${d.date} · ${d.count}건`}
          >
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-sm bg-brand/60 transition-all hover:bg-brand"
                style={{ height: `${Math.max(h, 2)}%` }}
              />
            </div>
            <span className="text-[9px] text-neutral-400">
              {d.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
