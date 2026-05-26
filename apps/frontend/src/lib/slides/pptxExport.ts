// apps/frontend/src/lib/slides/pptxExport.ts
import PptxGenJS from "pptxgenjs";
import type { SlideElement, SlideSchema } from "./types";

const CANVAS_W = 1280;
const CANVAS_H = 720;
const SLIDE_W_IN = 13.33;  // 16:9 width in inches
const SLIDE_H_IN = 7.5;    // 16:9 height in inches

function toInchX(px: number): number {
  return (px / CANVAS_W) * SLIDE_W_IN;
}

function toInchY(px: number): number {
  return (px / CANVAS_H) * SLIDE_H_IN;
}

function hexToRgb(hex: string): string {
  // pptxgenjs expects 'RRGGBB' without #
  return hex.replace("#", "").toUpperCase();
}

function addElementToSlide(
  slide: ReturnType<InstanceType<typeof PptxGenJS>["addSlide"]>,
  el: SlideElement,
  pptx: InstanceType<typeof PptxGenJS>
): void {
  const x = toInchX(el.left);
  const y = toInchY(el.top);
  const w = toInchX(el.width);
  const h = toInchY(el.height);
  const color = hexToRgb(el.fill ?? "#000000");

  switch (el.type) {
    case "textbox":
      slide.addText(el.text ?? "", {
        x,
        y,
        w,
        h,
        fontSize: el.fontSize ?? 14,
        bold: el.fontWeight === "bold",
        color,
        fontFace: "맑은 고딕",
        align: "left",
        wrap: true,
      });
      break;

    case "rect":
      slide.addShape(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pptx as any).ShapeType?.RECTANGLE ?? "rect",
        {
          x,
          y,
          w,
          h,
          fill: { color },
          line: { color, width: 0 },
        }
      );
      break;

    case "circle":
      slide.addShape(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pptx as any).ShapeType?.OVAL ?? "ellipse",
        {
          x,
          y,
          w,
          h,
          fill: { color },
          line: { color, width: 0 },
        }
      );
      break;

    case "line":
      slide.addShape(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pptx as any).ShapeType?.LINE ?? "line",
        {
          x,
          y,
          w,
          h,
          line: { color, width: 2 },
        }
      );
      break;

    case "image":
      if (el.src) {
        slide.addImage({ path: el.src, x, y, w, h });
      }
      break;
  }
}

export async function exportToPptx(schema: SlideSchema): Promise<void> {
  const pptx = new PptxGenJS();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pptx as any).layout = "LAYOUT_WIDE";  // 16:9

  for (const slideData of schema.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: hexToRgb(slideData.background) };

    for (const el of slideData.elements) {
      addElementToSlide(slide, el, pptx);
    }
  }

  await pptx.writeFile({ fileName: `${schema.title}.pptx` });
}
