import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // TenAI · DocuAX 통합 브랜드 — 하늘색 (sky tone)
        // DocuAX 로고 그라디언트(#0A3F90→#1565C8→#2998E5) 와 TenAI 로고 시안 AI 와 정렬
        brand: { DEFAULT: "#0284C7", soft: "#0EA5E9" },  // sky-600 / sky-500
        accent: { DEFAULT: "#F0B429", soft: "#FFD66B" },
        review: {
          red: "#C0392B",
          blue: "#1F5BAF",
          yellow: "#F0B429",
        },
      },
      fontFamily: {
        sans: ["'맑은 고딕'", "Malgun Gothic", "Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
