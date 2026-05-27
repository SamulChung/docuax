import VerifyBannerWrapper from "@/components/auth/VerifyBannerWrapper";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <VerifyBannerWrapper />
      {children}
    </>
  );
}
