// 앱 전역 CustomEvent 이름 상수 — 문자열 리터럴 중복 방지.
// 변환 트리거 이벤트: MenuBar·RibbonToolbar·Editor(디바운스)가 dispatch,
// RemoteControl 이 상시 listen 하여 실제 변환을 실행한다.
// (탭·접힘·페르소나와 무관하게 동작해야 하므로 패널이 아닌 RemoteControl 에서 listen —
//  legacy "docuax:trigger-convert" 리스너와 동일한 위치·계약)
export const AUTO_CONVERT_EVENT = "docuax:auto-convert";

/**
 * 변환 실행 이벤트 dispatch — 리스너는 RemoteControl 에 있다.
 * detail.forceFast=true 면 LLM 분석·검토 단계를 강제 skip (에디터 자동반영 디바운스 등).
 * detail 생략 시 fastConvert store 플래그가 fast/full 을 결정한다.
 */
export function dispatchAutoConvert(detail?: { forceFast?: boolean }): void {
  window.dispatchEvent(new CustomEvent(AUTO_CONVERT_EVENT, { detail }));
}
