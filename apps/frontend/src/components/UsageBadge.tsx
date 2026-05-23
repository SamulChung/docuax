"use client";

import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, Zap } from "lucide-react";

import { getBillingStatus, getMe } from "@/lib/api";

/**
 * 상단 바 사용량 배지.
 *
 * - 무제한 플랜은 "무제한" 표시
 * - 한도가 있으면 "X / Y건" + 75% 초과 시 노란색, 95% 초과 시 빨간색
 * - 클릭 시 /pricing 으로 이동 (업그레이드 유도)
 */
export function UsageBadge() {
  const { data: me } = useSWR("me", () => getMe().catch(() => null), {
    shouldRetryOnError: false,
  });
  // 로그인 안 한 사용자는 표시 안 함
  const { data: billing } = useSWR(me ? "billing-status" : null, getBillingStatus, {
    refreshInterval: 60000, // 1분마다 갱신
  });

  if (!me || !billing) return null;
  const { usage_today, limits, plan } = billing;
  const limit = limits.daily_conversions;

  // 무제한 — 깔끔하게 표시만
  if (limit < 0) {
    return (
      <Link
        href="/pricing"
        className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300"
        title={`현재 ${plan.toUpperCase()} 플랜 — 무제한`}
      >
        <Zap size={11} />
        무제한
      </Link>
    );
  }

  const pct = (usage_today / Math.max(1, limit)) * 100;
  // 색상 단계
  let cls = "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";
  let warn = false;
  if (pct >= 95) {
    cls = "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300";
    warn = true;
  } else if (pct >= 75) {
    cls = "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  } else if (pct >= 50) {
    cls = "bg-brand/10 text-brand";
  }

  const tooltip = warn
    ? `오늘 변환 한도가 거의 다 찼습니다 (${usage_today}/${limit}). 클릭하면 플랜 업그레이드`
    : `오늘 ${usage_today} / ${limit}건 사용 — ${plan.toUpperCase()} 플랜`;

  return (
    <Link
      href="/pricing"
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-all hover:ring-2 hover:ring-brand/40 ${cls}`}
      title={tooltip}
    >
      {warn ? <AlertTriangle size={11} /> : <Zap size={11} />}
      <span className="font-mono">
        {usage_today.toLocaleString()}
        <span className="opacity-60">/{limit.toLocaleString()}</span>
      </span>
    </Link>
  );
}
