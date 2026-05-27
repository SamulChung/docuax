// DocuAX 마케팅 슬라이드 생성 스크립트
// 실행: node generate-marketing.js (apps/frontend 에서)
const pptxgen = require("pptxgenjs");
const path = require("path");

// ─── 컬러 팔레트 ────────────────────────────────────────────────────
const C = {
  darkBg:    "0F172A",  // slate-900
  cardBg:    "1E293B",  // slate-800
  cardBg2:   "263548",  // slightly lighter card
  border:    "334155",  // slate-700
  borderLight: "E2E8F0",
  indigo:    "6366F1",  // indigo-500
  indigoMid: "818CF8",  // indigo-400
  indigoLight: "EEF2FF", // indigo-50
  indigoPale: "C7D2FE", // indigo-200
  cyan:      "06B6D4",  // cyan-500
  white:     "FFFFFF",
  light:     "F1F5F9",  // slate-100
  muted:     "64748B",  // slate-500
  mutedLight:"94A3B8",  // slate-400
  dark:      "1E293B",  // for text on light bg
  blue:      "1D4ED8",
  purple:    "7C3AED",
  teal:      "0891B2",
  green:     "059669",
  amber:     "D97706",
  red:       "DC2626",
};

const makeShadow = () => ({ type: "outer", color: "000000", blur: 8, offset: 2, angle: 135, opacity: 0.08 });

let pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33" × 7.5"

// ══════════════════════════════════════════════════════════════════════
// SLIDE 1: TITLE
// ══════════════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: C.darkBg };

  // Left indigo accent bar
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 7.5,
    fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });

  // Decorative background circles (visible at 60% transparency)
  s.addShape(pres.shapes.OVAL, { x: 9.8, y: -1.2, w: 5.5, h: 5.5,
    fill: { color: C.indigo, transparency: 60 }, line: { color: C.indigo, transparency: 60, width: 0 } });
  s.addShape(pres.shapes.OVAL, { x: 11.2, y: 4.2, w: 3.8, h: 3.8,
    fill: { color: C.cyan, transparency: 60 }, line: { color: C.cyan, transparency: 60, width: 0 } });

  // Logo / Brand
  s.addText("DocuAX", { x: 0.5, y: 1.4, w: 9, h: 1.4,
    fontSize: 76, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });

  // Indigo badge
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 3.0, w: 4.0, h: 0.45,
    fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });
  s.addText("AI 기반 문서 지능화 플랫폼", { x: 0.5, y: 3.01, w: 4.0, h: 0.43,
    fontSize: 14, bold: true, color: C.white, fontFace: "Calibri",
    align: "center", valign: "middle", margin: 0 });

  // Tagline
  s.addText("복잡한 문서를 분석하고  ·  즉시 슬라이드로  ·  공공·기업 최적화", {
    x: 0.5, y: 3.7, w: 11, h: 0.5,
    fontSize: 16, color: C.mutedLight, fontFace: "Calibri", margin: 0 });

  // Three feature pills — w=2.4, gap=0.3 → 3rd pill ends at x=8.3 (0.3" before mockup panel)
  const pills = ["역관목조분 자동 분석", "AI 슬라이드 생성", "PPTX 즉시 내보내기"];
  pills.forEach((p, i) => {
    const x = 0.5 + i * 2.7;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 4.6, w: 2.4, h: 0.5,
      fill: { color: C.cardBg }, line: { color: C.border, width: 1 } });
    s.addText(p, { x, y: 4.61, w: 2.4, h: 0.48,
      fontSize: 13, color: C.indigoMid, fontFace: "Calibri",
      align: "center", valign: "middle", margin: 0 });
  });

  // Right-side visual: DocuAX 분석 결과 mockup
  s.addShape(pres.shapes.RECTANGLE, { x: 8.6, y: 0.9, w: 4.3, h: 5.6,
    fill: { color: C.cardBg }, line: { color: C.border, width: 1 } });
  s.addShape(pres.shapes.RECTANGLE, { x: 8.6, y: 0.9, w: 4.3, h: 0.38,
    fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });
  s.addText("DocuAX  —  분석 결과", { x: 8.7, y: 0.91, w: 4.1, h: 0.35,
    fontSize: 10, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });

  const mockItems = [
    { label: "역할", text: "갑: ○○부처 / 을: ○○기업" },
    { label: "목표", text: "납품 기한 2025.12.31" },
    { label: "조건", text: "계약금 30%, 잔금 70%" },
    { label: "분쟁", text: "위약금 조항 검토 필요" },
  ];
  mockItems.forEach((item, i) => {
    const my = 1.5 + i * 1.1;
    s.addShape(pres.shapes.RECTANGLE, { x: 8.8, y: my, w: 3.9, h: 0.85,
      fill: { color: C.cardBg2 }, line: { color: C.border, width: 1 } });
    s.addShape(pres.shapes.RECTANGLE, { x: 8.8, y: my, w: 0.06, h: 0.85,
      fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });
    s.addText(item.label, { x: 8.96, y: my + 0.08, w: 0.7, h: 0.28,
      fontSize: 9, bold: true, color: C.indigoMid, fontFace: "Calibri", margin: 0 });
    s.addText(item.text, { x: 8.96, y: my + 0.42, w: 3.5, h: 0.3,
      fontSize: 10, color: C.mutedLight, fontFace: "Calibri", margin: 0 });
  });
  s.addShape(pres.shapes.RECTANGLE, { x: 9.1, y: 6.0, w: 2.8, h: 0.5,
    fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });
  s.addText("슬라이드 생성  →", { x: 9.1, y: 6.01, w: 2.8, h: 0.48,
    fontSize: 11, bold: true, color: C.white, fontFace: "Calibri",
    align: "center", valign: "middle", margin: 0 });
}

// ══════════════════════════════════════════════════════════════════════
// SLIDE 2: PROBLEM
// ══════════════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: C.light };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 13.33, h: 0.08,
    fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });

  s.addText("문서 업무의 현실", { x: 0.5, y: 0.28, w: 12, h: 0.8,
    fontSize: 38, bold: true, color: C.dark, fontFace: "Calibri", margin: 0 });
  s.addText("수백 페이지의 문서, 반복되는 수작업, 놓치는 핵심", { x: 0.5, y: 1.15, w: 12, h: 0.4,
    fontSize: 16, color: C.muted, fontFace: "Calibri", margin: 0 });

  const problems = [
    { num: "01", title: "시간 낭비", body: "계약서·보고서 한 건 분석에\n평균 3시간 이상 소요.\n단순 반복 작업이 업무의 절반." },
    { num: "02", title: "놓치는 핵심", body: "핵심 조항·쟁점을 수작업으로\n추출하다 누락 발생.\n검토 누락이 곧 리스크." },
    { num: "03", title: "형식 불일치", body: "부서마다 다른 보고서 포맷.\n통일되지 않는 문서 체계로\n협업 효율 저하." },
  ];

  problems.forEach((p, i) => {
    const x = 0.5 + i * 4.2;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.8, w: 3.9, h: 4.8,
      fill: { color: C.white }, line: { color: C.borderLight, width: 1 }, shadow: makeShadow() });

    // Number badge
    s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: 2.05, w: 0.75, h: 0.75,
      fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });
    s.addText(p.num, { x: x + 0.25, y: 2.07, w: 0.75, h: 0.71,
      fontSize: 13, bold: true, color: C.white, fontFace: "Calibri",
      align: "center", valign: "middle", margin: 0 });

    s.addText(p.title, { x: x + 0.2, y: 3.05, w: 3.5, h: 0.55,
      fontSize: 22, bold: true, color: C.dark, fontFace: "Calibri", margin: 0 });
    s.addText(p.body, { x: x + 0.2, y: 3.75, w: 3.5, h: 1.8,
      fontSize: 14, color: C.muted, fontFace: "Calibri", margin: 0 });
  });
}

// ══════════════════════════════════════════════════════════════════════
// SLIDE 3: SOLUTION OVERVIEW
// ══════════════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: C.darkBg };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 7.5,
    fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });

  s.addText("DocuAX로 해결합니다", { x: 0.5, y: 0.45, w: 12, h: 0.9,
    fontSize: 42, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });
  s.addText("업로드 → AI 분석 → 슬라이드 완성까지, 단 3분", { x: 0.5, y: 1.45, w: 12, h: 0.45,
    fontSize: 18, color: C.mutedLight, fontFace: "Calibri", margin: 0 });

  const steps = [
    { num: "1", title: "문서 업로드", body: "PDF · Word · HWP\n어떤 형식이든\n즉시 처리" },
    { num: "2", title: "AI 역관목조분 분석", body: "역할·관계·목표·조건·분쟁\n구조로 핵심 내용\n자동 추출·정리" },
    { num: "3", title: "슬라이드 자동 생성", body: "원클릭으로 PPTX\n슬라이드 완성본 생성\nCanva 수준 자유 편집" },
  ];

  steps.forEach((step, i) => {
    const x = 0.5 + i * 4.2;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 2.25, w: 3.85, h: 4.5,
      fill: { color: C.cardBg }, line: { color: C.border, width: 1 } });

    // Step circle
    s.addShape(pres.shapes.OVAL, { x: x + 0.2, y: 2.55, w: 0.9, h: 0.9,
      fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });
    s.addText(step.num, { x: x + 0.2, y: 2.57, w: 0.9, h: 0.86,
      fontSize: 22, bold: true, color: C.white, fontFace: "Calibri",
      align: "center", valign: "middle", margin: 0 });

    s.addText(step.title, { x: x + 0.2, y: 3.7, w: 3.45, h: 0.6,
      fontSize: 19, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });
    s.addText(step.body, { x: x + 0.2, y: 4.45, w: 3.45, h: 1.8,
      fontSize: 14, color: C.mutedLight, fontFace: "Calibri", margin: 0 });

    // Arrow connector
    if (i < 2) {
      s.addShape(pres.shapes.RECTANGLE, { x: x + 3.9, y: 4.5, w: 0.28, h: 0.1,
        fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });
      s.addText("▶", { x: x + 3.85, y: 4.35, w: 0.35, h: 0.4,
        fontSize: 14, color: C.indigo, fontFace: "Calibri", align: "center", margin: 0 });
    }
  });
}

// ══════════════════════════════════════════════════════════════════════
// SLIDE 4: 역관목조분
// ══════════════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: C.light };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 13.33, h: 0.08,
    fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });

  s.addText("역관목조분 분석", { x: 0.5, y: 0.28, w: 9, h: 0.78,
    fontSize: 38, bold: true, color: C.dark, fontFace: "Calibri", margin: 0 });
  s.addText("문서의 핵심 구조를 5가지 차원으로 자동 추출 · 정리", { x: 0.5, y: 1.12, w: 12, h: 0.4,
    fontSize: 16, color: C.muted, fontFace: "Calibri", margin: 0 });

  const elements = [
    { label: "역", name: "역할", desc: "당사자·담당자\n관계 파악", color: C.indigo },
    { label: "관", name: "관계", desc: "계약·협력·대립\n관계 구조", color: C.teal },
    { label: "목", name: "목표", desc: "목적·목표·\n기대 성과", color: C.green },
    { label: "조", name: "조건", desc: "요건·기한·\n전제 조건", color: C.amber },
    { label: "분", name: "분쟁", desc: "쟁점·리스크·\n갈등 요소", color: C.red },
  ];

  elements.forEach((el, i) => {
    const x = 0.5 + i * 2.5;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.88, w: 2.2, h: 4.5,
      fill: { color: C.white }, line: { color: C.borderLight, width: 1 }, shadow: makeShadow() });

    // Top color bar with Korean char
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.88, w: 2.2, h: 0.65,
      fill: { color: el.color }, line: { color: el.color, width: 0 } });
    s.addText(el.label, { x, y: 1.9, w: 2.2, h: 0.61,
      fontSize: 24, bold: true, color: C.white, fontFace: "Calibri",
      align: "center", valign: "middle", margin: 0 });

    s.addText(el.name, { x: x + 0.15, y: 2.75, w: 1.9, h: 0.55,
      fontSize: 20, bold: true, color: C.dark, fontFace: "Calibri", margin: 0 });
    s.addText(el.desc, { x: x + 0.15, y: 3.4, w: 1.9, h: 1.5,
      fontSize: 13, color: C.muted, fontFace: "Calibri", margin: 0 });

    if (i < 4) {
      s.addText("›", { x: x + 2.2, y: 3.8, w: 0.3, h: 0.4,
        fontSize: 18, bold: true, color: el.color, fontFace: "Calibri",
        align: "center", margin: 0 });
    }
  });

  // Bottom callout
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 6.58, w: 12.33, h: 0.62,
    fill: { color: C.indigoLight }, line: { color: C.indigoPale, width: 1 } });
  s.addText("✓  계약서·보고서·행정문서 등 모든 문서 유형 지원  ·  평균 분석 소요 시간 3분 이내", {
    x: 0.7, y: 6.63, w: 12, h: 0.52,
    fontSize: 13, color: C.indigo, fontFace: "Calibri",
    align: "center", valign: "middle", margin: 0 });
}

// ══════════════════════════════════════════════════════════════════════
// SLIDE 5: AI 슬라이드 생성
// ══════════════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: C.darkBg };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 7.5,
    fill: { color: C.cyan }, line: { color: C.cyan, width: 0 } });

  s.addText("AI 슬라이드 자동 생성", { x: 0.5, y: 0.45, w: 12, h: 0.85,
    fontSize: 40, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });
  s.addText("문서 또는 분석 결과 → 완성된 프레젠테이션, 클릭 한 번에", { x: 0.5, y: 1.38, w: 12, h: 0.45,
    fontSize: 16, color: C.mutedLight, fontFace: "Calibri", margin: 0 });

  // Feature list (left)
  const features = [
    "문서 업로드 또는 역관목조분 결과 직접 선택",
    "4가지 내장 테마  (공공기관 / 기업 / 미니멀 / 그라데이션)",
    "PPTX·이미지 업로드로 커스텀 테마 자동 추출",
    "Fabric.js 기반 Canva 수준 자유 편집 에디터",
    ".pptx 즉시 다운로드 (브라우저 사이드 생성)",
  ];

  features.forEach((feat, i) => {
    const y = 2.05 + i * 0.88;
    s.addShape(pres.shapes.OVAL, { x: 0.5, y: y + 0.06, w: 0.36, h: 0.36,
      fill: { color: C.cyan }, line: { color: C.cyan, width: 0 } });
    s.addText("✓", { x: 0.5, y: y + 0.04, w: 0.36, h: 0.38,
      fontSize: 12, bold: true, color: C.darkBg, fontFace: "Calibri",
      align: "center", valign: "middle", margin: 0 });
    s.addText(feat, { x: 1.1, y, w: 6.0, h: 0.48,
      fontSize: 15, color: C.white, fontFace: "Calibri", margin: 0 });
  });

  // Right: theme preview cards
  s.addShape(pres.shapes.RECTANGLE, { x: 7.8, y: 1.75, w: 5.0, h: 5.3,
    fill: { color: C.cardBg }, line: { color: C.border, width: 1 } });
  s.addText("테마 미리보기", { x: 7.95, y: 1.92, w: 4.7, h: 0.38,
    fontSize: 12, bold: true, color: C.mutedLight, fontFace: "Calibri", margin: 0 });

  const themes = [
    { name: "공공기관", bg: "1E3A5F", tc: C.white },
    { name: "기업 피치덱", bg: C.darkBg, tc: C.white },
    { name: "미니멀", bg: "FAFAFA", tc: "111827" },
    { name: "그라데이션", bg: "312E81", tc: C.white },
  ];
  themes.forEach((t, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const tx = 7.98 + col * 2.4;
    const ty = 2.52 + row * 2.1;
    s.addShape(pres.shapes.RECTANGLE, { x: tx, y: ty, w: 2.1, h: 1.65,
      fill: { color: t.bg }, line: { color: "475569", width: 1 } });
    // Slide header line
    s.addShape(pres.shapes.RECTANGLE, { x: tx, y: ty, w: 2.1, h: 0.18,
      fill: { color: t.tc === C.white ? C.indigo : "1E3A5F" }, line: { color: t.tc === C.white ? C.indigo : "1E3A5F", width: 0 } });
    // Title line mock
    s.addShape(pres.shapes.RECTANGLE, { x: tx + 0.1, y: ty + 0.35, w: 1.2, h: 0.12,
      fill: { color: t.tc, transparency: 20 }, line: { color: t.tc, transparency: 20, width: 0 } });
    s.addShape(pres.shapes.RECTANGLE, { x: tx + 0.1, y: ty + 0.6, w: 0.85, h: 0.08,
      fill: { color: t.tc, transparency: 50 }, line: { color: t.tc, transparency: 50, width: 0 } });
    s.addText(t.name, { x: tx, y: ty + 1.2, w: 2.1, h: 0.35,
      fontSize: 11, color: t.tc, fontFace: "Calibri",
      align: "center", valign: "middle", margin: 0 });
  });
}

// ══════════════════════════════════════════════════════════════════════
// SLIDE 6: 출력 & 통합
// ══════════════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: C.light };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 13.33, h: 0.08,
    fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });
  s.addText("다양한 출력 & 통합", { x: 0.5, y: 0.28, w: 12, h: 0.78,
    fontSize: 38, bold: true, color: C.dark, fontFace: "Calibri", margin: 0 });
  s.addText("업무 흐름에 맞게, 원하는 형식으로 즉시 출력", { x: 0.5, y: 1.12, w: 12, h: 0.4,
    fontSize: 16, color: C.muted, fontFace: "Calibri", margin: 0 });

  const outputs = [
    { label: "PPTX", title: "파워포인트 슬라이드", desc: "pptxgenjs 기반 브라우저에서\n바로 다운로드.\n수정 가능한 완전한 .pptx 파일." },
    { label: "분석", title: "역관목조분 보고서", desc: "구조화된 분석 결과를\nMarkdown·JSON 형식으로\n출력 및 저장." },
    { label: "편집", title: "인앱 캔버스 에디터", desc: "Fabric.js 기반 에디터로\nCanva 수준 자유 편집.\n요소 추가·이동·리사이즈." },
    { label: "저장", title: "저장 & 불러오기", desc: "SlideSchema JSON을 DB에 저장.\n언제든 불러와서 이어서 편집.\n버전 관리 가능." },
  ];

  outputs.forEach((o, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 6.4;
    const y = 1.85 + row * 2.6;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 6.0, h: 2.25,
      fill: { color: C.white }, line: { color: C.borderLight, width: 1 }, shadow: makeShadow() });
    // Left accent bar
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.08, h: 2.25,
      fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });
    // Badge
    s.addShape(pres.shapes.RECTANGLE, { x: x + 0.25, y: y + 0.3, w: 0.75, h: 0.75,
      fill: { color: C.indigoLight }, line: { color: C.indigoPale, width: 1 } });
    s.addText(o.label, { x: x + 0.25, y: y + 0.3, w: 0.75, h: 0.75,
      fontSize: 13, bold: true, color: C.indigo, fontFace: "Calibri",
      align: "center", valign: "middle", margin: 0 });

    s.addText(o.title, { x: x + 1.2, y: y + 0.28, w: 4.6, h: 0.52,
      fontSize: 18, bold: true, color: C.dark, fontFace: "Calibri", margin: 0 });
    s.addText(o.desc, { x: x + 1.2, y: y + 0.9, w: 4.6, h: 1.1,
      fontSize: 13, color: C.muted, fontFace: "Calibri", margin: 0 });
  });
}

// ══════════════════════════════════════════════════════════════════════
// SLIDE 7: USE CASES
// ══════════════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: C.darkBg };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 7.5,
    fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });
  s.addText("주요 사용 사례", { x: 0.5, y: 0.45, w: 12, h: 0.85,
    fontSize: 40, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });
  s.addText("공공기관부터 기업 경영기획까지 — 문서 집약적 모든 업무에", { x: 0.5, y: 1.38, w: 12, h: 0.42,
    fontSize: 16, color: C.mutedLight, fontFace: "Calibri", margin: 0 });

  const cases = [
    { sector: "공공기관 · 정부", color: C.blue,
      items: ["행정 문서 역관목조분 자동 분석", "보고서·공문 슬라이드 자동화", "부처 간 문서 형식 통일"] },
    { sector: "법률 · 컨설팅", color: C.purple,
      items: ["계약서 핵심 조항 자동 추출", "분쟁 리스크 사전 탐지", "클라이언트 보고용 PPTX 즉시 생성"] },
    { sector: "기업 경영기획", color: C.teal,
      items: ["RFP · 제안서 구조 분석", "임원 보고용 슬라이드 자동화", "전략 문서 핵심 요약"] },
  ];

  cases.forEach((c, i) => {
    const x = 0.5 + i * 4.2;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.95, w: 3.9, h: 4.55,
      fill: { color: C.cardBg }, line: { color: C.border, width: 1 } });
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.95, w: 3.9, h: 0.52,
      fill: { color: c.color }, line: { color: c.color, width: 0 } });
    s.addText(c.sector, { x: x + 0.15, y: 1.97, w: 3.6, h: 0.48,
      fontSize: 15, bold: true, color: C.white, fontFace: "Calibri",
      valign: "middle", margin: 0 });

    c.items.forEach((item, j) => {
      const iy = 2.68 + j * 1.25;
      s.addShape(pres.shapes.RECTANGLE, { x: x + 0.15, y: iy, w: 3.6, h: 1.0,
        fill: { color: C.cardBg2 }, line: { color: C.border, width: 1 } });
      s.addShape(pres.shapes.RECTANGLE, { x: x + 0.15, y: iy, w: 0.05, h: 1.0,
        fill: { color: c.color }, line: { color: c.color, width: 0 } });
      s.addText(item, { x: x + 0.35, y: iy + 0.15, w: 3.25, h: 0.7,
        fontSize: 13, color: C.mutedLight, fontFace: "Calibri", margin: 0 });
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
// SLIDE 8: STATS
// ══════════════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: C.light };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 13.33, h: 0.08,
    fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });
  s.addText("DocuAX 도입 효과", { x: 0.5, y: 0.28, w: 12, h: 0.78,
    fontSize: 38, bold: true, color: C.dark, fontFace: "Calibri", margin: 0 });
  s.addText("도입 전후 비교 — 내부 테스트 기준", { x: 0.5, y: 1.12, w: 12, h: 0.4,
    fontSize: 16, color: C.muted, fontFace: "Calibri", margin: 0 });

  const stats = [
    { num: "90%", label: "문서 분석 시간 단축", sub: "3시간 → 18분" },
    { num: "3×",  label: "보고서 생산성 향상",  sub: "동일 시간 대비" },
    { num: "5",   label: "지원 출력 테마",       sub: "공공·기업·커스텀" },
    { num: "∞",   label: "확장 가능한 구조",     sub: "API 기반 아키텍처" },
  ];

  stats.forEach((stat, i) => {
    const x = 0.5 + i * 3.1;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.85, w: 2.85, h: 3.7,
      fill: { color: C.white }, line: { color: C.borderLight, width: 1 }, shadow: makeShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.85, w: 2.85, h: 0.07,
      fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });
    s.addText(stat.num, { x, y: 2.1, w: 2.85, h: 1.15,
      fontSize: 58, bold: true, color: C.indigo, fontFace: "Calibri",
      align: "center", margin: 0 });
    s.addText(stat.label, { x: x + 0.15, y: 3.4, w: 2.55, h: 0.6,
      fontSize: 14, bold: true, color: C.dark, fontFace: "Calibri",
      align: "center", margin: 0 });
    s.addText(stat.sub, { x: x + 0.15, y: 4.1, w: 2.55, h: 0.4,
      fontSize: 12, color: C.muted, fontFace: "Calibri",
      align: "center", margin: 0 });
  });

  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 6.35, w: 12.33, h: 0.72,
    fill: { color: C.indigoLight }, line: { color: C.indigoPale, width: 1 } });
  s.addText("※ 내부 테스트 기준  |  실제 결과는 문서 유형 및 환경에 따라 다를 수 있습니다", {
    x: 0.7, y: 6.42, w: 12, h: 0.58,
    fontSize: 12, color: C.muted, fontFace: "Calibri",
    align: "center", valign: "middle", margin: 0 });
}

// ══════════════════════════════════════════════════════════════════════
// SLIDE 9: CTA
// ══════════════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: C.darkBg };

  // Decorative circles (60% transparency — visible)
  s.addShape(pres.shapes.OVAL, { x: 9.5, y: -1.3, w: 5.8, h: 5.8,
    fill: { color: C.indigo, transparency: 60 }, line: { color: C.indigo, transparency: 60, width: 0 } });
  s.addShape(pres.shapes.OVAL, { x: 11.2, y: 4.3, w: 3.8, h: 3.8,
    fill: { color: C.cyan, transparency: 60 }, line: { color: C.cyan, transparency: 60, width: 0 } });

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.12, h: 7.5,
    fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });

  // DocuAX brand label above heading
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 0.55, w: 2.0, h: 0.45,
    fill: { color: "1E2060" }, line: { color: C.indigo, width: 1 } });
  s.addText("◆  DocuAX", { x: 0.5, y: 0.56, w: 2.0, h: 0.43,
    fontSize: 13, bold: true, color: C.indigoMid, fontFace: "Calibri",
    align: "center", valign: "middle", margin: 0 });

  s.addText("지금 바로 시작하세요", { x: 0.5, y: 1.3, w: 10.5, h: 1.15,
    fontSize: 52, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });
  s.addText("DocuAX와 함께, 문서 업무를 새롭게 정의하십시오.", { x: 0.5, y: 2.6, w: 10, h: 0.55,
    fontSize: 20, color: C.mutedLight, fontFace: "Calibri", margin: 0 });

  // CTA button
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 3.55, w: 3.4, h: 0.78,
    fill: { color: C.indigo }, line: { color: C.indigo, width: 0 } });
  s.addText("무료로 시작하기  →", { x: 0.5, y: 3.57, w: 3.4, h: 0.74,
    fontSize: 17, bold: true, color: C.white, fontFace: "Calibri",
    align: "center", valign: "middle", margin: 0 });

  // Divider
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 5.0, w: 2.5, h: 0.03,
    fill: { color: C.border }, line: { color: C.border, width: 0 } });

  // Contact
  s.addText([
    { text: "docuax.com", options: { bold: true, color: C.white, breakLine: true } },
    { text: "specialdatastrategist@gmail.com", options: { color: C.mutedLight } }
  ], { x: 0.5, y: 5.2, w: 8, h: 0.9, fontSize: 14, fontFace: "Calibri", margin: 0 });

  // Brand (visible slate-400)
  s.addText("DocuAX", { x: 0.5, y: 6.65, w: 3, h: 0.5,
    fontSize: 16, bold: true, color: C.mutedLight, fontFace: "Calibri", margin: 0 });
}

// ─── WRITE FILE ────────────────────────────────────────────────────
const outPath = path.join(__dirname, "..", "..", "docuax-marketing.pptx");
pres.writeFile({ fileName: outPath })
  .then(() => console.log("✅ 생성 완료:", outPath))
  .catch(err => { console.error("❌ 오류:", err); process.exit(1); });
