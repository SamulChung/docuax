"use client";

import { useEffect, useState } from "react";
import { Loader2, LogIn, UserPlus, X } from "lucide-react";

import { login, register } from "@/lib/api";

type Mode = "login" | "register";

interface Props {
  initialMode?: Mode;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AuthModal({ initialMode = "login", onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "register" && (!agreeTerms || !agreePrivacy)) {
      setError("이용약관과 개인정보처리방침에 모두 동의해야 가입할 수 있습니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
      onSuccess?.();
      onClose();
    } catch (e) {
      const m = (e as Error).message;
      if (m.includes("401")) setError("이메일 또는 비밀번호가 잘못되었습니다");
      else if (m.includes("409")) setError("이미 가입된 이메일입니다");
      else if (m.includes("422")) setError("비밀번호는 8자 이상이어야 합니다");
      else setError(m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-[400px] rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold">
            {mode === "register" ? "회원가입" : "로그인"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          {mode === "register" && (
            <div>
              <label className="mb-1 block text-[11px] text-neutral-600 dark:text-neutral-400">이름 (선택)</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[11px] text-neutral-600 dark:text-neutral-400">이메일</label>
            <input
              type="email"
              value={email}
              required
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-neutral-600 dark:text-neutral-400">
              비밀번호 {mode === "register" && "(8자 이상)"}
            </label>
            <input
              type="password"
              value={password}
              required
              minLength={mode === "register" ? 8 : 1}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
            />
          </div>
        </div>

        {mode === "register" && (
          <div className="mt-3 space-y-1.5 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs dark:border-neutral-700 dark:bg-neutral-900">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <a href="/terms" target="_blank" rel="noopener" className="font-semibold text-brand hover:underline">
                  이용약관
                </a>
                에 동의합니다 <span className="text-rose-600">(필수)</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={agreePrivacy}
                onChange={(e) => setAgreePrivacy(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <a href="/privacy" target="_blank" rel="noopener" className="font-semibold text-brand hover:underline">
                  개인정보처리방침
                </a>
                에 동의합니다 <span className="text-rose-600">(필수)</span>
              </span>
            </label>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !email || !password || (mode === "register" && (!agreeTerms || !agreePrivacy))}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-brand py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-soft disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {mode === "register" ? (
            <><UserPlus size={14} /> 가입하기</>
          ) : (
            <><LogIn size={14} /> 로그인</>
          )}
        </button>

        <div className="mt-3 text-center text-xs text-neutral-500">
          {mode === "register" ? (
            <>
              이미 계정이 있으신가요?{" "}
              <button
                type="button"
                onClick={() => { setMode("login"); setError(null); }}
                className="text-brand hover:underline"
              >
                로그인
              </button>
            </>
          ) : (
            <>
              <a
                href="/forgot-password"
                className="mb-2 block text-neutral-500 hover:text-brand"
              >
                비밀번호를 잊으셨나요?
              </a>
              계정이 없으신가요?{" "}
              <button
                type="button"
                onClick={() => { setMode("register"); setError(null); }}
                className="text-brand hover:underline"
              >
                회원가입
              </button>
            </>
          )}
        </div>

        <div className="mt-3 text-center text-[10px] text-neutral-400">
          ⓘ 비밀번호는 bcrypt로 안전하게 해시되어 저장됩니다.
        </div>
      </form>
    </div>
  );
}
