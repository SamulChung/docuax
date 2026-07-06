"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, FileUp, MessageCircle, Sparkles, Wand2 } from "lucide-react";

import { ChatDock } from "@/components/chat/ChatDock";
import { FormFillPanel } from "@/components/editor/FormFillPanel";
import { HwpDropZone, importFileToEditor } from "@/components/editor/HwpDropZone";
import { InsertVisualBar } from "@/components/editor/InsertVisualBar";
import { MarkdownEditor } from "@/components/editor/MarkdownEditor";
import { PromptLibrary } from "@/components/prompts/PromptLibrary";
import { SamplePicker } from "@/components/samples/SamplePicker";
import { insertBlock } from "@/lib/editorCommands";
import { dispatchAutoConvert } from "@/lib/events";
import { useWorkspace } from "@/store/workspace";

export function Editor() {
  const source = useWorkspace((s) => s.source);
  const title = useWorkspace((s) => s.title);
  const setTitle = useWorkspace((s) => s.setTitle);
  const autoConvert = useWorkspace((s) => s.autoConvert);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  // 에디터 전체 드롭 타겟 — 자식 요소 dragleave 로 깜빡이지 않게 depth 카운터 사용
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    if (!autoConvert || !source.trim()) return;
    const timer = setTimeout(() => {
      // 자동반영 debounce 는 항상 빠른 변환 — 입력마다 LLM 분석·검토를 돌리지 않음
      dispatchAutoConvert({ forceFast: true });
    }, 1000);
    return () => clearTimeout(timer);
  }, [source, autoConvert]);

  // ChatDock 이 하단을 차지하므로 textarea 는 flex-1 + 내부 스크롤 (자동 높이 조정 제거)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        {/* 좌측: 라벨 + 제목 입력. 라벨은 줄바꿈 금지, 제목은 좁아질 때 줄어듦 */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold">입력 (마크다운)</span>
          <input
            type="text"
            value={title}
            placeholder="제목 (선택)"
            onChange={(e) => setTitle(e.target.value)}
            className="min-w-0 flex-1 rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        {/* 우측: 버튼 묶음 — 줄어들지 않고 텍스트도 줄바꿈 금지 */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setPickerOpen(true)}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-600 transition-all hover:border-brand hover:text-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
            title="템플릿 라이브러리 — 디자인 그대로 가져오기"
          >
            <BookOpen size={11} />
            템플릿
          </button>
          <button
            onClick={() => setPromptsOpen(true)}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-600 transition-all hover:border-brand hover:text-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
            title="회사·기관별 프롬프트 치트시트"
          >
            <Sparkles size={11} />
            프롬프트
          </button>
          <HwpDropZone />
          <span className="shrink-0 whitespace-nowrap text-[10px] text-neutral-500">
            {source.length.toLocaleString()}자
          </span>
        </div>
      </div>
      {/* 시각 요소 삽입 툴바 — 표지·이미지·차트·다이어그램·수식
          onInsert 로 CodeMirror 에디터의 현재 커서 위치에 삽입되도록 */}
      <InsertVisualBar onInsert={insertBlock} />

      {/* 양식 자동 채우기 패널 — 플레이스홀더 감지 시 자동 표시 */}
      <div className="px-3 pt-1 empty:hidden">
        <FormFillPanel />
      </div>

      {/* 마크다운 입력 영역 — flex-1, 채팅 dock 위에 위치.
          빈 상태일 때는 textarea 위에 안내 카드 오버레이 — 클릭 시 자동으로 textarea 포커스.
          영역 전체가 파일 드롭 타겟 (HWP·DOCX·MD → importFileToEditor) */}
      <div
        className={`relative flex-1 overflow-hidden ${dropping ? "ring-2 ring-inset ring-brand/50" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDropping(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDropping(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDropping(false);
          const file = e.dataTransfer.files[0];
          if (!file) return;
          importFileToEditor(file).catch((err: unknown) => {
            alert(err instanceof Error ? err.message : "파일 처리 중 오류가 발생했습니다");
          });
        }}
      >
        <div className="absolute inset-0">
          {/* 플레이스홀더 없음 — 빈 상태 안내는 아래 오버레이 카드가 담당 (텍스트 겹침 방지) */}
          <MarkdownEditor />
        </div>
        {dropping && (
          <div
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-brand/5 p-4"
            aria-hidden
          >
            <div className="flex items-center gap-2 rounded-lg border-2 border-dashed border-brand bg-white/95 px-5 py-3 text-sm font-semibold text-brand shadow-lg dark:bg-neutral-900/95">
              <FileUp size={16} />
              여기에 파일을 놓으세요 (HWP·DOCX·MD)
            </div>
          </div>
        )}
        {source.length === 0 && !dropping && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center p-4"
            aria-hidden
          >
            {/* 카드 자체는 pointer-events-none — 클릭이 뒤의 textarea 로 통과되어
                빈 화면에서 바로 입력 가능. 내부 [템플릿] 버튼만 pointer-events-auto 로 살림. */}
            <div className="pointer-events-none w-full max-w-md rounded-xl border border-dashed border-brand/40 bg-gradient-to-b from-brand/5 to-transparent p-5 text-center shadow-sm dark:from-brand/10">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand/15 text-brand">
                <Wand2 size={20} />
              </div>
              <h3 className="mb-1 text-[13px] font-bold text-neutral-800 dark:text-neutral-100">
                문서의 AI화 — 3단계로 시작
              </h3>
              <p className="mb-4 text-[11px] text-neutral-500 dark:text-neutral-400">
                마크다운을 직접 작성하셔도 되고, 아래 순서를 따르셔도 됩니다.
              </p>
              <ol className="space-y-2 text-left text-[11.5px] text-neutral-700 dark:text-neutral-300">
                <li className="flex gap-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">1</span>
                  <span>
                    상단의{" "}
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="pointer-events-auto inline-flex items-center gap-0.5 rounded bg-white px-1.5 py-0.5 font-semibold text-brand shadow-sm hover:bg-brand/10 dark:bg-neutral-800"
                    >
                      <BookOpen size={10} /> 템플릿
                    </button>
                    {" "}버튼으로 기본 양식을 가져오기
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">2</span>
                  <span>
                    아래{" "}
                    <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <MessageCircle size={10} /> AI 채팅
                    </span>
                    {" "}창에{" "}
                    <strong className="text-brand">&ldquo;사업 제안서 초안 만들어줘&rdquo;</strong>
                    {" "}같이 요청
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">3</span>
                  <span>
                    AI 응답의{" "}
                    <span className="inline-flex items-center gap-0.5 rounded bg-brand/10 px-1.5 py-0.5 font-semibold text-brand">
                      에디터에 추가
                    </span>
                    {" "}버튼 → 우측{" "}
                    <kbd className="rounded bg-neutral-200 px-1 py-0.5 text-[9px] dark:bg-neutral-700">Ctrl+Enter</kbd>
                    로 변환
                  </span>
                </li>
              </ol>
              <p className="mt-4 border-t border-neutral-200 pt-3 text-[10px] text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                💡 빈 화면에서 바로 입력해도 됩니다. AI 채팅은 항상 옆에서 도와드립니다.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* AI 채팅 dock — 에디터 입력 밑 5줄. 확대 시 ChatPanel 로 분리. */}
      <ChatDock />

      {pickerOpen && <SamplePicker onClose={() => setPickerOpen(false)} />}
      {promptsOpen && <PromptLibrary onClose={() => setPromptsOpen(false)} />}
    </div>
  );
}
