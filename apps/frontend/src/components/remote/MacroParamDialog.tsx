"use client";

import { useEffect, useRef, useState } from "react";

interface FieldDef {
  key: string;
  label: string;
  type: "number" | "text" | "select";
  default: string | number;
  min?: number;
  max?: number;
  options?: string[];
}

export interface MacroParamSchema {
  macroId: string;
  title: string;
  fields: FieldDef[];
}

/** 어떤 매크로가 파라미터 입력을 받아야 하는지 정의. 없으면 즉시 실행. */
export const MACRO_PARAM_SCHEMAS: Record<string, MacroParamSchema> = {
  T1: {
    macroId: "T1",
    title: "표 생성 (기본)",
    fields: [
      { key: "rows", label: "행 수", type: "number", default: 3, min: 1, max: 50 },
      { key: "cols", label: "열 수", type: "number", default: 3, min: 1, max: 20 },
    ],
  },
  T2: {
    macroId: "T2",
    title: "표 생성 (점선)",
    fields: [
      { key: "rows", label: "행 수", type: "number", default: 3, min: 1, max: 50 },
      { key: "cols", label: "열 수", type: "number", default: 3, min: 1, max: 20 },
    ],
  },
  T3: {
    macroId: "T3",
    title: "표 생성 (격자)",
    fields: [
      { key: "rows", label: "행 수", type: "number", default: 3, min: 1, max: 50 },
      { key: "cols", label: "열 수", type: "number", default: 3, min: 1, max: 20 },
    ],
  },
  T4: {
    macroId: "T4",
    title: "표 생성 (헤더형)",
    fields: [
      { key: "rows", label: "행 수", type: "number", default: 4, min: 2, max: 50 },
      { key: "cols", label: "열 수", type: "number", default: 3, min: 1, max: 20 },
    ],
  },
  T21: {
    macroId: "T21",
    title: "천 단위 곱/나눔",
    fields: [
      {
        key: "op",
        label: "연산",
        type: "select",
        default: "mul",
        options: ["mul", "div"],
      },
      { key: "factor", label: "배수", type: "number", default: 1000, min: 1, max: 1000000 },
    ],
  },
  G9: {
    macroId: "G9",
    title: "글자 크기 일괄",
    fields: [{ key: "size", label: "포인트", type: "number", default: 11, min: 6, max: 36 }],
  },
  G11: {
    macroId: "G11",
    title: "글꼴 일괄 변경",
    fields: [
      {
        key: "font",
        label: "글꼴",
        type: "select",
        default: "맑은 고딕",
        options: ["맑은 고딕", "바탕", "굴림", "함초롬바탕", "Inter"],
      },
    ],
  },
  G16: {
    macroId: "G16",
    title: "세대별 톤 변환 (役關目條分 · 條 조건)",
    fields: [
      {
        key: "target_age",
        label: "대상 연령층",
        type: "select",
        default: "60대",
        options: ["60대", "40대", "MZ"],
      },
    ],
  },
};

interface Props {
  schema: MacroParamSchema;
  onConfirm: (params: Record<string, string | number>) => void;
  onCancel: () => void;
}

export function MacroParamDialog({ schema, onConfirm, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string | number>>(() => {
    const init: Record<string, string | number> = {};
    for (const f of schema.fields) init[f.key] = f.default;
    return init;
  });
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
    firstFieldRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && !(e.target as HTMLElement)?.tagName?.toLowerCase().includes("select")) {
        onConfirm(values);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [values, onCancel, onConfirm]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-80 rounded-lg border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold">{schema.title}</h3>
          <span className="font-mono text-[10px] text-neutral-400">{schema.macroId}</span>
        </div>

        <div className="space-y-3">
          {schema.fields.map((f, idx) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-xs text-neutral-600 dark:text-neutral-400">
                {f.label}
              </span>
              {f.type === "select" ? (
                <select
                  value={values[f.key] as string}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
                >
                  {f.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  ref={idx === 0 ? firstFieldRef : undefined}
                  type={f.type}
                  value={values[f.key] as number}
                  min={f.min}
                  max={f.max}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value,
                    })
                  }
                  className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
                />
              )}
            </label>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            취소
          </button>
          <button
            onClick={() => onConfirm(values)}
            className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-soft"
          >
            적용 ⏎
          </button>
        </div>
      </div>
    </div>
  );
}
