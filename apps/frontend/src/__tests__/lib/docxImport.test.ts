import { htmlToMarkdown } from "@/lib/docxImport";

describe("htmlToMarkdown", () => {
  it("헤딩·굵게·리스트 변환", () => {
    const md = htmlToMarkdown("<h1>제목</h1><p><strong>굵게</strong></p><ul><li>항목</li></ul>");
    expect(md).toContain("# 제목");
    expect(md).toContain("**굵게**");
    expect(md).toContain("- 항목");
  });

  it("표 변환 (GFM 파이프 표)", () => {
    const md = htmlToMarkdown("<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>");
    expect(md).toContain("| a | b |");
    expect(md).toContain("| 1 | 2 |");
  });
});
