import { createDocument, updateDocument } from "@/lib/api";
import { saveAsNewDocument, saveCurrentDocument } from "@/lib/docActions";
import { useWorkspace } from "@/store/workspace";

jest.mock("@/lib/api");

const mockCreateDocument = createDocument as jest.MockedFunction<typeof createDocument>;
const mockUpdateDocument = updateDocument as jest.MockedFunction<typeof updateDocument>;

function resetStore() {
  useWorkspace.setState({
    source: "",
    title: "",
    currentDocId: null,
    dirty: false,
    saveState: { kind: "none", at: null },
  });
}

describe("docActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  describe("saveCurrentDocument", () => {
    it("currentDocId가 있으면 updateDocument를 호출하고 saved 상태로 전환한다", async () => {
      useWorkspace.setState({ source: "본문", title: "제목", currentDocId: "doc-1", dirty: true });
      mockUpdateDocument.mockResolvedValue({
        id: "doc-1",
        title: "제목",
        preview: "본문",
        updated_at: "2026-01-01T00:00:00Z",
        source_md: "본문",
        created_at: "2026-01-01T00:00:00Z",
      });

      await saveCurrentDocument();

      expect(mockUpdateDocument).toHaveBeenCalledWith("doc-1", { title: "제목", source_md: "본문" });
      expect(mockCreateDocument).not.toHaveBeenCalled();
      expect(useWorkspace.getState().dirty).toBe(false);
      expect(useWorkspace.getState().saveState.kind).toBe("saved");
    });

    it("currentDocId가 없으면 createDocument를 호출하고 currentDocId를 설정한다", async () => {
      jest.spyOn(window, "prompt").mockReturnValue("새 문서 제목");
      useWorkspace.setState({ source: "본문", title: "", currentDocId: null, dirty: true });
      mockCreateDocument.mockResolvedValue({
        id: "doc-new",
        title: "새 문서 제목",
        preview: "본문",
        updated_at: "2026-01-01T00:00:00Z",
        source_md: "본문",
        created_at: "2026-01-01T00:00:00Z",
      });

      await saveCurrentDocument();

      expect(mockCreateDocument).toHaveBeenCalledWith({ title: "새 문서 제목", source_md: "본문" });
      expect(useWorkspace.getState().currentDocId).toBe("doc-new");
      expect(useWorkspace.getState().dirty).toBe(false);
      expect(useWorkspace.getState().saveState.kind).toBe("saved");
    });

    it("API가 실패하면 error 상태로 전환되고 dirty는 유지된다", async () => {
      useWorkspace.setState({ source: "본문", title: "제목", currentDocId: "doc-1", dirty: true });
      mockUpdateDocument.mockRejectedValue(new Error("network fail"));

      await saveCurrentDocument();

      expect(useWorkspace.getState().saveState.kind).toBe("error");
      expect(useWorkspace.getState().dirty).toBe(true);
    });
  });

  describe("saveAsNewDocument", () => {
    it("항상 createDocument로 새 문서를 만들고 currentDocId를 갱신한다", async () => {
      jest.spyOn(window, "prompt").mockReturnValue("사본 제목");
      useWorkspace.setState({ source: "본문", title: "원본", currentDocId: "doc-1", dirty: false });
      mockCreateDocument.mockResolvedValue({
        id: "doc-copy",
        title: "사본 제목",
        preview: "본문",
        updated_at: "2026-01-01T00:00:00Z",
        source_md: "본문",
        created_at: "2026-01-01T00:00:00Z",
      });

      await saveAsNewDocument();

      expect(mockCreateDocument).toHaveBeenCalledWith({ title: "사본 제목", source_md: "본문" });
      expect(useWorkspace.getState().currentDocId).toBe("doc-copy");
      expect(useWorkspace.getState().title).toBe("사본 제목");
      expect(useWorkspace.getState().saveState.kind).toBe("saved");
    });
  });
});
