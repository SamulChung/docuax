// apps/frontend/src/lib/slides/types.ts
// SlideSchema — Fabric.js 렌더링 및 pptxgenjs 변환에 공통 사용

export type ElementType = "textbox" | "rect" | "circle" | "line" | "image";
export type ThemeName = "gov" | "corp" | "minimal" | "gradient" | "custom";

export interface SlideElement {
  id: string;
  type: ElementType;
  left: number;
  top: number;
  width: number;
  height: number;
  text: string | null;
  fontSize: number | null;
  fontWeight: "normal" | "bold" | null;
  fill: string | null;
  src: string | null;
}

export interface SlideData {
  id: string;
  background: string;
  elements: SlideElement[];
}

export interface CustomTheme {
  source: "upload";
  background: string;
  primary: string;
  accent: string;
  fontFamily: string;
  headingSize: number;
  bodySize: number;
  shapes: { borderRadius: number; strokeColor: string };
}

export interface SlideSchema {
  id: string;
  title: string;
  theme: ThemeName;
  customTheme: CustomTheme | null;
  slides: SlideData[];
}

export interface GenerateRequest {
  mode: "document" | "analysis";
  document_text?: string;
  instruction?: string;
  analysis_text?: string;
  theme: ThemeName;
  custom_theme?: CustomTheme | null;
}

export interface SaveSlideRequest {
  schema: SlideSchema;
  title: string;
}
