import type { SealOrder } from "@/lib/design/seal-order";
import { STONE_VISUAL, LOOK_VISUAL } from "@/lib/design/seal-prompt";
import { outboundFetch } from "@/lib/3d/outbound-fetch";
import type { Seal3dErrorResponse } from "@/types/seal-3d";

/**
 * Meshy multi-image-to-3d 客户端（服务端专用，key 永不出现在客户端包）。
 *
 * 降档策略（Phase 1 实测基线 52.9MB → 目标 ≤15MB）：
 *   - should_remesh: true + target_polycount: 30000 —— spike 未传
 *     should_remesh 时 Meshy 原生高模是体积大头，remesh 到 3 万面后
 *     预计几何 <2MB（官方 remesh 档位 100-300k，30k 是保细节的下限档）
 *   - texture_resolution: "2k" + enable_pbr: false —— 单张 base color，
 *     石料不需要 metallic/emission；PBR 三图会显著增重，Phase 2 再评估
 *   - target_formats: ["glb"] —— 只产 glb，省任务时间
 *
 * 铁律（PRD 8.1）：texture_prompt 只写石料材质语义，绝不包含任何
 * 文字/字符概念——印面文字由崇羲字体引擎后期叠加，永不进 Meshy。
 */

const MESHY_BASE = "https://api.meshy.ai/openapi/v1";

/** 创建参数集中于此——降档取舍只动这一处 */
const CREATE_OPTIONS = {
  ai_model: "latest",
  should_texture: true,
  /** 降体积主闸：remesh 减面 */
  should_remesh: true,
  target_polycount: 30_000,
  topology: "triangle",
  /** 降体积副闸：2k 单贴图、不开 PBR */
  texture_resolution: "2k",
  enable_pbr: false,
  target_formats: ["glb"],
} as const;

export interface MeshyTask {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
  progress: number;
  model_urls?: { glb?: string } | null;
  thumbnail_url?: string | null;
  task_error?: { message?: string } | null;
  expires_at?: number;
  consumed_credits?: number;
}

/** Meshy HTTP 状态 → 本站错误码（前端据此给可读提示） */
export function classifyMeshyHttpError(status: number, bodyText: string): Seal3dErrorResponse {
  const detail = bodyText.slice(0, 300);
  switch (status) {
    case 401:
      return { success: false, error: `Meshy API key 无效或过期（${detail}）`, code: "meshy_unauthorized" };
    case 402:
      return { success: false, error: "Meshy 额度不足（credits 余额耗尽）", code: "meshy_insufficient_credits" };
    case 429:
      return { success: false, error: "Meshy 请求频率/并发超限，请稍后再试", code: "meshy_rate_limited" };
    case 400:
      return { success: false, error: `Meshy 拒绝了请求参数（${detail}）`, code: "invalid_input" };
    default:
      return { success: false, error: `Meshy 服务异常 HTTP ${status}（${detail}）`, code: "unknown" };
  }
}

/** 任务终态 FAILED/CANCELED → envelope（credits 已自动退还，可安全重试） */
export function taskFailureEnvelope(task: MeshyTask): Seal3dErrorResponse {
  const reason = task.task_error?.message?.slice(0, 300) ?? "无错误详情";
  return {
    success: false,
    error: `Meshy 建模任务${task.status === "CANCELED" ? "被取消" : "失败"}：${reason}（credits 已退还）`,
    code: "meshy_task_failed",
  };
}

/** 带超时的 JSON 请求（Meshy 全异步任务制，创建/查询都是短请求） */
async function meshyJson(
  key: string,
  path: string,
  init: { method: "GET" | "POST"; timeoutMs: number; body?: string },
): Promise<{ ok: boolean; status: number; body: unknown; bodyText: string }> {
  const { timeoutMs, method, body } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await outboundFetch(`${MESHY_BASE}${path}`, {
      method,
      body,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    const bodyText = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      /* 非 JSON 响应按原文透传给错误分类 */
    }
    return { ok: res.ok, status: res.status, body: parsed, bodyText };
  } finally {
    clearTimeout(timer);
  }
}

/** 石料材质 texture_prompt（复用质感层词汇表，零发明） */
export function buildSeal3dTexturePrompt(order: SealOrder): string {
  const stone = STONE_VISUAL[order.stone_type] ?? STONE_VISUAL.unknown;
  const look = LOOK_VISUAL[order.stone_look] ?? LOOK_VISUAL.unknown;
  return `Polished Chinese seal stone, ${stone}, ${look}. Solid mineral material, no metal, no glass, no fabric.`;
}

/** 创建 multi-image-to-3d 任务。返回 task id（响应字段是 result 不是 id）。 */
export async function createMeshyTask(
  key: string,
  imageDataUris: string[],
  order: SealOrder,
): Promise<{ taskId: string } | Seal3dErrorResponse> {
  const res = await meshyJson(key, "/multi-image-to-3d", {
    method: "POST",
    timeoutMs: 30_000,
    body: JSON.stringify({
      image_urls: imageDataUris,
      texture_prompt: buildSeal3dTexturePrompt(order),
      ...CREATE_OPTIONS,
    }),
  });
  if (!res.ok) return classifyMeshyHttpError(res.status, res.bodyText);
  const created = res.body as { result?: string } | null;
  if (!created?.result) {
    return { success: false, error: "Meshy 创建响应缺少 result 字段", code: "unknown" };
  }
  return { taskId: created.result };
}

/** 查询任务状态 */
export async function getMeshyTask(key: string, taskId: string): Promise<MeshyTask | Seal3dErrorResponse> {
  const res = await meshyJson(key, `/multi-image-to-3d/${encodeURIComponent(taskId)}`, {
    method: "GET",
    timeoutMs: 15_000,
  });
  if (!res.ok) return classifyMeshyHttpError(res.status, res.bodyText);
  return res.body as MeshyTask;
}

/** 下载 glb 产物（Meshy CDN 签名 URL，3 天过期前必须取走） */
export async function downloadGlb(url: string): Promise<{ bytes: ArrayBuffer } | Seal3dErrorResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await outboundFetch(url, { signal: controller.signal });
    if (!res.ok) {
      return { success: false, error: `glb 下载失败 HTTP ${res.status}`, code: "transfer_failed" };
    }
    return { bytes: await res.arrayBuffer() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: /aborted|time[d]? ?out/i.test(message)
        ? "glb 下载超时"
        : `glb 下载失败：${message}`,
      code: /aborted|time[d]? ?out/i.test(message) ? "timeout" : "transfer_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
