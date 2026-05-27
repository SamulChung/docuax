"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

const _apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";
const BASE = _apiBase ? `${_apiBase}/api/v1` : "/api/v1";

type Status = "loading" | "success" | "error";

function VerifyEmailContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("인증 토큰이 없습니다.");
      return;
    }
    fetch(`${BASE}/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        let data: { message?: string; detail?: string } = {};
        try {
          data = await res.json();
        } catch {
          setStatus("error");
          setMessage(`인증 응답을 처리할 수 없습니다. (HTTP ${res.status})`);
          return;
        }
        if (res.ok) {
          setStatus("success");
          setMessage(data.message ?? "이메일 인증이 완료되었습니다.");
        } else {
          setStatus("error");
          setMessage(data.detail ?? "인증에 실패했습니다.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("서버 연결에 실패했습니다.");
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 text-center">
        {status === "loading" && (
          <>
            <Loader2 size={40} className="mx-auto mb-4 animate-spin text-brand" />
            <p className="text-sm text-neutral-600 dark:text-neutral-400">인증 처리 중…</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle size={40} className="mx-auto mb-4 text-green-500" />
            <h2 className="mb-2 text-base font-bold">인증 완료!</h2>
            <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">{message}</p>
            <button
              onClick={() => router.push("/app")}
              className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-soft"
            >
              앱으로 이동
            </button>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle size={40} className="mx-auto mb-4 text-red-500" />
            <h2 className="mb-2 text-base font-bold">인증 실패</h2>
            <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">{message}</p>
            <button
              onClick={() => router.push("/app")}
              className="rounded-md bg-neutral-200 px-6 py-2 text-sm font-semibold hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            >
              홈으로 이동
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
          <Loader2 size={40} className="animate-spin text-brand" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
