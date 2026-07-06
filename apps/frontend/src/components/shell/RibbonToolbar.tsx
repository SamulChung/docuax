"use client";

import {
  Bold, Italic, Underline, Strikethrough,
  Heading1, Heading2, Heading3, Pilcrow,
  List, ListOrdered, ListTree, Quote, Minus, Table, Link as LinkIcon,
  Sparkles, Presentation, Zap,
} from "lucide-react";

import { insertBlock, setHeadingLevel, toggleListMarker, wrapSelection } from "@/lib/editorCommands";
import { TABLE_3X3_MD } from "@/lib/commands";
import { performConvert } from "@/lib/convert";
import { dispatchAutoConvert } from "@/lib/events";
import { useWorkspace } from "@/store/workspace";

function RibbonButton({ title, onClick, children }: {
  title: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />;
}

export function RibbonToolbar() {
  const source = useWorkspace((s) => s.source);
  const setActiveTab = useWorkspace((s) => s.setActiveTab);
  const toggleOutline = useWorkspace((s) => s.toggleOutline);
  const busy = useWorkspace((s) => s.busy);

  const toSlides = () => {
    try { sessionStorage.setItem("docuax_slide_prefill", source); } catch {}
    setActiveTab("slides");
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-0.5 border-b border-neutral-200 bg-white px-2 py-1 dark:border-neutral-800 dark:bg-neutral-900">
      <RibbonButton title="목차" onClick={toggleOutline}><ListTree size={15} /></RibbonButton>
      <Divider />
      <RibbonButton title="제목 1" onClick={() => setHeadingLevel(1)}><Heading1 size={15} /></RibbonButton>
      <RibbonButton title="제목 2" onClick={() => setHeadingLevel(2)}><Heading2 size={15} /></RibbonButton>
      <RibbonButton title="제목 3" onClick={() => setHeadingLevel(3)}><Heading3 size={15} /></RibbonButton>
      <RibbonButton title="본문" onClick={() => setHeadingLevel(0)}><Pilcrow size={15} /></RibbonButton>
      <Divider />
      <RibbonButton title="굵게 (Ctrl+B)" onClick={() => wrapSelection("**")}><Bold size={15} /></RibbonButton>
      <RibbonButton title="기울임 (Ctrl+I)" onClick={() => wrapSelection("*")}><Italic size={15} /></RibbonButton>
      <RibbonButton title="밑줄 (Ctrl+U)" onClick={() => wrapSelection("<u>", "</u>")}><Underline size={15} /></RibbonButton>
      <RibbonButton title="취소선" onClick={() => wrapSelection("~~")}><Strikethrough size={15} /></RibbonButton>
      <Divider />
      <RibbonButton title="글머리 목록" onClick={() => toggleListMarker("- ")}><List size={15} /></RibbonButton>
      <RibbonButton title="번호 목록" onClick={() => toggleListMarker("1. ")}><ListOrdered size={15} /></RibbonButton>
      <RibbonButton title="인용" onClick={() => insertBlock("> 인용문")}><Quote size={15} /></RibbonButton>
      <RibbonButton title="구분선" onClick={() => insertBlock("---")}><Minus size={15} /></RibbonButton>
      <Divider />
      <RibbonButton title="표 삽입 (3×3)" onClick={() => insertBlock(TABLE_3X3_MD)}>
        <Table size={15} />
      </RibbonButton>
      <RibbonButton title="링크" onClick={() => wrapSelection("[", "](url)")}><LinkIcon size={15} /></RibbonButton>
      <Divider />
      <button
        onClick={() => dispatchAutoConvert()}
        disabled={busy}
        title="LLM 분석·검토 포함 정밀 변환 (Ctrl+Enter)"
        className="flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-300"
      >
        <Sparkles size={12} /> AI 변환·검토
      </button>
      <button
        onClick={() => void performConvert({ forceFast: true })}
        disabled={busy}
        title="LLM 분석·검토 생략 — 즉시 변환"
        className="flex items-center gap-1 rounded bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50 dark:bg-sky-950/40 dark:text-sky-300"
      >
        <Zap size={12} /> 한 번에 변환
      </button>
      <button
        onClick={toSlides}
        className="flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
      >
        <Presentation size={12} /> 슬라이드로 변환
      </button>
    </div>
  );
}
