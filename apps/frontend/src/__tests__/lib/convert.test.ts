import { performConvert } from "@/lib/convert";
import { convertDocument } from "@/lib/api";
import { useWorkspace } from "@/store/workspace";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  convertDocument: jest.fn(),
}));

describe("performConvert", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWorkspace.setState({ busy: false, source: "# 문서", title: "", fastConvert: false });
  });

  it("busy 중이면 재진입하지 않는다", async () => {
    useWorkspace.setState({ busy: true });
    await performConvert();
    expect(convertDocument).not.toHaveBeenCalled();
  });

  it("forceFast가 skip_analyze/skip_review로 전달된다", async () => {
    (convertDocument as jest.Mock).mockResolvedValue({ preview: { document_id: "d", blocks: [] } });
    await performConvert({ forceFast: true });
    expect(convertDocument).toHaveBeenCalledWith(expect.objectContaining({ skip_analyze: true, skip_review: true }));
    expect(useWorkspace.getState().busy).toBe(false);
  });
});
