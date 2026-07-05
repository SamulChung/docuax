import { downloadMarkdown, parseDocuaxWarnings } from "@/lib/download";

describe("downloadMarkdown", () => {
  // window.URL 원본 디스크립터를 보관했다가 각 테스트 후 복원 — 파일 내 다른 테스트 오염 방지
  const originalCreate = Object.getOwnPropertyDescriptor(window.URL, "createObjectURL");
  const originalRevoke = Object.getOwnPropertyDescriptor(window.URL, "revokeObjectURL");

  afterEach(() => {
    if (originalCreate) Object.defineProperty(window.URL, "createObjectURL", originalCreate);
    else delete (window.URL as Partial<typeof window.URL>).createObjectURL;
    if (originalRevoke) Object.defineProperty(window.URL, "revokeObjectURL", originalRevoke);
    else delete (window.URL as Partial<typeof window.URL>).revokeObjectURL;
  });

  it("Blob URL을 만들어 a[download]를 클릭한다", () => {
    const createObjectURL = jest.fn((_blob: Blob) => "blob:fake");
    const revokeObjectURL = jest.fn();
    Object.defineProperty(window.URL, "createObjectURL", { value: createObjectURL, writable: true, configurable: true });
    Object.defineProperty(window.URL, "revokeObjectURL", { value: revokeObjectURL, writable: true, configurable: true });
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadMarkdown("# hello", "보고서");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/markdown;charset=utf-8");
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    click.mockRestore();
  });

  it("파일명이 비면 document.md", () => {
    Object.defineProperty(window.URL, "createObjectURL", { value: () => "blob:x", writable: true, configurable: true });
    Object.defineProperty(window.URL, "revokeObjectURL", { value: () => {}, writable: true, configurable: true });
    let anchor: HTMLAnchorElement | null = null;
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      anchor = this;
    });
    downloadMarkdown("x", "");
    expect(anchor!.download).toBe("document.md");
    click.mockRestore();
  });
});

describe("parseDocuaxWarnings", () => {
  it("헤더가 없으면(null) 빈 배열", () => {
    expect(parseDocuaxWarnings(null)).toEqual([]);
  });

  it("빈 문자열도 빈 배열", () => {
    expect(parseDocuaxWarnings("")).toEqual([]);
  });

  it("encodeURIComponent(JSON.stringify(string[])) 를 복원한다", () => {
    const warnings = ["수식 1개가 텍스트로 대체됨", "각주 2개 생략 …외 3건"];
    const header = encodeURIComponent(JSON.stringify(warnings));
    expect(parseDocuaxWarnings(header)).toEqual(warnings);
  });

  it("깨진 값(비JSON·비배열)은 빈 배열로 안전하게 처리", () => {
    expect(parseDocuaxWarnings("not-json%%%")).toEqual([]);
    expect(parseDocuaxWarnings(encodeURIComponent('"just-a-string"'))).toEqual([]);
    expect(parseDocuaxWarnings(encodeURIComponent('{"a":1}'))).toEqual([]);
  });

  it("배열 안의 문자열이 아닌 항목은 걸러낸다", () => {
    const header = encodeURIComponent(JSON.stringify(["ok", 42, null, "ok2"]));
    expect(parseDocuaxWarnings(header)).toEqual(["ok", "ok2"]);
  });
});
