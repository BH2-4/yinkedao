import { NextResponse } from "next/server";
import { z } from "zod";
import { SealOrderSchema } from "@/lib/design/seal-order";
import { buildSealImagePrompt } from "@/lib/design/seal-prompt";
import { generateSealDesignImage } from "@/lib/ai/image-generator";
import type { SealRenderApiResponse } from "@/types/design-render";

/**
 * POST /api/design-render —— 印章质感层渲染（三站流程第 3 站）。
 *
 * 输入：五维度参数单（URL 持久化的同一份 SealOrder）+ 变体 seed。
 * 管线：Zod 校验 → buildSealImagePrompt（纯确定性翻译，NO TEXT RULE
 * 素坯无字铁律）→ generateSealDesignImage（gpt-image-2 参考图编辑 /
 * mock 章型 SVG）。印面文字由崇羲字体引擎在质感层之上另行叠加——
 * 本 API 不接触任何字形（PRD 8.1 质感层/文字层分离）。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 生图（gpt-image-2 含参考图编辑）实测 30-90 秒；60s 在所有计划内合法。
export const maxDuration = 60;

const RenderRequestSchema = z.object({
  order: SealOrderSchema,
  seed: z.number().int().min(0).max(2 ** 31 - 1).default(1),
});

type ErrorCode = NonNullable<
  Extract<SealRenderApiResponse, { success: false }>["code"]
>;

function errorResponse(
  message: string,
  code: ErrorCode,
  status: number,
): NextResponse<SealRenderApiResponse> {
  return NextResponse.json({ success: false, error: message, code }, { status });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("Request body was not valid JSON.", "invalid_input", 400);
  }

  const parsed = RenderRequestSchema.safeParse(payload);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const path = firstIssue?.path.join(".") || "<root>";
    return errorResponse(
      `Invalid request at ${path}: ${firstIssue?.message ?? "unknown validation error"}.`,
      "invalid_input",
      400,
    );
  }

  const { order, seed } = parsed.data;

  try {
    const prompt = buildSealImagePrompt(order);
    const image = await generateSealDesignImage({ prompt, seed });

    const body: SealRenderApiResponse = {
      success: true,
      order,
      image_prompt: prompt,
      image: {
        data_url: image.dataUrl,
        mime: image.mime,
        provider: image.provider,
        model: image.model,
        generated_at: image.generatedAt,
        seed,
      },
    };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Seal render failed.";
    const code: ErrorCode = /timeout/i.test(message)
      ? "timeout"
      : /rate limit/i.test(message)
        ? "rate_limited"
        : /render/i.test(message)
          ? "render_failed"
          : "unknown";
    return errorResponse(message, code, 500);
  }
}
