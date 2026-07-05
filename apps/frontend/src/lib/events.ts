// 앱 전역 CustomEvent 이름 상수 — 문자열 리터럴 중복 방지.
// 변환 트리거 이벤트: MenuBar·RibbonToolbar·Editor(디바운스)가 dispatch,
// WorkerConvertPanel 이 listen 하여 실제 변환을 실행한다.
export const AUTO_CONVERT_EVENT = "docuax:auto-convert";

/** 변환 실행 이벤트 dispatch — 리스너는 WorkerConvertPanel 에 있다. */
export function dispatchAutoConvert(): void {
  window.dispatchEvent(new CustomEvent(AUTO_CONVERT_EVENT));
}
