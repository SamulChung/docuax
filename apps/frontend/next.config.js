const BACKEND = (
  process.env.NEXT_PUBLIC_API_BASE || "https://docuax-production-f113.up.railway.app"
).trim().replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Next.js 14 uses this name; serverExternalPackages is a Next.js 15 option.
    serverComponentsExternalPackages: ["kordoc"],
    outputFileTracingIncludes: {
      // kordoc loads CFB through createRequire(import.meta.url), which Next 14
      // does not discover automatically when tracing its ESM entry point.
      "/api/parse-hwp": [
        "./node_modules/cfb/**/*",
        "./node_modules/adler-32/**/*",
        "./node_modules/crc-32/**/*",
      ],
    },
    outputFileTracingExcludes: {
      // HWP/HWPX parsing does not use kordoc's optional PDF formula OCR.
      // Tracing those GPU/native dependencies produced a ~777 MiB function.
      "/api/parse-hwp": [
        "./node_modules/onnxruntime-node/**/*",
        "./node_modules/@huggingface/**/*",
        "./node_modules/@hyzyla/pdfium/**/*",
      ],
    },
  },
  // Build-time public API address for direct browser requests to Railway.
  env: { NEXT_PUBLIC_API_BASE: BACKEND },
  async rewrites() {
    if (process.env.NEXT_PUBLIC_API_BASE) return [];
    return [{ source: "/api/:path*", destination: `${BACKEND}/api/:path*` }];
  },
};

module.exports = nextConfig;
