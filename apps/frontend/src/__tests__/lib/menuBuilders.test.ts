import { buildMacroEntries } from "@/lib/menuBuilders";
import type { MacroDescriptor } from "@/lib/api";

const macro = (id: string, category: MacroDescriptor["category"], name: string): MacroDescriptor => ({
  id,
  category,
  name,
  description: "",
  ai_powered: false,
  auto: false,
  shortcut: {},
});

const MACROS: MacroDescriptor[] = [
  macro("T1", "T", "표 생성"),
  macro("B1", "B", "블록 선택"),
  macro("S1", "S", "셀 병합"),
  macro("T2", "T", "표 테두리"),
  macro("G1", "G", "굵게"),
];

describe("buildMacroEntries", () => {
  it("카테고리 필터·그룹 라벨·순서 — 카테고리 선언 순서대로, 카테고리 내에서는 원본 순서 유지", () => {
    const onRun = jest.fn();
    const entries = buildMacroEntries(
      MACROS,
      [
        { cat: "T", group: "표 매크로" },
        { cat: "S", group: "셀 매크로" },
      ],
      true,
      onRun,
    );
    expect(entries.map((e) => e.id)).toEqual(["T1", "T2", "S1"]);
    expect(entries.map((e) => e.group)).toEqual(["표 매크로", "표 매크로", "셀 매크로"]);
    expect(entries.every((e) => !e.disabled)).toBe(true);
    // run 은 해당 매크로 id 로 onRun 호출
    entries[2].run();
    expect(onRun).toHaveBeenCalledWith("S1");
  });

  it("hasPreview=false → 전부 disabled + disabledReason", () => {
    const entries = buildMacroEntries(
      MACROS,
      [
        { cat: "B", group: "블록" },
        { cat: "G", group: "글자" },
      ],
      false,
      jest.fn(),
    );
    expect(entries).toHaveLength(2);
    for (const e of entries) {
      expect(e.disabled).toBe(true);
      expect(e.disabledReason).toBeTruthy();
    }
  });

  it("빈 매크로 목록 → []", () => {
    expect(buildMacroEntries([], [{ cat: "T", group: "표 매크로" }], true, jest.fn())).toEqual([]);
  });
});
