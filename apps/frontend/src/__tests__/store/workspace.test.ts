import { useWorkspace } from "@/store/workspace";

describe("workspace store — v3 shell state", () => {
  it("activeTab 기본값은 doc, setActiveTab으로 전환", () => {
    expect(useWorkspace.getState().activeTab).toBe("doc");
    useWorkspace.getState().setActiveTab("slides");
    expect(useWorkspace.getState().activeTab).toBe("slides");
    useWorkspace.getState().setActiveTab("doc");
  });

  it("pageCount 기본값 0, setPageCount로 갱신", () => {
    expect(useWorkspace.getState().pageCount).toBe(0);
    useWorkspace.getState().setPageCount(3);
    expect(useWorkspace.getState().pageCount).toBe(3);
  });

  it("currentDocId 기본값 null, setCurrentDocId로 갱신", () => {
    expect(useWorkspace.getState().currentDocId).toBeNull();
    useWorkspace.getState().setCurrentDocId("doc-1");
    expect(useWorkspace.getState().currentDocId).toBe("doc-1");
    useWorkspace.getState().setCurrentDocId(null);
  });

  it("dirty 기본값 false, setSource 호출 시 true로 전환", () => {
    useWorkspace.getState().setDirty(false);
    expect(useWorkspace.getState().dirty).toBe(false);
    useWorkspace.getState().setSource("본문 변경");
    expect(useWorkspace.getState().dirty).toBe(true);
  });

  it("dirty는 setDirty로 명시적으로 false로 되돌릴 수 있다", () => {
    useWorkspace.getState().setSource("x");
    expect(useWorkspace.getState().dirty).toBe(true);
    useWorkspace.getState().setDirty(false);
    expect(useWorkspace.getState().dirty).toBe(false);
  });

  it("resetWorkspace는 currentDocId를 null로, dirty를 false로 되돌린다", () => {
    useWorkspace.getState().setCurrentDocId("doc-2");
    useWorkspace.getState().setSource("무언가");
    expect(useWorkspace.getState().currentDocId).toBe("doc-2");
    expect(useWorkspace.getState().dirty).toBe(true);
    useWorkspace.getState().resetWorkspace();
    expect(useWorkspace.getState().currentDocId).toBeNull();
    expect(useWorkspace.getState().dirty).toBe(false);
  });

  it("outlineOpen 기본값 false, toggleOutline으로 전환", () => {
    expect(useWorkspace.getState().outlineOpen).toBe(false);
    useWorkspace.getState().toggleOutline();
    expect(useWorkspace.getState().outlineOpen).toBe(true);
    useWorkspace.getState().toggleOutline();
    expect(useWorkspace.getState().outlineOpen).toBe(false);
  });
});
