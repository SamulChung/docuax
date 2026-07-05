"use client";

import { useEffect, useState } from "react";
import { Loader2, LogIn, UserPlus, X } from "lucide-react";

import { login, register } from "@/lib/api";
import { PasswordStrength } from "./PasswordStrength";

type Mode = "login" | "register";

interface Props {
  initialMode?: Mode;
  onClose: () => void;
  onSuccess?: () => void;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function AuthModal({ initialMode = "login", onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
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

  // 모드 전환 시 에러 초기화
  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setEmailError(null);
    setPassword("");
    setPasswordConfirm("");
  };

  const handleEmailBlur = () => {
    if (email && !EMAIL_RE.test(email)) {
      setEmailError("올바른 이메일 형식이 아닙니다");
    } else {
      setEmailError(null);
    }
  };

  const passwordMismatch =
    mode === "register" && passwordConfirm.length > 0 && password !== passwordConfirm;

  const canSubmit =
    !busy &&
    email.length > 0 &&
    EMAIL_RE.test(email) &&
    password.length >= (mode === "register" ? 8 : 1) &&
    (mode === "login" || (password === passwordConfirm && agreeTerms && agreePrivacy));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
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
      onClick={busy ? undefined : onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-[400px] rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        {/* 헤더 */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold">
            {mode === "register" ? "회원가입" : "로그인"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={16} />
          </button>
        </div>

        {/* 폼 필드 */}
        <div className="space-y-3">
          {mode === "register" && (
            <div>
              <label htmlFor="auth-name" className="mb-1 block text-[11px] text-neutral-600 dark:text-neutral-400">이름 (선택)</label>
              <input
                id="auth-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
              />
            </div>
          )}
          <div>
            <label htmlFor="auth-email" className="mb-1 block text-[11px] text-neutral-600 dark:text-neutral-400">이메일</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              required
              autoComplete="email"
              onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
              onBlur={handleEmailBlur}
              placeholder="you@company.com"
              className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none dark:bg-neutral-950 ${
                emailError
                  ? "border-red-400 focus:border-red-500"
                  : "border-neutral-200 focus:border-brand dark:border-neutral-700"
              }`}
            />
            {emailError && (
              <p className="mt-0.5 text-[10px] text-red-500">{emailError}</p>
            )}
          </div>
          <div>
            <label htmlFor="auth-password" className="mb-1 block text-[11px] text-neutral-600 dark:text-neutral-400">
              비밀번호 {mode === "register" && "(8자 이상)"}
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              required
              minLength={mode === "register" ? 8 : 1}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
            />
            {mode === "register" && <PasswordStrength password={password} />}
          </div>
          {mode === "register" && (
            <div>
              <label htmlFor="auth-password-confirm" className="mb-1 block text-[11px] text-neutral-600 dark:text-neutral-400">비밀번호 확인</label>
              <input
                id="auth-password-confirm"
                type="password"
                value={passwordConfirm}
                required
                autoComplete="new-password"
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none dark:bg-neutral-950 ${
                  passwordMismatch
                    ? "border-red-400 focus:border-red-500"
                    : "border-neutral-200 focus:border-brand dark:border-neutral-700"
                }`}
              />
              {passwordMismatch && (
                <p className="mt-0.5 text-[10px] text-red-500">비밀번호가 일치하지 않습니다</p>
              )}
            </div>
          )}
        </div>

        {/* 약관 동의 */}
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

        {/* 에러 */}
        {error && (
          <div className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* 제출 버튼 */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-brand py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-soft disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {mode === "register" ? (
            <><UserPlus size={14} /> {busy ? "가입 중…" : "가입하기"}</>
          ) : (
            <><LogIn size={14} /> {busy ? "로그인 중…" : "로그인"}</>
          )}
        </button>

        {/* 모드 전환 링크 */}
        <div className="mt-3 text-center text-xs text-neutral-500">
          {mode === "register" ? (
            <>
              이미 계정이 있으신가요?{" "}
              <button
                type="button"
                onClick={() => switchMode("login")}
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
                onClick={() => switchMode("register")}
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
