"""수식 30+ 종 종합 렌더 검증."""
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.visuals import render_equation_to_png  # noqa: E402
from app.services.visuals.cache import cache_dir  # noqa: E402


EQUATIONS = {
    # 기초
    "simple":      r"E = mc^2",
    "fraction":    r"\frac{a}{b} = \frac{c}{d}",
    "power":       r"a^x = b \quad \Leftrightarrow \quad x = \log_a b",
    "sqrt":        r"\sqrt{a^2 + b^2} = c",
    # 대수
    "quadratic":   r"x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}",
    "binomial":    r"(a + b)^n = \sum_{k=0}^{n} \binom{n}{k} a^{n-k} b^k",
    "factorial":   r"\binom{n}{k} = \frac{n!}{k!(n-k)!}",
    # 미적분
    "derivative":  r"f'(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}",
    "integral":    r"\int_{a}^{b} f(x) \, dx = F(b) - F(a)",
    "gaussian":    r"\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}",
    "limit":       r"\lim_{n \to \infty} \left(1 + \frac{1}{n}\right)^n = e",
    "sum_series":  r"\sum_{i=1}^{n} i^2 = \frac{n(n+1)(2n+1)}{6}",
    "taylor":      r"f(x) = \sum_{n=0}^{\infty} \frac{f^{(n)}(a)}{n!} (x - a)^n",
    # 통계·확률
    "mean":        r"\bar{x} = \frac{1}{n} \sum_{i=1}^{n} x_i",
    "variance":    r"s^2 = \frac{1}{n-1} \sum_{i=1}^{n} (x_i - \bar{x})^2",
    "normal_pdf":  r"f(x) = \frac{1}{\sigma \sqrt{2\pi}} \, e^{-\frac{(x-\mu)^2}{2\sigma^2}}",
    "bayes":       r"P(A|B) = \frac{P(B|A) \, P(A)}{P(B)}",
    "regression":  r"\hat{\beta} = (X^T X)^{-1} X^T y",
    # 선형대수
    "matrix_mul":  r"(AB)_{ij} = \sum_{k=1}^{n} A_{ik} B_{kj}",
    "determinant": r"\det \begin{pmatrix} a & b \\ c & d \end{pmatrix} = ad - bc",
    "eigenvalue":  r"A \mathbf{v} = \lambda \mathbf{v}",
    "dot_product": r"\mathbf{a} \cdot \mathbf{b} = \sum_{i=1}^{n} a_i b_i = |\mathbf{a}||\mathbf{b}| \cos\theta",
    # 물리·공학
    "newton":      r"F = m \cdot a",
    "kinetic":     r"K = \frac{1}{2} m v^2",
    "wave":        r"\frac{\partial^2 u}{\partial t^2} = c^2 \frac{\partial^2 u}{\partial x^2}",
    "schrodinger": r"i\hbar \frac{\partial \Psi}{\partial t} = \hat{H} \Psi",
    "maxwell":     r"\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}",
    # 경제·재무
    "pv":          r"PV = \frac{FV}{(1 + r)^n}",
    "compound":    r"A = P \left(1 + \frac{r}{n}\right)^{n t}",
    "npv":         r"NPV = \sum_{t=0}^{n} \frac{CF_t}{(1 + r)^t}",
    "roi":         r"ROI = \frac{R - C}{C} \times 100\%",
    "blackscholes":r"C = S_0 N(d_1) - K e^{-rT} N(d_2)",
    # 정렬·정의
    "definition":  r"f(x) \;\equiv\; ax^2 + bx + c",
    "tagged":      r"P(\text{정답}) = \frac{N_{\text{정답}}}{N_{\text{전체}}} \tag{1}",
    "cases":       r"f(x) = \begin{cases} x^2 & x \ge 0 \\ -x^2 & x < 0 \end{cases}",
    "unit":        r"v = 9.8 \; \mathrm{m/s^2} \cdot t",
}


def main() -> int:
    print(f"━ 수식 {len(EQUATIONS)}종 검증")
    print(f"  캐시: {cache_dir()}")
    ok = 0
    fail = 0
    for name, latex in EQUATIONS.items():
        t0 = time.time()
        try:
            p = render_equation_to_png(latex=latex, display=True)
            elapsed = (time.time() - t0) * 1000
            if p and p.exists() and p.stat().st_size > 500:
                print(f"  ✓ {name:14s} {p.stat().st_size:>7,} bytes ({elapsed:.0f}ms)")
                ok += 1
            else:
                print(f"  ✗ {name:14s} 실패 ({elapsed:.0f}ms)")
                fail += 1
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ {name:14s} {type(e).__name__}: {str(e)[:80]}")
            fail += 1

    # \tag{} 동작 확인
    print()
    print("━ 추가 기능 검증")
    p = render_equation_to_png(latex=r"y = mx + b \tag{2.1}", display=True)
    print(f"  \\tag 자동 번호: {'✓' if p and p.exists() else '✗'} ({p.stat().st_size if p else 0:,} bytes)")
    p = render_equation_to_png(latex=r"E = mc^2", display=False)
    print(f"  인라인:       {'✓' if p and p.exists() else '✗'} ({p.stat().st_size if p else 0:,} bytes)")
    p = render_equation_to_png(latex=r"\nabla \cdot E", display=True, color="#1F5BAF")
    print(f"  컬러:         {'✓' if p and p.exists() else '✗'} ({p.stat().st_size if p else 0:,} bytes)")

    print()
    print(f"━ 결과: ✓ {ok}/{len(EQUATIONS)} 통과, ✗ {fail} 실패")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
