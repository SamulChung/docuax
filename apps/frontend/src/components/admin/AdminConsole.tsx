"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Activity,
  ArrowLeft,
  Building2,
  Cpu,
  FileSearch,
  Loader2,
  LayoutDashboard,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";

import { LogoLockup } from "@/components/Logo";
import { AdminAuditLogs } from "@/components/admin/AdminAuditLogs";
import { AdminDashboardSection } from "@/components/admin/AdminDashboardSection";
import { AdminLLMSettings } from "@/components/admin/AdminLLMSettings";
import { AdminOrganizations } from "@/components/admin/AdminOrganizations";
import { AdminPrompts } from "@/components/admin/AdminPrompts";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { getMe } from "@/lib/api";

type Section =
  | "dashboard"
  | "users"
  | "organizations"
  | "prompts"
  | "audit"
  | "llm";

const NAV: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "대시보드", icon: LayoutDashboard },
  { id: "users", label: "사용자", icon: Users },
  { id: "organizations", label: "조직 양식", icon: Building2 },
  { id: "prompts", label: "프롬프트", icon: Sparkles },
  { id: "audit", label: "감사 로그", icon: ShieldAlert },
  { id: "llm", label: "LLM 설정", icon: Cpu },
];

export function AdminConsole() {
  const [section, setSection] = useState<Section>("dashboard");

  const { data: me, isLoading } = useSWR("me", () => getMe().catch(() => null), {
    shouldRetryOnError: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 size={20} className="animate-spin text-neutral-500" />
      </div>
    );
  }

  if (!me) {
    return <GateMessage title="로그인이 필요합니다" message="관리자 콘솔은 로그인 후 이용 가능합니다." />;
  }
  if (!me.is_admin) {
    return (
      <GateMessage
        title="관리자 권한이 필요합니다"
        message="현재 계정은 관리자가 아닙니다. 관리자에게 권한 부여를 요청하세요."
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-300px)] min-h-[640px]">
      {/* 사이드바 */}
      <aside className="flex w-60 flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <Link href="/" className="transition-opacity hover:opacity-80" title="홈으로">
            <LogoLockup size={20} />
          </Link>
          <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand">
            ADMIN
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-3 text-sm">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = section === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setSection(n.id)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-all ${
                  active
                    ? "bg-brand text-white"
                    : "text-neutral-700 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                <Icon size={14} />
                {n.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-neutral-200 px-4 py-3 text-xs text-neutral-500 dark:border-neutral-800">
          <p className="truncate font-medium text-neutral-700 dark:text-neutral-300">
            {me.name || me.email}
          </p>
          <p className="truncate text-[10px]">{me.email}</p>
          <Link
            href="/"
            className="mt-2 flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <ArrowLeft size={11} />
            워크스페이스로
          </Link>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-y-auto">
        <header className="border-b border-neutral-200 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-950">
          <h1 className="flex items-center gap-2 text-base font-semibold">
            {(() => {
              const cur = NAV.find((n) => n.id === section);
              if (!cur) return null;
              const Icon = cur.icon;
              return <Icon size={16} className="text-brand" />;
            })()}
            {NAV.find((n) => n.id === section)?.label}
          </h1>
        </header>

        <section className="p-6">
          {section === "dashboard" && <AdminDashboardSection />}
          {section === "users" && <AdminUsers />}
          {section === "organizations" && <AdminOrganizations />}
          {section === "prompts" && <AdminPrompts />}
          {section === "audit" && <AdminAuditLogs />}
          {section === "llm" && <AdminLLMSettings />}
        </section>
      </main>
    </div>
  );
}

function GateMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <Activity size={40} className="text-neutral-300" />
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{message}</p>
      <Link
        href="/"
        className="flex items-center gap-1 rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
      >
        <ArrowLeft size={14} />
        워크스페이스로 돌아가기
      </Link>
    </div>
  );
}
