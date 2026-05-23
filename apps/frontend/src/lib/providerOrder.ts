// Provider 토글 동적 정렬 규칙 — 박사님 운영 정책 반영.
//
// 우선순위 (앞에 노출되는 순서):
//   1. "auto"  — 현재 활성 provider 사용 (항상 첫 번째)
//   2. TenOS-Ko — 자체 LLM. configured 이면 그대로, 아니면 마지막 일반 자리.
//   3. configured=True 외부 provider (Claude, ChatGPT) — 키가 설정된 것 우선
//   4. configured=False 외부 provider — 회색·클릭 시 안내
//   5. Mock — 항상 가용이지만 운영용 아니므로 맨 뒤
//
// 박사님 의도: TenOS 가 기본값. 만약 운영자가 Claude/ChatGPT 키를 넣었다면 그것도 토글에 활성으로 보이게.

import type { ProviderStatus } from "@/lib/api";

export type ProviderChoiceId = ProviderStatus["id"] | "auto" | "chain";

export interface SortableProvider extends ProviderStatus {
  /** 정렬용 우선순위 점수 (낮을수록 앞) */
  order: number;
}

const RANK: Record<string, number> = {
  tenos: 10,
  tenos_hf: 11,
  anthropic: 20,
  openai: 21,
  mock: 90,
  chain: 95,
};

/**
 * 백엔드 /providers 응답을 토글 메뉴 표시 순서로 정렬.
 * configured 가 우선이지만, TenOS·자체는 configured 여부와 무관하게 앞에 둔다 (자사 자산).
 */
export function sortProviders(items: ProviderStatus[]): SortableProvider[] {
  return items
    .map((p) => {
      let order = RANK[p.id] ?? 50;
      // 자체 LLM(TenOS) 가 아닌 외부 provider 가 configured 면 살짝 앞으로 (활성 강조)
      if (!p.id.startsWith("tenos") && p.id !== "mock" && p.configured) {
        order -= 5;
      }
      // configured=False 인 외부 provider 는 뒤로
      if (!p.configured && p.id !== "mock") {
        order += 30;
      }
      return { ...p, order };
    })
    .sort((a, b) => a.order - b.order);
}
