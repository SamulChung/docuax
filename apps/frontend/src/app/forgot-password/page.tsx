"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Mail } from "lucide-react";

import { LogoLockup } from "@/components/Logo";
import { requestPasswordReset } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-6 py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs text-neutral-500 hover:text-brand"
        >
          <ArrowLeft size={12} />
          <LogoLockup size={20} />
        </Link>

        <h1 className="mt-8 text-2xl font-bold">비밀번호 재설정</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          가입한 이메일을 입력하시면 재설정 링크를 보내드립니다.
        </p>

        {sent ? (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Mail size={16} className="mb-2" />
            <p className="font-semibold">메일을 발송했습니다</p>
            <p className="mt-1 text-xs">
              <span className="font-mono">{email}</span> 으로 비밀번호 재설정 링크를 보냈습니다.
              메일이 30분 이내에 도착하지 않으면 스팸함을 확인하세요.
            </p>
            <Link
              href="/"
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold underline"
            >
              <ArrowLeft size={11} /> 홈으로
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                이메일
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="email@example.com"
                className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>

            {err && (
              <p className="rounded bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                {err}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !email}
              className="flex w-full items-center justify-center gap-2 rounded bg-brand py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              재설정 링크 받기
            </button>

            <p className="text-center text-xs text-neutral-500">
              <Link href="/" className="hover:text-brand">로그인 화면으로 돌아가기</Link>
            </p>
          </form>
        )}
    </div>
  );
}
