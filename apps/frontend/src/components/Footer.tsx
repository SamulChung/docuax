import Link from "next/link";
import { ExternalLink } from "lucide-react";

/**
 * 전 페이지 공통 푸터.
 * - 운영사 TenAI 연결
 * - 법적 페이지(약관·개인정보) 링크
 * - 제품 / 회사 / 지원 3분 구성
 */
export function Footer() {
  return (
    <footer className="no-print border-t border-neutral-200 bg-neutral-50 px-6 py-8 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 md:grid-cols-4">
          {/* 제품 */}
          <div>
            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              제품
            </h3>
            <ul className="space-y-1.5 text-xs">
              <li><Link href="/" className="hover:text-brand">워크스페이스</Link></li>
              <li><Link href="/pricing" className="hover:text-brand">요금제</Link></li>
              <li><a href="https://docuax.com/docs" target="_blank" rel="noopener" className="hover:text-brand">문서</a></li>
            </ul>
          </div>

          {/* 회사 */}
          <div>
            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              회사
            </h3>
            <ul className="space-y-1.5 text-xs">
              <li>
                <a
                  href="https://www.tenai.kr"
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 hover:text-brand"
                >
                  (주)텐에이아이 <ExternalLink size={9} />
                </a>
              </li>
              <li><a href="mailto:contact@tenai.kr" className="hover:text-brand">문의하기</a></li>
              <li><a href="mailto:sales@tenai.kr" className="hover:text-brand">B2B 영업</a></li>
              <li><a href="mailto:careers@tenai.kr" className="hover:text-brand">채용</a></li>
            </ul>
          </div>

          {/* 지원 */}
          <div>
            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              지원
            </h3>
            <ul className="space-y-1.5 text-xs">
              <li><a href="mailto:support@docuax.com" className="hover:text-brand">고객지원</a></li>
              <li><a href="mailto:privacy@docuax.com" className="hover:text-brand">개인정보 문의</a></li>
              <li><a href="mailto:security@docuax.com" className="hover:text-brand">보안 신고</a></li>
            </ul>
          </div>

          {/* 법적 */}
          <div>
            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              법적 고지
            </h3>
            <ul className="space-y-1.5 text-xs">
              <li><Link href="/terms" className="hover:text-brand">이용약관</Link></li>
              <li><Link href="/privacy" className="hover:text-brand">개인정보처리방침</Link></li>
            </ul>
          </div>
        </div>

        {/* 하단 라인 — 한국 전자상거래법 표시사항 */}
        <div className="mt-8 border-t border-neutral-200 pt-4 text-[11px] text-neutral-500 dark:border-neutral-800">
          <div className="grid gap-1 leading-relaxed md:grid-cols-2">
            <p>
              <strong className="text-neutral-700 dark:text-neutral-300">(주)텐에이아이</strong>{" "}
              · 대표 <strong>정원훈</strong>
            </p>
            <p>
              사업자등록번호 <span className="font-mono">801-81-03734</span>
            </p>
            <p>서울 서초구 효령로 335, 202호 (서초동, 대호프레조빌)</p>
            <p>
              대표전화 <a href="tel:+82-2-588-9881" className="font-mono hover:text-brand">02-588-9881</a>
            </p>
            <p>
              문의 <a href="mailto:contact@tenai.kr" className="hover:text-brand">contact@tenai.kr</a>
              {" · "}
              <a href="https://www.tenai.kr" target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 hover:text-brand">
                www.tenai.kr <ExternalLink size={9} />
              </a>
            </p>
            <p className="text-neutral-400">
              한국어 LLM · 한컴 한글 정식 호환 · ISMS-P
            </p>
          </div>
          <p className="mt-3 text-neutral-400">
            © 2026 (주)텐에이아이 · GuelZip(글집) is a product of TenAI
          </p>
        </div>
      </div>
    </footer>
  );
}
