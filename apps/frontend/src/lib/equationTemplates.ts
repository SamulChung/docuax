/**
 * 수식(LaTeX) 템플릿 카탈로그 — 30+ 종 한국어 카테고리.
 *
 * 각 템플릿:
 *   - id, label, description
 *   - category (기초·대수·미적분·통계·확률·선형대수·물리·공학·경제·재무·정렬·정의)
 *   - latex   : LaTeX 본문 (코드펜스/태그 제외 raw)
 *   - defaultWidth / defaultAlign
 *
 * 코드 펜스(```math ... ```)는 다이얼로그가 width/align 옵션과 함께 별도 합성.
 */

export type EquationCategory =
  | "기초"
  | "대수"
  | "미적분"
  | "통계·확률"
  | "선형대수"
  | "물리·공학"
  | "경제·재무"
  | "정렬·정의";

export interface EquationTemplate {
  id: string;
  label: string;
  description: string;
  category: EquationCategory;
  latex: string;
  defaultWidth: string;
  defaultAlign: "left" | "center" | "right";
}

export const EQUATION_TEMPLATES: EquationTemplate[] = [
  // ─── 기초 ───
  { id: "simple",    label: "단순 등식 (E = mc²)", description: "가장 보편적인 형태",
    category: "기초", latex: "E = mc^2", defaultWidth: "60%", defaultAlign: "center" },
  { id: "fraction",  label: "분수", description: "두 값의 비율",
    category: "기초", latex: String.raw`\frac{a}{b} = \frac{c}{d}`, defaultWidth: "60%", defaultAlign: "center" },
  { id: "power",     label: "거듭제곱·지수", description: "지수·로그 관계",
    category: "기초", latex: String.raw`a^x = b \quad \Leftrightarrow \quad x = \log_a b`, defaultWidth: "60%", defaultAlign: "center" },
  { id: "sqrt",      label: "제곱근", description: "근호 표기",
    category: "기초", latex: String.raw`\sqrt{a^2 + b^2} = c`, defaultWidth: "60%", defaultAlign: "center" },

  // ─── 대수 ───
  { id: "quadratic", label: "이차방정식의 근", description: "근의 공식",
    category: "대수", latex: String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`, defaultWidth: "60%", defaultAlign: "center" },
  { id: "binomial",  label: "이항정리", description: "(a+b)^n 전개",
    category: "대수", latex: String.raw`(a + b)^n = \sum_{k=0}^{n} \binom{n}{k} a^{n-k} b^k`, defaultWidth: "70%", defaultAlign: "center" },
  { id: "factorial", label: "팩토리얼·조합", description: "조합 정의",
    category: "대수", latex: String.raw`\binom{n}{k} = \frac{n!}{k!(n-k)!}`, defaultWidth: "60%", defaultAlign: "center" },

  // ─── 미적분 ───
  { id: "derivative", label: "도함수 정의", description: "극한으로 정의된 미분",
    category: "미적분", latex: String.raw`f'(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}`, defaultWidth: "70%", defaultAlign: "center" },
  { id: "integral",   label: "정적분", description: "기본 적분 표기",
    category: "미적분", latex: String.raw`\int_{a}^{b} f(x) \, dx = F(b) - F(a)`, defaultWidth: "65%", defaultAlign: "center" },
  { id: "gaussian",   label: "가우스 적분", description: "정규분포의 기반",
    category: "미적분", latex: String.raw`\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}`, defaultWidth: "65%", defaultAlign: "center" },
  { id: "limit",      label: "극한", description: "극한 표현",
    category: "미적분", latex: String.raw`\lim_{n \to \infty} \left(1 + \frac{1}{n}\right)^n = e`, defaultWidth: "65%", defaultAlign: "center" },
  { id: "sum_series", label: "급수 합", description: "1~n 제곱의 합",
    category: "미적분", latex: String.raw`\sum_{i=1}^{n} i^2 = \frac{n(n+1)(2n+1)}{6}`, defaultWidth: "70%", defaultAlign: "center" },
  { id: "taylor",     label: "테일러 급수", description: "테일러 전개",
    category: "미적분", latex: String.raw`f(x) = \sum_{n=0}^{\infty} \frac{f^{(n)}(a)}{n!} (x - a)^n`, defaultWidth: "75%", defaultAlign: "center" },

  // ─── 통계·확률 ───
  { id: "mean",       label: "평균", description: "산술 평균",
    category: "통계·확률", latex: String.raw`\bar{x} = \frac{1}{n} \sum_{i=1}^{n} x_i`, defaultWidth: "60%", defaultAlign: "center" },
  { id: "variance",   label: "분산", description: "표본 분산",
    category: "통계·확률", latex: String.raw`s^2 = \frac{1}{n-1} \sum_{i=1}^{n} (x_i - \bar{x})^2`, defaultWidth: "70%", defaultAlign: "center" },
  { id: "normal_pdf", label: "정규분포 PDF", description: "확률밀도함수",
    category: "통계·확률", latex: String.raw`f(x) = \frac{1}{\sigma \sqrt{2\pi}} \, e^{-\frac{(x-\mu)^2}{2\sigma^2}}`, defaultWidth: "75%", defaultAlign: "center" },
  { id: "bayes",      label: "베이즈 정리", description: "조건부 확률",
    category: "통계·확률", latex: String.raw`P(A|B) = \frac{P(B|A) \, P(A)}{P(B)}`, defaultWidth: "65%", defaultAlign: "center" },
  { id: "regression", label: "선형 회귀", description: "최소제곱 추정량",
    category: "통계·확률", latex: String.raw`\hat{\beta} = (X^T X)^{-1} X^T y`, defaultWidth: "60%", defaultAlign: "center" },

  // ─── 선형대수 ───
  { id: "matrix_mul", label: "행렬 곱셈", description: "(AB)_{ij} = ...",
    category: "선형대수", latex: String.raw`(AB)_{ij} = \sum_{k=1}^{n} A_{ik} B_{kj}`, defaultWidth: "65%", defaultAlign: "center" },
  { id: "determinant", label: "2×2 행렬식", description: "2차 정사각 행렬",
    category: "선형대수", latex: String.raw`\det \begin{pmatrix} a & b \\ c & d \end{pmatrix} = ad - bc`, defaultWidth: "55%", defaultAlign: "center" },
  { id: "eigenvalue", label: "고유값 정의", description: "Av = λv",
    category: "선형대수", latex: String.raw`A \mathbf{v} = \lambda \mathbf{v}`, defaultWidth: "50%", defaultAlign: "center" },
  { id: "dot_product", label: "벡터 내적", description: "두 벡터의 내적",
    category: "선형대수", latex: String.raw`\mathbf{a} \cdot \mathbf{b} = \sum_{i=1}^{n} a_i b_i = |\mathbf{a}||\mathbf{b}| \cos\theta`, defaultWidth: "75%", defaultAlign: "center" },

  // ─── 물리·공학 ───
  { id: "newton",   label: "뉴턴 제2법칙", description: "F = ma",
    category: "물리·공학", latex: String.raw`F = m \cdot a`, defaultWidth: "50%", defaultAlign: "center" },
  { id: "kinetic",  label: "운동에너지", description: "K = ½mv²",
    category: "물리·공학", latex: String.raw`K = \frac{1}{2} m v^2`, defaultWidth: "55%", defaultAlign: "center" },
  { id: "wave",     label: "파동 방정식", description: "1차원 파동",
    category: "물리·공학", latex: String.raw`\frac{\partial^2 u}{\partial t^2} = c^2 \frac{\partial^2 u}{\partial x^2}`, defaultWidth: "70%", defaultAlign: "center" },
  { id: "schrodinger", label: "슈뢰딩거 방정식", description: "양자역학 기본 방정식",
    category: "물리·공학", latex: String.raw`i\hbar \frac{\partial \Psi}{\partial t} = \hat{H} \Psi`, defaultWidth: "65%", defaultAlign: "center" },
  { id: "maxwell",  label: "맥스웰 — 가우스 법칙", description: "전기장 가우스 법칙",
    category: "물리·공학", latex: String.raw`\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}`, defaultWidth: "55%", defaultAlign: "center" },

  // ─── 경제·재무 ───
  { id: "pv",       label: "현재가치 (PV)", description: "할인된 현재가치",
    category: "경제·재무", latex: String.raw`PV = \frac{FV}{(1 + r)^n}`, defaultWidth: "55%", defaultAlign: "center" },
  { id: "compound", label: "복리 계산", description: "복리 미래가치",
    category: "경제·재무", latex: String.raw`A = P \left(1 + \frac{r}{n}\right)^{n t}`, defaultWidth: "60%", defaultAlign: "center" },
  { id: "npv",      label: "순현재가치 (NPV)", description: "투자 평가",
    category: "경제·재무", latex: String.raw`NPV = \sum_{t=0}^{n} \frac{CF_t}{(1 + r)^t}`, defaultWidth: "65%", defaultAlign: "center" },
  { id: "roi",      label: "투자수익률 (ROI)", description: "ROI 계산",
    category: "경제·재무", latex: String.raw`ROI = \frac{R - C}{C} \times 100\%`, defaultWidth: "60%", defaultAlign: "center" },
  { id: "blackscholes", label: "Black-Scholes (콜)", description: "옵션 가격",
    category: "경제·재무", latex: String.raw`C = S_0 N(d_1) - K e^{-rT} N(d_2)`, defaultWidth: "65%", defaultAlign: "center" },

  // ─── 정렬·정의 ───
  { id: "definition", label: "정의 (≡)", description: "기호 정의",
    category: "정렬·정의", latex: String.raw`f(x) \;\equiv\; ax^2 + bx + c`, defaultWidth: "60%", defaultAlign: "center" },
  { id: "tagged",     label: "번호 붙은 식", description: "\\tag 로 식 번호",
    category: "정렬·정의", latex: String.raw`P(\text{정답}) = \frac{N_{\text{정답}}}{N_{\text{전체}}} \tag{1}`, defaultWidth: "60%", defaultAlign: "center" },
  { id: "cases",      label: "케이스 분리", description: "조건별 분기",
    category: "정렬·정의", latex: String.raw`f(x) = \begin{cases} x^2 & x \ge 0 \\ -x^2 & x < 0 \end{cases}`, defaultWidth: "55%", defaultAlign: "center" },
  { id: "unit",       label: "단위가 있는 식", description: "물리 단위 표기",
    category: "정렬·정의", latex: String.raw`v = 9.8 \; \mathrm{m/s^2} \cdot t`, defaultWidth: "55%", defaultAlign: "center" },
];

/**
 * LaTeX 본문에서 \tag{X} 번호를 추출 → { latex(태그 제거), tag } 반환.
 * 다이얼로그에서 식 번호를 별도 입력으로 분리해 보여주기 위함.
 */
export function extractEquationTag(latex: string): { latex: string; tag: string } {
  const m = /\\tag\{([^}]*)\}/.exec(latex);
  if (!m) return { latex, tag: "" };
  const stripped = latex.replace(/\s*\\tag\{[^}]*\}\s*/g, "").trim();
  return { latex: stripped, tag: m[1] };
}

/**
 * tag 가 있으면 latex 끝에 \tag{X} 붙여 합성.
 */
export function composeEquationLatex(latex: string, tag: string): string {
  const body = latex.trim();
  const t = tag.trim();
  if (!t) return body;
  return `${body} \\tag{${t}}`;
}

/**
 * 최종 마크다운 코드 펜스 스니펫 — width/align 포함.
 */
export function composeEquationSnippet(opts: {
  latex: string;
  width: string;
  align: "left" | "center" | "right";
}): string {
  return [`\`\`\`math width=${opts.width} align=${opts.align}`, opts.latex, "```"].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────
// 심볼·패턴 팔레트 — 다이얼로그 편집기에서 클릭으로 커서 위치 삽입
// ─────────────────────────────────────────────────────────────────────────

export interface PaletteItem {
  /** 화면에 표시되는 라벨 (가능한 경우 실제 기호) */
  label: string;
  /** 커서 위치에 삽입될 LaTeX 문자열. `{}` 자리는 사용자가 채울 곳 */
  insert: string;
  /** 툴팁 (LaTeX 명령어) */
  title?: string;
  /** 삽입 후 커서를 첫 번째 빈 `{}` 안으로 이동시킬지 — 기본 true */
  focusInsideBraces?: boolean;
}

export interface PaletteGroup {
  name: string;
  items: PaletteItem[];
}

export const PALETTE: PaletteGroup[] = [
  {
    name: "그리스 (소문자)",
    items: [
      { label: "α", insert: "\\alpha ", title: "\\alpha", focusInsideBraces: false },
      { label: "β", insert: "\\beta ", title: "\\beta", focusInsideBraces: false },
      { label: "γ", insert: "\\gamma ", title: "\\gamma", focusInsideBraces: false },
      { label: "δ", insert: "\\delta ", title: "\\delta", focusInsideBraces: false },
      { label: "ε", insert: "\\varepsilon ", title: "\\varepsilon", focusInsideBraces: false },
      { label: "ζ", insert: "\\zeta ", title: "\\zeta", focusInsideBraces: false },
      { label: "η", insert: "\\eta ", title: "\\eta", focusInsideBraces: false },
      { label: "θ", insert: "\\theta ", title: "\\theta", focusInsideBraces: false },
      { label: "κ", insert: "\\kappa ", title: "\\kappa", focusInsideBraces: false },
      { label: "λ", insert: "\\lambda ", title: "\\lambda", focusInsideBraces: false },
      { label: "μ", insert: "\\mu ", title: "\\mu", focusInsideBraces: false },
      { label: "π", insert: "\\pi ", title: "\\pi", focusInsideBraces: false },
      { label: "ρ", insert: "\\rho ", title: "\\rho", focusInsideBraces: false },
      { label: "σ", insert: "\\sigma ", title: "\\sigma", focusInsideBraces: false },
      { label: "τ", insert: "\\tau ", title: "\\tau", focusInsideBraces: false },
      { label: "φ", insert: "\\phi ", title: "\\phi", focusInsideBraces: false },
      { label: "ψ", insert: "\\psi ", title: "\\psi", focusInsideBraces: false },
      { label: "ω", insert: "\\omega ", title: "\\omega", focusInsideBraces: false },
    ],
  },
  {
    name: "그리스 (대문자)",
    items: [
      { label: "Γ", insert: "\\Gamma ", title: "\\Gamma", focusInsideBraces: false },
      { label: "Δ", insert: "\\Delta ", title: "\\Delta", focusInsideBraces: false },
      { label: "Θ", insert: "\\Theta ", title: "\\Theta", focusInsideBraces: false },
      { label: "Λ", insert: "\\Lambda ", title: "\\Lambda", focusInsideBraces: false },
      { label: "Π", insert: "\\Pi ", title: "\\Pi", focusInsideBraces: false },
      { label: "Σ", insert: "\\Sigma ", title: "\\Sigma", focusInsideBraces: false },
      { label: "Φ", insert: "\\Phi ", title: "\\Phi", focusInsideBraces: false },
      { label: "Ψ", insert: "\\Psi ", title: "\\Psi", focusInsideBraces: false },
      { label: "Ω", insert: "\\Omega ", title: "\\Omega", focusInsideBraces: false },
    ],
  },
  {
    name: "연산자·관계",
    items: [
      { label: "±", insert: "\\pm ", title: "\\pm", focusInsideBraces: false },
      { label: "∓", insert: "\\mp ", title: "\\mp", focusInsideBraces: false },
      { label: "×", insert: "\\times ", title: "\\times", focusInsideBraces: false },
      { label: "÷", insert: "\\div ", title: "\\div", focusInsideBraces: false },
      { label: "·", insert: "\\cdot ", title: "\\cdot", focusInsideBraces: false },
      { label: "≤", insert: "\\le ", title: "\\le", focusInsideBraces: false },
      { label: "≥", insert: "\\ge ", title: "\\ge", focusInsideBraces: false },
      { label: "≠", insert: "\\neq ", title: "\\neq", focusInsideBraces: false },
      { label: "≈", insert: "\\approx ", title: "\\approx", focusInsideBraces: false },
      { label: "≡", insert: "\\equiv ", title: "\\equiv", focusInsideBraces: false },
      { label: "→", insert: "\\to ", title: "\\to (오른쪽 화살표)", focusInsideBraces: false },
      { label: "⇒", insert: "\\Rightarrow ", title: "\\Rightarrow", focusInsideBraces: false },
      { label: "⇔", insert: "\\Leftrightarrow ", title: "\\Leftrightarrow", focusInsideBraces: false },
      { label: "∞", insert: "\\infty ", title: "\\infty", focusInsideBraces: false },
      { label: "∈", insert: "\\in ", title: "\\in", focusInsideBraces: false },
      { label: "∉", insert: "\\notin ", title: "\\notin", focusInsideBraces: false },
      { label: "∀", insert: "\\forall ", title: "\\forall (모든)", focusInsideBraces: false },
      { label: "∃", insert: "\\exists ", title: "\\exists (어떤)", focusInsideBraces: false },
    ],
  },
  {
    name: "구조 (자주 쓰는 패턴)",
    items: [
      { label: "a⁄b 분수", insert: "\\frac{}{}", title: "\\frac{분자}{분모}" },
      { label: "√x 제곱근", insert: "\\sqrt{}", title: "\\sqrt{값}" },
      { label: "ⁿ√x n제곱근", insert: "\\sqrt[]{}" , title: "\\sqrt[n]{값}" },
      { label: "x² 제곱", insert: "^{2}", title: "위첨자 ^{}", focusInsideBraces: false },
      { label: "xⁿ 거듭제곱", insert: "^{}", title: "위첨자 ^{지수}" },
      { label: "xₙ 아래첨자", insert: "_{}", title: "아래첨자 _{인덱스}" },
      { label: "∫ 적분", insert: "\\int_{}^{} ", title: "\\int_{아래}^{위}", focusInsideBraces: false },
      { label: "∮ 폐적분", insert: "\\oint_{}^{} ", title: "\\oint_{}^{}", focusInsideBraces: false },
      { label: "Σ 합", insert: "\\sum_{}^{} ", title: "\\sum_{시작}^{끝}", focusInsideBraces: false },
      { label: "Π 곱", insert: "\\prod_{}^{} ", title: "\\prod_{시작}^{끝}", focusInsideBraces: false },
      { label: "lim 극한", insert: "\\lim_{} ", title: "\\lim_{x \\to a}", focusInsideBraces: false },
      { label: "벡터 →", insert: "\\vec{}", title: "\\vec{a}" },
      { label: "굵게 𝐀", insert: "\\mathbf{}", title: "\\mathbf{}" },
      { label: "텍스트 안", insert: "\\text{}", title: "\\text{한글 가능}" },
      { label: "괄호 (·)", insert: "\\left( \\right)", title: "\\left( \\right) — 자동 크기 조절", focusInsideBraces: false },
      { label: "케이스", insert: "\\begin{cases} & \\\\ & \\end{cases}", title: "조건 분기 cases 블록", focusInsideBraces: false },
      { label: "행렬 2×2", insert: "\\begin{pmatrix} & \\\\ & \\end{pmatrix}", title: "2×2 행렬 pmatrix", focusInsideBraces: false },
      { label: "정렬", insert: "\\begin{aligned} &= \\\\ &= \\end{aligned}", title: "여러 줄 정렬 (등호 정렬)", focusInsideBraces: false },
    ],
  },
];
