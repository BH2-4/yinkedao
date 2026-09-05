import type { SealImagePrompt } from "@/lib/design/seal-prompt";
import type { SealOrder } from "@/lib/design/seal-order";

/**
 * /api/design-render 响应契约（印章质感层版）。
 * 成功：结构化 prompt（可追溯）+ 图（dataUrl 自包含）。
 * 失败：typed error envelope（与全站一致）。
 */
export type SealRenderApiResponse =
  | {
      success: true;
      /** 参数单回显（供 UI 校对） */
      order: SealOrder;
      image_prompt: SealImagePrompt;
      image: {
        data_url: string;
        mime: "image/svg+xml" | "image/png";
        provider: string;
        model: string;
        generated_at: string;
        /** 变体种子（换 seed 重生成） */
        seed: number;
      };
    }
  | {
      success: false;
      error: string;
      code:
        | "invalid_input"
        | "render_failed"
        | "rate_limited"
        | "timeout"
        | "unknown";
    };
