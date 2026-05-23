// DocuAX 공식 로고 — 베이스라인 정렬 락업.
// 출처: docuax_logo_baseline_aligned.html
// 그라디언트: #0A3F90 → #1565C8 → #2998E5
// 워드마크: Docu(#0F1A3D) + AX(#1B7FA8)

import { useId } from "react";

interface SymbolProps {
  size?: number;
  className?: string;
  title?: string;
}

export function LogoSymbol({ size = 32, className, title = "DocuAX" }: SymbolProps) {
  const uid = useId().replace(/:/g, "");
  const gradId = `lg-${uid}`;
  const clipId = `clip-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <linearGradient id={gradId} x1="10%" y1="15%" x2="95%" y2="85%">
          <stop offset="0%" stopColor="#0A3F90" />
          <stop offset="40%" stopColor="#1565C8" />
          <stop offset="100%" stopColor="#2998E5" />
        </linearGradient>
        <clipPath id={clipId}>
          <path d="M 22 22 L 22 78 L 48 78 A 28 28 0 0 0 48 22 Z" />
        </clipPath>
      </defs>
      <path
        d="M 8 3 L 50 3 A 47 47 0 0 1 50 97 L 8 97 A 3 3 0 0 1 5 94 L 5 6 A 3 3 0 0 1 8 3 Z M 22 22 L 22 78 L 48 78 A 28 28 0 0 0 48 22 Z"
        fill={`url(#${gradId})`}
        fillRule="evenodd"
      />
      <g clipPath={`url(#${clipId})`}>
        <path
          d="M 24 68 L 49 43 L 35 29 L 68 26 L 65 59 L 51 45 L 32 76 Z"
          fill={`url(#${gradId})`}
        />
      </g>
    </svg>
  );
}

interface LockupProps {
  /** 심볼 가로/세로 (px). 워드마크는 비율(450/100)에 따라 자동 폭. */
  size?: number;
  /** 심볼·워드마크 사이 간격 (px) */
  gap?: number;
  className?: string;
}

/**
 * DocuAX 풀 락업 — 심볼 + 워드마크 (베이스라인 정확 일치).
 * 원본 HTML의 size별 gap 비율을 따른다:
 *   100px → gap 6   64px → gap 4   40px → gap 3   26px → gap 2
 */
export function LogoLockup({ size = 32, gap, className }: LockupProps) {
  const wordmarkWidth = Math.round((size * 450) / 100);
  const computedGap = gap ?? Math.max(2, Math.round((size * 6) / 100));
  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "flex-end",
        gap: `${computedGap}px`,
      }}
    >
      <LogoSymbol size={size} />
      <svg
        width={wordmarkWidth}
        height={size}
        viewBox="0 0 450 100"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="DocuAX"
      >
        <text
          x="0"
          y="97"
          fontFamily="Inter, system-ui, sans-serif"
          fontWeight="800"
          fontSize="110"
          letterSpacing="-4"
        >
          <tspan fill="#0F1A3D">Docu</tspan>
          <tspan fill="#1B7FA8">AX</tspan>
        </text>
      </svg>
    </div>
  );
}
