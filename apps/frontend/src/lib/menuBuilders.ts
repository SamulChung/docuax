// 메뉴 항목 빌더 — 매크로 목록을 상단 메뉴 드롭다운 항목으로 변환.
// 순수 함수로 분리해 MenuBar(메뉴 구성)와 테스트가 동일 로직을 공유한다.
import type { MacroDescriptor } from "@/lib/api";

export interface MenuEntry {
  id: string;
  label: string;
  /** 그룹 헤더 라벨 — 같은 group 이 연속되는 항목 묶음 위에 1회 렌더 */
  group?: string;
  disabled?: boolean;
  disabledReason?: string;
  run: () => void;
}

/** 변환 전 매크로 비활성 사유 — 리모컨·macroActions 가드와 동일 문구 */
export const NEEDS_CONVERT_REASON = "먼저 변환(Ctrl+Enter)을 실행하세요";

/**
 * 카테고리 필터 + 그룹 라벨로 매크로를 메뉴 항목으로 변환.
 * - categories 선언 순서대로 그룹이 나열되고, 각 그룹 내에서는 macros 원본 순서 유지.
 * - hasPreview=false 면 전부 비활성 (매크로는 변환 결과가 있어야 실행 가능).
 */
export function buildMacroEntries(
  macros: MacroDescriptor[],
  categories: { cat: MacroDescriptor["category"]; group: string }[],
  hasPreview: boolean,
  onRun: (macroId: string) => void,
): MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const { cat, group } of categories) {
    for (const m of macros) {
      if (m.category !== cat) continue;
      entries.push({
        id: m.id,
        label: `${m.name} (${m.id})`,
        group,
        disabled: !hasPreview,
        disabledReason: hasPreview ? undefined : NEEDS_CONVERT_REASON,
        run: () => onRun(m.id),
      });
    }
  }
  return entries;
}
