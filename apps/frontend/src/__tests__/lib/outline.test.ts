import { parseOutline } from "@/lib/outline";

describe("parseOutline", () => {
  it("H1~H3 헤딩을 줄 번호와 함께 추출", () => {
    const src = "# 제목\n본문\n## 소제목\n### 세부\n#### 4단계는 제외";
    expect(parseOutline(src)).toEqual([
      { level: 1, text: "제목", line: 1 },
      { level: 2, text: "소제목", line: 3 },
      { level: 3, text: "세부", line: 4 },
    ]);
  });

  it("코드펜스 내부 #은 무시", () => {
    const src = "```\n# 주석\n```\n# 진짜 제목";
    expect(parseOutline(src)).toEqual([{ level: 1, text: "진짜 제목", line: 4 }]);
  });

  it("빈 문서 → []", () => {
    expect(parseOutline("")).toEqual([]);
  });
});
