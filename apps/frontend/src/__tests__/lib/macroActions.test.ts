import { executeMacroAction } from "@/lib/macroActions";
import { executeMacro } from "@/lib/api";
import { useWorkspace } from "@/store/workspace";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  executeMacro: jest.fn(),
  convertDocument: jest.fn(),
}));

describe("executeMacroAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWorkspace.setState({ preview: null });
  });

  it("preview 없으면 executeMacro를 호출하지 않고 가드", async () => {
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    await executeMacroAction("T5");
    expect(executeMacro).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("N1은 jumpToNext(red)를 호출하고 백엔드는 호출하지 않는다", async () => {
    const jumpSpy = jest.fn();
    useWorkspace.setState({
      preview: { document_id: "d1", blocks: [], all_tags: [], plain_text: "" } as never,
      jumpToNext: jumpSpy as never,
    });
    await executeMacroAction("N1");
    expect(jumpSpy).toHaveBeenCalledWith("red");
    expect(executeMacro).not.toHaveBeenCalled();
  });

  it("일반 매크로는 executeMacro 후 setPreview", async () => {
    const newPreview = { document_id: "d1", blocks: [{ id: "b" }] };
    (executeMacro as jest.Mock).mockResolvedValue({ preview: newPreview });
    useWorkspace.setState({
      preview: { document_id: "d1", blocks: [], all_tags: [], plain_text: "" } as never,
    });
    await executeMacroAction("T5");
    expect(executeMacro).toHaveBeenCalledWith(expect.objectContaining({ macro_id: "T5", document_id: "d1" }));
    expect(useWorkspace.getState().preview).toEqual(newPreview);
  });
});
