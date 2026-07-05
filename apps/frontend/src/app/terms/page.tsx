import Link from "next/link";

import { LogoLockup } from "@/components/Logo";

export const metadata = {
  title: "이용약관 — DocuAI",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs text-neutral-500 hover:text-brand"
      >
        <LogoLockup size={20} />
      </Link>

      <h1 className="mt-6 text-2xl font-bold">DocuAI 이용약관</h1>
      <p className="mt-1 text-xs text-neutral-500">최종 개정일: 2026년 5월 18일 · 시행일: 2026년 7월 1일</p>

      <div className="mt-4 rounded border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-900">
        <p className="font-semibold">서비스 운영자</p>
        <ul className="mt-1 space-y-0.5 text-neutral-600 dark:text-neutral-400">
          <li>상호: <strong>주식회사 텐에이아이</strong></li>
          <li>대표자: <strong>정원훈</strong></li>
          <li>사업자등록번호: <span className="font-mono">801-81-03734</span></li>
          <li>법인등록번호: <span className="font-mono">110111-0952128</span></li>
          <li>설립일: 2026년 3월 5일</li>
          <li>본사 주소: 서울특별시 서초구 효령로 335, 202호 (서초동, 대호프레조빌)</li>
          <li>대표전화: <a href="tel:+82-2-588-9881" className="font-mono text-brand hover:underline">02-588-9881</a></li>
          <li>업태·종목: 정보통신업·교육서비스업 (응용 소프트웨어 개발 및 공급업)</li>
          <li>회사 웹사이트: <a href="https://www.tenai.kr" target="_blank" rel="noopener" className="text-brand hover:underline">www.tenai.kr</a></li>
          <li>서비스: DocuAI (<a href="https://www.docuax.com" target="_blank" rel="noopener" className="text-brand hover:underline">www.docuax.com</a>)</li>
          <li>고객 문의: <a href="mailto:contact@tenai.kr" className="text-brand hover:underline">contact@tenai.kr</a></li>
        </ul>
      </div>

      <article className="prose prose-sm prose-neutral mt-8 max-w-none space-y-6 dark:prose-invert">
        <section>
          <h2 className="text-lg font-bold">제 1 조 (목적)</h2>
          <p>
            본 약관은 (주)텐에이아이(이하 "회사")이 제공하는 한국어 LLM 기반 문서 자동화 SaaS
            "DocuAI"(이하 "서비스")의 이용과 관련하여 회사와 이용자의 권리·의무 및 책임 사항을
            규정함을 목적으로 합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">제 2 조 (정의)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>"이용자"란 본 약관에 동의하고 서비스를 이용하는 개인 또는 법인을 말합니다.</li>
            <li>"콘텐츠"란 이용자가 서비스에 입력·업로드한 마크다운·문서·프롬프트 등 모든 디지털 자료를 말합니다.</li>
            <li>"플랜"이란 Free, Pro, Team, Enterprise 등 회사가 제공하는 서비스 등급을 말합니다.</li>
            <li>"조직"이란 같은 organization_id를 공유하는 이용자 그룹을 말합니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-bold">제 3 조 (약관의 게시 및 변경)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>회사는 본 약관의 내용을 이용자가 쉽게 확인할 수 있도록 서비스 초기 화면에 게시합니다.</li>
            <li>회사는 관련 법령에 위배되지 않는 범위에서 본 약관을 변경할 수 있으며, 변경 시 시행일 7일 전부터 공지합니다.</li>
            <li>이용자가 변경된 약관에 동의하지 않는 경우 서비스 이용을 중단하고 탈퇴할 수 있습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-bold">제 4 조 (회원 가입)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>가입 신청자는 본 약관 및 개인정보처리방침에 동의한 후 회사가 정한 절차에 따라 가입을 신청합니다.</li>
            <li>회사는 다음 각호에 해당하는 경우 가입을 거절하거나 사후 해지할 수 있습니다.
              <ul className="list-disc pl-5 mt-1">
                <li>실명이 아니거나 타인의 정보를 도용한 경우</li>
                <li>허위 정보를 기재한 경우</li>
                <li>서비스 운영에 현저한 지장을 초래하는 경우</li>
              </ul>
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-bold">제 5 조 (서비스 제공 및 변경)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>회사는 다음 서비스를 제공합니다.
              <ul className="list-disc pl-5 mt-1">
                <li>마크다운 → DOCX·HWPX·PDF 변환</li>
                <li>매크로 100종</li>
                <li>회사·기관별 양식 프로파일</li>
                <li>프롬프트 라이브러리</li>
                <li>RAG 기반 양식 학습 (유료 플랜)</li>
              </ul>
            </li>
            <li>회사는 서비스의 내용·운영시간을 변경할 수 있으며, 사전 공지합니다.</li>
            <li>회사는 정기 점검 또는 시스템 장애 시 사전 공지 후 서비스를 일시 중단할 수 있습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-bold">제 6 조 (이용 요금 및 결제)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Free 플랜은 무료입니다. Pro·Team·Enterprise 플랜은 회사가 정한 요금을 결제합니다.</li>
            <li>결제는 Stripe를 통한 신용카드 자동결제로 이루어지며, 결제 정보는 PCI-DSS 표준에 따라 보호됩니다.</li>
            <li>이용자는 언제든지 플랜을 변경하거나 해지할 수 있습니다. 환불은 다음 기준에 따릅니다.
              <ul className="list-disc pl-5 mt-1">
                <li>월 결제: 결제일로부터 7일 이내, 사용 횟수 10건 이하인 경우 전액 환불</li>
                <li>연 결제: 결제일로부터 14일 이내 전액 환불</li>
                <li>그 외: 잔여 기간 일할 환산하여 환불</li>
              </ul>
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-bold">제 7 조 (콘텐츠와 지식재산권)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>이용자가 서비스에 입력·업로드한 콘텐츠의 저작권은 이용자에게 있습니다.</li>
            <li>이용자는 회사에 콘텐츠를 서비스 제공 목적(변환·저장·표시)으로 이용할 수 있도록 비독점적·무상의 라이선스를 부여합니다.</li>
            <li>이용자가 학습 데이터 활용에 동의한 경우(opt-in)에 한하여 회사는 모델 개선에 콘텐츠를 활용할 수 있습니다. 동의는 언제든지 철회 가능합니다.</li>
            <li>회사의 서비스·매크로·LLM 모델 등에 관한 지식재산권은 회사에 귀속됩니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-bold">제 8 조 (이용자의 의무)</h2>
          <p>이용자는 다음 행위를 하여서는 안됩니다.</p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li>타인의 개인정보·저작물을 무단 사용·배포</li>
            <li>서비스를 통해 생성된 콘텐츠를 사실로 호도하는 행위</li>
            <li>API를 비정상적으로 호출하거나 부하를 발생시키는 행위</li>
            <li>법령·공공질서·미풍양속에 반하는 콘텐츠 작성</li>
            <li>서비스의 운영을 방해하거나 무단으로 시스템에 침입하는 행위</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">제 9 조 (서비스 이용 제한)</h2>
          <p>
            회사는 이용자가 본 약관을 위반하거나 서비스 운영을 방해한 경우 사전 통지 없이 서비스 이용을
            정지하거나 계약을 해지할 수 있습니다. 중대한 위반의 경우 즉시 조치하며, 사후 통지합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">제 10 조 (책임의 제한)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>회사는 천재지변·전쟁·정전·해킹 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.</li>
            <li>회사는 이용자가 서비스를 통해 생성한 콘텐츠의 정확성·완전성·적법성을 보증하지 않으며, 이용자는 결과를 검토·검증한 후 사용할 책임이 있습니다.</li>
            <li>LLM의 특성상 환각(hallucination) 가능성이 있으므로, 중요 의사결정 자료에는 반드시 사람의 검토가 필요합니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-bold">제 11 조 (분쟁 해결)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>본 약관에 관한 분쟁이 발생한 경우 회사와 이용자는 상호 협의하여 해결합니다.</li>
            <li>협의가 불가능한 경우 회사의 본점 소재지를 관할하는 법원을 합의 관할로 합니다.</li>
            <li>본 약관은 대한민국 법에 따라 해석됩니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-bold">부 칙</h2>
          <p>본 약관은 2026년 7월 1일부터 시행합니다.</p>
        </section>
      </article>

      <div className="mt-8 flex items-center gap-4 text-xs text-neutral-500">
        <Link href="/" className="hover:text-brand">홈으로</Link>
        <Link href="/privacy" className="hover:text-brand">개인정보처리방침 →</Link>
      </div>
    </div>
  );
}
