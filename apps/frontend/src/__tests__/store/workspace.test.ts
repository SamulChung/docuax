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
});
