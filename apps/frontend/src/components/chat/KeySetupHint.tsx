"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";

import {
  deleteMyApiKey,
  getMe,
  listMyApiKeys,
  setMyApiKey,
  type MyApiKey,
} from "@/lib/api";
import { useChat } from "@/store/chat";

interface Props {
  /** 안내할 provider id */
  providerId: "openai" | "anthropic" | "tenos" | "tenos_hf" | "mock" | "chain";
  /** 사람이 읽는 이름 (예: "Claude") */
  providerName: string;
  /** 닫기 */
  onClose: () => void;
}

interface GuideEntry {
  /** API 키 발급 사이트 */
  consoleUrl: string;
  consoleLabel: string;
  /** .env 또는 관리자 설정의 변수명 */
  envKey: string;
  /** 키 가격·정책 안내 */
  pricingNote: string;
  /** 가입·발급 단계 */
  steps: string[];
}

const GUIDES: Record<string, GuideEntry> = {
  anthropic: {
    consoleUrl: "https://console.anthropic.com/settings/keys",
    consoleLabel: "Anthropic Console",
    envKey: "ANTHROPIC_API_KEY",
    pricingNote: "Claude Sonnet 4.5: 입력 $3 / 출력 $15 per 1M 토큰. 신규 가입 시 $5 무료 크레딧.",
    steps: [
      "Anthropic Console 에서 가입 (회사 이메일 권장)",
      "결제 카드 등록 + $5~$20 선충전",
      "Settings → API Keys → Create Key 클릭",
      "발급된 sk-ant-... 키를 복사해 아래 [관리자 콘솔]에 등록",
    ],
  },
  openai: {
    consoleUrl: "https://platform.openai.com/api-keys",
    consoleLabel: "OpenAI Platform",
    envKey: "OPENAI_API_KEY",
    pricingNote: "GPT-4o-mini: 입력 $0.15 / 출력 $0.60 per 1M 토큰. 무료 크레딧은 신규 계정만.",
    steps: [
      "OpenAI Platform 에서 가입",
      "Billing → Add payment method 로 결제수단 등록",
      "API keys → Create new secret key",
      "발급된 sk-... 키를 복사해 아래 [관리자 콘솔]에 등록",
    ],
  },
  tenos: {
    consoleUrl: "https://www.tenai.kr/contact",
    consoleLabel: "(주)텐에이아이 문의",
    envKey: "TENOS_BASE_URL · TENOS_MODEL",
    pricingNote: "자체 호스팅 — (주)텐에이아이 에서 vLLM 서빙 인프라 제공. 망분리 패키지 가능.",
    steps: [
      "(주)텐에이아이 영업팀에 도입 문의 (sales@tenai.kr)",
      "vLLM 서빙 URL · 모델 ID 발급",
      "관리자 콘솔의 TenOS 항목에 URL·모델 입력",
    ],
  },
};

export function KeySetupHint({ providerId, providerName, onClose }: Props) {
  const { data: me } = useSWR("me", () => getMe().catch(() => null), {
    shouldRetryOnError: false,
  });
  const isAdmin = Boolean(me?.is_admin);
  const guide = GUIDES[providerId];
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText("admin@docuax.com");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Key size={16} className="text-brand" />
            <h2 className="text-sm font-semibold">{providerName} API 키 등록</h2>
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              미설정
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title="닫기 (Esc)"
          >
            <X size={14} />
          </button>
        </div>

        {/* 본문 */}
        <div className="space-y-3 px-5 py-4 text-sm">
          {/* BYOK — 본인 키 등록 (openai/anthropic 만 지원). 로그인 필수. */}
          {me && (providerId === "openai" || providerId === "anthropic") && (
            <MyKeyForm
              providerId={providerId}
              providerName={providerName}
              keyPrefix={providerId === "anthropic" ? "sk-ant-" : "sk-"}
            />
          )}

          {!guide ? (
            <p className="text-neutral-600 dark:text-neutral-400">
              {providerName} 사용 안내는 곧 추가됩니다. 자세한 내용은 관리자에게 문의하세요.
            </p>
          ) : isAdmin ? (
            <>
              {/* 관리자용 안내 */}
              <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <p className="flex items-center gap-1 font-semibold">
                  <ShieldCheck size={12} />
                  관리자로 로그인되어 있습니다.
                </p>
                <p className="mt-1">아래 절차로 직접 키를 발급·등록할 수 있습니다.</p>
              </div>

              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                  키 발급 단계
                </p>
                <ol className="list-decimal space-y-1 pl-5 text-xs text-neutral-700 dark:text-neutral-300">
                  {guide.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>

              <div className="rounded border border-neutral-200 bg-neutral-50 p-2.5 text-[11px] dark:border-neutral-800 dark:bg-neutral-950">
                <p className="font-semibold">참고 가격</p>
                <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">
                  {guide.pricingNote}
                </p>
                <p className="mt-1.5 text-neutral-500">
                  환경변수: <code className="font-mono">{guide.envKey}</code>
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <a
                  href={guide.consoleUrl}
                  target="_blank"
                  rel="noopener"
                  className="flex flex-1 items-center justify-center gap-1 rounded border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold hover:border-brand hover:text-brand dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <ExternalLink size={12} />
                  {guide.consoleLabel} 열기
                </a>
                <Link
                  href="/admin"
                  onClick={onClose}
                  className="flex flex-1 items-center justify-center gap-1 rounded bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand/90"
                >
                  관리자 콘솔로 가기
                  <ArrowRight size={12} />
                </Link>
              </div>
              <p className="text-center text-[10px] text-neutral-400">
                관리자 콘솔 → LLM 설정 → {guide.envKey} 입력 → 저장
              </p>
            </>
          ) : (
            <>
              {/* 일반 사용자용 안내 */}
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <p className="flex items-center gap-1 font-semibold">
                  <AlertCircle size={12} />
                  관리자만 LLM 키를 등록할 수 있습니다.
                </p>
                <p className="mt-1">
                  현재 글집 는 회사·기관 단위로 운영됩니다 — 외부 LLM(Claude·ChatGPT) 키는
                  운영자(관리자)가 등록·관리합니다.
                </p>
              </div>

              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                  당장은 어떻게?
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs text-neutral-700 dark:text-neutral-300">
                  <li>
                    기본 (자동·TenOS) provider 로 계속 사용 — 한국어 문서 작업엔 충분합니다.
                  </li>
                  <li>
                    {providerName} 를 꼭 쓰고 싶다면 관리자에게 키 등록을 요청하세요.
                  </li>
                </ul>
              </div>

              <div className="rounded border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
                <p className="text-xs font-semibold">관리자에게 요청 메시지</p>
                <textarea
                  readOnly
                  rows={3}
                  value={`안녕하세요. 글집 에서 ${providerName} 모델을 사용하고 싶습니다.\n` +
                    `관리자 콘솔 → LLM 설정에서 ${guide.envKey} 등록을 부탁드립니다.`}
                  className="mt-1.5 w-full resize-none rounded border border-neutral-200 bg-white p-2 text-[11px] dark:border-neutral-700 dark:bg-neutral-900"
                />
                <button
                  onClick={handleCopyEmail}
                  className="mt-2 flex items-center gap-1 rounded bg-brand px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand/90"
                >
                  {copied ? <Check size={12} /> : <Mail size={12} />}
                  {copied ? "admin@docuax.com 복사됨" : "관리자 이메일 복사"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** BYOK — 본인 키 등록·삭제 폼. 로그인 사용자에게 표시. */
function MyKeyForm({
  providerId,
  providerName,
  keyPrefix,
}: {
  providerId: "openai" | "anthropic";
  providerName: string;
  keyPrefix: string;
}) {
  const { data: keys = [], mutate } = useSWR<MyApiKey[]>("my-api-keys", listMyApiKeys);
  const { mutate: globalMutate } = useSWRConfig();
  const existing = keys.find((k) => k.provider === providerId);

  const [input, setInput] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedLast4, setSavedLast4] = useState<string | null>(null);

  const onSubmit = async () => {
    const key = input.trim();
    if (!key) return;
    if (!key.startsWith(keyPrefix)) {
      setErr(`${providerName} 키는 ${keyPrefix} 로 시작해야 합니다.`);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await setMyApiKey(providerId, key);
      setInput("");
      setSavedLast4(r.last_4);
      // providers 캐시 갱신 — 드롭다운에 즉시 자물쇠 해제 반영
      await Promise.all([mutate(), globalMutate("providers")]);
      // ✨ 키 등록 성공 → 채팅 store 의 활성 provider 를 그 provider 로 자동 전환
      // 사용자가 명시적으로 등록했다는 건 그것을 쓰겠다는 의도. "자동" 상태에서도
      // 즉시 GPT/Claude 가 사용되도록.
      if (providerId === "openai" || providerId === "anthropic") {
        useChat.setState({ provider: providerId });
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m.includes("400")) setErr(m.replace(/^400:\s*/, ""));
      else setErr(m);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!confirm(`등록된 ${providerName} 키를 삭제할까요?`)) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteMyApiKey(providerId);
      setSavedLast4(null);
      await Promise.all([mutate(), globalMutate("providers")]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-brand/30 bg-brand/5 p-3">
      <p className="flex items-center gap-1 text-xs font-semibold text-brand">
        <UserCheck size={12} />
        본인 키로 즉시 사용하기 (BYOK)
      </p>
      <p className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400">
        본인의 {providerName} API 키를 직접 등록하면 즉시 사용할 수 있습니다. 호출 비용은 본인 계정에서 청구됩니다 ·
        키는 암호화 저장되며 마지막 4자리만 표시됩니다.
      </p>

      {existing || savedLast4 ? (
        <div className="mt-2 flex items-center justify-between rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs dark:border-emerald-900 dark:bg-emerald-950/40">
          <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
            <Check size={11} />
            <span className="font-semibold">{providerName}</span>
            <span className="font-mono text-[10px]">
              {keyPrefix}…{savedLast4 ?? existing?.last_4}
            </span>
            <span className="text-[10px] text-emerald-600">— 등록됨, 사용 중</span>
          </span>
          <button
            onClick={onDelete}
            disabled={busy}
            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-950/40"
            title="등록한 키 삭제"
          >
            {busy ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
            삭제
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-1">
            <input
              type={show ? "text" : "password"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`${keyPrefix}xxxxxxxxxxxx`}
              autoComplete="off"
              spellCheck={false}
              className="flex-1 rounded border border-neutral-200 bg-white px-2 py-1.5 font-mono text-[11px] focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              title={show ? "감추기" : "보이기"}
            >
              {show ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
            <button
              onClick={onSubmit}
              disabled={busy || !input.trim()}
              className="flex items-center gap-1 rounded bg-brand px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Key size={11} />}
              등록
            </button>
          </div>
          {err && (
            <p className="rounded bg-rose-50 px-2 py-1 text-[10px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {err}
            </p>
          )}
          <p className="text-[10px] text-neutral-500">
            키는 입력 즉시 Fernet 으로 암호화되어 저장됩니다. 평문은 저장·로그에 남지 않습니다.
          </p>
        </div>
      )}
    </div>
  );
}
