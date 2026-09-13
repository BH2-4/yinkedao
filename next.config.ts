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
    // 崇曦字体（服务端私有资产，不进 public/）：随 /api/seal-face
    // 函数 bundle 上 serverless（路线 A：运行时 fs 直读原始 OTF）。
    // 注意：字体当前被 .gitignore（安置方式待决）——CI/部署环境缺此
    // 文件时 glob 为空集，font-stack 自动回退峄山碑栈，不阻断构建。
    "/api/seal-face": ["./assets/fonts/chongxi/**/*"],
  },
};

export default nextConfig;
