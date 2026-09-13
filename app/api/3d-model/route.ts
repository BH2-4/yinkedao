import { NextResponse } from "next/server";
import { z } from "zod";
import { SealOrderSchema } from "@/lib/design/seal-order";
import { SheetParseError, cellsToDataUris, extractSheetPhoto, splitSheetCells } from "@/lib/3d/sheet-cells";
import { createMeshyTask } from "@/lib/3d/meshy-client";
import { createSeal3dJob, seal3dJobHash } from "@/lib/3d/create-job";
import { errorStatus } from "@/lib/3d/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CreateRequestSchema = z.object({
  sheet_data_url: z.string().max(24 * 1024 * 1024).startsWith("data:image/svg+xml"),
  order: SealOrderSchema,
  seed: z.number().int().min(0).max(2 ** 31 - 1).default(1),
});

export async function POST(request: Request) {
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ success: false, error: "请求体不是合法 JSON。", code: "invalid_input" }, { status: 400 }); }
  const parsed = CreateRequestSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ success: false, error: "效果图或参数单格式不正确。", code: "invalid_input" }, { status: 400 });
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({ success: false, error: "当前环境尚未配置 3D 模型存储。", code: "transfer_failed" }, { status: 503 });
  }
  try {
    const { order, seed, sheet_data_url } = parsed.data;
    const photo = extractSheetPhoto(sheet_data_url);
    const cells = await splitSheetCells(photo);
    const result = await createSeal3dJob({
      hash: seal3dJobHash(photo, order, seed), kind: "model",
      create: (key) => createMeshyTask(key, cellsToDataUris(cells), order),
    });
    return NextResponse.json(result, { status: result.success ? 200 : errorStatus(result.code) });
  } catch (error) {
    const invalid = error instanceof SheetParseError;
    return NextResponse.json({ success: false, code: invalid ? "invalid_input" : "transfer_failed", error: invalid ? error.message : "模型创建或缓存服务暂不可用，请稍后再试。" }, { status: invalid ? 400 : 503 });
  }
}
