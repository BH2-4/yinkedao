import { NextResponse } from "next/server";
import { z } from "zod";
import { SealOrderSchema } from "@/lib/design/seal-order";
import { createMeshyRetextureTask } from "@/lib/3d/meshy-client";
import { createSeal3dJob, seal3dJobHash } from "@/lib/3d/create-job";
import { findStoredModel } from "@/lib/3d/job-store";
import { errorStatus, TaskIdSchema } from "@/lib/3d/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const Schema = z.object({ source_task_id: TaskIdSchema, source_kind: z.enum(["model", "retexture"]).default("model"), order: SealOrderSchema });

export async function POST(request: Request) {
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ success: false, code: "invalid_input", error: "请求体不是合法 JSON。" }, { status: 400 }); }
  const parsed = Schema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ success: false, code: "invalid_input", error: "模型任务或参数单无效。" }, { status: 400 });
  try {
    const { source_task_id, source_kind, order } = parsed.data;
    // 只查原始无字模型，拒绝任意外部 URL 或用户导出的合成 GLB。
    const source = await findStoredModel(source_task_id, source_kind);
    if (!source) return NextResponse.json({ success: false, code: "invalid_input", error: "请先等待原始模型完成并转存。" }, { status: 400 });
    const result = await createSeal3dJob({
      hash: seal3dJobHash(source.url, order, 0, "retexture"), kind: "retexture",
      create: (key) => createMeshyRetextureTask(key, source.url, order),
    });
    return NextResponse.json(result, { status: result.success ? 200 : errorStatus(result.code) });
  } catch {
    return NextResponse.json({ success: false, code: "transfer_failed", error: "石料质感任务暂不可用，请稍后重试。" }, { status: 503 });
  }
}
