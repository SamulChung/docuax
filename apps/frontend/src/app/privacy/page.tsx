import Link from "next/link";

import { LogoLockup } from "@/components/Logo";

export const metadata = {
  title: "개인정보처리방침 — DocuAX",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs text-neutral-500 hover:text-brand"
      >
        <LogoLockup size={20} />
      </Link>

      <h1 className="mt-6 text-2xl font-bold">DocuAX 개인정보처리방침</h1>
      <p className="mt-1 text-xs text-neutral-500">최종 개정일: 2026년 5월 18일 · 시행일: 2026년 7월 1일</p>

      <div className="mt-4 rounded border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-900">
        <p className="font-semibold">개인정보처리자 (운영자)</p>
        <ul className="mt-1 space-y-0.5 text-neutral-600 dark:text-neutral-400">
          <li>상호: <strong>주식회사 텐에이아이</strong></li>
          <li>대표자: <strong>정원훈</strong></li>
          <li>사업자등록번호: <span className="font-mono">801-81-03734</span></li>
          <li>법인등록번호: <span className="font-mono">110111-0952128</span></li>
          <li>본사 주소: 서울특별시 서초구 효령로 335, 202호 (서초동, 대호프레조빌)</li>
          <li>대표전화: <a href="tel:+82-2-588-9881" className="font-mono text-brand hover:underline">02-588-9881</a></li>
          <li>회사 웹사이트: <a href="https://www.tenai.kr" target="_blank" rel="noopener" className="text-brand hover:underline">www.tenai.kr</a></li>
          <li>서비스: DocuAX (<a href="https://www.docuax.com" target="_blank" rel="noopener" className="text-brand hover:underline">www.docuax.com</a>)</li>
        </ul>
      </div>

      <article className="prose prose-sm prose-neutral mt-8 max-w-none space-y-6 dark:prose-invert">
        <section>
          <p className="rounded bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            (주)텐에이아이(이하 "회사")는 「개인정보 보호법」을 준수하며, 이용자의 개인정보를 안전하게 보호하기 위해 본 방침을 수립·공개합니다. ISMS-P 인증 기준에 따라 운영됩니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">1. 수집하는 개인정보 항목 및 방법</h2>
          <h3 className="mt-3 font-semibold">필수 수집 항목</h3>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>이메일 주소 (회원 식별, 로그인)</li>
            <li>비밀번호 (bcrypt 단방향 해시 저장)</li>
            <li>이름 (선택 입력)</li>
            <li>접속 로그, IP 주소, User-Agent (보안·감사)</li>
          </ul>

          <h3 className="mt-3 font-semibold">결제 시 추가 수집</h3>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>결제 카드 정보 — 회사는 직접 보관하지 않으며, Stripe(PCI-DSS Level 1)에 위탁</li>
            <li>청구 주소·사업자등록번호 (법인 사용자)</li>
          </ul>

          <h3 className="mt-3 font-semibold">서비스 이용 중 수집</h3>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>이용자가 입력한 문서·프롬프트·매크로 실행 기록</li>
            <li>변환 횟수·시간 등 사용 통계</li>
            <li>감사 로그 (모든 민감 작업, 90일 보관)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">2. 개인정보 수집·이용 목적</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>회원 가입·관리 (식별·인증·고객 응대)</li>
            <li>서비스 제공 (문서 변환, 양식 적용, 다운로드)</li>
            <li>요금 결제 (Pro·Team·Enterprise 플랜)</li>
            <li>서비스 개선 — 익명화된 사용 통계 기반</li>
            <li>보안 사고 대응 및 감사 (ISMS-P)</li>
            <li>마케팅·뉴스레터 발송 — 별도 동의 시에만</li>
            <li>모델 학습 데이터 활용 — 옵트인(opt_in_training=True) 사용자에 한함</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-bold">3. 보유 및 이용 기간</h2>
          <table className="my-2 w-full text-xs">
            <thead className="bg-neutral-100 dark:bg-neutral-800">
              <tr>
                <th className="px-3 py-1 text-left">항목</th>
                <th className="px-3 py-1 text-left">보유 기간</th>
                <th className="px-3 py-1 text-left">근거</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              <tr><td className="px-3 py-1">회원 정보</td><td className="px-3 py-1">탈퇴 시 즉시 파기</td><td className="px-3 py-1">개인정보 보호법</td></tr>
              <tr><td className="px-3 py-1">결제·청구 기록</td><td className="px-3 py-1">5년</td><td className="px-3 py-1">전자상거래법</td></tr>
              <tr><td className="px-3 py-1">감사 로그</td><td className="px-3 py-1">90일 (자동 삭제)</td><td className="px-3 py-1">ISMS-P</td></tr>
              <tr><td className="px-3 py-1">접속 로그·IP</td><td className="px-3 py-1">3개월</td><td className="px-3 py-1">통신비밀보호법</td></tr>
              <tr><td className="px-3 py-1">이용자 문서</td><td className="px-3 py-1">이용자 요청 또는 탈퇴 시 즉시 삭제</td><td className="px-3 py-1">이용자 권리</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-lg font-bold">4. 개인정보 제 3 자 제공</h2>
          <p>회사는 이용자의 개인정보를 외부에 제공하지 않습니다. 단, 다음의 경우는 예외입니다.</p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li>이용자의 사전 동의가 있는 경우</li>
            <li>법령에 따라 수사기관·법원의 적법한 요청이 있는 경우</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">5. 개인정보 처리 위탁</h2>
          <table className="my-2 w-full text-xs">
            <thead className="bg-neutral-100 dark:bg-neutral-800">
              <tr>
                <th className="px-3 py-1 text-left">수탁자</th>
                <th className="px-3 py-1 text-left">위탁 업무</th>
                <th className="px-3 py-1 text-left">위치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              <tr><td className="px-3 py-1">Stripe Inc.</td><td className="px-3 py-1">결제 처리</td><td className="px-3 py-1">미국 (PCI-DSS L1)</td></tr>
              <tr><td className="px-3 py-1">AWS / Azure (선택)</td><td className="px-3 py-1">서버·스토리지</td><td className="px-3 py-1">한국 리전</td></tr>
              <tr><td className="px-3 py-1">OpenAI / Anthropic (백업)</td><td className="px-3 py-1">LLM 처리 — 옵트인 사용자만</td><td className="px-3 py-1">미국</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-neutral-500 mt-2">
            ※ 망분리·온프레미스 도입 기관은 외부 위탁이 적용되지 않습니다. 자체 서버에서만 데이터를 처리합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">6. 이용자의 권리 및 행사 방법</h2>
          <p>이용자는 언제든지 다음 권리를 행사할 수 있습니다.</p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li>개인정보 열람·정정·삭제·처리 정지 요구</li>
            <li>학습 데이터 활용 동의(opt-in) 철회 — 설정 페이지에서 즉시 가능</li>
            <li>회원 탈퇴 — 보유 정보 즉시 파기</li>
          </ul>
          <p className="mt-2">권리 행사는 <a href="mailto:privacy@docuax.com" className="text-brand underline">privacy@docuax.com</a> 으로 요청하시거나, 설정 페이지에서 직접 수행할 수 있습니다.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold">7. 개인정보 보호 조치</h2>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>비밀번호는 bcrypt 단방향 해시로 저장 (평문 저장 안 함)</li>
            <li>HTTPS/TLS 1.3 통신 암호화</li>
            <li>접근 권한 최소화 — 관리자만 민감 데이터 접근</li>
            <li>90일 감사 로그 보관 및 분기 모의 점검</li>
            <li>외부 침투 시험 연 1회 이상 실시</li>
            <li>ISMS-P 인증 (진행 중, 2026.6 완료 예정)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">8. 쿠키 사용</h2>
          <p>
            회사는 인증 토큰을 HttpOnly·Secure 쿠키로 저장합니다. 분석용 추적 쿠키(GA 등)는 사용하지
            않으며, 이용자는 브라우저 설정에서 쿠키 사용을 거부할 수 있습니다. 단, 거부 시 로그인이
            제한됩니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">9. 개인정보 보호책임자</h2>
          <div className="rounded bg-neutral-50 p-3 dark:bg-neutral-900">
            <p>성명: <strong>정원훈</strong> (대표이사 겸 CPO)</p>
            <p>소속: (주)텐에이아이 대표이사실</p>
            <p>이메일: <a href="mailto:privacy@docuax.com" className="text-brand underline">privacy@docuax.com</a></p>
            <p>연락처: <a href="tel:+82-2-588-9881" className="font-mono text-brand underline">02-588-9881</a> (평일 09:00~18:00)</p>
            <p className="mt-2 text-[10px] text-neutral-500">
              본 책임자는 「개인정보 보호법」 제31조에 따른 개인정보 보호책임자이며, 정보주체의 권리 행사·문의·고충 처리 책임을 집니다.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold">10. 권익 침해 구제 방법</h2>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>개인정보분쟁조정위원회 (privacy.go.kr / 1833-6972)</li>
            <li>개인정보침해신고센터 (privacy.kisa.or.kr / 118)</li>
            <li>대검찰청 사이버수사과 (spo.go.kr / 1301)</li>
            <li>경찰청 사이버수사국 (cyberbureau.police.go.kr / 182)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">11. 방침 변경</h2>
          <p>본 방침은 법령·서비스 변경에 따라 수정될 수 있으며, 수정 시 시행일 7일 전 공지합니다.</p>
        </section>
      </article>

      <div className="mt-8 flex items-center gap-4 text-xs text-neutral-500">
        <Link href="/" className="hover:text-brand">홈으로</Link>
        <Link href="/terms" className="hover:text-brand">← 이용약관</Link>
      </div>
    </div>
  );
}
