import { getStaticCommands, filterCommands } from "@/lib/commands";

describe("commands", () => {
  it("정적 명령에 서식·삽입·파일·내보내기 명령이 있다", () => {
    const ids = getStaticCommands().map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([
      "format.bold", "insert.table", "file.save", "export.md", "view.slides",
    ]));
  });

  it("filterCommands — 라벨·키워드 부분 일치 (대소문자 무시)", () => {
    const cmds = [
      { id: "a", label: "굵게", keywords: "bold strong", run: () => {} },
      { id: "b", label: "표 삽입", keywords: "table", run: () => {} },
    ];
    expect(filterCommands(cmds, "BOLD").map((c) => c.id)).toEqual(["a"]);
    expect(filterCommands(cmds, "표").map((c) => c.id)).toEqual(["b"]);
    expect(filterCommands(cmds, "").length).toBe(2);
  });
});
