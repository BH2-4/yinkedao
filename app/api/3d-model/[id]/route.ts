import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { downloadGlb, getMeshyTask, taskFailureEnvelope } from "@/lib/3d/meshy-client";
import { findStoredModel, modelPath } from "@/lib/3d/job-store";
import { errorStatus, TaskIdSchema } from "@/lib/3d/http";
import type { Seal3dStatusResponse } from "@/types/seal-3d";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kind = new URL(request.url).searchParams.get("kind") ?? "model";
  if (!TaskIdSchema.safeParse(id).success || (kind !== "model" && kind !== "retexture")) {
    return NextResponse.json({ success: false, code: "invalid_input", error: "任务编号或类型无效。" }, { status: 400 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({ success: false, code: "transfer_failed", error: "服务端未配置模型存储。" }, { status: 503 });
  }
  const done = (model: { url: string; size: number }, thumbnail: string | null = null): Seal3dStatusResponse => ({
    success: true, task_id: id, status: "SUCCEEDED", progress: 100,
    model_url: model.url, model_size: model.size, thumbnail_url: thumbnail,
  });
  try {
    // 已转存模型优先，Meshy 任务过期或 Key 轮换后仍可预览。
    const existing = await findStoredModel(id, kind);
    if (existing) return NextResponse.json(done(existing));
    const key = process.env.MESHY_API_KEY?.trim();
    if (!key) return NextResponse.json({ success: false, code: "meshy_unauthorized", error: "服务端未配置 MESHY_API_KEY。" }, { status: 503 });
    const task = await getMeshyTask(key, id, kind);
    if (!("status" in task)) return NextResponse.json(task, { status: errorStatus(task.code) });
    if (task.status === "PENDING" || task.status === "IN_PROGRESS") {
      return NextResponse.json({ success: true, task_id: id, status: task.status, progress: Math.max(0, Math.min(100, task.progress || 0)), poll_after_ms: 5000 });
    }
    if (task.status !== "SUCCEEDED") return NextResponse.json(taskFailureEnvelope(task));
    const url = task.model_urls?.glb;
    if (!url) return NextResponse.json({ success: false, code: "meshy_expired", error: "Meshy 产物已过有效期且无转存副本，请重新生成。" });
    const downloaded = await downloadGlb(url);
    if (!("bytes" in downloaded)) return NextResponse.json(downloaded, { status: errorStatus(downloaded.code) });
    const bytes = Buffer.from(downloaded.bytes);
    const model = await put(modelPath(id, kind), bytes, { access: "public", contentType: "model/gltf-binary", allowOverwrite: true, addRandomSuffix: false });
    return NextResponse.json(done({ url: model.url, size: bytes.length }, task.thumbnail_url ?? null));
  } catch {
    return NextResponse.json({ success: false, code: "transfer_failed", error: "模型查询或转存失败，请重试查询当前任务。" }, { status: 503 });
  }
}
