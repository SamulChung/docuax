"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { SlideElement, SlideSchema } from "@/lib/slides/types";
import SlideGeneratorPanel from "@/components/slides/SlideGeneratorPanel";
import SlideThumbnails from "@/components/slides/SlideThumbnails";
import SlideToolbar from "@/components/slides/SlideToolbar";
import SlideExportButton from "@/components/slides/SlideExportButton";
import { saveSlide } from "@/lib/api";

// Fabric.js SSR 불가 → dynamic import
const SlideEditor = dynamic(
  () => import("@/components/slides/SlideEditor"),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex items-center justify-center bg-gray-100 rounded-lg text-sm text-gray-400"
        style={{ width: 960, height: 540 }}
      >
        에디터 로딩 중…
      </div>
    ),
  }
);

const EMPTY_SCHEMA: SlideSchema = {
  id: "",
  title: "새 슬라이드",
  theme: "minimal",
  customTheme: null,
  slides: [],
};

// named export 유지 필수 — Workspace.tsx가 dynamic(...).then((m) => m.SlideWorkspace)로
// 지연 로드하므로 default export로 바꾸면 슬라이드 탭이 깨진다.
export function SlideWorkspace() {
  const [schema, setSchema] = useState<SlideSchema>(EMPTY_SCHEMA);
  const [activeIndex, setActiveIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const handleGenerated = useCallback((newSchema: SlideSchema) => {
    setSchema(newSchema);
    setActiveIndex(0);
  }, []);

  const handleSlideChange = useCallback((slideIndex: number, elements: SlideElement[]) => {
    setSchema((prev) => {
      const slides = [...prev.slides];
      if (slides[slideIndex]) {
        slides[slideIndex] = { ...slides[slideIndex], elements };
      }
      return { ...prev, slides };
    });
  }, []);

  const handleAddSlide = useCallback(() => {
    setSchema((prev) => ({
      ...prev,
      slides: [
        ...prev.slides,
        {
          id: crypto.randomUUID(),
          background: "#ffffff",
          elements: [],
        },
      ],
    }));
    setActiveIndex((prev) => prev + 1);
  }, []);

  const handleDeleteSlide = useCallback((index: number) => {
    setSchema((prev) => {
      const slides = prev.slides.filter((_, i) => i !== index);
      return { ...prev, slides };
    });
    setActiveIndex((prev) => Math.max(0, prev > index ? prev - 1 : prev));
  }, []);

  const handleSave = async () => {
    if (!schema.id) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveSlide(schema.id, { schema, title: schema.title });
      setSaveMsg("저장됨");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch {
      setSaveMsg("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col w-full bg-gray-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <h1 className="text-base font-bold text-gray-800">
          {schema.title || "슬라이드 편집기"}
        </h1>
        <div className="flex items-center gap-2">
          {saveMsg && <span className="text-xs text-green-600">{saveMsg}</span>}
          {schema.id && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md border border-gray-300"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          )}
          <SlideExportButton schema={schema} />
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 gap-4 p-4">
        {/* Left: generation panel */}
        <SlideGeneratorPanel onGenerated={handleGenerated} />

        {/* Center: editor */}
        <div className="flex flex-col flex-1 min-w-0 gap-2">
          <SlideToolbar />
          {schema.slides.length > 0 ? (
            <SlideEditor
              schema={schema}
              activeSlideIndex={activeIndex}
              onSlideChange={handleSlideChange}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-white border border-dashed border-gray-300 rounded-lg text-gray-400 text-sm">
              왼쪽 패널에서 슬라이드를 생성하세요
            </div>
          )}
        </div>

        {/* Right: thumbnails */}
        {schema.slides.length > 0 && (
          <SlideThumbnails
            schema={schema}
            activeIndex={activeIndex}
            onSelect={setActiveIndex}
            onAdd={handleAddSlide}
            onDelete={handleDeleteSlide}
          />
        )}
      </div>
    </div>
  );
}
