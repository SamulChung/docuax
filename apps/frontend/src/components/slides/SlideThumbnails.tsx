"use client";

import type { SlideSchema } from "@/lib/slides/types";

interface Props {
  schema: SlideSchema;
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
}

export default function SlideThumbnails({ schema, activeIndex, onSelect, onAdd, onDelete }: Props) {
  return (
    <div className="flex flex-col gap-2 w-36 shrink-0 overflow-y-auto py-2">
      {schema.slides.map((slide, i) => (
        <div key={slide.id} className="relative group">
          <button
            onClick={() => onSelect(i)}
            className={`w-full aspect-video rounded border-2 transition-colors relative ${
              i === activeIndex ? "border-indigo-500" : "border-gray-200 hover:border-gray-400"
            }`}
            style={{ background: slide.background }}
          >
            <span className="text-[9px] text-gray-400 absolute top-1 left-1">{i + 1}</span>
          </button>
          <button
            onClick={() => onDelete(i)}
            className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 bg-red-500 text-white text-[10px] rounded-full items-center justify-center"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={onAdd}
        className="w-full aspect-video rounded border-2 border-dashed border-gray-300 hover:border-indigo-400 text-gray-400 hover:text-indigo-500 text-xl transition-colors flex items-center justify-center"
      >
        +
      </button>
    </div>
  );
}
