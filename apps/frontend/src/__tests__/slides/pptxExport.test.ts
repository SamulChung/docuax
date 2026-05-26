import { exportToPptx } from "@/lib/slides/pptxExport";
import type { SlideSchema } from "@/lib/slides/types";
import PptxGenJS from "pptxgenjs";

const mockSchema: SlideSchema = {
  id: "test",
  title: "테스트 슬라이드",
  theme: "minimal",
  customTheme: null,
  slides: [
    {
      id: "slide-0",
      background: "#ffffff",
      elements: [
        {
          id: "el-0",
          type: "textbox",
          left: 80,
          top: 60,
          width: 1120,
          height: 80,
          text: "제목",
          fontSize: 28,
          fontWeight: "bold",
          fill: "#111827",
          src: null,
        },
        {
          id: "el-1",
          type: "rect",
          left: 80,
          top: 200,
          width: 300,
          height: 150,
          text: null,
          fontSize: null,
          fontWeight: null,
          fill: "#f59e0b",
          src: null,
        },
      ],
    },
  ],
};

describe("exportToPptx", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls pptxgenjs writeFile with correct filename", async () => {
    await exportToPptx(mockSchema);
    const instance = (PptxGenJS as unknown as jest.Mock).mock.results[0].value;
    expect(instance.writeFile).toHaveBeenCalledWith({ fileName: "테스트 슬라이드.pptx" });
  });

  it("adds one slide per schema slide", async () => {
    await exportToPptx(mockSchema);
    const instance = (PptxGenJS as unknown as jest.Mock).mock.results[0].value;
    expect(instance.addSlide).toHaveBeenCalledTimes(1);
  });

  it("calls addText for textbox elements", async () => {
    await exportToPptx(mockSchema);
    const instance = (PptxGenJS as unknown as jest.Mock).mock.results[0].value;
    const slide = instance.addSlide.mock.results[0].value;
    expect(slide.addText).toHaveBeenCalledWith(
      "제목",
      expect.objectContaining({ fontSize: 28, bold: true })
    );
  });

  it("calls addShape for rect elements", async () => {
    await exportToPptx(mockSchema);
    const instance = (PptxGenJS as unknown as jest.Mock).mock.results[0].value;
    const slide = instance.addSlide.mock.results[0].value;
    expect(slide.addShape).toHaveBeenCalled();
  });
});
