/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_BASE || "https://docuax-production.up.railway.app"}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
