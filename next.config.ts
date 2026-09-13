import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  // 原生/重量级服务端依赖不做打包，运行时直接 require——Turbopack
  // 打包 sharp（原生 addon）与 undici（重 node 内置依赖）在 dev 下
  // 会卡死编译进程。
  serverExternalPackages: ["sharp", "undici"],
  // Vercel serverless 适配：生图 API 在运行时用 fs 读取 public/ 里的
  // 真实印章参考图（动态 readdir，tracing 无法静态分析），
  // 必须显式包含进 /api/design-render 的函数 bundle。
  // seal-references 为印章质感层参考库（forms/craftsmanship/materials）。
  outputFileTracingIncludes: {
    "/api/design-render": [
      "./public/seal-references/forms/**/*",
      "./public/seal-references/craftsmanship/**/*",
    ],
  },
};

export default nextConfig;
