import { AUTO_CONVERT_EVENT, dispatchAutoConvert } from "@/lib/events";

describe("dispatchAutoConvert", () => {
  it("AUTO_CONVERT_EVENT 를 dispatch 한다 (detail 없음 = fastConvert store 플래그가 결정)", () => {
    const handler = jest.fn();
    window.addEventListener(AUTO_CONVERT_EVENT, handler);
    try {
      dispatchAutoConvert();
      expect(handler).toHaveBeenCalledTimes(1);
      const evt = handler.mock.calls[0][0] as CustomEvent<{ forceFast?: boolean } | undefined>;
      // RemoteControl 리스너가 (detail || {}).forceFast 로 읽으므로 undefined/미지정 모두 안전
      expect(evt.detail?.forceFast).toBeUndefined();
    } finally {
      window.removeEventListener(AUTO_CONVERT_EVENT, handler);
    }
  });

  it("forceFast=true detail 을 그대로 전달한다 (에디터 자동반영 debounce 경로)", () => {
    const handler = jest.fn();
    window.addEventListener(AUTO_CONVERT_EVENT, handler);
    try {
      dispatchAutoConvert({ forceFast: true });
      const evt = handler.mock.calls[0][0] as CustomEvent<{ forceFast?: boolean }>;
      expect(evt.detail.forceFast).toBe(true);
    } finally {
      window.removeEventListener(AUTO_CONVERT_EVENT, handler);
    }
  });
});
