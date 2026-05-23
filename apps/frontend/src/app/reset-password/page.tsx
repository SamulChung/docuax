"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

import { LogoLockup } from "@/components/Logo";
import { confirmPasswordReset } from "@/lib/api";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) {
      setErr("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (pw !== pw2) {
      setErr("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (!token) {
      setErr("재설정 토큰이 없습니다. 메일의 링크로 다시 접속하세요.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await confirmPasswordReset(token, pw);
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        <Check size={20} className="mb-2" />
        <p className="font-semibold">비밀번호가 변경되었습니다</p>
        <p className="mt-1 text-xs">새 비밀번호로 다시 로그인하세요.</p>
        <Link
          href="/"
          className="mt-3 inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          홈으로 가기
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
          새 비밀번호 (8자 이상)
        </span>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
          비밀번호 확인
        </span>
        <input
          type="password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
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
        disabled={busy || !pw || !pw2}
        className="flex w-full items-center justify-center gap-2 rounded bg-brand py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        비밀번호 변경
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs text-neutral-500 hover:text-brand"
        >
          <ArrowLeft size={12} />
          <LogoLockup size={20} />
        </Link>

        <h1 className="mt-8 text-2xl font-bold">새 비밀번호 설정</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          새 비밀번호를 입력해 주세요. 재설정 링크는 발급 후 30분간 유효합니다.
        </p>

      <Suspense fallback={<p className="mt-6 text-sm text-neutral-500">로딩…</p>}>
        <ResetForm />
      </Suspense>
    </div>
  );
}
