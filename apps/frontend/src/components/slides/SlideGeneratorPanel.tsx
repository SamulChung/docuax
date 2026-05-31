"use client";

import { useEffect, useState } from "react";
import type { CustomTheme, SlideSchema, ThemeName } from "@/lib/slides/types";
import { generateSlides } from "@/lib/api";
import ThemeUploader from "./ThemeUploader";

interface Props {
  onGenerated: (schema: SlideSchema) => void;
}

const THEMES: { value: ThemeName; label: string }[] = [
  { value: "gov", label: "공공기관/정부보고서" },
  { value: "corp", label: "기업 피치덱" },
  { value: "minimal", label: "미니멀 모던" },
  { value: "gradient", label: "그라데이션 모던" },
  { value: "custom", label: "파일에서 추출" },
];

export default function SlideGeneratorPanel({ onGenerated }: Props) {
  const [mode, setMode] = useState<"document" | "analysis">("document");
  const [documentText, setDocumentText] = useState("");
  const [instruction, setInstruction] = useState("");
  const [analysisText, setAnalysisText] = useState("");
  const [theme, setTheme] = useState<ThemeName>("minimal");
  const [customTheme, setCustomTheme] = useState<CustomTheme | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 문서 → 슬라이드 내보내기: PreviewPane에서 sessionStorage로 전달된 텍스트 자동 채우기
  useEffect(() => {
    try {
      const prefill = sessionStorage.getItem("docuax_slide_prefill");
      if (prefill) {
        setMode("document");
        setDocumentText(prefill);
        sessionStorage.removeItem("docuax_slide_prefill"); // 일회용
      }
    } catch {
      // sessionStorage 접근 불가 시 무시
    }
  }, []); // 마운트 1회만 실행

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDocumentText(reader.result as string);
    };
    reader.readAsText(file, "utf-8");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const schema = await generateSlides({
        mode,
        document_text: mode === "document" ? documentText : undefined,
        instruction: mode === "document" ? instruction : undefined,
        analysis_text: mode === "analysis" ? analysisText : undefined,
        theme,
        custom_theme: customTheme,
      });
      onGenerated(schema);
    } catch (err) {
      setError(err instanceof Error ? err.message : "슬라이드 생성 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4 bg-white border rounded-lg w-80 shrink-0">
      <h2 className="text-base font-bold text-gray-800">슬라이드 생성</h2>

      {/* 모드 선택 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("document")}
          className={`flex-1 py-1.5 text-sm rounded-md border transition-colors ${
            mode === "document"
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
          }`}
        >
          문서+지시어
        </button>
        <button
          type="button"
          onClick={() => setMode("analysis")}
          className={`flex-1 py-1.5 text-sm rounded-md border transition-colors ${
            mode === "analysis"
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
          }`}
        >
          역관목조분
        </button>
      </div>

      {mode === "document" ? (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">문서 파일 (txt/md)</label>
            <input
              type="file"
              accept=".txt,.md"
              onChange={handleFileUpload}
              className="text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">또는 직접 입력</label>
            <textarea
              value={documentText}
              onChange={(e) => setDocumentText(e.target.value)}
              rows={4}
              placeholder="문서 내용을 여기에 붙여넣으세요"
              className="text-sm border border-gray-300 rounded p-2 resize-none focus:outline-none focus:border-indigo-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">지시어</label>
            <input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="예: 5장짜리 요약 슬라이드로 만들어줘"
              className="text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-indigo-400"
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">역관목조분 분석 결과 붙여넣기</label>
          <textarea
            value={analysisText}
            onChange={(e) => setAnalysisText(e.target.value)}
            rows={6}
            placeholder="역관목조분 분석 결과를 여기에 붙여넣으세요"
            className="text-sm border border-gray-300 rounded p-2 resize-none focus:outline-none focus:border-indigo-400"
          />
        </div>
      )}

      {/* 테마 선택 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">테마</label>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as ThemeName)}
          className="text-sm border border-gray-300 rounded p-2 focus:outline-none focus:border-indigo-400"
        >
          {THEMES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {theme === "custom" && (
        <ThemeUploader onThemeExtracted={setCustomTheme} />
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-md transition-colors"
      >
        {loading ? "생성 중…" : "슬라이드 생성"}
      </button>
    </form>
  );
}
