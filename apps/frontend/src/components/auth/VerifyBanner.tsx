"use client";

import { useState } from "react";
import { Mail, X } from "lucide-react";
import { resendVerification } from "@/lib/api";

interface Props {
  emailVerified: boolean | undefined;
}

export function VerifyBanner({ emailVerified }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 인증 완료이거나 아직 로드 안 됐으면 표시 안 함
  if (emailVerified === true || emailVerified === undefined || dismissed) return null;

  const handleResend = async () => {
    setSending(true);
    setError(null);
    try {
      await resendVerification();
      setSent(true);
    } catch {
      setError("재발송 실패. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="no-print flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <Mail size={14} className="shrink-0" />
      <span className="flex-1">
        이메일 인증을 완료해 주세요.{" "}
        {!sent ? (
          <button
            onClick={handleResend}
            disabled={sending}
            className="font-semibold underline hover:no-underline disabled:opacity-50"
          >
            {sending ? "발송 중…" : "인증 메일 재발송"}
          </button>
        ) : (
          <span className="font-semibold">발송했습니다. 메일함을 확인해 주세요.</span>
        )}
        {error && <span className="ml-2 text-red-600 dark:text-red-400">{error}</span>}
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900"
        aria-label="닫기"
      >
        <X size={14} />
      </button>
    </div>
  );
}
