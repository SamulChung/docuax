"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { Check, ChevronDown, Lock } from "lucide-react";

import { KeySetupHint } from "@/components/chat/KeySetupHint";
import { listProviders } from "@/lib/api";
import { sortProviders } from "@/lib/providerOrder";
import type { ProviderChoice } from "@/store/chat";

interface Props {
  /** 현재 선택된 provider — "auto" 또는 특정 id */
  value: ProviderChoice;
  /** 변경 콜백 */
  onChange: (v: ProviderChoice) => void;
  /** 압축(dock) 또는 일반(panel) 크기 */
  size?: "sm" | "md";
}

/**
 * Provider 선택 드롭다운 — Portal 렌더링으로 부모 overflow:hidden 에 잘리지 않음.
 *
 * - 닫힌 칩: 현재 선택된 provider 한 줄 (예: "🚀 TenOS ▼")
 * - 열린 메뉴: document.body 에 fixed 로 렌더 → ChatDock·Editor·Workspace 등의
 *   overflow-hidden 컨테이너를 모두 무시하고 화면 위에 자유롭게 표시
 * - 위/아래 공간 비교해 자동 방향, 화면 벗어나면 자체 max-height + 스크롤
 *
 * 박사님 의도: 활성화된 것이 앞에 보이고, 나머지는 드롭다운으로 펼쳐서 선택.
 */
export function ProviderSelector({ value, onChange, size = "sm" }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // SSR 안전: client 에서만 portal 렌더
  const [hint, setHint] = useState<{ id: string; name: string } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number; placement: "below" | "above" }>(
    { top: 0, right: 0, placement: "below" },
  );

  const { data: providersData } = useSWR("providers", listProviders, {
    refreshInterval: 30000,
  });
  const sorted = providersData ? sortProviders(providersData.items) : [];

  // client mount 후에만 portal 렌더
  useEffect(() => {
    setMounted(true);
  }, []);

  // 열릴 때 trigger 기준 위치 계산
  const recompute = () => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const menuH = 320; // 추정 — 자체 스크롤로 조정됨
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const placement: "below" | "above" =
      spaceBelow >= menuH || spaceBelow >= spaceAbove ? "below" : "above";
    setPos({
      top: placement === "below" ? r.bottom + 4 : r.top - 4,
      right: window.innerWidth - r.right,
      placement,
    });
  };

  useLayoutEffect(() => {
    if (open) recompute();
  }, [open]);

  // 외부 클릭·스크롤·리사이즈로 닫기
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    window.addEventListener("mousedown", onClick);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", recompute);
    };
  }, [open]);

  // 현재 선택 항목의 라벨/이모지 (닫힌 칩 표시)
  let currentEmoji = "⚙";
  let currentLabel = "자동";
  if (value !== "auto") {
    const p = sorted.find((x) => x.id === value);
    if (p) {
      currentEmoji = p.emoji;
      currentLabel = compactName(p.id, p.name);
    } else {
      currentLabel = value;
    }
  }

  const triggerCls =
    size === "sm"
      ? "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-brand text-white px-2 py-0.5 text-[10px] font-semibold hover:bg-brand/90"
      : "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-brand text-white px-2.5 py-1 text-xs font-semibold hover:bg-brand/90";

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className={triggerCls}
        title="AI 모델 선택"
      >
        <span>{currentEmoji}</span>
        <span>{currentLabel}</span>
        <ChevronDown size={size === "sm" ? 10 : 12} className="opacity-80" />
      </button>

      {/* Portal — body 에 렌더 → 어떤 overflow-hidden 컨테이너도 escape */}
      {mounted && open
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[100] flex w-56 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
              style={{
                top: pos.placement === "below" ? pos.top : undefined,
                bottom:
                  pos.placement === "above"
                    ? typeof window !== "undefined"
                      ? window.innerHeight - pos.top
                      : 0
                    : undefined,
                right: pos.right,
                maxHeight: "min(70vh, 480px)",
              }}
            >
              <div className="shrink-0 border-b border-neutral-200 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                AI 모델 선택
              </div>
              <div className="overflow-y-auto py-1">
                {/* "자동" — 항상 첫 번째 */}
                <Row
                  emoji="⚙"
                  name="자동"
                  tagline="현재 활성 provider 사용"
                  active={value === "auto"}
                  disabled={false}
                  onClick={() => {
                    onChange("auto");
                    setOpen(false);
                  }}
                />
                {sorted.map((p) => {
                  const id = p.id as ProviderChoice;
                  const active = value === id;
                  const disabled = !p.configured;
                  return (
                    <Row
                      key={p.id}
                      emoji={p.emoji}
                      name={compactName(p.id, p.name)}
                      tagline={disabled ? p.reason : p.tagline}
                      active={active}
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) {
                          // alert 대신 친화적 안내 모달로
                          setHint({ id: p.id, name: p.name });
                          setOpen(false);
                          return;
                        }
                        onChange(id);
                        setOpen(false);
                      }}
                    />
                  );
                })}
              </div>
              <div className="shrink-0 border-t border-neutral-200 bg-neutral-50 px-2.5 py-2 text-[10px] dark:border-neutral-800 dark:bg-neutral-950">
                <p className="mb-1.5 font-semibold text-neutral-600 dark:text-neutral-400">
                  본인 API 키 등록 (BYOK)
                </p>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setHint({ id: "openai", name: "GPT (OpenAI)" });
                      setOpen(false);
                    }}
                    className="flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-700 hover:border-brand hover:text-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                    title="OpenAI(GPT) API 키 등록 — 본인 계정에서 청구"
                  >
                    + 내 GPT 키 등록
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHint({ id: "anthropic", name: "Claude (Anthropic)" });
                      setOpen(false);
                    }}
                    className="flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-700 hover:border-brand hover:text-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                    title="Anthropic(Claude) API 키 등록 — 본인 계정에서 청구"
                  >
                    + 내 Claude 키 등록
                  </button>
                </div>
                <p className="mt-1.5 text-[9px] text-neutral-500">
                  🔒 = 키 미설정 · 자물쇠 항목을 클릭해도 동일한 등록 절차로 진입합니다.
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* 키 등록 안내 모달 — alert 대신 친화적 절차 안내 */}
      {hint && (
        <KeySetupHint
          providerId={hint.id as "openai" | "anthropic" | "tenos" | "tenos_hf" | "mock" | "chain"}
          providerName={hint.name}
          onClose={() => setHint(null)}
        />
      )}
    </>
  );
}

function Row({
  emoji,
  name,
  tagline,
  active,
  disabled,
  onClick,
}: {
  emoji: string;
  name: string;
  tagline: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
        active ? "bg-brand/5" : ""
      } ${disabled ? "opacity-70" : ""}`}
    >
      <span className="text-sm">{emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 whitespace-nowrap font-semibold">
          {name}
          {disabled && <Lock size={9} className="opacity-60" />}
        </p>
        <p className="truncate text-[9px] text-neutral-500">{tagline}</p>
      </div>
      {active && <Check size={11} className="shrink-0 text-brand" />}
    </button>
  );
}

/** 좁은 dock 용 라벨 축약. */
function compactName(id: string, fullName: string): string {
  switch (id) {
    case "tenos":
      return "TenOS";
    case "tenos_hf":
      return "TenOS·HF";
    case "openai":
      return "GPT";
    default:
      return fullName;
  }
}
