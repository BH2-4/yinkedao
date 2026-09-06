import { NextResponse } from "next/server";
import { head, put } from "@vercel/blob";
import { downloadGlb, getMeshyTask, taskFailureEnvelope } from "@/lib/3d/meshy-client";
import type {
  Seal3dErrorResponse,
  Seal3dStatusResponse,
} from "@/types/seal-3d";

/**
 * GET /api/3d-model/{task_id} —— 建模进度轮询 + glb 转存（B 线 Phase 1）。
 *
 * SUCCEEDED 的第一次命中：下载 Meshy glb（签名 URL，3 天过期）→ 转存
 * @vercel/blob 公开桶。pathname 锁定为 seal-3d/{task_id}.glb，转存幂等：
 * 先 head 查在，已转存（页面刷新/二次进入）直接回 URL，不重复下载。
 * 3 天过期约束由此化解——blob 转存后长期有效。
 *
 * 任务终态后 Meshy 过期（model_urls 已清空）→ meshy_expired：本地若
 * 曾转存仍可返回；否则只能让前端重新建模（错误文案明示）。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 转存链路（Meshy 查询 + glb 下载 ≤120s + blob put）最长 ~3 分钟
export const maxDuration = 300;

const POLL_AFTER_MS = 5_000;
const BLOB_PREFIX = "seal-3d";

function errorResponse(
  payload: Seal3dErrorResponse,
  status: number,
): NextResponse<Seal3dErrorResponse> {
  return NextResponse.json(payload, { status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const meshyKey = process.env.MESHY_API_KEY?.trim();
  if (!meshyKey) {
    return errorResponse(
      { success: false, error: "服务端未配置 MESHY_API_KEY", code: "meshy_unauthorized" },
      500,
    );
  }
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!blobToken) {
    return errorResponse(
      { success: false, error: "服务端未配置 BLOB_READ_WRITE_TOKEN", code: "transfer_failed" },
      500,
    );
  }

  const { id: taskId } = await params;

  try {
    const task = await getMeshyTask(meshyKey, taskId);
    if (!("status" in task)) {
      /* Meshy 查询失败（key/额度/限流/网络）——已分类的 envelope */
      return errorResponse(task, 502);
    }

    /* 未终态：透传进度 */
    if (task.status === "PENDING" || task.status === "IN_PROGRESS") {
      const body: Seal3dStatusResponse = {
        success: true,
        task_id: task.id,
        status: task.status,
        progress: typeof task.progress === "number" ? task.progress : 0,
        poll_after_ms: POLL_AFTER_MS,
      };
      return NextResponse.json(body, { status: 200 });
    }

    if (task.status !== "SUCCEEDED") {
      return errorResponse(taskFailureEnvelope(task), 200);
    }

    /* 终态成功 → 转存（幂等） */
    const pathname = `${BLOB_PREFIX}/${taskId}.glb`;

    const existing = await head(pathname).catch(() => null);
    if (existing) {
      const body: Seal3dStatusResponse = {
        success: true,
        task_id: task.id,
        status: "SUCCEEDED",
        progress: 100,
        model_url: existing.url,
        model_size: existing.size,
        thumbnail_url: task.thumbnail_url ?? null,
      };
      return NextResponse.json(body, { status: 200 });
    }

    const glbUrl = task.model_urls?.glb;
    if (!glbUrl) {
      /* SUCCEEDED 但产物 URL 已清——Meshy 3 天过期窗口外的重放 */
      return errorResponse(
        {
          success: false,
          error: "Meshy 任务产物已过 3 天有效期且本地无转存副本，请重新生成 3D 模型",
          code: "meshy_expired",
        },
        200,
      );
    }

    const downloaded = await downloadGlb(glbUrl);
    if ("bytes" in downloaded) {
      const bytes = Buffer.from(downloaded.bytes);
      const blob = await put(pathname, bytes, {
        access: "public",
        contentType: "model/gltf-binary",
        allowOverwrite: true,
      });
      console.log(
        `[3d-model] 转存完成 task=${taskId} ${(bytes.length / 1024 / 1024).toFixed(1)}MB → ${blob.url}`,
      );
      const body: Seal3dStatusResponse = {
        success: true,
        task_id: task.id,
        status: "SUCCEEDED",
        progress: 100,
        model_url: blob.url,
        model_size: bytes.length,
        thumbnail_url: task.thumbnail_url ?? null,
      };
      return NextResponse.json(body, { status: 200 });
    }
    return errorResponse(downloaded, 502);
  } catch (err) {
    const message = err instanceof Error ? err.message : "3D model status check failed.";
    console.error("[3d-model] 状态查询/转存失败:", err);
    const code: Seal3dErrorResponse["code"] = /time[d]? ?out|aborted/i.test(message)
      ? "timeout"
      : "unknown";
    return errorResponse({ success: false, error: message, code }, 500);
  }
}
