"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  editBlock,
  editCell,
} from "@/lib/api";
import type {
  ConvertPreview,
  CoverPayload,
  InlineRunPayload,
  PreviewBlock,
  ReviewTag,
  TableCellPayload,
} from "@/lib/api";
import { useWorkspace } from "@/store/workspace";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";


/**
 * 선택한 블록들을 AI 채팅창에 컨텍스트로 주입.
 * - 채팅창을 확장 모드로 열고
 * - 입력창에 "다음 블록(들)을 검토해주세요:" 프리셋
 * - 시스템 프롬프트에는 이미 selected_block_ids 가 자동 전달됨 (store/chat.ts)
 */
function askAiAboutSelected(blockIds: string[], preview: ConvertPreview | null): void {
  if (!preview || blockIds.length === 0) return;
  const blocks = preview.blocks.filter((b) => blockIds.includes(b.id));
  const lines = blocks.map((b) => {
    const text = (b.text || "").trim();
    const snippet = text.length > 200 ? text.slice(0, 200) + "…" : text;
    return `• ${b.id} (${b.type}): ${snippet}`;
  });
  const prefill =
    blocks.length === 1
      ? `다음 블록을 검토해주세요:\n${lines.join("\n")}\n\n어떻게 다듬으면 좋을까요?`
      : `다음 ${blocks.length}개 블록을 함께 검토해주세요:\n${lines.join("\n")}\n\n전체적으로 어떻게 개선하면 좋을까요?`;
  // 입력란 prefill 만 — 작은 ChatDock 에 텍스트가 채워짐.
  // 확대(ChatPanel)는 박사님이 명시적으로 ⤢ 클릭할 때만 노출.
  const evt = new CustomEvent("docuax:chat-prefill", { detail: { text: prefill } });
  window.dispatchEvent(evt);
}

// ─────────────────────────────────────────────────────────────────────────
// 표지(Cover) 페이지 — 5종 템플릿 디자인 미리보기
// ─────────────────────────────────────────────────────────────────────────
function CoverPage({ cover }: { cover: CoverPayload }) {
  const template = cover.template || "modern";
  switch (template) {
    case "classic":       return <CoverClassic cover={cover} />;
    case "gongmun":       return <CoverGongmun cover={cover} />;
    case "proposal":      return <CoverProposal cover={cover} />;
    case "research":      return <CoverResearch cover={cover} />;
    case "executive":     return <CoverExecutive cover={cover} />;
    case "annual_report": return <CoverAnnual cover={cover} />;
    case "government":    return <CoverGovernment cover={cover} />;
    case "whitepaper":    return <CoverWhitepaper cover={cover} />;
    case "minimal":       return <CoverMinimal cover={cover} />;
    default:              return <CoverModern cover={cover} />;
  }
}

function CoverLabel({ template }: { template: string }) {
  return (
    <div className="absolute right-3 top-3 z-10 rounded-full bg-brand/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow">
      {template} 표지
    </div>
  );
}

// MODERN — 상단 컬러 밴드 + 큰 제목
function CoverModern({ cover }: { cover: CoverPayload }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-md dark:border-neutral-700">
      <CoverLabel template="modern" />
      <div className="relative h-32 bg-gradient-to-br from-brand to-blue-500 px-6 py-4">
        {cover.organization && (
          <div className="absolute bottom-3 left-6 text-base font-bold text-white">{cover.organization}</div>
        )}
        {cover.classification && (
          <div className="absolute right-4 top-4 inline-block border-2 border-white bg-white/90 px-2 py-0.5 text-[10px] font-bold text-rose-700">
            {cover.classification}
          </div>
        )}
      </div>
      <div className="px-6 pb-6 pt-8">
        {cover.title && <h1 className="mb-3 text-3xl font-extrabold text-neutral-900 dark:text-neutral-100">{cover.title}</h1>}
        {cover.subtitle && <div className="mb-8 text-base text-neutral-600 dark:text-neutral-400">{cover.subtitle}</div>}
        <div className="space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
          {cover.author && <div><span className="mr-3 inline-block w-16 font-bold text-brand">작성자</span>{cover.author}</div>}
          {cover.department && <div><span className="mr-3 inline-block w-16 font-bold text-brand">부서</span>{cover.department}</div>}
          {cover.date && <div><span className="mr-3 inline-block w-16 font-bold text-brand">작성일자</span>{cover.date}</div>}
          {cover.document_number && <div><span className="mr-3 inline-block w-16 font-bold text-brand">문서번호</span>{cover.document_number}</div>}
        </div>
      </div>
      <div className="h-3 bg-brand" />
    </div>
  );
}

// CLASSIC — 중앙 정렬 + 워터마크
function CoverClassic({ cover }: { cover: CoverPayload }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-lg border border-neutral-200 bg-white p-10 text-center shadow-md dark:border-neutral-700">
      <CoverLabel template="classic" />
      {cover.organization && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[180px] font-black text-brand opacity-[0.04]">
          {cover.organization.slice(0, 2)}
        </div>
      )}
      <div className="relative">
        {cover.organization && <div className="text-lg font-bold text-brand">{cover.organization}</div>}
        {cover.department && <div className="mt-1 text-sm text-neutral-500">{cover.department}</div>}
        <div className="mx-auto my-6 h-0.5 w-20 bg-brand" />
        {cover.classification && (
          <div className="mb-4 inline-block border-2 border-rose-600 px-3 py-0.5 text-xs font-bold text-rose-600">
            {cover.classification}
          </div>
        )}
        {cover.title && <h1 className="my-4 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{cover.title}</h1>}
        {cover.subtitle && <div className="mb-10 text-sm italic text-neutral-600 dark:text-neutral-400">{cover.subtitle}</div>}
        <div className="space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
          {cover.author && <div><strong>작성자</strong> &nbsp; {cover.author}</div>}
          {cover.date && <div><strong>작성일자</strong> &nbsp; {cover.date}</div>}
          {cover.document_number && <div><strong>문서번호</strong> &nbsp; {cover.document_number}</div>}
        </div>
      </div>
    </div>
  );
}

// GONGMUN — 한국 공문서 양식
function CoverGongmun({ cover }: { cover: CoverPayload }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded border-2 border-neutral-900 bg-white p-8 shadow-md dark:bg-neutral-50">
      <CoverLabel template="gongmun" />
      {cover.organization && (
        <div className="mb-6 border-b-4 border-t-4 border-double border-black py-2 text-center text-xl font-bold tracking-[6px] text-black">
          {cover.organization}
        </div>
      )}
      {cover.document_number && (
        <div className="mb-2 text-right text-xs text-neutral-700">문서번호 : {cover.document_number}</div>
      )}
      {cover.classification && (
        <div className="mb-6 text-right">
          <span className="inline-block border-2 border-black bg-yellow-50 px-3 py-0.5 text-sm font-bold text-black">
            {cover.classification}
          </span>
        </div>
      )}
      {cover.title && (
        <h1 className="my-4 border-b-2 border-t-2 border-black py-4 text-center text-2xl font-bold text-black">
          {cover.title}
        </h1>
      )}
      {cover.subtitle && <div className="mb-6 text-center text-sm text-neutral-700">{cover.subtitle}</div>}
      <table className="mt-10 w-full border-collapse">
        <tbody className="text-sm text-black">
          {cover.department && (
            <tr><td className="w-24 border border-black bg-neutral-100 px-3 py-2 text-center font-bold">부서</td><td className="border border-black px-3 py-2">{cover.department}</td></tr>
          )}
          {cover.author && (
            <tr><td className="border border-black bg-neutral-100 px-3 py-2 text-center font-bold">작성자</td><td className="border border-black px-3 py-2">{cover.author}</td></tr>
          )}
          {cover.date && (
            <tr><td className="border border-black bg-neutral-100 px-3 py-2 text-center font-bold">작성일자</td><td className="border border-black px-3 py-2">{cover.date}</td></tr>
          )}
        </tbody>
      </table>
      <div className="mt-6 text-right">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-rose-600 text-xs text-rose-600">
          (직&nbsp;인)
        </div>
      </div>
    </div>
  );
}

// PROPOSAL — 좌측 컬러 밴드 + 큰 제목
function CoverProposal({ cover }: { cover: CoverPayload }) {
  return (
    <div className="relative mb-6 grid grid-cols-[35%_65%] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-md dark:border-neutral-700">
      <CoverLabel template="proposal" />
      <div className="relative bg-gradient-to-b from-brand to-neutral-900 p-6 text-white">
        {cover.organization && <div className="mb-3 text-sm font-bold leading-tight">{cover.organization}</div>}
        {cover.department && <div className="mb-12 text-xs opacity-90">{cover.department}</div>}
        <div className="absolute bottom-4 left-6 text-[10px] uppercase tracking-[3px] opacity-70">P R O P O S A L</div>
      </div>
      <div className="p-6">
        {cover.classification && (
          <div className="mb-4 inline-block bg-rose-600 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            {cover.classification}
          </div>
        )}
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[3px] text-brand">P R O P O S A L · 제안서</div>
        {cover.title && <h1 className="mb-3 text-3xl font-extrabold text-neutral-900 dark:text-neutral-100">{cover.title}</h1>}
        {cover.subtitle && <div className="mb-10 text-base text-neutral-600 dark:text-neutral-400">{cover.subtitle}</div>}
        <div className="space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
          {cover.author && <div><span className="mr-2 font-bold text-brand">작성자</span>{cover.author}</div>}
          {cover.date && <div><span className="mr-2 font-bold text-brand">작성일자</span>{cover.date}</div>}
          {cover.document_number && <div><span className="mr-2 font-bold text-brand">문서번호</span>{cover.document_number}</div>}
        </div>
      </div>
    </div>
  );
}

// RESEARCH — 학술 스타일
function CoverResearch({ cover }: { cover: CoverPayload }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-lg border border-neutral-200 bg-white p-8 shadow-md dark:border-neutral-700">
      <CoverLabel template="research" />
      {cover.document_number && (
        <div className="mb-8 border-b border-neutral-300 pb-2 font-mono text-xs text-neutral-500">
          Document No. {cover.document_number}
        </div>
      )}
      <div className="mb-3 text-xs font-bold uppercase tracking-[3px] text-brand">
        R E S E A R C H &nbsp; R E P O R T
      </div>
      {cover.title && <h1 className="mb-4 text-2xl font-bold leading-tight text-neutral-900 dark:text-neutral-100">{cover.title}</h1>}
      {cover.subtitle && <div className="mb-10 text-sm italic text-neutral-600 dark:text-neutral-400">{cover.subtitle}</div>}
      <div className="mt-10 border-t-2 border-brand pt-3">
        <table className="w-full">
          <tbody className="text-sm">
            {cover.author && <tr><td className="w-24 py-1 text-xs font-bold uppercase tracking-wider text-brand">저자</td><td className="text-neutral-800 dark:text-neutral-200">{cover.author}</td></tr>}
            {cover.department && <tr><td className="py-1 text-xs font-bold uppercase tracking-wider text-brand">소속</td><td className="text-neutral-800 dark:text-neutral-200">{cover.department}</td></tr>}
            {cover.organization && <tr><td className="py-1 text-xs font-bold uppercase tracking-wider text-brand">기관</td><td className="text-neutral-800 dark:text-neutral-200">{cover.organization}</td></tr>}
            {cover.date && <tr><td className="py-1 text-xs font-bold uppercase tracking-wider text-brand">발행일</td><td className="text-neutral-800 dark:text-neutral-200">{cover.date}</td></tr>}
            {cover.classification && <tr><td className="py-1 text-xs font-bold uppercase tracking-wider text-brand">분류</td><td className="text-neutral-800 dark:text-neutral-200">{cover.classification}</td></tr>}
          </tbody>
        </table>
      </div>
      {cover.organization && (
        <div className="mt-6 border-t border-neutral-300 pt-3 text-center text-[10px] uppercase tracking-[2px] text-neutral-500">
          {cover.organization}
        </div>
      )}
    </div>
  );
}

// EXECUTIVE — 임원 보고서 (고급 비즈니스)
function CoverExecutive({ cover }: { cover: CoverPayload }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-md dark:border-neutral-700">
      <CoverLabel template="executive" />
      <div className="h-3 bg-gradient-to-r from-neutral-900 to-brand" />
      <div className="relative p-10">
        {cover.classification && (
          <div className="absolute right-6 top-6 inline-block border-2 border-rose-600 bg-white px-3 py-0.5 text-xs font-bold text-rose-600">
            {cover.classification}
          </div>
        )}
        {cover.organization && (
          <div className="mb-2 text-sm uppercase tracking-[8px] text-neutral-500">
            {cover.organization}
          </div>
        )}
        <div className="mb-12 text-xs font-bold uppercase tracking-[5px] text-brand">
          EXECUTIVE&nbsp;&nbsp;REPORT
        </div>
        {cover.title && (
          <h1 className="mb-3 font-serif text-3xl font-black text-neutral-900 dark:text-neutral-100">
            {cover.title}
          </h1>
        )}
        {cover.subtitle && (
          <div className="mb-12 text-base italic text-neutral-600 dark:text-neutral-400">
            {cover.subtitle}
          </div>
        )}
        <div className="mb-3 h-0.5 w-12 bg-brand" />
        <div className="space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
          {cover.author && <div><span className="mr-3 inline-block w-20 font-bold tracking-wider text-brand-dark">Author</span>{cover.author}</div>}
          {cover.department && <div><span className="mr-3 inline-block w-20 font-bold tracking-wider text-brand-dark">Division</span>{cover.department}</div>}
          {cover.date && <div><span className="mr-3 inline-block w-20 font-bold tracking-wider text-brand-dark">Date</span>{cover.date}</div>}
          {cover.document_number && <div><span className="mr-3 inline-block w-20 font-bold tracking-wider text-brand-dark">Ref. No.</span>{cover.document_number}</div>}
        </div>
      </div>
      <div className="h-3 bg-gradient-to-r from-brand to-neutral-900" />
    </div>
  );
}

// ANNUAL_REPORT — 연차 보고서 (풍부한 표지)
function CoverAnnual({ cover }: { cover: CoverPayload }) {
  const year = (cover.date || "").match(/\d{4}/)?.[0] || "";
  return (
    <div className="relative mb-6 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-md dark:border-neutral-700">
      <CoverLabel template="annual_report" />
      <div className="relative bg-gradient-to-br from-neutral-900 via-brand to-blue-400 p-8 text-white">
        {year && (
          <div className="absolute right-4 top-4 font-serif text-6xl font-black opacity-20">{year}</div>
        )}
        <div className="mb-3 text-xs uppercase tracking-[5px] opacity-85">ANNUAL&nbsp;REPORT</div>
        {cover.organization && <div className="mb-10 text-lg font-bold">{cover.organization}</div>}
        {cover.title && <h1 className="max-w-md text-2xl font-black leading-tight">{cover.title}</h1>}
      </div>
      <div className="p-6">
        {cover.subtitle && <div className="mb-8 text-sm text-neutral-600 dark:text-neutral-400">{cover.subtitle}</div>}
        <div className="grid grid-cols-2 gap-4 border-t-2 border-brand pt-3 text-xs">
          {cover.author && (<div><div className="font-bold uppercase tracking-wider text-brand">발행</div><div className="mt-0.5 text-neutral-800 dark:text-neutral-200">{cover.author}</div></div>)}
          {cover.department && (<div><div className="font-bold uppercase tracking-wider text-brand">부서</div><div className="mt-0.5 text-neutral-800 dark:text-neutral-200">{cover.department}</div></div>)}
          {cover.date && (<div><div className="font-bold uppercase tracking-wider text-brand">발행일</div><div className="mt-0.5 text-neutral-800 dark:text-neutral-200">{cover.date}</div></div>)}
          {cover.document_number && (<div><div className="font-bold uppercase tracking-wider text-brand">문서번호</div><div className="mt-0.5 text-neutral-800 dark:text-neutral-200">{cover.document_number}</div></div>)}
        </div>
      </div>
    </div>
  );
}

// GOVERNMENT — 정부 공문 표준
function CoverGovernment({ cover }: { cover: CoverPayload }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded border-2 border-neutral-900 bg-white p-8 text-center shadow-md dark:bg-neutral-50">
      <CoverLabel template="government" />
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-rose-600 font-serif text-2xl font-bold text-rose-600">
        印
      </div>
      {cover.organization && (
        <div className="mb-1 font-serif text-xl font-bold tracking-[4px] text-black">{cover.organization}</div>
      )}
      {cover.department && <div className="mb-6 text-sm text-neutral-700">{cover.department}</div>}
      <div className="mb-2 text-left text-xs text-neutral-700">{cover.document_number && `문서번호 : ${cover.document_number}`}</div>
      {cover.classification && (
        <div className="mb-6 text-right">
          <span className="inline-block border-2 border-rose-600 px-3 py-0.5 text-sm font-bold text-rose-600">{cover.classification}</span>
        </div>
      )}
      {cover.title && (
        <h1 className="my-4 border-b-2 border-t-2 border-black py-4 font-serif text-xl font-bold text-black">{cover.title}</h1>
      )}
      {cover.subtitle && <div className="mb-6 text-xs text-neutral-700">{cover.subtitle}</div>}
      <table className="mt-6 w-full border-collapse">
        <tbody className="text-xs text-black">
          {cover.author && <tr><td className="w-20 border border-black bg-neutral-100 px-2 py-1.5 text-center font-bold">작성자</td><td className="border border-black px-2 py-1.5 text-left">{cover.author}</td></tr>}
          {cover.date && <tr><td className="border border-black bg-neutral-100 px-2 py-1.5 text-center font-bold">작성일자</td><td className="border border-black px-2 py-1.5 text-left">{cover.date}</td></tr>}
          {cover.department && <tr><td className="border border-black bg-neutral-100 px-2 py-1.5 text-center font-bold">담당부서</td><td className="border border-black px-2 py-1.5 text-left">{cover.department}</td></tr>}
        </tbody>
      </table>
      <div className="mt-6 flex justify-end gap-4">
        {["담당", "검토", "결재"].map((stamp) => (
          <div key={stamp} className="inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-rose-600 text-[10px] text-rose-600">{stamp}</div>
        ))}
      </div>
    </div>
  );
}

// WHITEPAPER — 백서
function CoverWhitepaper({ cover }: { cover: CoverPayload }) {
  const keywords = (cover.classification || "").split(",").map((k) => k.trim()).filter(Boolean);
  return (
    <div className="relative mb-6 overflow-hidden rounded-lg border border-neutral-200 bg-white p-8 shadow-md dark:border-neutral-700">
      <CoverLabel template="whitepaper" />
      <div className="mb-6 flex items-center justify-between border-b-4 border-brand pb-3">
        <div className="text-xs font-bold uppercase tracking-[4px] text-brand">WHITE PAPER · 백서</div>
        {cover.document_number && <div className="font-mono text-xs text-neutral-500">{cover.document_number}</div>}
      </div>
      <div className="mb-3 text-sm font-bold tracking-[3px] text-brand">기술·산업 분석 보고서</div>
      {cover.title && <h1 className="mb-3 text-2xl font-extrabold leading-tight text-neutral-900 dark:text-neutral-100">{cover.title}</h1>}
      {cover.subtitle && <div className="mb-8 text-sm italic text-neutral-600 dark:text-neutral-400">{cover.subtitle}</div>}
      {keywords.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-1.5">
          {keywords.map((k) => (
            <span key={k} className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[10px] font-medium text-brand">{k}</span>
          ))}
        </div>
      )}
      <div className="mt-6 border-t border-neutral-300 pt-3 text-sm leading-relaxed dark:border-neutral-700">
        {cover.author && <div><span className="mr-3 inline-block w-20 font-bold text-brand">저자</span>{cover.author}</div>}
        {cover.department && <div><span className="mr-3 inline-block w-20 font-bold text-brand">연구팀</span>{cover.department}</div>}
        {cover.organization && <div><span className="mr-3 inline-block w-20 font-bold text-brand">발행기관</span>{cover.organization}</div>}
        {cover.date && <div><span className="mr-3 inline-block w-20 font-bold text-brand">발행일</span>{cover.date}</div>}
      </div>
      {cover.organization && (
        <div className="mt-6 border-t border-neutral-300 pt-2 text-center text-[10px] text-neutral-500 dark:border-neutral-700">
          © {cover.organization}
        </div>
      )}
    </div>
  );
}

// MINIMAL — 미니멀
function CoverMinimal({ cover }: { cover: CoverPayload }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-lg border border-neutral-200 bg-white px-10 py-20 text-center shadow-md dark:border-neutral-700">
      <CoverLabel template="minimal" />
      {cover.classification && (
        <div className="absolute right-6 top-6 border border-rose-600 px-2 py-0.5 text-[10px] font-bold tracking-widest text-rose-600">
          {cover.classification}
        </div>
      )}
      <div className="mx-auto mb-12 h-1 w-12 bg-brand" />
      {cover.organization && (
        <div className="mb-3 text-xs uppercase tracking-[6px] text-neutral-500">{cover.organization}</div>
      )}
      {cover.title && (
        <h1 className="mb-4 text-3xl font-light leading-tight tracking-tight text-neutral-900 dark:text-neutral-100">
          {cover.title}
        </h1>
      )}
      {cover.subtitle && (
        <div className="mb-16 text-sm font-light text-neutral-500">{cover.subtitle}</div>
      )}
      <div className="space-y-1 text-xs text-neutral-500">
        {cover.author && <div>{cover.author}</div>}
        {cover.date && <div>{cover.date}</div>}
        {cover.document_number && <div className="font-mono">{cover.document_number}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 변환 진행 안내 — 큰 spinner + 단계별 + 경과 시간
// ─────────────────────────────────────────────────────────────────────────
function ConvertProgress() {
  const fastConvert = useWorkspace((s) => s.fastConvert);
  const [elapsed, setElapsed] = useState(0);
  const [stage, setStage] = useState(0);

  // 경과 시간 (0.1초 단위)
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - start), 100);
    return () => clearInterval(id);
  }, []);

  // 단계 자동 전환 (예상 시간 기반).
  //   풀 변환: 1(파싱)→2(분석·LLM 1)→3(매핑)→4(검토·LLM 2)→5(매크로)→6(미리보기)
  //   각 누적 ms 에 도달하면 다음 단계로.
  useEffect(() => {
    if (fastConvert) return; // 빠른 변환은 거의 즉시 — 단계 표시 불필요
    const start = Date.now();
    const tics = [200, 1500, 1800, 4500, 4800, 5200];
    const id = setInterval(() => {
      const e = Date.now() - start;
      const next = tics.findIndex((t) => e < t);
      setStage(next >= 0 ? next : tics.length - 1);
    }, 100);
    return () => clearInterval(id);
  }, [fastConvert]);

  const fullStages = [
    { icon: "📝", label: "마크다운 파싱" },
    { icon: "🧠", label: "AI 분석 (문서 분류·메타 추출)" },
    { icon: "📐", label: "양식 매핑" },
    { icon: "🔍", label: "검토 태그 생성 (빨강·파랑·노랑)" },
    { icon: "⚙️", label: "자동 매크로 적용" },
    { icon: "🎨", label: "미리보기 생성" },
  ];

  const elapsedSec = (elapsed / 1000).toFixed(1);
  const estimated = fastConvert ? "1초 이내" : "보통 3~7초";

  if (fastConvert) {
    return (
      <div className="mb-3 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm dark:border-amber-700 dark:bg-amber-950/40">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-amber-600" />
        <div className="flex-1 text-sm">
          <div className="font-semibold text-amber-900 dark:text-amber-200">
            ⚡ 빠른 변환 진행 중
          </div>
          <div className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
            LLM 단계 생략 · {estimated} 완료 예정 · {elapsedSec}초 경과
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-brand/30 bg-gradient-to-b from-brand/5 to-transparent p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <Loader2 className="h-6 w-6 shrink-0 animate-spin text-brand" />
        <div className="flex-1">
          <div className="text-sm font-bold text-brand-dark dark:text-brand-light">
            AI 가 문서를 변환 중입니다
          </div>
          <div className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
            {estimated} 소요 예정 · <strong>{elapsedSec}초</strong> 경과
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        {fullStages.map((s, i) => {
          const isDone = i < stage;
          const isCurrent = i === stage;
          return (
            <div
              key={i}
              className={`flex items-center gap-2 rounded px-2 py-1 text-xs transition-all ${
                isCurrent
                  ? "bg-brand/10 font-semibold text-brand-dark dark:text-brand-light"
                  : isDone
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-neutral-400"
              }`}
            >
              <span className="w-5 text-center">
                {isDone ? "✓" : isCurrent ? s.icon : "○"}
              </span>
              <span className="flex-1">{s.label}</span>
              {isCurrent && <Loader2 size={10} className="animate-spin" />}
            </div>
          );
        })}
      </div>
      <div className="mt-3 border-t border-brand/20 pt-2 text-[10px] text-neutral-500 dark:text-neutral-400">
        💡 변환 시간을 줄이려면 우측 [⚡ 빠른 변환] 토글 ON — LLM 단계 생략 (~5ms)
      </div>
    </div>
  );
}

function VisualImage({
  src,
  caption,
  align = "center",
  width,
  height,
}: {
  src: string;
  caption?: string;
  align?: string;
  width?: string;
  height?: string;
}) {
  const finalSrc = src.startsWith("http") || src.startsWith("data:")
    ? src
    : `${API_BASE}${src.startsWith("/") ? "" : "/"}${src}`;

  // 정렬 → flex justify
  const alignCls = align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";

  // width 단위: "70%", "400px", "120mm", "5cm", "300pt" 등 — CSS 그대로 통과 가능
  const imgStyle: React.CSSProperties = {};
  if (width) imgStyle.width = width;
  if (height) imgStyle.height = height;
  // width 미지정 시 최대 100% 유지
  if (!width) imgStyle.maxWidth = "100%";

  return (
    <figure className={`my-3 ${alignCls}`}>
      <img
        src={finalSrc}
        alt={caption || "이미지"}
        style={imgStyle}
        className="inline-block rounded border border-neutral-200 dark:border-neutral-700"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      {caption && (
        <figcaption className="mt-1 text-xs italic text-neutral-500 dark:text-neutral-400">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function VisualPlaceholder({ icon, title, body }: { icon: string; title: string; body?: string }) {
  return (
    <div className="my-3 flex flex-col items-center rounded border border-dashed border-neutral-300 bg-neutral-50/60 p-3 text-center dark:border-neutral-700 dark:bg-neutral-900/40">
      <div className="text-lg">{icon}</div>
      <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{title}</div>
      {body && (
        <pre className="mt-2 max-h-48 max-w-full overflow-auto whitespace-pre rounded bg-white/70 p-2 text-left text-[10px] text-neutral-600 dark:bg-neutral-800/40 dark:text-neutral-400">
          {body}
        </pre>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// InlineRun → React (bold/italic/color/font_size 모두 시각화)
// ─────────────────────────────────────────────────────────────────────────

/**
 * 텍스트 안의 `\n` 을 React 의 <br/> 로 변환.
 * markdown-it 의 softbreak → '\n' 으로 들어온 줄바꿈을 시각적으로 보존.
 */
function textWithBreaks(text: string, baseKey: number): React.ReactNode {
  if (!text.includes("\n")) return text;
  const parts = text.split("\n");
  const out: React.ReactNode[] = [];
  parts.forEach((p, i) => {
    if (i > 0) out.push(<br key={`br-${baseKey}-${i}`} />);
    if (p) out.push(p);
  });
  return <>{out}</>;
}


function renderRun(run: InlineRunPayload, key: number): React.ReactNode {
  const style: React.CSSProperties = {};
  if (run.color) style.color = run.color;
  if (run.background) style.backgroundColor = run.background;
  if (run.font_family) style.fontFamily = run.font_family;
  if (run.font_size) style.fontSize = `${run.font_size}pt`;

  // 줄바꿈 보존 — '\n' 을 <br/> 로 (CommonMark breaks=True 지원)
  let el: React.ReactNode = textWithBreaks(run.text, key);
  if (run.code) el = <code className="rounded bg-neutral-100 px-1 font-mono text-[0.9em] dark:bg-neutral-800">{el}</code>;
  if (run.subscript) el = <sub>{el}</sub>;
  if (run.superscript) el = <sup>{el}</sup>;
  if (run.strikethrough) el = <s>{el}</s>;
  if (run.underline) el = <u>{el}</u>;
  if (run.italic) el = <em>{el}</em>;
  if (run.bold) el = <strong>{el}</strong>;

  const hasStyle = Object.keys(style).length > 0;
  if (run.link) {
    return <a key={key} href={run.link} style={style} className="text-brand underline" target="_blank" rel="noopener noreferrer">{el}</a>;
  }
  if (hasStyle) {
    return <span key={key} style={style}>{el}</span>;
  }
  return <span key={key}>{el}</span>;
}

// 인라인 runs + review tags 오버레이
function renderRunsWithTags(
  runs: InlineRunPayload[] | undefined,
  fallbackText: string,
  tags: ReviewTag[],
  jumpRange: { start: number; end: number; seq: number } | null,
): React.ReactNode[] {
  // 가장 단순한 케이스 — runs 없으면 텍스트로
  if (!runs || runs.length === 0) {
    return [<span key="0">{fallbackText}</span>];
  }
  // 태그를 처리하기 위해 runs를 문자 단위로 펼침
  // 각 run을 그대로 렌더링 + 태그가 걸린 영역은 별도 wrapping
  // 단순화: 태그 영역과 run 경계가 일치하면 OK, 아니면 plain run만 렌더링 (태그는 별도 wrapper로)
  // 일단 runs 렌더링 우선, 태그는 fallback 시 동작
  const result: React.ReactNode[] = [];
  let cursor = 0;
  const sortedTags = [...tags].sort((a, b) => a.rel_start - b.rel_start);
  let tagIdx = 0;

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const runEnd = cursor + run.text.length;

    // 이 run 안에 태그가 시작되는지
    const tagsInRun: ReviewTag[] = [];
    while (tagIdx < sortedTags.length && sortedTags[tagIdx].rel_start < runEnd) {
      if (sortedTags[tagIdx].rel_end > cursor) {
        tagsInRun.push(sortedTags[tagIdx]);
      }
      if (sortedTags[tagIdx].rel_end <= runEnd) tagIdx++;
      else break;
    }

    if (tagsInRun.length === 0) {
      result.push(renderRun(run, i));
    } else {
      // run 텍스트를 태그별로 잘라서 렌더링
      let localCursor = 0;
      const runText = run.text;
      for (const t of tagsInRun) {
        const localStart = Math.max(0, t.rel_start - cursor);
        const localEnd = Math.min(runText.length, t.rel_end - cursor);
        if (localStart > localCursor) {
          result.push(renderRun({ ...run, text: runText.slice(localCursor, localStart) }, i * 100 + localCursor));
        }
        const isJump = jumpRange !== null && t.rel_start === jumpRange.start && t.rel_end === jumpRange.end;
        result.push(
          <span
            key={`tag-${i}-${localStart}`}
            className={`review-${t.color} ${isJump ? "jump-flash" : ""}`}
            title={t.reason}
          >
            {renderRun({ ...run, text: runText.slice(localStart, localEnd) }, 0)}
          </span>
        );
        localCursor = localEnd;
      }
      if (localCursor < runText.length) {
        result.push(renderRun({ ...run, text: runText.slice(localCursor) }, i * 100 + 999));
      }
    }
    cursor = runEnd;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// 표 렌더링 — 셀별 align·background·rotate
// ─────────────────────────────────────────────────────────────────────────

function renderTable(
  table: NonNullable<PreviewBlock["table"]>,
  blockId: string,
  onCellEdit: (blockId: string, row: number, col: number, text: string) => void,
  editingCell: { blockId: string; row: number; col: number } | null,
  setEditingCell: (v: { blockId: string; row: number; col: number } | null) => void,
): React.ReactNode {
  const borderCls = {
    default: "border border-neutral-400",
    grid: "border border-neutral-300",
    dashed: "border border-dashed border-neutral-400",
    header: "border border-neutral-400",
    none: "",
  }[table.border_style] ?? "border border-neutral-400";

  // 열별 너비 균등 (column_widths가 있으면 사용)
  const colCount = Math.max(...table.rows.map((r) => r.length));
  const colWidth = table.column_widths
    ? null
    : `${(100 / colCount).toFixed(2)}%`;

  return (
    <table
      className="my-2 w-full border-collapse table-fixed"
      style={{ tableLayout: "fixed" }}
    >
      {colWidth && (
        <colgroup>
          {Array.from({ length: colCount }).map((_, i) => (
            <col key={i} style={{ width: colWidth }} />
          ))}
        </colgroup>
      )}
      {table.column_widths && (
        <colgroup>
          {table.column_widths.map((w, i) => (
            <col key={i} style={{ width: `${(w * 100).toFixed(2)}%` }} />
          ))}
        </colgroup>
      )}
      <tbody>
        {table.rows.map((row, ri) => (
          <tr key={ri} style={{ height: "2.4em" }}>
            {row.map((cell, ci) => {
              if (cell.colspan === 0 || cell.rowspan === 0) return null;
              const isHeader = ri === 0 && table.header_row;
              const Tag = isHeader ? "th" : "td";
              const style: React.CSSProperties = { textAlign: cell.align };
              if (cell.background) style.backgroundColor = cell.background;
              if (cell.rotate) style.transform = `rotate(${cell.rotate}deg)`;
              const cellBorderCls = cell.border === "none" ? "" : borderCls;
              const isEditing =
                editingCell?.blockId === blockId && editingCell.row === ri && editingCell.col === ci;
              const cellText = cell.runs.map((r) => r.text).join("");

              return (
                <Tag
                  key={ci}
                  colSpan={cell.colspan > 1 ? cell.colspan : undefined}
                  rowSpan={cell.rowspan > 1 ? cell.rowspan : undefined}
                  style={style}
                  className={`${cellBorderCls} px-2 py-1 align-middle ${isHeader ? "bg-neutral-100 font-semibold dark:bg-neutral-800" : ""}`}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingCell({ blockId, row: ri, col: ci });
                  }}
                  title="더블클릭 → 편집"
                >
                  {isEditing ? (
                    <CellEditor
                      initial={cellText}
                      align={cell.align}
                      onSubmit={(text) => {
                        onCellEdit(blockId, ri, ci, text);
                        setEditingCell(null);
                      }}
                      onCancel={() => setEditingCell(null)}
                    />
                  ) : (
                    cell.runs.map((r, i) => renderRun(r, i))
                  )}
                </Tag>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BlockEditor({ initial, onSubmit, onCancel }: {
  initial: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <textarea
      ref={inputRef}
      value={value}
      rows={Math.max(2, value.split("\n").length)}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSubmit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          onSubmit(value);
        } else if (e.key === "Escape") {
          onCancel();
        }
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-full rounded border-2 border-brand bg-white px-2 py-1 outline-none dark:bg-neutral-900"
    />
  );
}


function CellEditor({
  initial, align, onSubmit, onCancel,
}: {
  initial: string;
  align: "left" | "center" | "right";
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSubmit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onSubmit(value);
        } else if (e.key === "Escape") {
          onCancel();
        }
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-full bg-white px-1 outline-2 outline-brand dark:bg-neutral-900"
      style={{ textAlign: align }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 블록 렌더러
// ─────────────────────────────────────────────────────────────────────────

function BlockRenderer({
  block,
  isJumpBlock,
  jumpRange,
  isSelected,
  isRecentlyChanged,
  isEditingBlock,
  editingCell,
  setEditingCell,
  onSelect,
  onCellEdit,
  onBlockEdit,
  startEditingBlock,
  stopEditingBlock,
}: {
  block: PreviewBlock;
  isJumpBlock: boolean;
  jumpRange: { start: number; end: number; seq: number } | null;
  isSelected: boolean;
  isRecentlyChanged: boolean;
  isEditingBlock: boolean;
  editingCell: { blockId: string; row: number; col: number } | null;
  setEditingCell: (v: { blockId: string; row: number; col: number } | null) => void;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onCellEdit: (blockId: string, row: number, col: number, text: string) => void;
  onBlockEdit: (blockId: string, text: string) => void;
  startEditingBlock: (id: string) => void;
  stopEditingBlock: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isJumpBlock && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isJumpBlock, jumpRange?.seq]);

  // 블록 타입별 렌더링
  let inner: React.ReactNode;

  // 블록 자체 인라인 편집 (heading·paragraph·list·quote)
  const isBlockEditable =
    block.type === "heading" ||
    block.type === "paragraph" ||
    block.type === "list_item" ||
    block.type === "quote";

  if (isEditingBlock && isBlockEditable) {
    inner = (
      <BlockEditor
        initial={block.list_item ? block.list_item.runs.map((r) => r.text).join("") : block.runs?.map((r) => r.text).join("") ?? block.text}
        onSubmit={(text) => {
          onBlockEdit(block.id, text);
          stopEditingBlock();
        }}
        onCancel={stopEditingBlock}
      />
    );
  } else if (block.type === "heading") {
    const level = Math.min(6, Math.max(1, block.heading_level));
    const Tag = (`h${level}` as unknown) as keyof JSX.IntrinsicElements;
    inner = (
      <Tag>{renderRunsWithTags(block.runs, block.text, block.tags, isJumpBlock ? jumpRange : null)}</Tag>
    );
  } else if (block.type === "list_item" && block.list_item) {
    const marker = block.list_item.ordered
      ? `${block.list_item.index}${block.list_item.order_format.replace("1.", ".")}`
      : block.list_item.bullet_marker;
    const indent = block.list_item.depth * 1.5;
    inner = (
      <p style={{ paddingLeft: `${indent}em` }}>
        <strong className="mr-1">{marker}</strong>
        {renderRunsWithTags(block.list_item.runs, block.text, block.tags, isJumpBlock ? jumpRange : null)}
      </p>
    );
  } else if (block.type === "quote") {
    inner = (
      <div className="quote">
        {renderRunsWithTags(block.runs, block.text, block.tags, isJumpBlock ? jumpRange : null)}
      </div>
    );
  } else if (block.type === "code") {
    inner = <pre className="code">{block.text}</pre>;
  } else if (block.type === "image" && block.image) {
    const src = block.image.image_url || block.image.url || block.image.src;
    inner = (
      <VisualImage
        src={src}
        caption={block.image.caption || block.image.alt}
        align={block.image.align}
        width={block.image.width}
        height={block.image.height}
      />
    );
  } else if (block.type === "diagram" && block.diagram) {
    if (block.diagram.image_url) {
      inner = (
        <VisualImage
          src={block.diagram.image_url}
          caption={block.diagram.caption || (block.diagram.engine === "mermaid" ? "Mermaid 다이어그램" : "PlantUML 다이어그램")}
          align={block.diagram.align}
          width={block.diagram.width}
          height={block.diagram.height}
        />
      );
    } else {
      inner = (
        <VisualPlaceholder
          icon="🔀"
          title={`${block.diagram.engine === "mermaid" ? "Mermaid" : "PlantUML"} 다이어그램${block.diagram.caption ? ` — ${block.diagram.caption}` : ""} (렌더 실패)`}
          body={block.diagram.source}
        />
      );
    }
  } else if (block.type === "chart" && block.chart) {
    const spec = block.chart.spec as { title?: string; type?: string };
    if (block.chart.image_url) {
      inner = (
        <VisualImage
          src={block.chart.image_url}
          caption={spec?.title || block.chart.caption || `차트 (${spec?.type || "bar"})`}
          align={block.chart.align}
          width={block.chart.width}
          height={block.chart.height}
        />
      );
    } else {
      inner = (
        <VisualPlaceholder
          icon="📊"
          title={`차트 [${spec?.type || "bar"}]${spec?.title ? ` — ${spec.title}` : ""} (렌더 실패)`}
          body={JSON.stringify(block.chart.spec, null, 2)}
        />
      );
    }
  } else if (block.type === "equation" && block.equation) {
    if (block.equation.image_url) {
      const eqStyle: React.CSSProperties = {};
      if (block.equation.width) eqStyle.width = block.equation.width;
      else eqStyle.maxHeight = "56px";
      inner = (
        <div className={`my-3 ${block.equation.align === "left" ? "text-left" : block.equation.align === "right" ? "text-right" : "text-center"}`}>
          <img
            src={block.equation.image_url.startsWith("http") || block.equation.image_url.startsWith("data:")
              ? block.equation.image_url
              : `${API_BASE}${block.equation.image_url}`}
            alt={block.equation.latex}
            style={eqStyle}
            className="inline-block align-middle"
          />
        </div>
      );
    } else {
      inner = (
        <div className="my-2 rounded bg-neutral-50 px-3 py-2 text-center font-mono text-sm dark:bg-neutral-800">
          {block.equation.latex}
        </div>
      );
    }
  } else if (block.type === "table" && block.table) {
    inner = renderTable(block.table, block.id, onCellEdit, editingCell, setEditingCell);
  } else if (block.type === "thematic_break") {
    inner = <hr />;
  } else if (block.type === "box") {
    inner = (
      <div className="box">
        {renderRunsWithTags(block.runs, block.text, block.tags, isJumpBlock ? jumpRange : null)}
      </div>
    );
  } else {
    inner = (
      <p>{renderRunsWithTags(block.runs, block.text, block.tags, isJumpBlock ? jumpRange : null)}</p>
    );
  }

  const wrapperCls = [
    "block-wrapper",
    "group relative cursor-pointer transition-all px-2 py-0.5 -mx-2 rounded",
    isSelected
      ? "bg-brand/10 ring-1 ring-brand/40"
      : "hover:bg-neutral-100 dark:hover:bg-neutral-800/50",
    isRecentlyChanged ? "animate-pulse-once" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={ref}
      data-block-id={block.id}
      className={wrapperCls}
      onClick={(e) => {
        if (isEditingBlock) return;  // 편집 중엔 선택 토글 X
        onSelect(block.id, e);
      }}
      onDoubleClick={(e) => {
        // 표는 셀별 처리, 시각 요소·구분선은 편집 없음
        if (
          block.type === "table" ||
          block.type === "thematic_break" ||
          block.type === "image" ||
          block.type === "diagram" ||
          block.type === "chart" ||
          block.type === "equation"
        )
          return;
        e.stopPropagation();
        startEditingBlock(block.id);
      }}
    >
      {inner}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PreviewPane
// ─────────────────────────────────────────────────────────────────────────

export function PreviewPane() {
  const preview = useWorkspace((s) => s.preview);
  const setPreview = useWorkspace((s) => s.setPreview);
  const busy = useWorkspace((s) => s.busy);
  const jumpTarget = useWorkspace((s) => s.jumpTarget);
  const selectedBlockIds = useWorkspace((s) => s.selectedBlockIds);
  const toggleBlockSelection = useWorkspace((s) => s.toggleBlockSelection);
  const clearSelection = useWorkspace((s) => s.clearSelection);
  const selectAll = useWorkspace((s) => s.selectAll);
  const recentlyChangedIds = useWorkspace((s) => s.recentlyChangedIds);
  const setRecentlyChanged = useWorkspace((s) => s.setRecentlyChanged);

  // 인라인 편집 상태 — 표 셀 한 곳 또는 블록 하나
  const [editingCell, setEditingCell] = useState<{ blockId: string; row: number; col: number } | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!preview) return null;
    return preview.review_counts;
  }, [preview]);

  const jumpBlockId = jumpTarget?.blockId ?? null;
  const jumpRange = jumpTarget
    ? { start: jumpTarget.relStart, end: jumpTarget.relEnd, seq: jumpTarget.seq }
    : null;

  const handleBlockSelect = (id: string, e: React.MouseEvent) => {
    const multi = e.ctrlKey || e.metaKey || e.shiftKey;
    toggleBlockSelection(id, { multi });
  };

  const handleCellEdit = async (blockId: string, row: number, col: number, text: string) => {
    if (!preview?.document_id) return;
    try {
      const res = await editCell({
        document_id: preview.document_id,
        block_id: blockId, row, col, text,
      });
      setPreview(res.preview);
      setRecentlyChanged([blockId]);
    } catch (e) {
      alert(`셀 수정 실패: ${(e as Error).message}`);
    }
  };

  const handleBlockEdit = async (blockId: string, text: string) => {
    if (!preview?.document_id) return;
    try {
      const res = await editBlock({
        document_id: preview.document_id,
        block_id: blockId, text,
      });
      setPreview(res.preview);
      setRecentlyChanged([blockId]);
    } catch (e) {
      alert(`블록 수정 실패: ${(e as Error).message}`);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-y-1 border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className="shrink-0 whitespace-nowrap text-sm font-semibold"
            title="더블클릭하면 직접 편집. 클릭 → 매크로 적용 대상으로 선택."
          >
            변환 결과{" "}
            <span className="whitespace-nowrap text-[10px] font-normal text-neutral-400">
              (클릭=선택)
            </span>
          </span>
          {preview && (
            <span className="shrink-0 whitespace-nowrap rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">
              {preview.document_class}
            </span>
          )}
          {selectedBlockIds.length > 0 && (
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="shrink-0 whitespace-nowrap rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">
                {selectedBlockIds.length}개 선택
              </span>
              <button
                onClick={() => askAiAboutSelected(selectedBlockIds, preview)}
                className="flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-700"
                title="선택한 블록을 AI 채팅창으로 — '이 블록 다듬어줘' 식으로 바로 질문 가능"
              >
                ✨ AI에 묻기
              </button>
              <button
                onClick={clearSelection}
                className="shrink-0 whitespace-nowrap text-[10px] text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                해제
              </button>
              <button
                onClick={selectAll}
                className="shrink-0 whitespace-nowrap text-[10px] text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                전체
              </button>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 whitespace-nowrap text-[11px]">
          {stats && (
            <>
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-review-red" title="수정 필요">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-review-red" />
                {stats.red}
              </span>
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-review-blue" title="핵심">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-review-blue" />
                {stats.blue}
              </span>
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-review-yellow" title="숫자">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-review-yellow" />
                {stats.yellow}
              </span>
            </>
          )}
          {preview && (
            <span className="shrink-0 whitespace-nowrap text-neutral-500" title={preview.model_version}>
              {(preview.latency_ms ?? 0).toFixed(0)}ms
            </span>
          )}
        </div>
      </div>

      <div className="preview flex-1 overflow-auto p-6 text-[14px]">
        {busy && <ConvertProgress />}
        {!preview && !busy && (
          <div className="flex h-full items-center justify-center text-center text-sm text-neutral-400">
            <div className="max-w-md">
              <div className="mb-3 text-3xl">🪄</div>
              <div className="mb-2 text-base font-semibold text-neutral-600 dark:text-neutral-300">
                3단계 워크플로우
              </div>
              <ol className="space-y-2 text-left text-xs text-neutral-500">
                <li>
                  <span className="inline-block w-5 font-bold text-brand">1</span>
                  왼쪽 에디터에 <strong>마크다운으로 작성</strong> (또는 템플릿 로드)
                </li>
                <li>
                  <span className="inline-block w-5 font-bold text-brand">2</span>
                  리모컨 <strong>&quot;한 번에 회사 문서로&quot;</strong> 클릭 (Ctrl+Enter)
                </li>
                <li>
                  <span className="inline-block w-5 font-bold text-brand">3</span>
                  여기서 블록 클릭 → 매크로로 <strong>색상·정렬·표 셀</strong> 조정 → 다운로드
                </li>
              </ol>
            </div>
          </div>
        )}
        {preview && (
          <article>
            {preview.cover && <CoverPage cover={preview.cover} />}
            {preview.title && (!preview.cover || !preview.cover.title) && (
              <h1 className="mb-4 text-center text-2xl font-bold">{preview.title}</h1>
            )}
            {preview.blocks.map((b) => (
              <BlockRenderer
                key={b.id}
                block={b}
                isJumpBlock={b.id === jumpBlockId}
                jumpRange={b.id === jumpBlockId ? jumpRange : null}
                isSelected={selectedBlockIds.includes(b.id)}
                isRecentlyChanged={recentlyChangedIds.includes(b.id)}
                isEditingBlock={editingBlockId === b.id}
                editingCell={editingCell}
                setEditingCell={setEditingCell}
                onSelect={handleBlockSelect}
                onCellEdit={handleCellEdit}
                onBlockEdit={handleBlockEdit}
                startEditingBlock={(id) => setEditingBlockId(id)}
                stopEditingBlock={() => setEditingBlockId(null)}
              />
            ))}
          </article>
        )}
      </div>
    </div>
  );
}
