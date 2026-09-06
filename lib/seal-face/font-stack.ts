/**
 * 印面文字层字体栈开关（INTEGRATION-CHONGXI.md §5.1 · FONT_STACK 双栈）。
 *
 *   chongxi —— 崇曦篆体正式栈：服务端渲染（路线 A），简繁前置映射，
 *              cmap 查字。字体资产缺失时自动回退 yishan 并标注。
 *   yishan  —— 峄山碑 demo 栈：客户端 woff2 分片渲染（现状不动）。
 *
 * 切换：env SEAL_FONT_STACK=chongxi|yishan，默认 yishan——直到视觉
 * 对齐与调参完成（方案文档步骤 ⑥）才切默认，回退链保证 demo 永不断。
 */

import { chongxiFontAvailable } from "./glyph-chongxi";

export type SealFontStack = "chongxi" | "yishan";

export interface SealFontStackInfo {
  stack: SealFontStack;
  /** 请求 chongxi 但字体资产缺失回退 yishan 时为 true（UI 如实标注） */
  fallback: boolean;
}

/**
 * 解析当前生效字体栈（服务端调用：page/route 层）。
 *
 * 探测是同步 fs existsSync——每次调用即时反映字体资产状态（构建期/
 * 运行期均可），无缓存失效问题；字体解析本身（21.2MB）仍在
 * glyph-chongxi 的进程级单例里，只发生一次。
 */
export function resolveSealFontStack(): SealFontStackInfo {
  const requested = process.env.SEAL_FONT_STACK?.trim().toLowerCase();
  if (requested === "chongxi") {
    if (chongxiFontAvailable()) {
      return { stack: "chongxi", fallback: false };
    }
    return { stack: "yishan", fallback: true };
  }
  return { stack: "yishan", fallback: false };
}
