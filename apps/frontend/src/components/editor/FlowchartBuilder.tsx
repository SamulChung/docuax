"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";

/**
 * Flowchart 시각 빌더 — Mermaid 구문 안 쓰고 노드·엣지 폼 입력으로 작성.
 *
 * 입력 컨트롤:
 *   - 방향: TD(세로) / LR(가로) / RL(우→좌) / BT(아래→위)
 *   - 노드 목록: id (A,B,C…) + 라벨 + 모양(6종)
 *   - 엣지 목록: from·to (드롭다운) + 라벨(선택) + 스타일(4종)
 *
 * 변경 시마다 Mermaid 소스 합성 → onChange(source) 로 부모에 보고.
 * 부모(DiagramDialog) 는 body 로 받아 frontmatter(title) 와 합쳐 최종 스니펫 생성.
 */

export type NodeShape = "rect" | "round" | "stadium" | "circle" | "diamond" | "hex";
export type EdgeStyle = "solid" | "dotted" | "thick" | "thin";
export type FlowDirection = "TD" | "LR" | "RL" | "BT";

interface NodeData {
  id: string;
  label: string;
  shape: NodeShape;
}

interface EdgeData {
  from: string;
  to: string;
  label: string;
  style: EdgeStyle;
}

interface BuilderState {
  direction: FlowDirection;
  nodes: NodeData[];
  edges: EdgeData[];
}

const SHAPE_LABELS: Record<NodeShape, { name: string; preview: string }> = {
  rect: { name: "사각형", preview: "[A]" },
  round: { name: "둥근 모서리", preview: "(A)" },
  stadium: { name: "스타디움", preview: "([A])" },
  circle: { name: "원", preview: "((A))" },
  diamond: { name: "다이아몬드", preview: "{A}" },
  hex: { name: "육각형", preview: "{{A}}" },
};

const SHAPE_BRACKETS: Record<NodeShape, [string, string]> = {
  rect: ["[", "]"],
  round: ["(", ")"],
  stadium: ["([", "])"],
  circle: ["((", "))"],
  diamond: ["{", "}"],
  hex: ["{{", "}}"],
};

const STYLE_LABELS: Record<EdgeStyle, { name: string; arrow: string }> = {
  solid: { name: "실선", arrow: "-->" },
  dotted: { name: "점선", arrow: "-.->" },
  thick: { name: "굵게", arrow: "==>" },
  thin: { name: "(화살표 X)", arrow: "---" },
};

const DIRECTION_LABELS: Record<FlowDirection, string> = {
  TD: "↓ 세로 (위→아래)",
  LR: "→ 가로 (좌→우)",
  RL: "← 가로 (우→좌)",
  BT: "↑ 세로 (아래→위)",
};

/** 새 노드 id 자동 발급 — A, B, …, Z, AA, AB, … */
function nextId(existing: string[]): string {
  for (let i = 0; ; i++) {
    let id = "";
    let n = i;
    do {
      id = String.fromCharCode(65 + (n % 26)) + id;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    if (!existing.includes(id)) return id;
  }
}

/** 상태 → Mermaid 소스 합성. */
function serialize(state: BuilderState): string {
  const lines: string[] = [`flowchart ${state.direction}`];
  for (const n of state.nodes) {
    const [open, close] = SHAPE_BRACKETS[n.shape];
    const safeLabel = n.label.replace(/\]/g, "\\]"); // 최소한의 escape
    lines.push(`    ${n.id}${open}${safeLabel}${close}`);
  }
  for (const e of state.edges) {
    if (!e.from || !e.to) continue;
    const arrow = STYLE_LABELS[e.style].arrow;
    const labelPart = e.label.trim() ? `|${e.label.trim()}|` : "";
    lines.push(`    ${e.from} ${arrow}${labelPart} ${e.to}`);
  }
  return lines.join("\n");
}

const DEFAULT_STATE: BuilderState = {
  direction: "LR",
  nodes: [
    { id: "A", label: "시작", shape: "round" },
    { id: "B", label: "처리", shape: "rect" },
    { id: "C", label: "종료", shape: "round" },
  ],
  edges: [
    { from: "A", to: "B", label: "", style: "solid" },
    { from: "B", to: "C", label: "", style: "solid" },
  ],
};

interface Props {
  /** 외부로 합성된 Mermaid body 전달 */
  onSourceChange: (mermaidBody: string) => void;
  /** 외부에서 초기 빌더 상태를 주입할 때 사용 (옵션) */
  initialState?: BuilderState;
}

export function FlowchartBuilder({ onSourceChange, initialState }: Props) {
  const [state, setState] = useState<BuilderState>(initialState ?? DEFAULT_STATE);

  // 상태 변경 시마다 부모에 소스 보고
  const source = useMemo(() => serialize(state), [state]);
  useEffect(() => {
    onSourceChange(source);
  }, [source, onSourceChange]);

  const addNode = () => {
    setState((s) => ({
      ...s,
      nodes: [
        ...s.nodes,
        { id: nextId(s.nodes.map((n) => n.id)), label: "새 노드", shape: "rect" },
      ],
    }));
  };

  const updateNode = (idx: number, patch: Partial<NodeData>) => {
    setState((s) => {
      const next = [...s.nodes];
      next[idx] = { ...next[idx], ...patch };
      // 만약 id 가 바뀌면 엣지의 from/to 도 함께 업데이트
      if (patch.id && patch.id !== s.nodes[idx].id) {
        const oldId = s.nodes[idx].id;
        const newId = patch.id;
        // 중복 검사 — 기존 id 와 충돌하면 거부
        if (s.nodes.some((n, i) => i !== idx && n.id === newId)) {
          alert(`이미 사용 중인 ID: ${newId}`);
          return s;
        }
        const newEdges = s.edges.map((e) => ({
          ...e,
          from: e.from === oldId ? newId : e.from,
          to: e.to === oldId ? newId : e.to,
        }));
        return { ...s, nodes: next, edges: newEdges };
      }
      return { ...s, nodes: next };
    });
  };

  const removeNode = (idx: number) => {
    setState((s) => {
      const removedId = s.nodes[idx].id;
      // 해당 노드를 참조하는 엣지도 함께 제거
      return {
        ...s,
        nodes: s.nodes.filter((_, i) => i !== idx),
        edges: s.edges.filter((e) => e.from !== removedId && e.to !== removedId),
      };
    });
  };

  const addEdge = () => {
    setState((s) => {
      if (s.nodes.length < 2) return s;
      return {
        ...s,
        edges: [
          ...s.edges,
          {
            from: s.nodes[0].id,
            to: s.nodes[1].id,
            label: "",
            style: "solid",
          },
        ],
      };
    });
  };

  const updateEdge = (idx: number, patch: Partial<EdgeData>) => {
    setState((s) => {
      const next = [...s.edges];
      next[idx] = { ...next[idx], ...patch };
      return { ...s, edges: next };
    });
  };

  const removeEdge = (idx: number) => {
    setState((s) => ({ ...s, edges: s.edges.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="space-y-3 text-xs">
      {/* 방향 선택 */}
      <section>
        <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          방향
        </h4>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(DIRECTION_LABELS) as FlowDirection[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setState((s) => ({ ...s, direction: d }))}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
                state.direction === d
                  ? "bg-brand text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
              }`}
            >
              {DIRECTION_LABELS[d]}
            </button>
          ))}
        </div>
      </section>

      {/* 노드 목록 */}
      <section>
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            노드 ({state.nodes.length})
          </h4>
          <button
            type="button"
            onClick={addNode}
            className="flex items-center gap-0.5 rounded bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand hover:bg-brand/20"
          >
            <Plus size={10} /> 노드 추가
          </button>
        </div>
        <div className="space-y-1">
          {state.nodes.map((n, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded border border-neutral-200 bg-white px-1.5 py-1 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <input
                type="text"
                value={n.id}
                onChange={(e) => updateNode(i, { id: e.target.value.replace(/[^A-Za-z0-9_]/g, "") })}
                className="w-12 shrink-0 rounded border border-neutral-200 bg-neutral-50 px-1 py-0.5 text-center font-mono text-[10px] font-bold dark:border-neutral-700 dark:bg-neutral-950"
                title="노드 ID (Mermaid 식별자 — 영문/숫자/_만)"
              />
              <input
                type="text"
                value={n.label}
                onChange={(e) => updateNode(i, { label: e.target.value })}
                placeholder="노드 라벨"
                className="flex-1 rounded border border-neutral-200 px-1.5 py-0.5 dark:border-neutral-700 dark:bg-neutral-900"
              />
              <select
                value={n.shape}
                onChange={(e) => updateNode(i, { shape: e.target.value as NodeShape })}
                className="w-28 shrink-0 rounded border border-neutral-200 px-1 py-0.5 text-[10px] dark:border-neutral-700 dark:bg-neutral-900"
                title="노드 모양"
              >
                {(Object.keys(SHAPE_LABELS) as NodeShape[]).map((s) => (
                  <option key={s} value={s}>
                    {SHAPE_LABELS[s].name} {SHAPE_LABELS[s].preview}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeNode(i)}
                className="shrink-0 rounded p-1 text-neutral-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                title="노드 삭제 (참조하는 엣지도 함께 삭제)"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
          {state.nodes.length === 0 && (
            <p className="text-[10px] text-neutral-500">노드가 없습니다. [노드 추가] 로 시작.</p>
          )}
        </div>
      </section>

      {/* 엣지 목록 */}
      <section>
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            연결 ({state.edges.length})
          </h4>
          <button
            type="button"
            onClick={addEdge}
            disabled={state.nodes.length < 2}
            className="flex items-center gap-0.5 rounded bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
            title={state.nodes.length < 2 ? "엣지 추가는 노드 2개 이상부터" : "엣지 추가"}
          >
            <Plus size={10} /> 연결 추가
          </button>
        </div>
        <div className="space-y-1">
          {state.edges.map((e, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded border border-neutral-200 bg-white px-1.5 py-1 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <select
                value={e.from}
                onChange={(ev) => updateEdge(i, { from: ev.target.value })}
                className="w-14 shrink-0 rounded border border-neutral-200 px-1 py-0.5 font-mono text-[10px] font-bold dark:border-neutral-700 dark:bg-neutral-900"
              >
                {state.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.id}
                  </option>
                ))}
              </select>
              <ArrowRight size={11} className="shrink-0 text-neutral-400" />
              <select
                value={e.to}
                onChange={(ev) => updateEdge(i, { to: ev.target.value })}
                className="w-14 shrink-0 rounded border border-neutral-200 px-1 py-0.5 font-mono text-[10px] font-bold dark:border-neutral-700 dark:bg-neutral-900"
              >
                {state.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.id}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={e.label}
                onChange={(ev) => updateEdge(i, { label: ev.target.value })}
                placeholder="연결 라벨 (선택)"
                className="flex-1 rounded border border-neutral-200 px-1.5 py-0.5 dark:border-neutral-700 dark:bg-neutral-900"
              />
              <select
                value={e.style}
                onChange={(ev) => updateEdge(i, { style: ev.target.value as EdgeStyle })}
                className="w-24 shrink-0 rounded border border-neutral-200 px-1 py-0.5 text-[10px] dark:border-neutral-700 dark:bg-neutral-900"
                title="엣지 스타일"
              >
                {(Object.keys(STYLE_LABELS) as EdgeStyle[]).map((s) => (
                  <option key={s} value={s}>
                    {STYLE_LABELS[s].name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeEdge(i)}
                className="shrink-0 rounded p-1 text-neutral-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
          {state.edges.length === 0 && (
            <p className="text-[10px] text-neutral-500">
              연결이 없습니다. 노드 2개 이상 만든 뒤 [연결 추가].
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
