// pptxgenjs mock for tests
const PptxGenJS = jest.fn().mockImplementation(() => ({
  addSlide: jest.fn().mockReturnValue({
    addText: jest.fn(),
    addShape: jest.fn(),
    addImage: jest.fn(),
    background: undefined,
  }),
  writeFile: jest.fn().mockResolvedValue(undefined),
  ShapeType: {
    RECTANGLE: "rect",
    OVAL: "ellipse",
    LINE: "line",
  },
}));

export default PptxGenJS;
