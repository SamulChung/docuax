"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { Activity, LogIn, LogOut, MessageCircle, ShieldCheck, User } from "lucide-react";

import { AuthModal } from "@/components/auth/AuthModal";
import { BrainDropdown } from "@/components/BrainDropdown";
import { LogoLockup } from "@/components/Logo";
import { UsageBadge } from "@/components/UsageBadge";
import { getHealth, getMe, logout } from "@/lib/api";
import { useChat } from "@/store/chat";
import { useWorkspace } from "@/store/workspace";

const PLAN_BADGE: Record<string, string> = {
  free: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  pro: "bg-brand/15 text-brand",
  team: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  enterprise: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

export function TopBar() {
  const { data: health } = useSWR("health", getHealth, { refreshInterval: 30000 });
  const { data: user, mutate: mutateMe } = useSWR("me", () => getMe().catch(() => null), {
    shouldRetryOnError: false,
  });
  const persona = useWorkspace((s) => s.persona);
  const togglePersona = useWorkspace((s) => s.togglePersona);
  const resetWorkspace = useWorkspace((s) => s.resetWorkspace);
  const autoConvert = useWorkspace((s) => s.autoConvert);
  const setAutoConvert = useWorkspace((s) => s.setAutoConvert);
  const sourceLen = useWorkspace((s) => s.source.length);
  const previewBlocks = useWorkspace((s) => s.preview?.blocks?.length ?? 0);
  const setChatExpanded = useChat((s) => s.setExpanded);
  const clearChat = useChat((s) => s.clear);
  const chatMsgCount = useChat((s) => s.messages.length);
  const [authOpen, setAuthOpen] = useState<null | "login" | "register">(null);
  const { mutate } = useSWRConfig();

  /**
   * 로고 클릭 → 첫화면 빈 상태로.
   * - 작업 중 내용이 있으면 confirm 으로 안전 확인
   * - 에디터·변환결과·선택·AI 채팅 대화까지 모두 초기화
   */
  const handleLogoClick = (e: React.MouseEvent) => {
    const hasContent = sourceLen > 5 || previewBlocks > 0 || chatMsgCount > 0;
    if (hasContent) {
      const ok = confirm(
        "첫화면으로 돌아가시겠습니까?\n에디터 본문·변환 결과·AI 채팅 대화가 모두 초기화됩니다.\n(변환 결과가 필요하시면 먼저 다운로드)",
      );
      if (!ok) {
        e.preventDefault();
        return;
      }
    }
    resetWorkspace();
    clearChat();
    // Link 의 기본 동작(href='/')은 그대로 진행 — 같은 페이지면 navigate 없이 상태만 초기화
  };

  // 인증 상태 변경 시 me·health 재조회
  useEffect(() => {
    const onChange = () => {
      mutateMe();
      mutate("health");
    };
    window.addEventListener("docuax:auth-changed", onChange);
    return () => window.removeEventListener("docuax:auth-changed", onChange);
  }, [mutateMe, mutate]);

  const handleLogout = async () => {
    await logout();
    mutateMe(null, { revalidate: false });
  };

  return (
    <>
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-end gap-3">
          <Link
            href="/"
            onClick={handleLogoClick}
            className="flex items-end gap-3 transition-opacity hover:opacity-80"
            title="첫화면으로 — 에디터·변환결과·AI 채팅 모두 초기화"
          >
            <LogoLockup size={28} />
            <span className="mb-[2px] text-[10px] uppercase tracking-wide text-neutral-500">
              마크다운을 한 번에 회사 문서로
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-4 text-xs">
          {/* 페르소나 모드 토글 */}
          <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 p-0.5 dark:border-neutral-700 dark:bg-neutral-900">
            <button
              onClick={() => persona !== "worker" && togglePersona()}
              className={`rounded-full px-3 py-1 transition-all ${
                persona === "worker"
                  ? "bg-brand text-white shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400"
              }`}
              title="Ctrl+Shift+M"
            >
              워커 모드
            </button>
            <button
              onClick={() => persona !== "heavy" && togglePersona()}
              className={`rounded-full px-3 py-1 transition-all ${
                persona === "heavy"
                  ? "bg-brand text-white shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400"
              }`}
            >
              헤비유저 모드
            </button>
          </div>

          {/* 두뇌 상태 + provider 즉시 전환 (admin 드롭다운) */}
          <BrainDropdown />

          {/* AI 채팅 확대 — 에디터 하단 dock 가 항상 떠있고, 이 버튼은 확장 모드 토글 */}
          <button
            onClick={() => setChatExpanded(true)}
            className="flex items-center gap-1 rounded-full border border-neutral-200 px-2.5 py-1 font-medium text-neutral-600 transition-all hover:border-brand hover:text-brand dark:border-neutral-700 dark:text-neutral-400"
            title="AI 채팅 확대 — 우측 패널로 띄우기"
          >
            <MessageCircle size={12} />
            AI 확대
          </button>

          <div className="flex items-center gap-1.5 text-neutral-500">
            <Activity size={12} />
            <span>매크로 {health?.macros.total ?? 0}/100</span>
          </div>

          {/* 일일 사용량 — 로그인 사용자에게만 노출 */}
          <UsageBadge />

          {/* 자동 변환 토글 */}
          <button
            onClick={() => setAutoConvert(!autoConvert)}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
              autoConvert
                ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"
                : "border-neutral-200 text-neutral-500 hover:border-brand hover:text-brand dark:border-neutral-700"
            }`}
            title={autoConvert ? "자동 변환 켜짐 — 입력 후 2.5초 자동 변환" : "자동 변환 꺼짐"}
          >
            {autoConvert ? "⚡ 자동" : "⚡ 수동"}
          </button>

          {/* 슬라이드 편집기 */}
          <Link
            href="/slides"
            className="text-neutral-600 hover:text-brand"
            title="슬라이드 편집기"
          >
            슬라이드
          </Link>

          {/* 배치 변환 */}
          <Link href="/batch" className="text-neutral-600 hover:text-brand" title="배치 변환">
            배치
          </Link>

          {/* 요금제 — 누구나 접근 */}
          <Link
            href="/pricing"
            className="text-neutral-600 hover:text-brand"
            title="요금제"
          >
            요금제
          </Link>

          {/* 관리자 진입 — is_admin 사용자만 노출 */}
          {user?.is_admin && (
            <Link
              href="/admin"
              className="flex items-center gap-1 rounded-full border border-brand/30 bg-brand/5 px-2.5 py-1 font-semibold text-brand transition-all hover:bg-brand/10"
              title="관리자 콘솔"
            >
              <ShieldCheck size={12} />
              관리자
            </Link>
          )}

          {/* 사용자 영역 */}
          {user ? (
            <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-2 py-0.5 dark:border-neutral-700 dark:bg-neutral-900">
              <User size={12} className="text-neutral-500" />
              <span className="max-w-[120px] truncate font-medium">{user.name || user.email}</span>
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${PLAN_BADGE[user.plan] ?? PLAN_BADGE.free}`}>
                {user.plan}
              </span>
              <button
                onClick={handleLogout}
                className="rounded p-0.5 text-neutral-400 hover:text-rose-600"
                title="로그아웃"
              >
                <LogOut size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAuthOpen("login")}
              className="flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1 font-medium hover:border-brand hover:text-brand dark:border-neutral-700"
            >
              <LogIn size={12} />
              로그인
            </button>
          )}
        </div>
      </header>

      {authOpen && (
        <AuthModal
          initialMode={authOpen}
          onClose={() => setAuthOpen(null)}
          onSuccess={() => {
            mutateMe();
            mutate("health");
          }}
        />
      )}
    </>
  );
}
