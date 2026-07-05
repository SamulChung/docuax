import { downloadMarkdown } from "@/lib/download";

describe("downloadMarkdown", () => {
  it("Blob URL을 만들어 a[download]를 클릭한다", () => {
    const createObjectURL = jest.fn((_blob: Blob) => "blob:fake");
    const revokeObjectURL = jest.fn();
    Object.defineProperty(window.URL, "createObjectURL", { value: createObjectURL, writable: true });
    Object.defineProperty(window.URL, "revokeObjectURL", { value: revokeObjectURL, writable: true });
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
    Object.defineProperty(window.URL, "createObjectURL", { value: () => "blob:x", writable: true });
    Object.defineProperty(window.URL, "revokeObjectURL", { value: () => {}, writable: true });
    let anchor: HTMLAnchorElement | null = null;
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      anchor = this;
    });
    downloadMarkdown("x", "");
    expect(anchor!.download).toBe("document.md");
    click.mockRestore();
  });
});
