import { splitTitle } from "@/lib/mdImport";

describe("splitTitle — 첫 H1 제목 분리", () => {
  it("H1 이 있으면 제목으로 추출하고 본문에서 그 줄을 제거한다", () => {
    const { title, body } = splitTitle("# 보고서 제목\n\n본문 첫 문단");
    expect(title).toBe("보고서 제목");
    expect(body).toBe("본문 첫 문단");
    expect(body).not.toContain("# 보고서 제목");
  });

  it("H1 앞의 빈 줄은 건너뛰고 제목을 찾는다", () => {
    const { title, body } = splitTitle("\n\n# 제목\n본문");
    expect(title).toBe("제목");
    expect(body).toBe("본문");
  });

  it("H1 이 없으면 제목은 빈 문자열, 본문은 원문 전체", () => {
    const text = "그냥 문단\n\n## 소제목은 H1 아님";
    const { title, body } = splitTitle(text);
    expect(title).toBe("");
    expect(body).toBe(text);
  });

  it("일반 텍스트 줄이 먼저 나오면 이후 H1 은 제목으로 승격하지 않는다", () => {
    const text = "서문 문단\n\n# 나중 제목";
    const { title, body } = splitTitle(text);
    expect(title).toBe("");
    expect(body).toBe(text);
  });

  it("빈 문자열이면 제목 없음 + 빈 본문", () => {
    const { title, body } = splitTitle("");
    expect(title).toBe("");
    expect(body).toBe("");
  });
});
