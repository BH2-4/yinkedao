import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  // Vercel serverless 适配：生图 API 在运行时用 fs 读取 public/ 里的
  // 真实印章参考图（动态 readdir，tracing 无法静态分析），
  // 必须显式包含进 /api/design-render 的函数 bundle。
  // seal-references 为印章质感层参考库（forms/craftsmanship）；
  // collection 目录待 F 批线上验证后移除（暂并存）。
  outputFileTracingIncludes: {
    "/api/design-render": [
      "./public/seal-references/forms/**/*",
      "./public/seal-references/craftsmanship/**/*",
      "./public/collection/assets/images/**/*",
    ],
  },
  // 成品独立站托管在 public/collection/（纯静态多页站）。
  // 独立站内部全部使用相对路径，浏览器需要以 /collection/ 为基准
  // 解析，因此入口必须落在真实文件 URL 上（/collection 这种无尾
  // 斜杠地址会让 assets/... 被解析到站点根，导致图片全部 404）。
  async redirects() {
    return [
      {
        source: "/collection",
        destination: "/collection/index.html",
        permanent: false,
      },
      // Spree 遗留店域名（shop.）整体迁往成品独立站：按 host 命中，
      // 任意旧路径一律 301 到 /collection（旧深链在静态站无对应页面）。
      {
        source: "/:path*",
        has: [{ type: "host", value: "shop.randomplayx.com" }],
        destination: "/collection",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      // 独立站子目录页面（products/、about/ 等）里的资源引用是
      // 相对路径 assets/...，浏览器会解析到 /collection/<子目录>/assets/...
      // 导致 404。这里统一重写回 /collection/assets/...。
      {
        source: "/collection/:page+/assets/:rest*",
        destination: "/collection/assets/:rest*",
      },
    ];
  },
};

export default nextConfig;