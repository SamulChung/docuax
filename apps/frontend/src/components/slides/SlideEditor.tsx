"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { SlideElement, SlideSchema } from "@/lib/slides/types";
import { schemaElementToFabricOptions, fabricObjectToSchemaElement } from "@/lib/slides/fabricHelpers";

// Fabric.js는 SSR 불가 — 런타임에만 dynamic import
let fabricModule: typeof import("fabric") | null = null;

interface Props {
  schema: SlideSchema;
  activeSlideIndex: number;
  onSlideChange: (slideIndex: number, elements: SlideElement[]) => void;
}

const DISPLAY_SCALE = 0.75;  // 1280×720 → 960×540

export default function SlideEditor({ schema, activeSlideIndex, onSlideChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<import("fabric").Canvas | null>(null);
  const [fabricLoaded, setFabricLoaded] = useState(false);

  // Fabric.js 동적 로드 (SSR safe)
  useEffect(() => {
    import("fabric").then((mod) => {
      fabricModule = mod;
      setFabricLoaded(true);
    });
  }, []);

  // 캔버스 초기화 — fabricLoaded 상태에만 반응
  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current || !fabricModule) return;
    const { Canvas } = fabricModule;

    const canvas = new Canvas(canvasRef.current, {
      width: 1280 * DISPLAY_SCALE,
      height: 720 * DISPLAY_SCALE,
      selection: true,
    });
    fabricRef.current = canvas;

    const handleChange = () => {
      const elements = (canvas.getObjects() as unknown[]).map((obj) =>
        fabricObjectToSchemaElement(obj as Parameters<typeof fabricObjectToSchemaElement>[0])
      );
      onSlideChange(activeSlideIndex, elements);
    };

    canvas.on("object:modified", handleChange);
    canvas.on("object:added", handleChange);
    canvas.on("object:removed", handleChange);

    return () => {
      canvas.dispose();
      fabricRef.current = null;
    };
  }, [fabricLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // 슬라이드 데이터 → 캔버스 렌더링
  useEffect(() => {
    if (!fabricRef.current || !fabricLoaded || !fabricModule) return;
    const canvas = fabricRef.current;
    const slide = schema.slides[activeSlideIndex];
    if (!slide) return;

    const { Textbox, Rect, Circle, Line, FabricImage } = fabricModule;

    canvas.clear();
    canvas.backgroundColor = slide.background;

    for (const el of slide.elements) {
      const opts = schemaElementToFabricOptions(el);
      const scaledOpts: Record<string, unknown> = {
        ...opts,
        left: (opts.left as number) * DISPLAY_SCALE,
        top: (opts.top as number) * DISPLAY_SCALE,
        width: (opts.width as number) * DISPLAY_SCALE,
        height: (opts.height as number) * DISPLAY_SCALE,
        fontSize: opts.fontSize ? (opts.fontSize as number) * DISPLAY_SCALE : undefined,
      };

      switch (el.type) {
        case "textbox":
          canvas.add(new Textbox(el.text ?? "", scaledOpts));
          break;
        case "rect":
          canvas.add(new Rect(scaledOpts));
          break;
        case "circle":
          canvas.add(new Circle({ ...scaledOpts, radius: (scaledOpts.width as number) / 2 }));
          break;
        case "line":
          canvas.add(new Line([0, 0, scaledOpts.width as number, 0], {
            ...scaledOpts,
            stroke: (scaledOpts.fill as string) ?? "#000",
            strokeWidth: 2,
          }));
          break;
        case "image":
          if (el.src) {
            FabricImage.fromURL(el.src).then((img) => {
              img.set(scaledOpts);
              canvas.add(img);
              canvas.renderAll();
            });
          }
          break;
      }
    }
    canvas.renderAll();
  }, [schema, activeSlideIndex, fabricLoaded]);

  // 요소 추가 핸들러들 — SlideToolbar에서 window CustomEvent로 트리거
  const addText = useCallback(() => {
    if (!fabricRef.current || !fabricModule) return;
    const obj = new fabricModule.Textbox("텍스트를 입력하세요", {
      left: 100, top: 100, width: 300, fontSize: 18, fill: "#111827",
      fontFamily: "맑은 고딕", data: { id: crypto.randomUUID() },
    });
    fabricRef.current.add(obj);
    fabricRef.current.setActiveObject(obj);
    fabricRef.current.renderAll();
  }, []);

  const addRect = useCallback(() => {
    if (!fabricRef.current || !fabricModule) return;
    const obj = new fabricModule.Rect({
      left: 100, top: 100, width: 200, height: 120,
      fill: "#6366f1", data: { id: crypto.randomUUID() },
    });
    fabricRef.current.add(obj);
    fabricRef.current.renderAll();
  }, []);

  const deleteSelected = useCallback(() => {
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObject();
    if (active) {
      fabricRef.current.remove(active);
      fabricRef.current.renderAll();
    }
  }, []);

  // window CustomEvent listener for toolbar actions
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ action: string }>;
      if (ce.detail.action === "addText") addText();
      if (ce.detail.action === "addRect") addRect();
      if (ce.detail.action === "deleteSelected") deleteSelected();
    };
    window.addEventListener("slideEditorAction", handler);
    return () => window.removeEventListener("slideEditorAction", handler);
  }, [addText, addRect, deleteSelected]);

  if (!fabricLoaded) {
    return (
      <div
        className="flex items-center justify-center bg-gray-100 rounded-lg"
        style={{ width: 1280 * DISPLAY_SCALE, height: 720 * DISPLAY_SCALE }}
      >
        <p className="text-sm text-gray-400">에디터 로딩 중…</p>
      </div>
    );
  }

  return (
    <div
      className="relative border border-gray-300 rounded-lg overflow-hidden shadow-md"
      style={{ width: 1280 * DISPLAY_SCALE, height: 720 * DISPLAY_SCALE }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
