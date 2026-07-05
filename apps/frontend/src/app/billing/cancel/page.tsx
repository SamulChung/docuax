import Link from "next/link";
import { XCircle, ArrowLeft } from "lucide-react";

import { LogoLockup } from "@/components/Logo";

export const metadata = {
  title: "결제 취소 — 글집",
};

export default function BillingCancelPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <Link href="/" className="absolute left-6 top-6">
        <LogoLockup size={24} />
      </Link>

      <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <XCircle size={56} className="mx-auto text-neutral-400" />
        <h1 className="mt-4 text-2xl font-bold">결제가 취소되었습니다</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          결제는 완료되지 않았으며, 어떤 금액도 청구되지 않았습니다.
          <br />
          언제든 다시 시도하실 수 있습니다.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Link
            href="/pricing"
            className="rounded border border-neutral-200 px-4 py-2 text-sm font-semibold hover:border-brand hover:text-brand dark:border-neutral-700"
          >
            요금제 다시 보기
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1 rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
          >
            <ArrowLeft size={14} />
            워크스페이스
          </Link>
        </div>
      </div>
    </div>
  );
}
