// 매크로 실행 로직 — RemoteControl에서 추출 (메뉴·리본·팔레트가 공유).
import { executeMacro } from "@/lib/api";
import { performConvert } from "@/lib/convert";
import { useWorkspace } from "@/store/workspace";

/** 변환 결과(preview)가 필요한 동작의 가드 문구 — 리모컨·메뉴·팔레트가 공유하는 단일 소스 */
export const NEEDS_CONVERT_MSG = "먼저 변환(Ctrl+Enter)을 실행하세요";

/**
 * GONGMUN_POLISH — 공문 원클릭 정돈 순차 실행 시퀀스.
 * 각 코드의 의미(backend app/macros/categories 의 name 기준):
 * - T5  셀 너비 균등 — 선택 표·행의 셀 너비 자동 균등 분배
 * - T16 테두리 일괄 — 외곽 굵게·내부 얇게 표준 테두리
 * - S12 숫자 자동 우측 정렬 — 셀이 숫자면 자동 우측 정렬
 * - S13 머리행 자동 강조 — 첫 행을 헤더 스타일로 자동 변환
 * - B20 단락 자동 정리 — 빈 단락 정리 + 공백 정규화
 */
export const GONGMUN_POLISH_SEQUENCE = ["T5", "T16", "S12", "S13", "B20"] as const;

/**
 * 매크로 1건 실행 — 리모컨·상단 메뉴·리본·명령 팔레트가 공유하는 실행부.
 *
 * 특수 분기: GONGMUN_POLISH(순차 실행), N1~N3(프론트 점프, 백엔드 X),
 * T1~T4(마크다운 표 골격 삽입 후 재변환), B11/B12/B14(브라우저 클립보드),
 * 그 외는 executeMacro API 호출 후 setPreview.
 *
 * 파라미터 다이얼로그 판단(MACRO_PARAM_SCHEMAS)은 UI 레이어(RemoteControl 등)의 몫 —
 * 여기 도달한 params 는 이미 확정된 값이어야 한다.
 *
 * @param macroId 매크로 ID (예: "T5", "N1", "GONGMUN_POLISH")
 * @param params 매크로 파라미터 — 백엔드 execute 에 그대로 전달.
 *   미리보기에서 블록이 선택돼 있으면 selected_block_ids 가 자동 첨부된다.
 *   (T1~T4 는 rows/cols 를 읽고, B14 는 plain_text 를 내부에서 추가)
 */
export async function executeMacroAction(
  macroId: string,
  params?: Record<string, unknown>
): Promise<void> {
  const preview = useWorkspace.getState().preview;
  if (!preview?.document_id) {
    alert(NEEDS_CONVERT_MSG);
    return;
  }
  const setPreview = useWorkspace.getState().setPreview;

  // 선택된 블록 ID 자동 첨부 — 미리보기에서 클릭으로 고른 블록들
  const selectedIds = useWorkspace.getState().selectedBlockIds;
  if (selectedIds.length > 0 && (!params || !params.selected_block_ids)) {
    params = { ...(params ?? {}), selected_block_ids: selectedIds };
  }

  // GONGMUN_POLISH — 공문 원클릭 정돈 (시퀀스 정의·코드별 설명은 GONGMUN_POLISH_SEQUENCE 참고)
  if (macroId === "GONGMUN_POLISH") {
    for (const id of GONGMUN_POLISH_SEQUENCE) {
      const docId = useWorkspace.getState().preview?.document_id;
      if (!docId) break;
      try {
        const res = await executeMacro({ macro_id: id, document_id: docId, params });
        setPreview(res.preview);
      } catch {
        // 개별 매크로 실패해도 나머지 계속 실행
      }
    }
    return;
  }

  // N1/N2/N3는 백엔드 호출 없이 프론트 스토어에서 직접 점프 — 즉각 반응
  if (macroId === "N1" || macroId === "N2" || macroId === "N3") {
    const color = macroId === "N1" ? "red" : macroId === "N2" ? "blue" : "yellow";
    useWorkspace.getState().jumpToNext(color);
    return;
  }

  // T1~T4 표 생성 — 에디터의 source 끝에 마크다운 표 골격 추가
  // 사용자가 마크다운 에디터에서 셀을 채우게 함. 그리고 자동 재변환.
  if (["T1", "T2", "T3", "T4"].includes(macroId)) {
    const rows = (params?.rows as number) ?? 3;
    const cols = (params?.cols as number) ?? 3;
    const cur = useWorkspace.getState().source;
    const header = "| " + Array.from({ length: cols }, (_, i) => `열 ${i + 1}`).join(" | ") + " |";
    const sep = "| " + Array.from({ length: cols }, () => "---").join(" | ") + " |";
    const body = Array.from({ length: rows - 1 }, () =>
      "| " + Array.from({ length: cols }, () => "  ").join(" | ") + " |"
    ).join("\n");
    const tableMd = `\n\n${header}\n${sep}\n${body}\n`;
    useWorkspace.getState().setSource(cur + tableMd);
    // 즉시 재변환 — setSource 가 store·에디터에 반영될 시간을 잠깐(50ms) 준 뒤 실행
    setTimeout(() => performConvert(), 50);
    return;
  }

  // B11(복사)·B12(잘라내기)는 브라우저 Clipboard API로 처리
  if (macroId === "B11" || macroId === "B12") {
    try {
      // 변환 결과 전체 텍스트를 클립보드에 — 운영에서는 선택 영역만
      await navigator.clipboard.writeText(preview.plain_text);
    } catch {
      alert("클립보드 권한이 필요합니다");
      return;
    }
    if (macroId === "B12") {
      // 잘라내기는 백엔드도 호출 (블록 제거)
      try {
        const res = await executeMacro({
          macro_id: macroId,
          document_id: preview.document_id,
          params,
        });
        setPreview(res.preview);
      } catch {
        /* 백엔드 실패는 무시 — 클립보드 복사는 성공 */
      }
    }
    return;
  }

  // B14 평문 붙임 — 브라우저 클립보드에서 읽어 백엔드에 전달
  if (macroId === "B14") {
    try {
      const text = await navigator.clipboard.readText();
      const res = await executeMacro({
        macro_id: macroId,
        document_id: preview.document_id,
        params: { ...params, plain_text: text },
      });
      setPreview(res.preview);
    } catch {
      alert("클립보드 읽기 권한이 필요합니다");
    }
    return;
  }

  try {
    const res = await executeMacro({
      macro_id: macroId,
      document_id: preview.document_id,
      params,
    });
    setPreview(res.preview);
    // 변경된 블록 표시 — 선택된 블록을 잠깐 강조
    const changedIds = (params?.selected_block_ids as string[] | undefined) ?? [];
    if (changedIds.length > 0) {
      useWorkspace.getState().setRecentlyChanged(changedIds);
    }
    // R9 결과는 alert로 일단 노출 (추후 사이드 패널로)
    if (macroId === "R9" && res.result?.score !== undefined) {
      const score = res.result.score as number;
      const suggestions = (res.result.suggestions as string[] | undefined) ?? [];
      alert(
        `기관 양식 일치도: ${(score * 100).toFixed(0)}점\n\n` +
          (suggestions.length ? `개선 제안:\n- ${suggestions.join("\n- ")}` : "개선 사항 없음")
      );
    }
  } catch (e) {
    alert(`매크로 실행 실패: ${(e as Error).message}`);
  }
}
