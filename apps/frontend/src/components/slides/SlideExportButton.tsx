"use client";

import { useState } from "react";
import type { SlideSchema } from "@/lib/slides/types";
import { exportToPptx } from "@/lib/slides/pptxExport";

interface Props {
  schema: SlideSchema;
}

export default function SlideExportButton({ schema }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    setLoading(true);
    try {
      await exportToPptx(schema);
    } catch (err) {
      setError("PPTX 내보내기 실패. 다시 시도해 주세요.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleExport}
        disabled={loading || schema.slides.length === 0}
        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-md transition-colors"
      >
        {loading ? "내보내는 중…" : "⬇ PPTX 다운로드"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
