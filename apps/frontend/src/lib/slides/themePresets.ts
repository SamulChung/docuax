// apps/frontend/src/lib/slides/themePresets.ts
import type { CustomTheme, ThemeName } from "./types";

export interface ThemePreset {
  background: string;
  primary: string;
  accent: string;
  fontFamily: string;
  headingSize: number;
  bodySize: number;
  shapes: { borderRadius: number; strokeColor: string };
}

export const THEME_PRESETS: Record<Exclude<ThemeName, "custom">, ThemePreset> = {
  gov: {
    background: "#ffffff",
    primary: "#1e3a5f",
    accent: "#2563eb",
    fontFamily: "맑은 고딕",
    headingSize: 28,
    bodySize: 14,
    shapes: { borderRadius: 0, strokeColor: "#1e3a5f" },
  },
  corp: {
    background: "#0f172a",
    primary: "#f8fafc",
    accent: "#6366f1",
    fontFamily: "Pretendard",
    headingSize: 30,
    bodySize: 14,
    shapes: { borderRadius: 6, strokeColor: "#6366f1" },
  },
  minimal: {
    background: "#fafafa",
    primary: "#111827",
    accent: "#f59e0b",
    fontFamily: "Noto Sans KR",
    headingSize: 26,
    bodySize: 13,
    shapes: { borderRadius: 2, strokeColor: "#e5e7eb" },
  },
  gradient: {
    background: "#1e1b4b",
    primary: "#ffffff",
    accent: "#a5f3fc",
    fontFamily: "Pretendard",
    headingSize: 30,
    bodySize: 14,
    shapes: { borderRadius: 8, strokeColor: "#a5b4fc" },
  },
};

export function getThemePreset(
  theme: ThemeName,
  customTheme: CustomTheme | null
): ThemePreset {
  if (theme === "custom" && customTheme) {
    return {
      background: customTheme.background,
      primary: customTheme.primary,
      accent: customTheme.accent,
      fontFamily: customTheme.fontFamily,
      headingSize: customTheme.headingSize,
      bodySize: customTheme.bodySize,
      shapes: customTheme.shapes,
    };
  }
  return THEME_PRESETS[theme as Exclude<ThemeName, "custom">] ?? THEME_PRESETS.minimal;
}
