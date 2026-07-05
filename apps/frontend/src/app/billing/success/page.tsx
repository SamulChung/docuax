import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";

import { LogoLockup } from "@/components/Logo";

export const metadata = {
  title: "결제 완료 — DocuAI",
};

export default function BillingSuccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <Link href="/" className="absolute left-6 top-6">
        <LogoLockup size={24} />
      </Link>

      <div className="max-w-md rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-900 dark:bg-emerald-950/40">
        <CheckCircle2 size={56} className="mx-auto text-emerald-600" />
        <h1 className="mt-4 text-2xl font-bold">결제가 완료되었습니다</h1>
        <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
          DocuAI 프리미엄 기능이 즉시 활성화됩니다.
          <br />
          매크로 100종·RAG 양식 학습·우선 지원 등을 마음껏 사용해 보세요.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1 rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
        >
          워크스페이스로 가기
          <ArrowRight size={14} />
        </Link>
        <p className="mt-4 text-xs text-neutral-500">
          영수증은 등록한 이메일로 자동 발송됩니다.
        </p>
      </div>
    </div>
  );
}
