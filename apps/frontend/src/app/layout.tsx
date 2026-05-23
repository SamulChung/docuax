import type { Metadata } from "next";
import "@/styles/globals.css";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.docuax.com"),
  title: "DocuAX — 마크다운을 한 번에 한국 회사 문서로",
  description:
    "한국어 특화 LLM + 매크로 100종 + 한컴 한글 정식 호환 — (주)TenAI 의 SaaS. 마크다운 입력 한 번에 DOCX·HWPX·PDF 표준 양식 출력.",
  applicationName: "DocuAX",
  authors: [{ name: "TenAI", url: "https://www.tenai.kr" }],
  keywords: ["한국어 LLM", "문서 자동화", "한컴 한글", "HWPX", "공문 작성", "DocuAX", "TenAI"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="flex min-h-screen flex-col antialiased">
        <div className="flex flex-1 flex-col">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
