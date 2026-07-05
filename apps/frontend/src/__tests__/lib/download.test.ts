import { downloadMarkdown } from "@/lib/download";

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
