"use client";

interface Props {
  password: string;
}

interface Rule {
  label: string;
  test: (p: string) => boolean;
}

const RULES: Rule[] = [
  { label: "8자 이상", test: (p) => p.length >= 8 },
  { label: "대문자", test: (p) => /[A-Z]/.test(p) },
  { label: "숫자", test: (p) => /[0-9]/.test(p) },
  { label: "특수문자", test: (p) => /[!@#$%^&*(),.?":{}|<>_\-+=/\\[\]~`']/.test(p) },
];

const STRENGTH_TEXT = ["약함", "약함", "보통", "강함", "매우 강함"];
const STRENGTH_BAR_COLOR = [
  "bg-red-500",
  "bg-red-500",
  "bg-orange-400",
  "bg-yellow-400",
  "bg-green-500",
];
const STRENGTH_TEXT_COLOR = [
  "text-red-500",
  "text-red-500",
  "text-orange-500",
  "text-yellow-600",
  "text-green-600",
];

export function PasswordStrength({ password }: Props) {
  if (!password) return null;

  const score = RULES.filter((r) => r.test(password)).length;

  return (
    <div className="mt-1.5 space-y-1">
      {/* 색상 바 */}
      <div className="flex gap-1">
        {RULES.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
              i < score ? STRENGTH_BAR_COLOR[score] : "bg-neutral-200 dark:bg-neutral-700"
            }`}
          />
        ))}
      </div>
      {/* 강도 텍스트 + 규칙 */}
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-semibold ${STRENGTH_TEXT_COLOR[score]}`}>
          {STRENGTH_TEXT[score]}
        </span>
        <div className="flex gap-2">
          {RULES.map((rule, i) => (
            <span
              key={i}
              className={`text-[10px] transition-colors ${
                rule.test(password)
                  ? "text-green-600 dark:text-green-400"
                  : "text-neutral-400"
              }`}
            >
              {rule.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
