"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";

import { adminCleanupAuditLogs, listAdminAuditLogs } from "@/lib/api";

const ACTIONS = [
  "",
  "auth.login",
  "auth.register",
  "auth.logout",
  "convert",
  "macro.execute",
  "billing.subscribe",
  "billing.cancel",
];

const STATUS_COLORS: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  denied: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  error: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

export function AdminAuditLogs() {
  const [action, setAction] = useState("");
  const [status, setStatus] = useState("");
  const [limit, setLimit] = useState(100);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const key = `admin:audit:${action}:${status}:${limit}`;
  const { data: logs = [], mutate, isLoading } = useSWR(key, () =>
    listAdminAuditLogs({ action: action || undefined, status: status || undefined, limit })
  );

  const handleCleanup = async () => {
    if (!confirm("90일 초과된 감사 로그를 영구 삭제합니다. 진행할까요?")) return;
    setCleaning(true);
    setCleanupResult(null);
    try {
      const r = await adminCleanupAuditLogs(90);
      setCleanupResult(`${r.deleted}건 삭제됨 (보관기간 ${r.retention_days}일)`);
      mutate();
    } catch (e) {
      setCleanupResult(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          ISMS-P 감사 로그 — 모든 사용자의 민감 작업이 90일간 보관됩니다.
        </p>
        <button
          onClick={handleCleanup}
          disabled={cleaning}
          className="flex shrink-0 items-center gap-1 rounded border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:hover:bg-rose-950/30"
          title="90일 초과 로그를 영구 삭제 (ISMS-P 보존 기간 종료)"
        >
          {cleaning ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          90일 초과 정리
        </button>
      </div>
      {cleanupResult && (
        <p
          className={`rounded p-2 text-xs ${
            cleanupResult.startsWith("삭제 실패")
              ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          }`}
        >
          {cleanupResult}
        </p>
      )}

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          <span className="text-neutral-500">action</span>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a || "전체"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-neutral-500">status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">전체</option>
            <option value="ok">ok</option>
            <option value="denied">denied</option>
            <option value="error">error</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-neutral-500">limit</span>
          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value))}
            className="rounded border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {[50, 100, 200, 500].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => mutate()}
          className="ml-auto flex items-center gap-1 rounded border border-neutral-200 px-2 py-1 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <RefreshCw size={11} /> 새로고침
        </button>
      </div>

      {/* 테이블 */}
      <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-neutral-500">
            <Loader2 size={14} className="mr-2 animate-spin" /> 불러오는 중…
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-sm text-neutral-500">
            <ShieldAlert size={28} className="mx-auto mb-2 text-neutral-300" />
            로그가 없습니다.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-neutral-200 text-[10px] uppercase text-neutral-500 dark:border-neutral-800">
              <tr>
                <th className="px-3 py-2 text-left font-medium">시각</th>
                <th className="px-3 py-2 text-left font-medium">사용자</th>
                <th className="px-3 py-2 text-left font-medium">action</th>
                <th className="px-3 py-2 text-left font-medium">resource</th>
                <th className="px-3 py-2 text-left font-medium">status</th>
                <th className="px-3 py-2 text-left font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800/50 dark:hover:bg-neutral-800/30"
                >
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-neutral-500">
                    {fmt(l.at)}
                  </td>
                  <td className="px-3 py-2">
                    {l.user_email || <span className="text-neutral-400">익명</span>}
                  </td>
                  <td className="px-3 py-2 font-mono">{l.action}</td>
                  <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">
                    {l.resource_type && (
                      <>
                        <span className="font-mono">{l.resource_type}</span>
                        {l.resource_id && <span className="text-neutral-400">/{l.resource_id.slice(0, 8)}</span>}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS_COLORS[l.status] ?? STATUS_COLORS.ok}`}
                    >
                      {l.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-neutral-400">{l.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function fmt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}
