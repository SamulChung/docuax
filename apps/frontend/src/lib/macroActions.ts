// 매크로 실행 로직 — RemoteControl에서 추출 (메뉴·리본·팔레트가 공유).
import { executeMacro } from "@/lib/api";
import { performConvert } from "@/lib/convert";
import { useWorkspace } from "@/store/workspace";

export async function executeMacroAction(
  macroId: string,
  params?: Record<string, unknown>
): Promise<void> {
  const preview = useWorkspace.getState().preview;
  if (!preview?.document_id) {
    alert("먼저 변환(Ctrl+Enter)을 실행하세요");
    return;
  }
  const setPreview = useWorkspace.getState().setPreview;

  // 선택된 블록 ID 자동 첨부 — 미리보기에서 클릭으로 고른 블록들
  const selectedIds = useWorkspace.getState().selectedBlockIds;
  if (selectedIds.length > 0 && (!params || !params.selected_block_ids)) {
    params = { ...(params ?? {}), selected_block_ids: selectedIds };
  }

  // GONGMUN_POLISH — T5·T16·S12·S13·B20 순차 실행 (공문 원클릭 정돈)
  if (macroId === "GONGMUN_POLISH") {
    const seq = ["T5", "T16", "S12", "S13", "B20"];
    for (const id of seq) {
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
    // 즉시 재변환
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
