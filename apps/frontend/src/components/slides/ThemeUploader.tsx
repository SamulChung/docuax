"use client";

import { useState } from "react";
import type { CustomTheme } from "@/lib/slides/types";
import { extractTheme } from "@/lib/api";

interface Props {
  onThemeExtracted: (theme: CustomTheme) => void;
}

export default function ThemeUploader({ onThemeExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pptx", "png", "jpg", "jpeg", "webp"].includes(ext ?? "")) {
      setError(".pptx 또는 이미지 파일(.png, .jpg, .webp)만 가능합니다");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const theme = await extractTheme(file);
      onThemeExtracted(theme);
      setExtracted(true);
    } catch {
      setError("스타일 추출 실패. minimal 테마를 사용하거나 다른 파일을 시도하세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">스타일 파일 업로드</label>
      <input
        type="file"
        accept=".pptx,.png,.jpg,.jpeg,.webp"
        onChange={handleFile}
        disabled={loading}
        className="text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700"
      />
      {loading && <p className="text-xs text-gray-500">스타일 추출 중…</p>}
      {extracted && !error && <p className="text-xs text-green-600">✓ 스타일 추출 완료</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-gray-400">.pptx 또는 이미지에서 색상/폰트 자동 추출</p>
    </div>
  );
}
