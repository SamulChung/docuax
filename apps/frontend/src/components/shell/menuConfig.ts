// 상단 메뉴바 메뉴 구성 — MenuBar 가 300줄을 넘지 않도록 구성 정의만 분리.
// 실행 로직은 전부 lib(convert/macroActions/exportActions/channelPresets)에 있고,
// 여기서는 라벨·순서·비활성 조건만 선언한다.
import { undo, redo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";

import type { ConvertPreview, MacroDescriptor } from "@/lib/api";
import { downloadUrl } from "@/lib/api";
import { CHANNEL_PRESETS, exportToChannel } from "@/lib/channelPresets";
import { TABLE_3X3_MD } from "@/lib/commands";
import { performConvert } from "@/lib/convert";
import { saveAsNewDocument, saveCurrentDocument } from "@/lib/docActions";
import { downloadMarkdown } from "@/lib/download";
import { getEditorView, insertBlock, setHeadingLevel, wrapSelection } from "@/lib/editorCommands";
import { downloadHwpWithWarnings } from "@/lib/exportActions";
import { NEEDS_CONVERT_MSG } from "@/lib/macroActions";
import { buildMacroEntries, MenuEntry } from "@/lib/menuBuilders";
import { useWorkspace } from "@/store/workspace";

export type MenuItem =
  | {
      label: string;
      action: () => void;
      disabled?: boolean;
      disabledReason?: string;
      /** 그룹 헤더 라벨 — 직전 항목과 group 이 다르면 헤더 1회 렌더 */
      group?: string;
    }
  | "divider";

export interface MenuDeps {
  source: string;
  title: string;
  preview: ConvertPreview | null;
  macros: MacroDescriptor[];
  resetWorkspace: () => void;
  setActiveTab: (t: "doc" | "slides") => void;
  openPicker: () => void;
  /** 매크로 실행 — 파라미터 필요 시 MenuBar 가 다이얼로그를 띄운다 */
  runMacro: (macroId: string) => void;
}

/** MenuEntry(menuBuilders) → MenuItem 어댑터 */
function toItems(entries: MenuEntry[]): MenuItem[] {
  return entries.map((e) => ({
    label: e.label,
    action: e.run,
    disabled: e.disabled,
    disabledReason: e.disabledReason,
    group: e.group,
  }));
}

const withEditor =
  (fn: (v: NonNullable<ReturnType<typeof getEditorView>>) => void) => () => {
    const v = getEditorView();
    if (v) fn(v);
  };

/** 메뉴 순서: 파일 편집 서식 삽입 표 글자 이동 검토 출력 도구 */
export function buildMenus(deps: MenuDeps): Record<string, MenuItem[]> {
  const { source, title, preview, macros, resetWorkspace, setActiveTab, openPicker, runMacro } = deps;
  const hasPreview = !!preview;
  const docId = preview?.document_id ?? null;
  const needsConvert = hasPreview
    ? {}
    : { disabled: true, disabledReason: NEEDS_CONVERT_MSG };
  const needsSource = source.trim()
    ? {}
    : { disabled: true, disabledReason: "에디터 내용이 비어 있습니다" };

  const counts = preview?.review_counts;
  const jumpItem = (
    base: string,
    color: "red" | "blue" | "yellow",
    n: number | undefined,
  ): MenuItem => ({
    label: n !== undefined ? `${base} (${n}곳)` : base,
    action: () => useWorkspace.getState().jumpToNext(color),
    ...needsConvert,
  });

  const openDownload = (fmt: "hwpx" | "docx" | "pdf") => () => {
    if (docId) window.open(downloadUrl(docId, fmt), "_blank");
  };

  return {
    파일: [
      { label: "새 문서", action: () => { if (confirm("에디터 내용을 초기화할까요?")) resetWorkspace(); } },
      { label: "열기… (내 문서)", action: openPicker },
      "divider",
      { label: "저장 (Ctrl+S)", action: () => void saveCurrentDocument() },
      { label: "다른 이름으로 저장", action: () => void saveAsNewDocument() },
      "divider",
      { label: "마크다운으로 저장 (.md)", action: () => downloadMarkdown(source, title) },
      { label: "인쇄 (Ctrl+P)", action: () => window.print() },
    ],
    편집: [
      { label: "실행 취소 (Ctrl+Z)", action: withEditor((v) => undo(v)) },
      { label: "다시 실행 (Ctrl+Y)", action: withEditor((v) => redo(v)) },
      "divider",
      { label: "찾기 (Ctrl+F)", action: withEditor((v) => openSearchPanel(v)) },
      { label: "바꾸기 (Ctrl+H)", action: withEditor((v) => openSearchPanel(v)) },
    ],
    서식: [
      { label: "제목 1", action: () => setHeadingLevel(1) },
      { label: "제목 2", action: () => setHeadingLevel(2) },
      { label: "제목 3", action: () => setHeadingLevel(3) },
      { label: "본문", action: () => setHeadingLevel(0) },
      "divider",
      { label: "굵게 (Ctrl+B)", action: () => wrapSelection("**") },
      { label: "기울임 (Ctrl+I)", action: () => wrapSelection("*") },
      { label: "밑줄 (Ctrl+U)", action: () => wrapSelection("<u>", "</u>") },
    ],
    삽입: [
      { label: "표 (3×3)", action: () => insertBlock(TABLE_3X3_MD) },
      { label: "구분선", action: () => insertBlock("---") },
      { label: "인용", action: () => insertBlock("> 인용문") },
    ],
    표: [
      { label: "표 삽입 (3×3)", action: () => insertBlock(TABLE_3X3_MD) },
      "divider",
      ...toItems(
        buildMacroEntries(
          macros,
          [
            { cat: "T", group: "표 매크로" },
            { cat: "S", group: "셀 매크로" },
          ],
          hasPreview,
          runMacro,
        ),
      ),
    ],
    글자: toItems(
      buildMacroEntries(
        macros,
        [
          { cat: "B", group: "블록" },
          { cat: "G", group: "글자" },
        ],
        hasPreview,
        runMacro,
      ),
    ),
    이동: [
      jumpItem("빨간 지점으로", "red", counts?.red),
      jumpItem("파란 지점으로", "blue", counts?.blue),
      jumpItem("노란 지점으로", "yellow", counts?.yellow),
    ],
    검토: [
      { label: "AI 변환·검토 실행 (Ctrl+Enter)", action: () => void performConvert() },
      "divider",
      ...toItems(buildMacroEntries(macros, [{ cat: "R", group: "검토 매크로" }], hasPreview, runMacro)),
      { label: "공문 원클릭 정돈", action: () => runMacro("GONGMUN_POLISH"), ...needsConvert },
    ],
    출력: [
      { label: "한글 문서 (.hwpx)", action: openDownload("hwpx"), ...needsConvert },
      {
        label: "한글 97-2010 (.hwp) — 베타",
        action: () => {
          if (!docId) return;
          void downloadHwpWithWarnings(docId, title)
            .then((warnings) => {
              if (warnings.length > 0) {
                alert(
                  `일부 요소가 텍스트로 대체되었습니다 (${warnings.length}건). 완전한 서식은 HWPX 권장\n- ${warnings.join("\n- ")}`,
                );
              }
            })
            .catch(() => alert("HWP 생성 실패 — HWPX 형식을 사용해주세요"));
        },
        ...needsConvert,
      },
      { label: "Word 문서 (.docx)", action: openDownload("docx"), ...needsConvert },
      { label: "PDF (.pdf)", action: openDownload("pdf"), ...needsConvert },
      { label: "마크다운 (.md)", action: () => downloadMarkdown(source, title), ...needsSource },
      {
        label: "프레젠테이션 (.pptx) — 슬라이드 탭으로",
        action: () => {
          try { sessionStorage.setItem("docuax_slide_prefill", source); } catch {}
          setActiveTab("slides");
        },
        ...needsSource,
      },
      "divider",
      { label: "인쇄 (Ctrl+P)", action: () => window.print() },
      "divider",
      ...CHANNEL_PRESETS.map<MenuItem>((ch) => ({
        label: `${ch.emoji} ${ch.label} — ${ch.hint}`,
        group: "채널 변환",
        action: () => void exportToChannel(ch.id),
        ...needsConvert,
      })),
      ...toItems(buildMacroEntries(macros, [{ cat: "P", group: "출력 매크로" }], hasPreview, runMacro)),
    ],
    도구: [
      { label: "슬라이드 탭으로", action: () => setActiveTab("slides") },
    ],
  };
}
