import { NextResponse } from "next/server";
import { z } from "zod";
import { SealOrderSchema } from "@/lib/design/seal-order";
import { SheetParseError, cellsToDataUris, extractSheetPhoto, splitSheetCells } from "@/lib/3d/sheet-cells";
import { createMeshyTask } from "@/lib/3d/meshy-client";
import type { Seal3dCreateResponse, Seal3dErrorResponse } from "@/types/seal-3d";

/**
 * POST /api/3d-model —— 印章 3D 建模任务创建（B 线 Phase 1）。
 *
 * 输入：/api/design-render 产出的六宫格效果图（SVG dataUrl）+ 参数单。
 * 管线：提取 SVG 内嵌照片 → sharp 按 2×3 网格裁 4 张选格 → Meshy
 * multi-image-to-3d 建任务（降档参数见 meshy-client.ts）→ 立即返回
 * task_id。建模进度走 GET /api/3d-model/{task_id} 轮询（异步任务制，
 * 服务端不持久化任何状态——Meshy 任务对象是唯一状态源）。
 *
 * 印面文字铁律：送入 Meshy 的选格来自无字素坯照片，texture_prompt
 * 仅含石料材质语义；印面文字由崇羲字体引擎在 3D 层后期叠加（Phase 2）。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 任务创建链路（下载/裁切均在内存完成 + Meshy 创建调用）实际 ~10s；
// 与 design-render 同档设 300，兜本地冷启动与 Meshy 慢响应。
export const maxDuration = 300;

/** 前端轮询节奏（服务端下发，改动无需发版） */
const POLL_AFTER_MS = 5_000;

const CreateRequestSchema = z.object({
  /** /api/design-render 响应的 image.data_url（自包含 SVG） */
  sheet_data_url: z.string().startsWith("data:image/svg+xml"),
  order: SealOrderSchema,
  /** 变体种子（回显追溯用，不参与 Meshy 参数） */
  seed: z.number().int().min(0).max(2 ** 31 - 1).default(1),
});

function errorResponse(
  payload: Seal3dErrorResponse,
  status: number,
): NextResponse<Seal3dErrorResponse> {
  return NextResponse.json(payload, { status });
}

export async function POST(request: Request) {
  const meshyKey = process.env.MESHY_API_KEY?.trim();
  if (!meshyKey) {
    return errorResponse(
      { success: false, error: "服务端未配置 MESHY_API_KEY", code: "meshy_unauthorized" },
      500,
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(
      { success: false, error: "Request body was not valid JSON.", code: "invalid_input" },
      400,
    );
  }

  const parsed = CreateRequestSchema.safeParse(payload);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const path = firstIssue?.path.join(".") || "<root>";
    return errorResponse(
      {
        success: false,
        error: `Invalid request at ${path}: ${firstIssue?.message ?? "unknown validation error"}.`,
        code: "invalid_input",
      },
      400,
    );
  }

  const { order, seed } = parsed.data;

  try {
    /* 1. SVG → 内嵌照片原图（标签/格缝/信息栏是 SVG 覆盖层，天然不进照片） */
    const photo = extractSheetPhoto(parsed.data.sheet_data_url);

    /* 2. 裁 4 张选格（白底正面/侧光/特写/多角度）→ data URI */
    const cells = await splitSheetCells(photo);
    const imageDataUris = cellsToDataUris(cells);
    console.log(
      `[3d-model] seed=${seed} stone=${order.stone_type} 选格=${cells.map((c) => `${c.label}:${(c.png.length / 1024).toFixed(0)}KB`).join(" ")}`,
    );

    /* 3. 建任务（降档参数在 meshy-client CREATE_OPTIONS） */
    const created = await createMeshyTask(meshyKey, imageDataUris, order);
    if ("taskId" in created) {
      const body: Seal3dCreateResponse = {
        success: true,
        task_id: created.taskId,
        status: "PENDING",
        poll_after_ms: POLL_AFTER_MS,
      };
      return NextResponse.json(body, { status: 200 });
    }
    /* Meshy 侧 4xx/5xx 已分类；HTTP 层语义对齐状态码 */
    const statusByCode: Record<string, number> = {
      invalid_input: 400,
      meshy_unauthorized: 502,
      meshy_insufficient_credits: 502,
      meshy_rate_limited: 429,
      unknown: 502,
    };
    return errorResponse(created, statusByCode[created.code] ?? 502);
  } catch (err) {
    const message = err instanceof Error ? err.message : "3D task creation failed.";
    console.error("[3d-model] 建任务失败:", err);
    const code: Seal3dErrorResponse["code"] = /time[d]? ?out|aborted/i.test(message)
      ? "timeout"
      : err instanceof SheetParseError
        ? "invalid_input"
        : "unknown";
    return errorResponse({ success: false, error: message, code }, code === "invalid_input" ? 400 : 500);
  }
}
