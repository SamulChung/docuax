"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Check, X } from "lucide-react";

import {
  labelColumnIndex,
  numericColumnIndices,
  type ParsedTable,
} from "@/lib/markdownTable";

/**
 * 마크다운 표 → 차트 변환 다이얼로그.
 *
 * 좌측: 감지된 표 미리보기 (HTML 표 렌더)
 * 우측: 차트 종류 + 라벨 컬럼 + 데이터셋 컬럼 + 차트 옵션 (제목·축·정렬)
 * 하단: 합성된 ```chart 스니펫 미리보기 + [삽입] 버튼
 */

type ChartKind =
  | "bar"
  | "hbar"
  | "stacked_bar"
  | "percent_stacked"
  | "line"
  | "area"
  | "pie"
  | "donut";

const CHART_KINDS: { id: ChartKind; label: string; description: string }[] = [
  { id: "bar", label: "막대", description: "분기·월별 비교 (가장 보편적)" },
  { id: "hbar", label: "가로 막대", description: "긴 라벨 비교" },
  { id: "stacked_bar", label: "누적 막대", description: "구성요소별 누적" },
  { id: "percent_stacked", label: "100% 누적", description: "비율 비교" },
  { id: "line", label: "선", description: "추이·시계열" },
  { id: "area", label: "영역", description: "누적 시각화" },
  { id: "pie", label: "파이", description: "단일 비중" },
  { id: "donut", label: "도넛", description: "비중 + 중앙 합계" },
];

const COLORS = [
  "#1F5BAF", "#F4B400", "#0F9D58", "#DB4437",
  "#9C27B0", "#00BCD4", "#FF7043", "#795548",
];

interface Props {
  table: ParsedTable;
  /** 사용자가 [삽입] 누르면 호출 — snippet 만 전달 (위치는 caller 가 결정) */
  onInsert: (chartMarkdown: string) => void;
  onClose: () => void;
}

export function TableToChartDialog({ table, onInsert, onClose }: Props) {
  const numCols = useMemo(() => numericColumnIndices(table), [table]);
  const defaultLabelIdx = useMemo(() => labelColumnIndex(table), [table]);

  const [kind, setKind] = useState<ChartKind>("bar");
  const [labelIdx, setLabelIdx] = useState<number>(defaultLabelIdx);
  const [seriesIdxs, setSeriesIdxs] = useState<number[]>(numCols);
  const [title, setTitle] = useState("");
  const [xLabel, setXLabel] = useState("");
  const [yLabel, setYLabel] = useState("");
  const [width, setWidth] = useState("80%");
  const [align, setAlign] = useState<"left" | "center" | "right">("center");
  const [showValues, setShowValues] = useState(true);
  /**
   * 시리즈별 사용자 지정 이름(범례 라벨).
   * 키: 컬럼 인덱스, 값: 사용자가 입력한 이름. 빈 문자열이거나 미정이면 헤더명 사용.
   */
  const [seriesLabels, setSeriesLabels] = useState<Record<number, string>>({});

  // 파이/도넛은 단일 데이터셋만
  const isSingleSeries = kind === "pie" || kind === "donut";

  // 데이터셋 선택 토글
  const toggleSeries = (idx: number) => {
    if (isSingleSeries) {
      setSeriesIdxs([idx]); // 파이/도넛 = 1개만
    } else {
      setSeriesIdxs((prev) => {
        const next = prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx];
        return next.length === 0 ? prev : next; // 최소 1개 유지
      });
    }
  };

  // kind 가 단일 시리즈로 바뀌면 seriesIdxs 도 1개로 압축
  useEffect(() => {
    if (isSingleSeries && seriesIdxs.length > 1) {
      setSeriesIdxs(seriesIdxs.slice(0, 1));
    }
  }, [isSingleSeries, seriesIdxs]);

  // 합성된 chart spec JSON 미리보기
  // snippet 재합성 의존성에 seriesLabels 도 포함 — 사용자가 이름 바꿀 때마다 미리보기 갱신
  const snippet = useMemo(() => {
    const labels = table.rows.map((r) => r[labelIdx]?.text || "");
    const datasets = seriesIdxs.map((sIdx, i) => {
      const data = table.rows.map((r) => r[sIdx]?.num ?? 0);
      // 시리즈 이름 — 사용자 지정 > 컬럼 헤더 > 폴백
      const customLabel = seriesLabels[sIdx]?.trim();
      const ds: Record<string, unknown> = {
        label: customLabel || table.headers[sIdx] || `열 ${sIdx + 1}`,
        data,
      };
      // 파이/도넛은 색상 자동, 막대/선은 dataset 별 1색
      if (!isSingleSeries) ds.color = COLORS[i % COLORS.length];
      return ds;
    });

    const spec: Record<string, unknown> = {
      type: kind,
      labels,
      datasets,
    };
    if (title.trim()) spec.title = title.trim();
    if (xLabel.trim()) spec.x_label = xLabel.trim();
    if (yLabel.trim()) spec.y_label = yLabel.trim();
    if (showValues && !isSingleSeries) spec.show_values = true;
    if (kind === "donut" && showValues) spec.show_values = true;

    const json = JSON.stringify(spec, null, 2);
    return ["```chart width=" + width + " align=" + align, json, "```"].join("\n");
  }, [
    table, labelIdx, seriesIdxs, kind, title, xLabel, yLabel,
    width, align, showValues, isSingleSeries, seriesLabels,
  ]);

  // Esc 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canInsert = seriesIdxs.length > 0 && table.rows.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-brand" />
            <h2 className="text-base font-semibold">표를 차트로 변환</h2>
            <span className="text-xs text-neutral-500">
              {table.rows.length}행 × {table.headers.length}열 — 차트 종류·데이터셋 선택 후 표 직후에 삽입
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={16} />
          </button>
        </div>

        {/* 본문 — 좌(표 미리보기) / 우(차트 설정) */}
        <div className="grid flex-1 grid-cols-12 overflow-hidden">
          {/* 좌측: 감지된 표 미리보기 */}
          <div className="col-span-5 flex flex-col overflow-hidden border-r border-neutral-200 dark:border-neutral-800">
            <div className="border-b border-neutral-200 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
              감지된 표
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    {table.headers.map((h, i) => {
                      const isLabel = i === labelIdx;
                      const isSeries = seriesIdxs.includes(i);
                      return (
                        <th
                          key={i}
                          className={`border border-neutral-200 px-2 py-1 text-left font-semibold dark:border-neutral-700 ${
                            isLabel
                              ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                              : isSeries
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "bg-neutral-50 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                          }`}
                          title={
                            isLabel
                              ? "라벨 컬럼 (X축)"
                              : isSeries
                                ? "데이터셋 컬럼"
                                : "(차트에 포함 안 됨)"
                          }
                        >
                          {h || `열 ${i + 1}`}
                          <div className="text-[8px] font-normal opacity-70">
                            {isLabel ? "X축" : isSeries ? `시리즈` : "—"}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.slice(0, 12).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className={`border border-neutral-200 px-2 py-1 dark:border-neutral-700 ${
                            ci === labelIdx
                              ? "bg-sky-50/40 dark:bg-sky-950/20"
                              : seriesIdxs.includes(ci)
                                ? "font-mono text-right text-emerald-700 dark:text-emerald-300"
                                : "text-neutral-400"
                          }`}
                        >
                          {cell.text || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {table.rows.length > 12 && (
                    <tr>
                      <td
                        colSpan={table.headers.length}
                        className="border border-neutral-200 px-2 py-1 text-center text-[10px] text-neutral-500 dark:border-neutral-700"
                      >
                        … 외 {table.rows.length - 12} 행 (모두 차트에 포함됨)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="mt-3 text-[10px] text-neutral-500">
                💡 헤더 클릭으로 라벨/시리즈 변경 (우측 패널)
              </p>
            </div>
          </div>

          {/* 우측: 차트 설정 */}
          <div className="col-span-7 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4">
              {/* 차트 이름 — 가장 중요한 입력이라 최상단 */}
              <section className="mb-4">
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  차트 이름 (제목)
                </h3>
                <input
                  placeholder="예: 분기별 매출 — 차트 위에 표시될 제목"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
                />
              </section>

              {/* 차트 종류 */}
              <section className="mb-4">
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  차트 종류
                </h3>
                <div className="grid grid-cols-4 gap-1.5">
                  {CHART_KINDS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => setKind(k.id)}
                      title={k.description}
                      className={`rounded border px-2 py-1.5 text-left text-[11px] transition-all ${
                        kind === k.id
                          ? "border-brand bg-brand/10 text-brand"
                          : "border-neutral-200 bg-white hover:border-brand/40 dark:border-neutral-700 dark:bg-neutral-900"
                      }`}
                    >
                      <div className="font-semibold">{k.label}</div>
                      <div className="mt-0.5 truncate text-[9px] opacity-70">{k.description}</div>
                    </button>
                  ))}
                </div>
              </section>

              {/* 라벨 컬럼 — X축 카테고리 */}
              <section className="mb-4">
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  라벨 컬럼 (X축)
                </h3>
                <div className="flex flex-wrap gap-1">
                  {table.headers.map((h, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setLabelIdx(i)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
                        labelIdx === i
                          ? "bg-sky-200 text-sky-800 dark:bg-sky-900 dark:text-sky-100"
                          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
                      }`}
                    >
                      {h || `열 ${i + 1}`}
                    </button>
                  ))}
                </div>
              </section>

              {/* 데이터셋 컬럼 — 시리즈 */}
              <section className="mb-4">
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  데이터셋 컬럼 (시리즈){isSingleSeries && " — 단일"}
                </h3>
                <div className="flex flex-wrap gap-1">
                  {table.headers.map((h, i) => {
                    if (i === labelIdx) return null;
                    const selected = seriesIdxs.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleSeries(i)}
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
                          selected
                            ? "bg-emerald-200 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100"
                            : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
                        }`}
                      >
                        {selected ? "✓ " : ""}{h || `열 ${i + 1}`}
                      </button>
                    );
                  })}
                </div>

                {/* 시리즈 이름(범례 라벨) 인라인 편집 — 선택된 시리즈만 */}
                {seriesIdxs.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <div className="text-[10px] text-neutral-500">
                      범례에 표시될 시리즈 이름 — 비우면 컬럼 헤더 그대로 사용
                    </div>
                    {seriesIdxs.map((sIdx, i) => {
                      const headerName = table.headers[sIdx] || `열 ${sIdx + 1}`;
                      const color = !isSingleSeries ? COLORS[i % COLORS.length] : undefined;
                      return (
                        <div key={sIdx} className="flex items-center gap-2 text-xs">
                          {color && (
                            <span
                              className="inline-block h-3 w-3 shrink-0 rounded-sm"
                              style={{ backgroundColor: color }}
                              title={`색상: ${color}`}
                            />
                          )}
                          <span
                            className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                            title="원본 컬럼명"
                          >
                            {headerName}
                          </span>
                          <span className="text-neutral-400">→</span>
                          <input
                            type="text"
                            value={seriesLabels[sIdx] ?? ""}
                            onChange={(e) =>
                              setSeriesLabels((prev) => ({ ...prev, [sIdx]: e.target.value }))
                            }
                            placeholder={headerName}
                            className="flex-1 rounded border border-neutral-200 px-2 py-1 text-xs focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
                          />
                          {seriesLabels[sIdx] && (
                            <button
                              type="button"
                              onClick={() =>
                                setSeriesLabels((prev) => {
                                  const next = { ...prev };
                                  delete next[sIdx];
                                  return next;
                                })
                              }
                              className="shrink-0 rounded px-1 text-[10px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800"
                              title="원본 컬럼명으로 되돌리기"
                            >
                              초기화
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 옵션 — 축·크기 (제목은 상단에 별도) */}
              <section>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  축·크기 옵션
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <input
                    placeholder="X축 라벨"
                    value={xLabel}
                    onChange={(e) => setXLabel(e.target.value)}
                    className="rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                  />
                  <input
                    placeholder="Y축 라벨"
                    value={yLabel}
                    onChange={(e) => setYLabel(e.target.value)}
                    className="rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-neutral-500">너비</span>
                    <select
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      className="flex-1 rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                    >
                      <option value="60%">60%</option>
                      <option value="70%">70%</option>
                      <option value="80%">80%</option>
                      <option value="90%">90%</option>
                      <option value="100%">100%</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-neutral-500">정렬</span>
                    <select
                      value={align}
                      onChange={(e) => setAlign(e.target.value as "left" | "center" | "right")}
                      className="flex-1 rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                    >
                      <option value="left">왼쪽</option>
                      <option value="center">가운데</option>
                      <option value="right">오른쪽</option>
                    </select>
                  </div>
                  <label className="col-span-2 flex items-center gap-2 text-[11px] text-neutral-600 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={showValues}
                      onChange={(e) => setShowValues(e.target.checked)}
                      className="h-3.5 w-3.5 cursor-pointer accent-brand"
                    />
                    데이터 값 표시
                  </label>
                </div>
              </section>
            </div>

            {/* 합성 스니펫 미리보기 */}
            <div className="border-t border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-950/40">
              <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                삽입될 차트 스니펫
              </div>
              <pre className="max-h-[180px] overflow-auto px-4 pb-2 font-mono text-[10px] leading-relaxed text-neutral-700 dark:text-neutral-300">
                {snippet}
              </pre>
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <div className="text-[11px] text-neutral-500">
            💡 차트는 표 직후에 빈 줄 두 개 + ```chart 블록으로 삽입됩니다 (표 원본 유지)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded border border-neutral-200 px-3 py-1.5 text-xs hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              취소
            </button>
            <button
              onClick={() => onInsert(snippet)}
              disabled={!canInsert}
              className="flex items-center gap-1 rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
            >
              <Check size={11} />
              차트 삽입
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
