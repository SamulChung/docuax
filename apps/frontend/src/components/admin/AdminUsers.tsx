"use client";

import { useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";

import { listAdminUsers, updateAdminUser, type AdminUser } from "@/lib/api";

const PLANS = ["", "free", "pro", "team", "enterprise"];
const PAGE_SIZE = 25;

const PLAN_BADGE: Record<string, string> = {
  free: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  pro: "bg-brand/15 text-brand",
  team: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  enterprise: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

export function AdminUsers() {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [page, setPage] = useState(1);
  const key = `admin:users:${q}:${plan}:${page}`;
  const { data, mutate, isLoading } = useSWR(key, () =>
    listAdminUsers({ q, plan: plan || undefined, page, page_size: PAGE_SIZE })
  );

  const handlePlanChange = async (u: AdminUser, newPlan: string) => {
    if (newPlan === u.plan) return;
    if (!confirm(`${u.email} 의 플랜을 ${u.plan} → ${newPlan} 로 변경할까요?`)) return;
    await updateAdminUser(u.id, { plan: newPlan });
    mutate();
  };

  return (
    <div className="space-y-4">
      {/* 검색·필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="이메일·이름으로 검색"
            className="w-full rounded border border-neutral-200 bg-white py-1.5 pl-7 pr-2 text-xs focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <select
          value={plan}
          onChange={(e) => {
            setPlan(e.target.value);
            setPage(1);
          }}
          className="rounded border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-900"
        >
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {p || "모든 플랜"}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-neutral-500">
          {data ? `${data.total.toLocaleString()}명` : "—"}
        </span>
      </div>

      {/* 테이블 */}
      <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {isLoading || !data ? (
          <div className="flex items-center justify-center py-12 text-sm text-neutral-500">
            <Loader2 size={14} className="mr-2 animate-spin" />
            불러오는 중…
          </div>
        ) : data.items.length === 0 ? (
          <div className="py-12 text-center text-sm text-neutral-500">검색 결과 없음</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-neutral-200 text-[10px] uppercase text-neutral-500 dark:border-neutral-800">
              <tr>
                <th className="px-3 py-2 text-left font-medium">이메일</th>
                <th className="px-3 py-2 text-left font-medium">이름</th>
                <th className="px-3 py-2 text-left font-medium">플랜</th>
                <th className="px-3 py-2 text-right font-medium">변환</th>
                <th className="px-3 py-2 text-left font-medium">가입일</th>
                <th className="px-3 py-2 text-left font-medium">최근 로그인</th>
                <th className="px-3 py-2 text-left font-medium">학습 옵트인</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800/50 dark:hover:bg-neutral-800/30"
                >
                  <td className="px-3 py-2 font-medium">{u.email}</td>
                  <td className="px-3 py-2 text-neutral-700 dark:text-neutral-300">{u.name || "—"}</td>
                  <td className="px-3 py-2">
                    <select
                      value={u.plan}
                      onChange={(e) => handlePlanChange(u, e.target.value)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PLAN_BADGE[u.plan] ?? PLAN_BADGE.free}`}
                    >
                      {["free", "pro", "team", "enterprise"].map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {u.conversion_count.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-neutral-500">{fmt(u.created_at)}</td>
                  <td className="px-3 py-2 text-neutral-500">{u.last_login ? fmt(u.last_login) : "—"}</td>
                  <td className="px-3 py-2">
                    {u.opt_in_training ? (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        ✓
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 페이지네이션 */}
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded border border-neutral-200 p-1 hover:bg-neutral-50 disabled:opacity-30 dark:border-neutral-700"
          >
            <ChevronLeft size={12} />
          </button>
          <span>
            {page} / {Math.ceil(data.total / PAGE_SIZE)}
          </span>
          <button
            onClick={() =>
              setPage((p) => (p < Math.ceil(data.total / PAGE_SIZE) ? p + 1 : p))
            }
            disabled={page >= Math.ceil(data.total / PAGE_SIZE)}
            className="rounded border border-neutral-200 p-1 hover:bg-neutral-50 disabled:opacity-30 dark:border-neutral-700"
          >
            <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ko-KR", {
      year: "2-digit",
      month: "numeric",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
