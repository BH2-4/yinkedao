import "./lib/register-ts.cjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { createSeal3dJob, seal3dJobHash } = require("../lib/3d/create-job.ts");
const { emptySealOrder } = require("../lib/design/seal-order.ts");
const meshy = require("../lib/3d/meshy-client.ts");
const storeModule = require("../lib/3d/job-store.ts");
let assertions = 0;
const check = (condition, label) => { assertions++; assert.ok(condition, label); };
const taskId = "018a210d-8ba4-705c-b111-1f1776f7f578";
function memoryStore() {
  const entries = new Map();
  return {
    entries,
    async read(hash) { return entries.get(hash) ?? null; },
    async claim(hash) { if (entries.has(hash)) return false; entries.set(hash, { state: "creating", createdAt: Date.now() }); return true; },
    async submit(hash, taskId) { entries.set(hash, { state: "submitted", taskId, createdAt: Date.now() }); },
    async release(hash) { entries.delete(hash); },
    async clearSubmitted(hash, taskId) { if (entries.get(hash)?.taskId !== taskId) return false; entries.delete(hash); return true; },
  };
}
const order = { ...emptySealOrder(), stone_type: "changhua", stone_look: "waxy", seal_text: "刘雨茜", inscription_text: "纪念文字不得进入 Meshy" };
check(seal3dJobHash("photo", order, 21) === seal3dJobHash("photo", { ...order, seal_text: "印可道", seal_style: "zhuwen" }, 21), "换印文复用同一无字章体");
check(seal3dJobHash("photo", order, 21) !== seal3dJobHash("different-photo", order, 21), "换照片需新模型");
check(seal3dJobHash("photo", order, 21) !== seal3dJobHash("photo", { ...order, stone_type: "qingtian" }, 21), "材质变更不误命中");

let created = 0, balances = 0;
const store = memoryStore();
const deps = { store, enabled: true, apiKey: "offline-fixture", balance: async () => { balances++; return { balance: 100 }; } };
let finish;
const releaseCreation = new Promise((resolve) => { finish = resolve; });
const input = { hash: "same-input", kind: "model", create: async () => { created++; await releaseCreation; return { taskId }; } };
const requests = Array.from({ length: 8 }, () => createSeal3dJob(input, deps));
await new Promise((resolve) => setImmediate(resolve));
check(created === 1, "并发 8 次仅创建一个收费任务");
finish();
const results = await Promise.all(requests);
check(results.filter((r) => r.success).length === 1 && results.filter((r) => r.code === "creation_in_progress").length === 7, "竞争者看到正在创建");
const replay = await createSeal3dJob(input, { ...deps, enabled: false, apiKey: null });
check(replay.success && replay.cached && replay.task_id === taskId && created === 1 && balances === 1, "已建任务在关闸和无 Key 时仍可复用");

const noCredit = await createSeal3dJob({ ...input, hash: "no-credit" }, { ...deps, balance: async () => ({ balance: 29 }) });
check(noCredit.code === "meshy_insufficient_credits" && created === 1 && !store.entries.has("no-credit"), "余额不足不创建且释放锁");
const off = await createSeal3dJob({ ...input, hash: "disabled" }, { ...deps, enabled: false });
check(off.code === "generation_disabled" && !store.entries.has("disabled"), "收费默认关闭");
const offline = await createSeal3dJob({ ...input, hash: "offline-balance" }, { ...deps, balance: async () => { throw new Error("断网"); } });
check(offline.code === "timeout" && !store.entries.has("offline-balance"), "余额查询失败可安全重试");
const unknown = await createSeal3dJob({ ...input, hash: "uncertain", create: async () => { throw new Error("发送后连接中断"); } }, deps);
check(unknown.code === "creation_uncertain" && store.entries.has("uncertain"), "发送后超时保留锁，禁止自动再扣费");
let duplicate = false;
await createSeal3dJob({ ...input, hash: "uncertain", create: async () => { duplicate = true; return { taskId }; } }, deps);
check(!duplicate, "不确定任务重放不会创建第二单");
const brokenStore = { ...memoryStore(), claim: async () => { throw new Error("存储不可用"); } };
await assert.rejects(() => createSeal3dJob({ ...input, hash: "storage-down" }, { ...deps, store: brokenStore })); assertions++;
check(created === 1, "持久化不可用不发收费请求");
const failedStore = memoryStore();
await failedStore.submit("failed-task", taskId);
let retries = 0;
const retried = await createSeal3dJob({ hash: "failed-task", kind: "model", create: async () => { retries++; return { taskId }; } }, { ...deps, store: failedStore, failedTask: async () => true });
check(retried.success && retries === 1 && !retried.cached, "已明确失败的任务可在用户重新发起时安全重建");

const realFetch = globalThis.fetch;
const sent = [];
delete process.env.OUTBOUND_PROXY_URL;
globalThis.fetch = async (url, init) => {
  sent.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
  if (String(url).endsWith("/balance")) return Response.json({ balance: 100 });
  if (init?.method === "POST") return Response.json({ result: taskId });
  throw new Error("测试拒绝任何未声明的网络调用");
};
try {
  await meshy.createMeshyTask("offline-fixture", ["data:image/png;base64,offline"], order);
  await meshy.createMeshyRetextureTask("offline-fixture", "https://example.invalid/raw.glb", order);
  for (const call of sent) {
    const body = JSON.stringify(call.body);
    check(!body.includes(order.seal_text) && !body.includes(order.inscription_text), "印文及边款内容不进入 Meshy");
  }
  check(sent[1].body.texture_resolution === "4k" && sent[1].body.enable_original_uv && sent[1].body.enable_pbr, "重贴图保留几何 UV 并使用 4K PBR");
  check(sent[1].body.text_style_prompt.length <= 800, "重贴图提示词符合 API 长度限制");
  const originalFind = storeModule.findStoredModel;
  storeModule.findStoredModel = async () => ({ url: "https://example.invalid/cached.glb", size: 1234 });
  process.env.BLOB_READ_WRITE_TOKEN = "offline-fixture";
  delete process.env.MESHY_API_KEY;
  const { GET } = require("../app/api/3d-model/[id]/route.ts");
  const result = await GET(new Request(`http://localhost/api/3d-model/${taskId}`), { params: Promise.resolve({ id: taskId }) });
  check((await result.json()).status === "SUCCEEDED" && sent.length === 2, "转存模型在 Meshy 过期或缺 Key 时直接返回，不访问 Meshy");
  const invalid = await GET(new Request("http://localhost/api/3d-model/invalid"), { params: Promise.resolve({ id: "../invalid" }) });
  check(invalid.status === 400, "任务编号拒绝非法路径");
  storeModule.findStoredModel = originalFind;
} finally { globalThis.fetch = realFetch; }
console.log(`3D Phase 2：${assertions} 断言通过（全部离线，未调用 Meshy/Blob）。`);
