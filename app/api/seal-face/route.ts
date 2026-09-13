import { NextResponse } from "next/server";
import { z } from "zod";
import { parseSealText } from "@/lib/seal-face/layout";
import { mapForChongxi } from "@/lib/seal-face/variant-map";
import {
  getChongxiFontInfo,
  lookupChongxiGlyph,
  type GlyphBoxMetrics,
} from "@/lib/seal-face/glyph-chongxi";
import { composeSealProofSvg } from "@/lib/seal-face/svg-proof";
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

  const { text, style, texture, freedom, seed } = parsed.data;

  /* 印文整理：1-4 字（客户端 SealFaceProof 同规则；>4 为经典正格外场景） */
  const chars = parseSealText(text);
  if (chars === null) {
    return errorResponse(
      "Seal text must contain 1-4 CJK characters after trimming whitespace.",
      "invalid_input",
      400,
    );
  }

  /* 字体栈守卫：崇曦资产缺失（或未启用）时不进入渲染——绝不静默降质 */
  const stack = resolveSealFontStack();
  if (stack.stack !== "chongxi") {
    return errorResponse(
      "Chongxi font assets are not available; the yishan fallback renders client-side.",
      "font_unavailable",
      503,
    );
  }

  try {
    /* ① 简繁前置映射（必选层：简体直查 cmap 覆盖仅 ~53%） */
    const { mapped, changes } = mapForChongxi(chars.join(""));

    /* ② cmap 逐字查询：命中取形，未命中如实记录（绝不造字） */
    const glyphs: { char: string; metrics: GlyphBoxMetrics }[] = [];
    const missing: string[] = [];
    for (const char of Array.from(mapped)) {
      const lookup = await lookupChongxiGlyph(char);
      if (lookup.ok) {
        glyphs.push({ char, metrics: lookup.glyph.metrics });
      } else {
        missing.push(char);
      }
    }

    /* ③ 排布 + 拼装（缺字格留空——与「绝不造字」一致） */
    const svg = composeSealProofSvg({ glyphs, style, texture, freedom, seed });

    const fontInfo = await getChongxiFontInfo();
    const body: SealFaceApiResponse = {
      success: true,
      fontStack: "chongxi",
      svg: {
        data_url: `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`,
        mime: "image/svg+xml",
      },
      mapped_text: mapped,
      mapping_changes: changes,
      missing,
      font: {
        num_glyphs: fontInfo.numGlyphs,
        units_per_em: fontInfo.unitsPerEm,
        outlines_format: fontInfo.outlinesFormat,
      },
      generated_at: new Date().toISOString(),
      seed,
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("[api/seal-face] render failed:", error);
    return errorResponse("Seal face rendering failed unexpectedly.", "unknown", 500);
  }
}
