import { createHash } from "node:crypto";
import type { SealOrder } from "@/lib/design/seal-order";
import type { Seal3dCreateResponse, Seal3dErrorResponse } from "@/types/seal-3d";
import { blobJobStore, findStoredModel, type JobStore } from "./job-store";
import { buildSeal3dTexturePrompt, CREATE_OPTIONS, RETEXTURE_OPTIONS, getMeshyBalance, getMeshyTask, type MeshyJobKind } from "./meshy-client";

/** 文字层不参与章体缓存；换印文无需重新建模或重贴石料。 */
export function seal3dJobHash(source: Buffer | string, order: SealOrder, seed: number, kind: MeshyJobKind = "model") {
  return createHash("sha256").update(JSON.stringify({
    version: 2, source: createHash("sha256").update(source).digest("hex"), seed, kind,
    material: buildSeal3dTexturePrompt(order), options: kind === "model" ? CREATE_OPTIONS : RETEXTURE_OPTIONS,
  })).digest("hex");
}

interface CreateJobOptions {
  hash: string;
  kind: MeshyJobKind;
  create: (key: string) => Promise<{ taskId: string } | Seal3dErrorResponse>;
}
interface Dependencies {
  store: JobStore;
  balance: typeof getMeshyBalance;
  enabled: boolean;
  apiKey: string | null;
  failedTask?: (key: string, taskId: string, kind: MeshyJobKind) => Promise<boolean>;
}

/** 收费调用仅在持久锁及余额检查均成功后执行；不确定结果保留锁。 */
export async function createSeal3dJob(options: CreateJobOptions, dependencies?: Dependencies): Promise<Seal3dCreateResponse | Seal3dErrorResponse> {
  const deps = dependencies ?? {
    store: blobJobStore, balance: getMeshyBalance,
    enabled: process.env.MESHY_GENERATION_ENABLED === "true",
    apiKey: process.env.MESHY_API_KEY?.trim() || null,
    failedTask: async (key: string, id: string, kind: MeshyJobKind) => {
      if (await findStoredModel(id, kind)) return false;
      const task = await getMeshyTask(key, id, kind);
      return "status" in task && (task.status === "FAILED" || task.status === "CANCELED");
    },
  };
  const cachedResponse = async (): Promise<Seal3dCreateResponse | Seal3dErrorResponse | null> => {
    const existing = await deps.store.read(options.hash);
    if (!existing) return null;
    if (existing.taskId) {
      if (deps.enabled && deps.apiKey && deps.failedTask && deps.store.clearSubmitted) {
        // 只有明确 FAILED/CANCELED 才释放旧任务；查询异常仍复用原编号。
        const failed = await deps.failedTask(deps.apiKey, existing.taskId, options.kind).catch(() => false);
        if (failed && await deps.store.clearSubmitted(options.hash, existing.taskId)) return null;
        if (failed) return { success: false, code: "creation_in_progress", error: "失败任务正在恢复，请稍后重试。" };
      }
      return { success: true, task_id: existing.taskId, status: "PENDING", poll_after_ms: 5000, kind: options.kind, cached: true };
    }
    const uncertain = Date.now() - existing.createdAt > 90_000;
    return { success: false, code: uncertain ? "creation_uncertain" : "creation_in_progress", error: uncertain ? "上次创建结果尚未确认。请核对 Meshy 任务记录后恢复，系统不会自动重复扣费。" : "相同效果图正在创建任务，请稍后再试。" };
  };
  const cached = await cachedResponse();
  if (cached) return cached;
  if (!deps.enabled) return { success: false, code: "generation_disabled", error: "当前环境尚未开放收费 3D 生成。" };
  if (!deps.apiKey) return { success: false, code: "meshy_unauthorized", error: "服务端未配置 MESHY_API_KEY。" };
  if (!await deps.store.claim(options.hash)) {
    return await cachedResponse() ?? { success: false, code: "creation_in_progress", error: "任务正在创建，请稍后再试。" };
  }
  // 余额查询和本地预处理失败尚未发送生成请求，可以释放创建锁。
  let balance;
  try { balance = await deps.balance(deps.apiKey); }
  catch { await deps.store.release(options.hash); return { success: false, code: "timeout", error: "余额查询失败，未发起生成。" }; }
  if (!("balance" in balance)) { await deps.store.release(options.hash); return balance; }
  const required = options.kind === "model" ? 30 : 10;
  if (balance.balance < required) {
    await deps.store.release(options.hash);
    return { success: false, code: "meshy_insufficient_credits", error: `Meshy 余额不足，本次需要约 ${required} credits，未发起生成。` };
  }
  try {
    const created = await options.create(deps.apiKey);
    if (!("taskId" in created)) {
      if (["invalid_input", "meshy_unauthorized", "meshy_insufficient_credits", "meshy_rate_limited"].includes(created.code)) await deps.store.release(options.hash);
      return created;
    }
    try { await deps.store.submit(options.hash, created.taskId); }
    catch { console.error(`[3d-model] 任务已创建但缓存记录失败，保留创建锁；hash=${options.hash} task=${created.taskId}`); }
    return { success: true, task_id: created.taskId, status: "PENDING", poll_after_ms: 5000, kind: options.kind, cached: false };
  } catch {
    return { success: false, code: "creation_uncertain", error: "创建请求中断，结果尚未确认。请核对 Meshy 任务记录，系统不会自动重复提交。" };
  }
}
