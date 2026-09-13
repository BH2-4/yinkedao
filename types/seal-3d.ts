/**
 * /api/3d-model 响应契约（印章 3D 效果图层 · B 线 Phase 1）。
 *
 * 异步任务制（与 Meshy 对齐）：
 *   POST /api/3d-model          → 创建建模任务，立即返回 task_id
 *   GET  /api/3d-model/{task_id} → 轮询状态；SUCCEEDED 时 glb 已转存
 *                                  @vercel/blob，返回长期有效的公开 URL
 *
 * 3 天过期约束的化解：Meshy 生成物 3 天过期，SUCCEEDED 后第一次 GET
 * 即下载转存 blob（幂等：pathname 锁定为 task_id），此后长期可访问。
 */

/** Meshy 任务状态（官方枚举，PENDING/IN_PROGRESS 为未终态） */
export type Seal3dTaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED";

/** POST /api/3d-model 成功响应 */
export type Seal3dCreateResponse = {
  success: true;
  /** Meshy 任务 id（前端据此轮询 GET /api/3d-model/{task_id}） */
  task_id: string;
  status: Extract<Seal3dTaskStatus, "PENDING" | "IN_PROGRESS">;
  /** 建议的下一次轮询间隔（毫秒）；Meshy 实测约 96s 出模 */
  poll_after_ms: number;
  kind?: "model" | "retexture";
  cached?: boolean;
};

/** GET /api/3d-model/{task_id} 成功响应（未终态 / 已完成） */
export type Seal3dStatusResponse =
  | {
      success: true;
      task_id: string;
      status: Extract<Seal3dTaskStatus, "PENDING" | "IN_PROGRESS">;
      /** Meshy 上报的 0-100 进度（PENDING 时为 0） */
      progress: number;
      poll_after_ms: number;
    }
  | {
      success: true;
      task_id: string;
      status: Extract<Seal3dTaskStatus, "SUCCEEDED">;
      progress: 100;
      /** 转存后的 blob 公开 URL（长期有效） */
      model_url: string;
      /** glb 字节数（前端展示体积、判断加载预期） */
      model_size: number;
      /** Meshy 缩略图（带 Expires 的临时 URL，仅即时预览用） */
      thumbnail_url: string | null;
    };

/** 两端点共用的失败 envelope（与全站 typed error 一致） */
export type Seal3dErrorResponse = {
  success: false;
  error: string;
  code:
    | "invalid_input"
    | "generation_disabled"
    | "creation_in_progress"
    | "creation_uncertain"
    | "meshy_unauthorized"
    | "meshy_insufficient_credits"
    | "meshy_rate_limited"
    | "meshy_task_failed"
    | "meshy_expired"
    | "transfer_failed"
    | "timeout"
    | "unknown";
};

export type Seal3dApiResponse =
  | Seal3dCreateResponse
  | Seal3dStatusResponse
  | Seal3dErrorResponse;

/** GET /api/3d-model/{task_id} 的完整响应（成功态或失败 envelope） */
export type Seal3dStatusApiResponse = Seal3dStatusResponse | Seal3dErrorResponse;
