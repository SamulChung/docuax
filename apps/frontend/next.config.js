/** @type {import('next').NextConfig} */
const BACKEND = process.env.NEXT_PUBLIC_API_BASE || "https://docuax-production.up.railway.app";

const nextConfig = {
  reactStrictMode: true,
  // NEXT_PUBLIC_API_BASE를 클라이언트 번들에 빌드 타임 삽입
  // → 브라우저가 Railway에 직접 요청해 Vercel 서버사이드 SSRF 차단 우회
  env: {
    NEXT_PUBLIC_API_BASE: BACKEND,
  },
  async rewrites() {
    // 로컬 개발 전용 (NEXT_PUBLIC_API_BASE 미설정 시 /api/* → localhost:8000)
    if (process.env.NEXT_PUBLIC_API_BASE) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
