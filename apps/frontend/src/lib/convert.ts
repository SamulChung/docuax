// 변환 실행 로직 — RemoteControl에서 추출 (메뉴·리본·팔레트가 공유).
import { convertDocument } from "@/lib/api";
import { getOrganizationId } from "@/lib/user";
import { useWorkspace } from "@/store/workspace";

export async function performConvert(opts?: { forceFast?: boolean }): Promise<void> {
  // 드롭존에서 setSource(...) 직후 동기적으로 호출되는 경로가 있어
  // selector closure 가 stale 한 빈 source 를 캡처할 수 있음 — store snapshot 으로 직독.
  const s = useWorkspace.getState();
  if (s.busy) return;
  if (!s.source || s.source.trim().length === 0) {
    alert("변환할 마크다운이 비어 있습니다. 에디터에 입력하거나 .md 파일을 드롭하세요.");
    return;
  }
  s.setBusy(true);
  try {
    const orgId = getOrganizationId();
    // ⚡ 빠른 변환 — fastConvert ON 또는 자동반영 이벤트(forceFast=true) 시
    //   LLM 단계 2(분석)·4(검토) 모두 skip → 1~2ms 변환
    const fast = !!opts?.forceFast || s.fastConvert;
    const res = await convertDocument({
      source: s.source,
      title: s.title || undefined,
      persona_mode: s.persona,
      organization_id: orgId ?? undefined,
      skip_analyze: fast,
      skip_review: fast,
    });
    s.setPreview(res.preview);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    const msg = (e as Error).message;
    if (msg.includes("429")) {
      alert("요청이 너무 많아 잠시 대기가 필요합니다.\n잠시 후 다시 시도하거나, 일일 한도가 충분한 플랜으로 업그레이드하세요.");
    } else if (msg.includes("429") || msg.includes("일일 한도") || msg.includes("daily")) {
      alert("오늘 변환 한도를 초과했습니다.\n상단 요금제에서 플랜을 업그레이드하실 수 있습니다.");
    } else {
      alert(`변환 실패: ${msg}`);
    }
  } finally {
    useWorkspace.getState().setBusy(false);
  }
}
