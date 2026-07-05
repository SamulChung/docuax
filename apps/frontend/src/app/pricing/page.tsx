"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";

import { LogoLockup } from "@/components/Logo";
import {
  createCheckoutSession,
  getBillingStatus,
  getMe,
  listPlans,
  type PlanInfo,
} from "@/lib/api";

const FEATURES_LABEL: Record<string, string> = {
  daily_conversions: "일 변환 한도",
  max_uploaded_templates: "양식 업로드",
  can_share_with_org: "조직 공유",
  can_use_rag: "RAG 양식 학습",
  can_use_on_premise: "온프레미스",
};

function formatLimit(value: number | boolean): string {
  if (typeof value === "boolean") return value ? "포함" : "—";
  if (value < 0) return "무제한";
  return value.toLocaleString();
}

export default function PricingPage() {
  const { data: plans = [] } = useSWR("plans", listPlans);
  const { data: me } = useSWR("me", () => getMe().catch(() => null), {
    shouldRetryOnError: false,
  });
  const { data: billing } = useSWR(me ? "billing-status" : null, getBillingStatus);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async (plan: PlanInfo) => {
    if (!me) {
      window.location.href = "/?signup=1";
      return;
    }
    if (plan.id === "enterprise") {
      window.location.href = "mailto:sales@tenai.kr?subject=글집%20Enterprise%20문의";
      return;
    }
    if (plan.id === "free") return;
    setLoadingPlan(plan.id);
    setError(null);
    try {
      const r = await createCheckoutSession(plan.id as "pro" | "team");
      window.location.href = r.checkout_url;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m.includes("503")) {
        setError("결제 시스템이 아직 활성화되지 않았습니다. 관리자에게 문의하세요.");
      } else {
        setError(m);
      }
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs text-neutral-500 hover:text-brand"
      >
        <ArrowLeft size={12} />
        <LogoLockup size={20} />
      </Link>

      <header className="mt-8 text-center">
        <h1 className="text-3xl font-bold">글집 요금제</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          마크다운 한 번에 회사 문서로 — 필요한 만큼만 결제하세요.
        </p>
        {billing && (
          <p className="mt-2 inline-block rounded-full bg-brand/10 px-3 py-1 text-xs text-brand">
            현재 플랜:{" "}
            <strong className="uppercase">{billing.plan}</strong>{" "}
            · 오늘 변환 {billing.usage_today.toLocaleString()}
            {billing.limits.daily_conversions > 0
              ? ` / ${billing.limits.daily_conversions.toLocaleString()}`
              : ""}
            건
          </p>
        )}
      </header>

      {error && (
        <p className="mx-auto mt-4 max-w-xl rounded bg-rose-50 px-3 py-2 text-center text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const isCurrent = billing?.plan === p.id;
          const isPaid = p.id === "pro" || p.id === "team";
          const featured = p.id === "pro";
          return (
            <div
              key={p.id}
              className={`relative rounded-xl border bg-white p-5 dark:bg-neutral-900 ${
                featured
                  ? "border-brand shadow-lg"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              {featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                  추천
                </span>
              )}
              {isCurrent && (
                <span className="absolute right-3 top-3 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  현재 사용 중
                </span>
              )}
              <h2 className="text-lg font-bold">{p.name}</h2>
              <div className="mt-2 text-3xl font-bold">
                {p.price_krw_monthly === null ? (
                  "별도 문의"
                ) : p.price_krw_monthly === 0 ? (
                  "무료"
                ) : (
                  <>
                    ₩{p.price_krw_monthly.toLocaleString()}
                    <span className="ml-1 text-sm font-normal text-neutral-500">/월</span>
                  </>
                )}
              </div>

              <ul className="mt-4 space-y-2 text-xs">
                <FeatureRow ok yes={`일 변환 ${formatLimit(p.daily_conversions)}건`} />
                <FeatureRow ok yes={`양식 업로드 ${formatLimit(p.max_uploaded_templates)}`} />
                <FeatureRow ok={p.can_share_with_org} yes="조직 내 공유" no="조직 내 공유" />
                <FeatureRow ok={p.can_use_rag} yes="RAG 양식 학습" no="RAG 양식 학습" />
                <FeatureRow ok={p.can_use_on_premise} yes="온프레미스 배포" no="온프레미스 배포" />
              </ul>

              <button
                onClick={() => handleSubscribe(p)}
                disabled={isCurrent || loadingPlan !== null}
                className={`mt-5 flex w-full items-center justify-center gap-1 rounded py-2 text-sm font-semibold transition-all disabled:opacity-50 ${
                  featured
                    ? "bg-brand text-white hover:bg-brand/90"
                    : "border border-neutral-200 hover:border-brand hover:text-brand dark:border-neutral-700"
                }`}
              >
                {loadingPlan === p.id && <Loader2 size={12} className="animate-spin" />}
                {isCurrent
                  ? "현재 사용 중"
                  : !isPaid && p.id === "enterprise"
                  ? "문의하기"
                  : p.id === "free"
                  ? "Free 시작"
                  : "구독하기"}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-neutral-500">
        모든 결제는 Stripe로 안전하게 처리됩니다 · 언제든 해지 가능
      </p>
    </div>
  );
}

function FeatureRow({ ok, yes, no }: { ok: boolean; yes: string; no?: string }) {
  return (
    <li className="flex items-start gap-1.5">
      {ok ? (
        <Check size={12} className="mt-0.5 shrink-0 text-emerald-600" />
      ) : (
        <X size={12} className="mt-0.5 shrink-0 text-neutral-300" />
      )}
      <span className={ok ? "" : "text-neutral-400 line-through"}>
        {ok ? yes : (no ?? yes)}
      </span>
    </li>
  );
}
