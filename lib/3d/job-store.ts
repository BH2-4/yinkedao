import { BlobNotFoundError, BlobPreconditionFailedError, del, get, head, put } from "@vercel/blob";
import { z } from "zod";

const JobSchema = z.object({
  state: z.enum(["creating", "submitted", "uncertain"]),
  taskId: z.string().optional(),
  createdAt: z.number(),
});
export type StoredJob = z.infer<typeof JobSchema>;
export interface JobStore {
  read(hash: string): Promise<StoredJob | null>;
  claim(hash: string): Promise<boolean>;
  submit(hash: string, taskId: string): Promise<void>;
  release(hash: string): Promise<void>;
  clearSubmitted?(hash: string, taskId: string): Promise<boolean>;
}
const jobPath = (hash: string) => `seal-3d/jobs/${hash}.json`;
export const modelPath = (id: string, kind = "model") => kind === "model" ? `seal-3d/${id}.glb` : `seal-3d/retexture/${id}.glb`;

/** 固定文件名 + 禁止覆盖是跨实例创建锁；读锁绕过 CDN 缓存。 */
export const blobJobStore: JobStore = {
  async read(hash) {
    const result = await get(jobPath(hash), { access: "public", useCache: false });
    if (!result) return null;
    if (result.statusCode !== 200) throw new Error("任务记录读取异常");
    return JobSchema.parse(await new Response(result.stream).json());
  },
  async claim(hash) {
    try {
      await put(jobPath(hash), JSON.stringify({ state: "creating", createdAt: Date.now() }), {
        access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: false,
      });
      return true;
    } catch (error) {
      // 仅已存在的记录视为竞争失败；鉴权或存储故障必须阻止收费请求。
      if (await this.read(hash)) return false;
      throw error;
    }
  },
  async submit(hash, taskId) {
    await put(jobPath(hash), JSON.stringify({ state: "submitted", taskId, createdAt: Date.now() }), {
      access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true,
    });
  },
  async release(hash) { await del(jobPath(hash)); },
  async clearSubmitted(hash, taskId) {
    const result = await get(jobPath(hash), { access: "public", useCache: false });
    if (!result || result.statusCode !== 200) return false;
    const job = JobSchema.parse(await new Response(result.stream).json());
    if (job.taskId !== taskId) return false;
    try { await del(result.blob.url, { ifMatch: result.blob.etag }); return true; }
    catch (error) { if (error instanceof BlobPreconditionFailedError || error instanceof BlobNotFoundError) return false; throw error; }
  },
};

export async function findStoredModel(id: string, kind = "model") {
  try { return await head(modelPath(id, kind)); }
  catch (error) { if (error instanceof BlobNotFoundError) return null; throw error; }
}
