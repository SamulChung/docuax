// apps/frontend/src/lib/slides/fabricHelpers.ts
import type { SlideElement } from "./types";

/** SlideElement → Fabric.js 생성자 옵션 */
export function schemaElementToFabricOptions(el: SlideElement): Record<string, unknown> {
  return {
    left: el.left,
    top: el.top,
    width: el.width,
    height: el.height,
    fill: el.fill ?? "#000000",
    fontSize: el.fontSize ?? 14,
    fontWeight: el.fontWeight ?? "normal",
    fontFamily: "맑은 고딕",
    data: { id: el.id },
    selectable: true,
    hasControls: true,
  };
}

/** Fabric.js 객체 → SlideElement (직렬화용) */
export function fabricObjectToSchemaElement(obj: {
  type: string;
  left: number;
  top: number;
  width: number;
  height: number;
  scaleX?: number;
  scaleY?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: string;
  fill?: string;
  src?: string;
  data?: { id?: string };
}): SlideElement {
  const scaleX = obj.scaleX ?? 1;
  const scaleY = obj.scaleY ?? 1;

  return {
    id: obj.data?.id ?? crypto.randomUUID(),
    type: obj.type as SlideElement["type"],
    left: Math.round(obj.left),
    top: Math.round(obj.top),
    width: Math.round(obj.width * scaleX),
    height: Math.round(obj.height * scaleY),
    text: obj.text ?? null,
    fontSize: obj.fontSize ?? null,
    fontWeight: (obj.fontWeight as "normal" | "bold" | null) ?? null,
    fill: (obj.fill as string) ?? null,
    src: obj.src ?? null,
  };
}

/** fabric canvas의 모든 객체를 SlideElement 배열로 직렬화 */
export function canvasToElements(canvas: {
  getObjects: () => unknown[];
}): SlideElement[] {
  return (canvas.getObjects() as Parameters<typeof fabricObjectToSchemaElement>[0][]).map(
    fabricObjectToSchemaElement
  );
}
