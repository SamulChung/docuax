import { schemaElementToFabricOptions, fabricObjectToSchemaElement } from "@/lib/slides/fabricHelpers";
import type { SlideElement } from "@/lib/slides/types";

const baseElement: SlideElement = {
  id: "el-0",
  type: "textbox",
  left: 100,
  top: 50,
  width: 400,
  height: 60,
  text: "Hello",
  fontSize: 24,
  fontWeight: "bold",
  fill: "#1e3a5f",
  src: null,
};

describe("schemaElementToFabricOptions", () => {
  it("maps SlideElement fields to Fabric.js constructor options", () => {
    const opts = schemaElementToFabricOptions(baseElement);
    expect(opts.left).toBe(100);
    expect(opts.top).toBe(50);
    expect(opts.width).toBe(400);
    expect(opts.height).toBe(60);
    expect(opts.fill).toBe("#1e3a5f");
    expect(opts.fontSize).toBe(24);
    expect(opts.fontWeight).toBe("bold");
  });

  it("includes element id in fabric options data", () => {
    const opts = schemaElementToFabricOptions(baseElement);
    expect((opts.data as { id: string }).id).toBe("el-0");
  });
});

describe("fabricObjectToSchemaElement", () => {
  it("converts a fabric-like object back to SlideElement", () => {
    const fabricObj = {
      type: "textbox",
      left: 100,
      top: 50,
      width: 400,
      height: 60,
      text: "Hello",
      fontSize: 24,
      fontWeight: "bold",
      fill: "#1e3a5f",
      data: { id: "el-0" },
      scaleX: 1,
      scaleY: 1,
    };
    const el = fabricObjectToSchemaElement(fabricObj);
    expect(el.id).toBe("el-0");
    expect(el.type).toBe("textbox");
    expect(el.left).toBe(100);
    expect(el.fill).toBe("#1e3a5f");
  });

  it("applies scaleX/scaleY to width/height", () => {
    const fabricObj = {
      type: "rect",
      left: 0,
      top: 0,
      width: 100,
      height: 50,
      scaleX: 2,
      scaleY: 3,
      data: { id: "r0" },
    };
    const el = fabricObjectToSchemaElement(fabricObj);
    expect(el.width).toBe(200);
    expect(el.height).toBe(150);
  });
});
