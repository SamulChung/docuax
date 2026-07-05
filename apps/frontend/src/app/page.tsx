"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthModal } from "@/components/auth/AuthModal";
import { LogoLockup } from "@/components/Logo";

export default function LandingPage() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-neutral-950">
      {/* 헤더 */}
      <header className="flex items-center justify-between border-b border-neutral-100 px-8 py-5 dark:border-neutral-800">
        <LogoLockup size={28} />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAuthMode("login")}
            className="rounded-md px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => setAuthMode("register")}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-soft"
          >
            지금 시작하기
          </button>
        </div>
      </header>

      {/* 히어로 */}
      <section className="flex flex-1 flex-col items-center justify-center px-4 pb-12 pt-20 text-center">
        <h1 className="mb-4 text-4xl font-bold leading-tight text-neutral-900 dark:text-white">
          공공기관, 기업의<br />문서 AI 자동화
        </h1>
        <p className="mb-8 max-w-md text-lg text-neutral-500 dark:text-neutral-400">
          AI 기반 문서 작성·변환·배포를 한 곳에서.
          <br />
          누구나 5분 안에 시작할 수 있습니다.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setAuthMode("register")}
            className="rounded-lg bg-brand px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-brand-soft"
          >
            무료로 시작하기
          </button>
          <button
            type="button"
            onClick={() => setAuthMode("login")}
            className="rounded-lg border border-neutral-200 px-6 py-3 text-base font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            로그인
          </button>
        </div>
      </section>

      {/* 스크린샷 프리뷰 */}
      <section className="flex justify-center px-4 pb-16">
        <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-neutral-200 shadow-2xl dark:border-neutral-700">
          {/* 브라우저 크롬 */}
          <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-100 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <div className="h-3 w-3 rounded-full bg-yellow-400" />
              <div className="h-3 w-3 rounded-full bg-green-400" />
            </div>
            <div className="mx-4 flex-1 rounded bg-white px-3 py-1 text-center text-xs text-neutral-400 dark:bg-neutral-700">
              guelzip.vercel.app/app
            </div>
          </div>
          {/* 앱 프리뷰 영역 */}
          <div className="flex h-72 items-center justify-center bg-neutral-50 dark:bg-neutral-900">
            <div className="text-center">
              <div className="mb-3 text-5xl">📄</div>
              <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                글집 — 문서 AI 워크스페이스
              </p>
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-600">
                가입 후 바로 사용해보세요
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 기능 칩 */}
      <section className="flex justify-center pb-16">
        <div className="flex flex-wrap justify-center gap-3 px-4">
          {[
            "✦ 역관목조분 프롬프트 빌더",
            "✦ 공문 원클릭 정돈",
            "✦ 세대별 톤 변환",
          ].map((label) => (
            <span
              key={label}
              className="rounded-full border border-brand/20 bg-brand/5 px-4 py-2 text-sm font-medium text-brand"
            >
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* 푸터 */}
      <footer className="flex items-center justify-between border-t border-neutral-100 px-8 py-6 text-xs text-neutral-400 dark:border-neutral-800">
        <span>© 2026 글집</span>
        <div className="flex gap-4">
          <a href="/terms" className="hover:text-neutral-600 hover:underline dark:hover:text-neutral-300">
            이용약관
          </a>
          <a href="/privacy" className="hover:text-neutral-600 hover:underline dark:hover:text-neutral-300">
            개인정보처리방침
          </a>
        </div>
      </footer>

      {/* 인증 모달 */}
      {authMode && (
        <AuthModal
          initialMode={authMode}
          onClose={() => setAuthMode(null)}
          onSuccess={() => router.push("/app")}
        />
      )}
    </div>
  );
}
