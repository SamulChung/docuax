/** @type {import('next').NextConfig} */
const BACKEND = process.env.NEXT_PUBLIC_API_BASE || "https://docuax-production.up.railway.app";

const nextConfig = {
  reactStrictMode: true,
  // kordoc → @huggingface/transformers → onnxruntime-node (네이티브 바이너리)
  // webpack이 .node 바이너리를 번들링하려 해서 빌드 실패 → 외부 패키지로 지정
  serverExternalPackages: [
    "kordoc",
    "@huggingface/transformers",
    "onnxruntime-node",
    "sharp",
  ],
  // NEXT_PUBLIC_API_BASE를 클라이언트 번들에 빌드 타임 삽입
  // → 브라우저가 Railway에 직접 요청해 Vercel 서버사이드 SSRF 차단 우회
  env: {
    NEXT_PUBLIC_API_BASE: BACKEND,
  },
  /**
   * webpack 커스텀 설정
   * serverExternalPackages 로도 .node 바이너리 번들링을 막지 못하는 경우
   * externals + ignore-loader 로 이중 차단
   */
  webpack(config, { isServer }) {
    if (isServer) {
      // onnxruntime-node 및 @huggingface/transformers 를 외부 패키지로 처리
      const existingExternals = Array.isArray(config.externals)
        ? config.externals
        : config.externals
        ? [config.externals]
        : [];

      config.externals = [
        ...existingExternals,
        ({ request }, callback) => {
          const EXTERNAL_PKGS = [
            "onnxruntime-node",
            "@huggingface/transformers",
            "kordoc",
            "sharp",
          ];
          if (
            EXTERNAL_PKGS.some(
              (pkg) => request === pkg || request.startsWith(pkg + "/")
            )
          ) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }

    // .node 네이티브 바이너리 파일을 빈 모듈로 처리 (빌드 타임 오류 방지)
    config.module.rules.push({
      test: /\.node$/,
      use: "null-loader",
    });

    return config;
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
