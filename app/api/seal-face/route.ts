import { NextResponse } from "next/server";
import { z } from "zod";
import { parseSealText } from "@/lib/seal-face/layout";
import { renderSealFace } from "@/lib/seal-face/render";
import { resolveSealFontStack } from "@/lib/seal-face/font-stack";
import type { SealFaceApiResponse } from "@/types/seal-face";

/**
 * POST /api/seal-face —— 崇曦栈印蜕渲染（INTEGRATION-CHONGXI.md §5.2）。
 *
 * 管线：Zod 校验 → 简繁前置映射（OpenCC s2t + 特例覆写）→ cmap 逐字
 * 查询（未命中=如实告知，绝不造字）→ layout.ts 排布 → path 拼印蜕
 * SVG（含朱白/斑驳/carved）→ dataUrl 返回。
 *
 * 仅崇曦栈生效：峄山碑栈（默认/回退）走客户端渲染不经过本 API——
 * 两栈同一组件两种数据源（SealFaceProof fontStack prop 分流）。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  /** 印文（1-4 字；空/超长由 UI 层先行提示，此处兜底校验） */
  text: z.string().min(1).max(16),
  /** 朱白 */
  style: z.enum(["baiwen", "zhuwen"]).default("baiwen"),
  /** 印泥斑驳 */
  texture: z.boolean().default(true),
  /** 章法错落自由度 0-100 */
  freedom: z.number().min(0).max(100).default(50),
  /** 变体种子（换 seed 重生成） */
  seed: z.number().int().min(0).max(2 ** 31 - 1).default(21),
  include_textures: z.boolean().default(false),
});

type ErrorCode = NonNullable<
  Extract<SealFaceApiResponse, { success: false }>["code"]
>;

function errorResponse(
  message: string,
  code: ErrorCode,
  status: number,
): NextResponse<SealFaceApiResponse> {
  return NextResponse.json({ success: false, error: message, code }, { status });
}

export async function POST(request: Request): Promise<NextResponse<SealFaceApiResponse>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("Request body was not valid JSON.", "invalid_input", 400);
  }

  const parsed = RequestSchema.safeParse(payload);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const path = firstIssue?.path.join(".") || "<root>";
    return errorResponse(
      `Invalid request at ${path}: ${firstIssue?.message ?? "unknown validation error"}.`,
      "invalid_input",
      400,
    );
  }

  const { text } = parsed.data;

  /* 印文整理：1-4 字（客户端 SealFaceProof 同规则；>4 为经典正格外场景） */
  const chars = parseSealText(text);
  if (chars === null) {
    return errorResponse(
      "去除空白后，印文应为 1–4 字。",
      "invalid_input",
      400,
    );
  }

  /* 字体栈守卫：崇曦资产缺失（或未启用）时不进入渲染——绝不静默降质 */
  const stack = resolveSealFontStack();
  if (stack.stack !== "chongxi") {
    return errorResponse(
      "崇曦字体当前不可用，印蜕页已提供峄山碑应急字体。",
      "font_unavailable",
      503,
    );
  }

  try {
    return NextResponse.json(await renderSealFace(parsed.data));
  } catch (error) {
    console.error("[api/seal-face] render failed:", error);
    return errorResponse("Seal face rendering failed unexpectedly.", "unknown", 500);
  }
}
