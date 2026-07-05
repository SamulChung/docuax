"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, BarChart3, GitBranch, Sigma, FileText, Loader2, ChevronDown, Table2 } from "lucide-react";

import { DiagramDialog } from "@/components/editor/DiagramDialog";
import { EquationDialog } from "@/components/editor/EquationDialog";
import { TableToChartDialog } from "@/components/editor/TableToChartDialog";
import { DIAGRAM_TEMPLATES as SHARED_DIAGRAM_TEMPLATES } from "@/lib/diagramTemplates";
import { EQUATION_TEMPLATES as SHARED_EQUATION_TEMPLATES } from "@/lib/equationTemplates";
import { findTableAtCursor, type ParsedTable } from "@/lib/markdownTable";
import { useWorkspace } from "@/store/workspace";

type CoverTemplate =
  | "modern" | "classic" | "gongmun" | "proposal" | "research"
  | "executive" | "annual_report" | "government" | "whitepaper" | "minimal";

type CoverCategory = "비즈니스·기획" | "공공·행정" | "학술·연구" | "고전·간결";

const COVER_TEMPLATES: { id: CoverTemplate; label: string; description: string; category: CoverCategory }[] = [
  // 비즈니스·기획
  { id: "modern",        category: "비즈니스·기획", label: "모던",       description: "상단 컬러 밴드 + 세련된 타이포 (기본값, 추천)" },
  { id: "executive",     category: "비즈니스·기획", label: "임원 보고서", description: "상하 그라데이션 밴드 + 고급 타이포 — Executive Report" },
  { id: "proposal",      category: "비즈니스·기획", label: "제안서",     description: "좌측 컬러 밴드 + 큰 제목 — 임팩트 강조" },
  { id: "annual_report", category: "비즈니스·기획", label: "연차 보고서", description: "큰 표지 + 연도 워터마크 — Annual Report" },
  // 공공·행정
  { id: "gongmun",       category: "공공·행정",     label: "공문서",     description: "한국 공문서 표준 — 직인 자리 + 격식 강조" },
  { id: "government",    category: "공공·행정",     label: "정부 공문",   description: "정부 표준 양식 — 기관 인장 + 결재선 3단" },
  // 학술·연구
  { id: "research",      category: "학술·연구",     label: "연구보고서",  description: "학술 스타일 + 식별번호 강조" },
  { id: "whitepaper",    category: "학술·연구",     label: "백서",       description: "산업·기술 분석 보고서 — 키워드 태그 지원" },
  // 고전·간결
  { id: "classic",       category: "고전·간결",     label: "클래식",     description: "중앙 정렬 + 워터마크 — 전통적·차분한 인상" },
  { id: "minimal",       category: "고전·간결",     label: "미니멀",     description: "제목만 강조 + 큰 여백 — 모던 미니멀" },
];

// ─────────────────────────────────────────────────────────────────────────
// 차트 카탈로그 — 18종 한국 비즈니스 시나리오 템플릿
// ─────────────────────────────────────────────────────────────────────────
interface ChartTemplate {
  id: string;
  label: string;
  description: string;
  category: "막대" | "선" | "비율" | "분포" | "평가" | "매트릭스";
  snippet: string;
}

const CHART_TEMPLATES: ChartTemplate[] = [
  // ───── 막대 ─────
  {
    id: "bar",
    label: "막대 차트",
    description: "분기별·월별 비교 — 가장 보편적",
    category: "막대",
    snippet: `\`\`\`chart width=80% align=center
{
  "type": "bar",
  "title": "분기별 매출",
  "subtitle": "단위: 백만원",
  "x_label": "분기",
  "y_label": "매출",
  "labels": ["1Q", "2Q", "3Q", "4Q"],
  "datasets": [
    {"label": "2025", "data": [12, 28, 45, 68], "color": "#1F5BAF"},
    {"label": "2026", "data": [22, 38, 56, 80], "color": "#F4B400"}
  ],
  "show_values": true
}
\`\`\``,
  },
  {
    id: "hbar",
    label: "가로 막대",
    description: "긴 라벨 비교 — 부서·제품 순위",
    category: "막대",
    snippet: `\`\`\`chart width=70% align=center
{
  "type": "hbar",
  "title": "부서별 인원",
  "labels": ["기획팀", "개발팀", "디자인팀", "운영팀", "영업팀"],
  "datasets": [{"data": [12, 28, 8, 15, 22], "color": "#1F5BAF"}],
  "show_values": true
}
\`\`\``,
  },
  {
    id: "stacked_bar",
    label: "누적 막대",
    description: "구성요소별 누적 — 부서별 비용 구성",
    category: "막대",
    snippet: `\`\`\`chart width=80% align=center
{
  "type": "stacked_bar",
  "title": "분기별 비용 구성",
  "labels": ["1Q", "2Q", "3Q", "4Q"],
  "datasets": [
    {"label": "인건비", "data": [40, 45, 50, 55]},
    {"label": "운영비", "data": [20, 22, 25, 28]},
    {"label": "마케팅", "data": [10, 15, 18, 22]}
  ],
  "show_values": true
}
\`\`\``,
  },
  {
    id: "percent_stacked",
    label: "100% 누적",
    description: "비율 비교 — 시장 점유율 변화",
    category: "막대",
    snippet: `\`\`\`chart width=80% align=center
{
  "type": "percent_stacked",
  "title": "시장 점유율 추이",
  "labels": ["2023", "2024", "2025", "2026"],
  "datasets": [
    {"label": "DocuAX", "data": [5, 12, 22, 35]},
    {"label": "경쟁사 A", "data": [40, 38, 35, 30]},
    {"label": "경쟁사 B", "data": [30, 28, 25, 20]},
    {"label": "기타", "data": [25, 22, 18, 15]}
  ]
}
\`\`\``,
  },
  {
    id: "waterfall",
    label: "워터폴",
    description: "누적 변화 — 손익·예산 분석",
    category: "막대",
    snippet: `\`\`\`chart width=80% align=center
{
  "type": "waterfall",
  "title": "분기 손익 분석 (단위: 억원)",
  "labels": ["시작", "매출", "원가", "운영비", "세금", "순이익"],
  "datasets": [{"data": [0, 150, -60, -40, -15, 35]}],
  "show_values": true
}
\`\`\``,
  },

  // ───── 선 ─────
  {
    id: "line",
    label: "선 차트",
    description: "추이 — 시간에 따른 변화",
    category: "선",
    snippet: `\`\`\`chart width=80% align=center
{
  "type": "line",
  "title": "주간 활성 사용자 추이",
  "labels": ["1주", "2주", "3주", "4주", "5주", "6주"],
  "datasets": [
    {"label": "DAU", "data": [120, 180, 260, 340, 430, 520]},
    {"label": "WAU", "data": [80, 130, 200, 280, 360, 460]}
  ],
  "show_values": true
}
\`\`\``,
  },
  {
    id: "step_line",
    label: "계단형 선",
    description: "단계적 변화 — 가격·정책 변경",
    category: "선",
    snippet: `\`\`\`chart width=80% align=center
{
  "type": "step_line",
  "title": "가격 정책 변화",
  "labels": ["1월", "2월", "3월", "4월", "5월", "6월"],
  "datasets": [
    {"label": "Pro 플랜", "data": [9900, 9900, 12000, 12000, 14000, 14000]}
  ],
  "show_values": true
}
\`\`\``,
  },
  {
    id: "area",
    label: "영역 차트",
    description: "누적 시각화 — 부드러운 흐름",
    category: "선",
    snippet: `\`\`\`chart width=80% align=center
{
  "type": "area",
  "title": "월별 가입자 누적",
  "labels": ["1월", "2월", "3월", "4월", "5월", "6월"],
  "datasets": [
    {"label": "가입자", "data": [100, 280, 520, 840, 1200, 1620]}
  ]
}
\`\`\``,
  },
  {
    id: "mixed",
    label: "혼합 차트",
    description: "막대+선 — 매출·증가율 동시 표시",
    category: "선",
    snippet: `\`\`\`chart width=80% align=center
{
  "type": "mixed",
  "title": "매출과 증가율",
  "labels": ["1Q", "2Q", "3Q", "4Q"],
  "datasets": [
    {"label": "매출", "data": [120, 180, 260, 340], "type": "bar"},
    {"label": "증가율(%)", "data": [10, 18, 25, 30], "type": "line", "color": "#DB4437"}
  ]
}
\`\`\``,
  },
  {
    id: "dual_axis",
    label: "이중 Y축",
    description: "단위 다른 두 지표 — 매출과 단가",
    category: "선",
    snippet: `\`\`\`chart width=80% align=center
{
  "type": "dual_axis",
  "title": "매출(좌) vs 평균 단가(우)",
  "labels": ["1Q", "2Q", "3Q", "4Q"],
  "datasets": [
    {"label": "매출(억원)", "data": [120, 180, 260, 340], "type": "bar", "axis": "left"},
    {"label": "평균단가(만원)", "data": [50, 55, 62, 70], "type": "line", "axis": "right", "color": "#DB4437"}
  ]
}
\`\`\``,
  },

  // ───── 비율 ─────
  {
    id: "pie",
    label: "파이 차트",
    description: "비율 — 단순 비중",
    category: "비율",
    snippet: `\`\`\`chart width=60% align=center
{
  "type": "pie",
  "title": "사용자 분포",
  "labels": ["공무원", "기업", "연구원", "기타"],
  "datasets": [{"data": [42, 30, 18, 10]}]
}
\`\`\``,
  },
  {
    id: "donut",
    label: "도넛 차트",
    description: "비율 + 중앙 합계",
    category: "비율",
    snippet: `\`\`\`chart width=60% align=center
{
  "type": "donut",
  "title": "예산 배분",
  "labels": ["개발", "마케팅", "운영", "예비"],
  "datasets": [{"data": [120, 80, 60, 40]}],
  "show_values": true
}
\`\`\``,
  },
  {
    id: "funnel",
    label: "퍼널 차트",
    description: "전환율 — 단계별 깔때기",
    category: "비율",
    snippet: `\`\`\`chart width=70% align=center
{
  "type": "funnel",
  "title": "사용자 전환 깔때기",
  "labels": ["방문", "회원가입", "첫 변환", "유료 전환", "리텐션"],
  "datasets": [{"data": [10000, 3200, 1800, 420, 280]}]
}
\`\`\``,
  },

  // ───── 분포 ─────
  {
    id: "scatter",
    label: "산점도",
    description: "두 변수 상관관계",
    category: "분포",
    snippet: `\`\`\`chart width=70% align=center
{
  "type": "scatter",
  "title": "광고비 vs 매출",
  "x_label": "광고비 (백만원)",
  "y_label": "매출 (백만원)",
  "datasets": [
    {"label": "지점", "data": [[10,50],[20,80],[15,65],[30,120],[25,95],[40,150]]}
  ]
}
\`\`\``,
  },
  {
    id: "bubble",
    label: "버블 차트",
    description: "3차원 비교 — 시장 포지셔닝",
    category: "분포",
    snippet: `\`\`\`chart width=70% align=center
{
  "type": "bubble",
  "title": "시장 포지셔닝 (X=점유율, Y=만족도, 크기=매출)",
  "x_label": "점유율",
  "y_label": "만족도",
  "datasets": [
    {"label": "DocuAX", "data": [[15, 9.0, 50, "DocuAX"]], "color": "#1F5BAF"},
    {"label": "경쟁사", "data": [[35, 7.5, 120, "A사"], [25, 8.0, 90, "B사"], [10, 7.0, 30, "C사"]]}
  ]
}
\`\`\``,
  },
  {
    id: "histogram",
    label: "히스토그램",
    description: "빈도 분포 — 통계 분석",
    category: "분포",
    snippet: `\`\`\`chart width=70% align=center
{
  "type": "histogram",
  "title": "응답 시간 분포 (ms)",
  "bins": 12,
  "datasets": [
    {"label": "응답시간", "data": [50,55,60,62,65,70,72,75,80,82,85,88,90,92,95,98,100,105,110,120,130,150,180,220]}
  ]
}
\`\`\``,
  },
  {
    id: "boxplot",
    label: "박스 플롯",
    description: "통계 비교 — 사분위수·이상치",
    category: "분포",
    snippet: `\`\`\`chart width=70% align=center
{
  "type": "boxplot",
  "title": "지점별 일일 매출 분포",
  "datasets": [
    {"label": "강남", "data": [12,15,18,20,22,25,28,30,32,35,40,45,55]},
    {"label": "분당", "data": [10,12,14,16,18,20,22,24,26,28,30,35]},
    {"label": "송도", "data": [8,10,12,14,16,18,20,22,24,28,32]}
  ]
}
\`\`\``,
  },

  // ───── 평가 ─────
  {
    id: "radar",
    label: "레이더 차트",
    description: "다축 평가 — 역량·성능 비교",
    category: "평가",
    snippet: `\`\`\`chart width=70% align=center
{
  "type": "radar",
  "title": "제품 비교 평가",
  "labels": ["가격", "성능", "사용성", "지원", "확장성", "보안"],
  "datasets": [
    {"label": "DocuAX", "data": [85, 90, 95, 88, 92, 87], "color": "#1F5BAF"},
    {"label": "경쟁사", "data": [70, 75, 65, 80, 70, 78], "color": "#F4B400"}
  ]
}
\`\`\``,
  },
  {
    id: "gauge",
    label: "게이지 (KPI)",
    description: "단일 지표 — 목표 달성률",
    category: "평가",
    snippet: `\`\`\`chart width=50% align=center
{
  "type": "gauge",
  "title": "월별 목표 달성률",
  "min": 0,
  "max": 100,
  "unit": "달성률 (%)",
  "datasets": [{"label": "5월 달성", "data": [78]}]
}
\`\`\``,
  },

  // ───── 매트릭스 ─────
  {
    id: "heatmap",
    label: "히트맵",
    description: "2D 매트릭스 — 시간×요일 패턴",
    category: "매트릭스",
    snippet: `\`\`\`chart width=80% align=center
{
  "type": "heatmap",
  "title": "요일·시간대별 트래픽",
  "labels": ["00시", "03시", "06시", "09시", "12시", "15시", "18시", "21시"],
  "datasets": [
    {"label": "월", "data": [5,3,8,45,80,75,90,55]},
    {"label": "화", "data": [4,2,9,50,85,80,95,60]},
    {"label": "수", "data": [5,3,8,48,82,78,92,58]},
    {"label": "목", "data": [6,4,10,52,88,82,98,62]},
    {"label": "금", "data": [7,5,12,55,92,85,105,70]},
    {"label": "토", "data": [15,8,12,30,50,55,75,68]},
    {"label": "일", "data": [10,6,8,25,45,50,65,55]}
  ],
  "cmap": "Blues"
}
\`\`\``,
  },
  {
    id: "treemap",
    label: "트리맵",
    description: "계층 비중 — 카테고리 구성",
    category: "매트릭스",
    snippet: `\`\`\`chart width=80% align=center
{
  "type": "treemap",
  "title": "제품군별 매출 구성",
  "labels": ["문서변환", "AI어시스턴트", "양식학습", "기타"],
  "datasets": [{"data": [450, 280, 180, 90]}]
}
\`\`\``,
  },
  {
    id: "polar",
    label: "극좌표 차트",
    description: "원형 막대 — 방위·시간 데이터",
    category: "매트릭스",
    snippet: `\`\`\`chart width=70% align=center
{
  "type": "polar",
  "title": "방향별 풍속",
  "labels": ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
  "datasets": [{"label": "풍속", "data": [12, 15, 8, 5, 7, 10, 18, 22]}]
}
\`\`\``,
  },
];

// 수식 카탈로그는 @/lib/equationTemplates.ts 로 분리됨 (SHARED_EQUATION_TEMPLATES import).

// 다이어그램 카탈로그는 @/lib/diagramTemplates.ts 로 분리됨 (SHARED_DIAGRAM_TEMPLATES import).

/**
 * 시각 요소 삽입 툴바 — 표지·이미지·차트·다이어그램·수식.
 *
 * 동작:
 *   1. 표지/차트/다이어그램/수식 — 미리 정의된 마크다운 템플릿을 본문 끝에 삽입.
 *   2. 이미지 — 파일 선택 → POST /uploads/image → 응답의 markdown 삽입.
 */
/**
 * @param textareaRef  Editor 의 textarea ref — 커서 위치에 정확히 삽입하기 위해 필요.
 *                     없으면 본문 끝에 append (fallback).
 * @param onInsert     v3: CodeMirror 등 외부 에디터로의 삽입 함수. 지정 시 textareaRef보다 우선.
 */
interface InsertVisualBarProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  /** v3: CodeMirror 등 외부 에디터로의 삽입 함수. 지정 시 textareaRef보다 우선. */
  onInsert?: (snippet: string) => void;
}

export function InsertVisualBar({ textareaRef, onInsert }: InsertVisualBarProps = {}) {
  const source = useWorkspace((s) => s.source);
  const setSource = useWorkspace((s) => s.setSource);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [coverMenuOpen, setCoverMenuOpen] = useState(false);
  const [diagramMenuOpen, setDiagramMenuOpen] = useState(false);
  const [chartMenuOpen, setChartMenuOpen] = useState(false);
  const [equationMenuOpen, setEquationMenuOpen] = useState(false);
  // 다이어그램 편집 다이얼로그
  const [diagramDialogOpen, setDiagramDialogOpen] = useState(false);
  const [diagramTplId, setDiagramTplId] = useState<string>(SHARED_DIAGRAM_TEMPLATES[0].id);
  // 수식 편집 다이얼로그
  const [equationDialogOpen, setEquationDialogOpen] = useState(false);
  const [equationTplId, setEquationTplId] = useState<string>(SHARED_EQUATION_TEMPLATES[0].id);
  // 커서 위치 기준 감지된 표 — null 이면 [표→차트] 비활성
  const [detectedTable, setDetectedTable] = useState<ParsedTable | null>(null);
  const [tableToChartOpen, setTableToChartOpen] = useState(false);

  // 커서 이동·source 변경 시마다 표 감지 갱신 (200ms 디바운스)
  useEffect(() => {
    const ta = textareaRef?.current;
    if (!ta) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const cursor = ta.selectionStart ?? 0;
        const t = findTableAtCursor(source, cursor);
        setDetectedTable(t);
      }, 200);
    };
    ta.addEventListener("keyup", update);
    ta.addEventListener("click", update);
    ta.addEventListener("focus", update);
    update();
    return () => {
      if (timer) clearTimeout(timer);
      ta.removeEventListener("keyup", update);
      ta.removeEventListener("click", update);
      ta.removeEventListener("focus", update);
    };
  }, [textareaRef, source]);

  /**
   * textarea 의 **현재 커서 위치**에 snippet 삽입.
   * - selection 이 있으면 선택 텍스트를 snippet 으로 교체.
   * - 삽입 후 커서를 snippet 끝으로 자동 이동 + focus.
   * - textareaRef 가 없으면 본문 끝에 append (fallback).
   *
   * 빈 줄 처리:
   *  - 커서 앞이 빈 줄이 아니면 자동으로 \n\n 앞에 붙임
   *  - 커서 뒤가 빈 줄이 아니면 \n\n 뒤에 붙임
   */
  function insertAtCursor(snippet: string) {
    if (onInsert) {
      onInsert(snippet);
      return;
    }
    const ta = textareaRef?.current;
    if (!ta) {
      // fallback — 본문 끝에 추가
      const prefix = source.trimEnd();
      const sep = prefix.length === 0 ? "" : "\n\n";
      setSource(prefix + sep + snippet + "\n");
      return;
    }
    const start = ta.selectionStart ?? source.length;
    const end = ta.selectionEnd ?? source.length;
    const before = source.slice(0, start);
    const after = source.slice(end);

    // 빈 줄 보장 — 마크다운 블록 요소가 인식되려면 앞뒤 빈 줄 필요
    const needBefore = before.length > 0 && !before.endsWith("\n\n");
    const needAfter = after.length > 0 && !after.startsWith("\n");
    const prefix = needBefore ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const suffix = needAfter ? "\n\n" : "\n";

    const insertion = prefix + snippet + suffix;
    const newSource = before + insertion + after;
    setSource(newSource);

    // 커서 위치 — snippet 직후
    const newCursor = start + insertion.length;
    // setSource 가 동기 store update 라 다음 frame 에 selection 적용
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
      // 삽입 위치가 화면 밖이면 자동 스크롤
      ta.scrollTop = ta.scrollTop;  // trigger reflow
    });
  }

  // 호환용 — 기존 appendSnippet 이름도 살림 (커서 위치 삽입으로 동작)
  function appendSnippet(snippet: string) {
    insertAtCursor(snippet);
  }

  // insertDiagramTemplate 은 다이얼로그 흐름으로 대체됨 — 드롭다운에서 직접 삽입은 제거.

  function insertChartTemplate(tmpl: ChartTemplate) {
    setChartMenuOpen(false);
    appendSnippet(tmpl.snippet);
  }

  // insertEquationTemplate 은 EquationDialog 흐름으로 대체됨 — 드롭다운에서 직접 삽입 제거.

  function insertCover(template: CoverTemplate = "modern") {
    setCoverMenuOpen(false);
    if (source.trimStart().startsWith("---")) {
      setUploadError("이미 frontmatter가 있습니다 — 직접 수정해주세요.");
      setTimeout(() => setUploadError(""), 3000);
      return;
    }
    const today = new Date()
      .toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
      .replace(/\./g, ".")
      .replace(/ /g, " ");
    const cover = [
      "---",
      "cover: true",
      `cover_template: ${template}`,
      "title: (제목을 입력하세요)",
      "subtitle: (부제 — 선택)",
      "author: 정원훈",
      "organization: (주)텐에이아이 · DocuAX",
      "department: ",
      `date: ${today}`,
      "document_number: DOCUAX-2026-",
      "classification: 공개",
      "---",
      "",
    ].join("\n");
    setSource(cover + source);
  }

  function insertChart() {
    appendSnippet(
      [
        '```chart width=80% align=center',
        "{",
        '  "type": "bar",',
        '  "title": "분기별 매출",',
        '  "x_label": "분기",',
        '  "y_label": "매출 (억원)",',
        '  "labels": ["1Q", "2Q", "3Q", "4Q"],',
        '  "datasets": [',
        '    {"label": "2025", "data": [12, 18, 24, 30], "color": "#1F5BAF"}',
        "  ]",
        "}",
        "```",
      ].join("\n"),
    );
  }

  // (다이어그램은 드롭다운 메뉴로 교체 — DIAGRAM_TEMPLATES 참조)

  // insertEquation() 폴백은 EquationDialog 로 대체됨.

  async function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("alt", file.name.replace(/\.[^.]+$/, ""));
      const ownerId = typeof window !== "undefined" ? localStorage.getItem("docuax_owner_id") : "";
      const headers: HeadersInit = ownerId ? { "X-Owner-Id": ownerId } : {};
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
      const res = await fetch(`${apiBase}/api/v1/uploads/image`, {
        method: "POST",
        headers,
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "업로드 실패" }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data: { url: string; markdown: string } = await res.json();
      // 절대 URL 로 변환 (마크다운 미리보기 시 정상 표시)
      const absoluteUrl = data.url.startsWith("http") ? data.url : `${apiBase}${data.url}`;
      const md = data.markdown.replace(data.url, absoluteUrl);
      appendSnippet(md);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "업로드 실패");
      setTimeout(() => setUploadError(""), 4000);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-neutral-200 bg-neutral-50/60 px-3 py-1.5 dark:border-neutral-800 dark:bg-neutral-900/40">
      <span
        className="mr-1 shrink-0 whitespace-nowrap text-[10px] font-semibold text-neutral-500 dark:text-neutral-400"
        title="삽입 위치 = 에디터의 현재 커서 위치. 원하는 자리에 커서를 두고 누르세요."
      >
        삽입 <span className="text-[8px] opacity-70">(커서 위치)</span>
      </span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setCoverMenuOpen((v) => !v)}
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-600 transition-all hover:border-brand hover:text-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
          title="문서 표지 — 5종 디자인 템플릿 중 선택"
        >
          <FileText size={11} />
          표지
          <ChevronDown size={9} />
        </button>
        {coverMenuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setCoverMenuOpen(false)} />
            <div className="absolute left-0 top-full z-20 mt-1 max-h-[480px] w-72 overflow-auto rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
              <div className="sticky top-0 border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[10px] font-bold text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                표지 디자인 선택 ({COVER_TEMPLATES.length}종)
              </div>
              {(["비즈니스·기획", "공공·행정", "학술·연구", "고전·간결"] as const).map((cat) => {
                const items = COVER_TEMPLATES.filter((t) => t.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat}>
                    <div className="bg-brand/5 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-brand">
                      {cat}
                    </div>
                    {items.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => insertCover(t.id)}
                        className="block w-full px-3 py-2 text-left hover:bg-brand/10"
                      >
                        <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                          {t.label}
                        </div>
                        <div className="mt-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
                          {t.description}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <ToolButton
        onClick={() => fileInputRef.current?.click()}
        icon={uploading ? <Loader2 size={11} className="animate-spin" /> : <ImageIcon size={11} />}
        label={uploading ? "업로드 중…" : "이미지"}
        title="이미지 업로드 — png·jpg·gif·webp·svg (최대 8MB)"
        disabled={uploading}
      />
      {/* 표 → 차트 변환 — 커서가 표 안에 있을 때만 활성 */}
      <button
        type="button"
        onClick={() => setTableToChartOpen(true)}
        disabled={!detectedTable}
        title={
          detectedTable
            ? `표 안에 있어요 — ${detectedTable.rows.length}행 × ${detectedTable.headers.length}열을 차트로 변환`
            : "마크다운 표 안에 커서를 두면 활성화됩니다"
        }
        className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded border px-2 py-1 text-[10px] font-semibold transition-all ${
          detectedTable
            ? "border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
            : "cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-600"
        }`}
      >
        <Table2 size={11} />
        표→차트
        {detectedTable && (
          <span className="ml-0.5 rounded-full bg-emerald-200 px-1 text-[8px] font-bold text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100">
            {detectedTable.rows.length}×{detectedTable.headers.length}
          </span>
        )}
      </button>

      {/* 차트 드롭다운 — 22+ 종 카테고리별 그룹 */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setChartMenuOpen((v) => !v)}
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-600 transition-all hover:border-brand hover:text-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
          title={`차트 — ${CHART_TEMPLATES.length}종 (막대·선·비율·분포·평가·매트릭스)`}
        >
          <BarChart3 size={11} />
          차트
          <ChevronDown size={9} />
        </button>
        {chartMenuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setChartMenuOpen(false)} />
            <div className="absolute left-0 top-full z-20 mt-1 max-h-[480px] w-80 overflow-auto rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
              <div className="sticky top-0 border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[10px] font-bold text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                차트 종류 선택 ({CHART_TEMPLATES.length}종)
              </div>
              {(["막대", "선", "비율", "분포", "평가", "매트릭스"] as const).map((cat) => {
                const items = CHART_TEMPLATES.filter((t) => t.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat}>
                    <div className="bg-brand/5 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-brand">
                      {cat}
                    </div>
                    {items.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => insertChartTemplate(t)}
                        className="block w-full px-3 py-2 text-left hover:bg-brand/10"
                      >
                        <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                          {t.label}
                        </div>
                        <div className="mt-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
                          {t.description}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
              <div className="border-t border-neutral-200 bg-neutral-50 px-3 py-2 text-[10px] text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                <div className="font-bold text-brand">💡 크기·정렬</div>
                <div className="mt-1 font-mono">
                  ```chart width=80% align=center
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 다이어그램 — 드롭다운에서 템플릿 선택 → 편집 다이얼로그 열림 */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setDiagramMenuOpen((v) => !v)}
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-600 transition-all hover:border-brand hover:text-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
          title={`다이어그램 — ${SHARED_DIAGRAM_TEMPLATES.length}종 Mermaid (편집기에서 제목·소스 직접 편집)`}
        >
          <GitBranch size={11} />
          다이어그램
          <ChevronDown size={9} />
        </button>
        {diagramMenuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setDiagramMenuOpen(false)} />
            <div className="absolute left-0 top-full z-20 mt-1 max-h-[520px] w-80 overflow-auto rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
              <div className="sticky top-0 border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[10px] font-bold text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                다이어그램 종류 선택 ({SHARED_DIAGRAM_TEMPLATES.length}종) — 편집기 열림
              </div>
              {/* 빈 편집기로 바로 진입하는 빠른 버튼 */}
              <button
                type="button"
                onClick={() => {
                  setDiagramMenuOpen(false);
                  setDiagramTplId(SHARED_DIAGRAM_TEMPLATES[0].id);
                  setDiagramDialogOpen(true);
                }}
                className="block w-full border-b border-neutral-200 bg-brand/10 px-3 py-2 text-left transition-all hover:bg-brand/15 dark:border-neutral-700"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-brand">
                  <GitBranch size={11} />
                  편집기 열기 — 처음부터 작성
                </div>
                <div className="mt-0.5 text-[10px] text-brand/70">
                  좌측에서 종류 선택 + 우측에서 제목·소스 편집
                </div>
              </button>
              {(["프로세스", "구조", "동작", "데이터", "프로젝트", "기획"] as const).map((cat) => {
                const items = SHARED_DIAGRAM_TEMPLATES.filter((t) => t.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat}>
                    <div className="bg-brand/5 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-brand">
                      {cat}
                    </div>
                    {items.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setDiagramMenuOpen(false);
                          setDiagramTplId(t.id);
                          setDiagramDialogOpen(true);
                        }}
                        className="block w-full px-3 py-2 text-left hover:bg-brand/10"
                      >
                        <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                          {t.label}
                        </div>
                        <div className="mt-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
                          {t.description}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
              <div className="border-t border-neutral-200 bg-neutral-50 px-3 py-2 text-[10px] text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                <div className="font-bold text-brand">💡 편집기 흐름</div>
                <div className="mt-1">템플릿 선택 → 좌(종류) / 우(제목·옵션·소스 편집) → 미리보기 → [삽입]</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 수식 — 드롭다운에서 템플릿 선택 → 편집 다이얼로그 (3패널 + 심볼 팔레트) */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setEquationMenuOpen((v) => !v)}
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-600 transition-all hover:border-brand hover:text-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
          title={`수식 — ${SHARED_EQUATION_TEMPLATES.length}종 (편집기에서 LaTeX 직접 + 심볼 팔레트)`}
        >
          <Sigma size={11} />
          수식
          <ChevronDown size={9} />
        </button>
        {equationMenuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setEquationMenuOpen(false)} />
            <div className="absolute left-0 top-full z-20 mt-1 max-h-[520px] w-80 overflow-auto rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
              <div className="sticky top-0 border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[10px] font-bold text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                수식 종류 선택 ({SHARED_EQUATION_TEMPLATES.length}종) — 편집기 열림
              </div>
              {/* 빈 편집기로 진입 (단순 등식부터 시작) */}
              <button
                type="button"
                onClick={() => {
                  setEquationMenuOpen(false);
                  setEquationTplId(SHARED_EQUATION_TEMPLATES[0].id);
                  setEquationDialogOpen(true);
                }}
                className="block w-full border-b border-neutral-200 bg-brand/10 px-3 py-2 text-left transition-all hover:bg-brand/15 dark:border-neutral-700"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-brand">
                  <Sigma size={11} />
                  편집기 열기 — 처음부터 작성
                </div>
                <div className="mt-0.5 text-[10px] text-brand/70">
                  심볼·구조 팔레트 + LaTeX 편집기 + 미리보기
                </div>
              </button>
              {(["기초", "대수", "미적분", "통계·확률", "선형대수", "물리·공학", "경제·재무", "정렬·정의"] as const).map((cat) => {
                const items = SHARED_EQUATION_TEMPLATES.filter((t) => t.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat}>
                    <div className="bg-brand/5 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-brand">
                      {cat}
                    </div>
                    {items.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setEquationMenuOpen(false);
                          setEquationTplId(t.id);
                          setEquationDialogOpen(true);
                        }}
                        className="block w-full px-3 py-2 text-left hover:bg-brand/10"
                      >
                        <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                          {t.label}
                        </div>
                        <div className="mt-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
                          {t.description}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
              <div className="border-t border-neutral-200 bg-neutral-50 px-3 py-2 text-[10px] text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                <div className="font-bold text-brand">💡 편집기 흐름</div>
                <div className="mt-1">템플릿 선택 → 좌(종류) / 가운데(팔레트 + LaTeX) / 우(미리보기) → [수식 삽입]</div>
              </div>
            </div>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleImageSelected}
      />

      {uploadError && (
        <span className="ml-2 truncate text-[10px] font-medium text-rose-600 dark:text-rose-400">
          ⚠ {uploadError}
        </span>
      )}

      {/* 다이어그램 편집 다이얼로그 */}
      {diagramDialogOpen && (
        <DiagramDialog
          initialTemplateId={diagramTplId}
          onClose={() => setDiagramDialogOpen(false)}
          onInsert={(diagramMarkdown) => {
            appendSnippet(diagramMarkdown);
            setDiagramDialogOpen(false);
          }}
        />
      )}

      {/* 수식 편집 다이얼로그 */}
      {equationDialogOpen && (
        <EquationDialog
          initialTemplateId={equationTplId}
          onClose={() => setEquationDialogOpen(false)}
          onInsert={(mathMarkdown) => {
            appendSnippet(mathMarkdown);
            setEquationDialogOpen(false);
          }}
        />
      )}

      {/* 표 → 차트 변환 다이얼로그 */}
      {tableToChartOpen && detectedTable && (
        <TableToChartDialog
          table={detectedTable}
          onClose={() => setTableToChartOpen(false)}
          onInsert={(chartMarkdown) => {
            // v3: 외부 에디터(CodeMirror)가 연결된 경우 — 표 뒤가 아니라 현재 커서 위치에 삽입.
            // (표→차트 버튼은 커서가 표 안에 있을 때만 활성화되므로 사실상 표 직후와 동일)
            if (onInsert) {
              onInsert(chartMarkdown);
              setTableToChartOpen(false);
              return;
            }
            // 차트 스니펫을 표 직후에 삽입 — 표 원본 유지
            const insertOffset = detectedTable.endOffset;
            const before = source.slice(0, insertOffset);
            const after = source.slice(insertOffset);
            // 표 다음에 빈 줄 보장
            const needBefore = !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
            const needAfter = !after.startsWith("\n") ? "\n\n" : "\n";
            const newSource = before + needBefore + chartMarkdown + needAfter + after;
            setSource(newSource);
            setTableToChartOpen(false);
            // 커서를 차트 직후로
            const ta = textareaRef?.current;
            if (ta) {
              const newCursor = insertOffset + needBefore.length + chartMarkdown.length + needAfter.length;
              requestAnimationFrame(() => {
                ta.focus();
                ta.setSelectionRange(newCursor, newCursor);
              });
            }
          }}
        />
      )}
    </div>
  );
}

function ToolButton({
  onClick,
  icon,
  label,
  title,
  disabled,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-600 transition-all hover:border-brand hover:text-brand disabled:cursor-wait disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
    >
      {icon}
      {label}
    </button>
  );
}
