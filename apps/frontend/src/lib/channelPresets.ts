// 1:N 채널 내보내기 프리셋 + 실행 로직 — RemoteControl에서 추출 (출력 메뉴와 공유).
import { downloadUrl } from "@/lib/api";
import { copyPreviewToClipboard } from "@/lib/clipboard";
import { executeMacroAction, NEEDS_CONVERT_MSG } from "@/lib/macroActions";
import { useWorkspace } from "@/store/workspace";

export const CHANNEL_PRESETS = [
  { id: "instagram", label: "인스타그램", emoji: "📸", hint: "MZ톤 변환 후 클립보드" },
  { id: "band",      label: "밴드·카카오", emoji: "💬", hint: "60대톤 변환 후 클립보드" },
  { id: "email",     label: "이메일",     emoji: "📧", hint: "PDF 다운로드" },
  { id: "blog",      label: "블로그",     emoji: "✍️", hint: "HTML+텍스트 클립보드" },
] as const;

export type ChannelId = (typeof CHANNEL_PRESETS)[number]["id"];

/**
 * 채널 프리셋 실행 — RemoteControl(출력 탭)·상단 출력 메뉴가 공유.
 * - instagram/band: G16 톤 변환 후 결과를 클립보드에 복사
 * - email: PDF 새 탭 다운로드
 * - blog: HTML+텍스트 클립보드 복사
 */
export async function exportToChannel(channelId: ChannelId): Promise<void> {
  if (!useWorkspace.getState().preview?.document_id) {
    alert(NEEDS_CONVERT_MSG);
    return;
  }
  if (channelId === "instagram") {
    await executeMacroAction("G16", { target_age: "MZ" });
    const docId = useWorkspace.getState().preview?.document_id;
    if (!docId) return;
    try {
      await copyPreviewToClipboard(docId);
      alert("인스타그램 캡션이 클립보드에 복사됐습니다 📸");
    } catch (e) { alert(`클립보드 복사 실패: ${(e as Error).message}`); }
  } else if (channelId === "band") {
    await executeMacroAction("G16", { target_age: "60대" });
    const docId = useWorkspace.getState().preview?.document_id;
    if (!docId) return;
    try {
      await copyPreviewToClipboard(docId);
      alert("밴드·카카오용 텍스트가 클립보드에 복사됐습니다 💬");
    } catch (e) { alert(`클립보드 복사 실패: ${(e as Error).message}`); }
  } else if (channelId === "email") {
    const docId = useWorkspace.getState().preview?.document_id;
    if (docId) window.open(downloadUrl(docId, "pdf"), "_blank");
  } else if (channelId === "blog") {
    const docId = useWorkspace.getState().preview?.document_id;
    if (!docId) return;
    try {
      await copyPreviewToClipboard(docId);
      alert("블로그용 HTML+텍스트가 클립보드에 복사됐습니다 ✍️");
    } catch (e) { alert(`클립보드 복사 실패: ${(e as Error).message}`); }
  }
}
