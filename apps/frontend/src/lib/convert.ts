// 변환 실행 로직 — RemoteControl에서 추출 (메뉴·리본·팔레트가 공유).
import { convertDocument } from "@/lib/api";
import { getOrganizationId } from "@/lib/user";
import { useWorkspace } from "@/store/workspace";

/**
 * 마크다운 → 문서 변환 실행 — 리모컨·상단 메뉴·리본·자동변환 이벤트가 공유하는 실행부.
 *
 * store snapshot 을 직독해 busy 재진입·빈 source 를 가드하고, 변환 결과를 setPreview 로
 * 반영한다. 오류는 429(레이트리밋)·일일 한도·일반 실패 3종 alert 로 사용자에게 알린다.
 *
 * @param opts.forceFast true 면 fastConvert 설정과 무관하게 LLM 단계 2(분석)·4(검토)를
 *   모두 skip (skip_analyze/skip_review) — 채팅 자동반영처럼 이미 LLM 을 거친 직후의
 *   재변환 경로에서 사용. 미지정 시 store 의 fastConvert 플래그가 fast/full 을 결정.
 */
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
  // 신구대조표(diff view) 기준선 — 어떤 경로(리본·메뉴·이벤트)로 변환하든 갱신
  s.setPrevSource(s.source);
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
    // 일일 한도 초과가 429보다 구체적이므로 먼저 검사 (429 선검사 시 도달 불가였던 기존 결함 수정)
    if (msg.includes("일일 한도") || msg.includes("daily")) {
      alert("오늘 변환 한도를 초과했습니다.\n상단 요금제에서 플랜을 업그레이드하실 수 있습니다.");
    } else if (msg.includes("429")) {
      alert("요청이 너무 많아 잠시 대기가 필요합니다.\n잠시 후 다시 시도하거나, 일일 한도가 충분한 플랜으로 업그레이드하세요.");
    } else {
      alert(`변환 실패: ${msg}`);
    }
  } finally {
    useWorkspace.getState().setBusy(false);
  }
}
