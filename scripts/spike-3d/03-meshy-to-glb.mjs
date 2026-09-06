/**
 * Meshy 多图转 3D spike —— node 编排 + curl 传输，零 npm 依赖。
 *
 * 为什么 HTTP 层用 curl 而不是 node fetch：
 *   本机 api.meshy.ai 直连被 DNS 污染（解析到无关 IP 段），必须走
 *   系统代理 127.0.0.1:12450；node fetch 经代理的 TLS 握手会被
 *   reset（NODE_USE_ENV_PROXY 下 ECONNRESET），而 curl 同路畅通
 *   （实测 404 根路径正常响应）。spike 以出结果为先，传输层交 curl。
 *
 * 链路：六格 PNG → base64 data URI → POST multi-image-to-3d（异步任务）
 *   → SSE stream 监听进度（不可用则退化 3s 轮询）→ glb 落盘
 *
 * 用法：
 *   MESHY_API_KEY=xxx node scripts/spike-3d/03-meshy-to-glb.mjs
 * 可选：HTTPS_PROXY=http://127.0.0.1:12450（不走代理的机器可不设）
 *       IMAGE_DIR / OUT_GLB 同旧版
 *
 * 注意：model_urls.glb 是带 Expires 的临时签名 URL——拿到后立刻下载
 *       （生产路径「即刻转存 Blob」的原因）。
 */

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGE_DIR = process.env.IMAGE_DIR ?? resolve(__dirname, "output");
const OUT_GLB = process.env.OUT_GLB ?? resolve(IMAGE_DIR, "seal.glb");
const API = "https://api.meshy.ai/openapi/v1";
const PROXY = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? "";

const key = process.env.MESHY_API_KEY;
if (!key) {
  console.error("✗ 缺少 MESHY_API_KEY（MESHY_API_KEY=xxx node scripts/spike-3d/03-meshy-to-glb.mjs）");
  process.exit(1);
}

const CURL_BASE = ["curl", "-sS", "--max-time", "590"];
if (PROXY) CURL_BASE.push("-x", PROXY);

/** curl 发 JSON 请求，返回解析后的 JSON。 */
function curlJson(method, url, body) {
  const args = [...CURL_BASE, "-X", method, url, "-H", `Authorization: Bearer ${key}`,
    "-H", "Content-Type: application/json", "-H", "Accept: application/json"];
  if (body) {
    const f = join(mkdtempSync(join(tmpdir(), "meshy-")), "body.json");
    writeFileSync(f, JSON.stringify(body));
    args.push("--data-binary", `@${f}`);
  }
  const out = execFileSync(args[0], args.slice(1), { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out);
}

/* ── 1. 六格 PNG → data URI（Meshy 官方支持 base64 data URI）── */

/* 实测约束（2026-09-06）：multi-image-to-3d 限 1-4 张图，六格全喂会被
 * 400 拒绝（"You must provide between 1 and 4 images"）。
 * 对齐生产 ABC 方案取 3 张（PANEL_LABELS 语义）：
 *   A 白底正面 cell-r0c0（几何主输入）
 *   B 低角度侧光 cell-r1c0（体积感）
 *   C 强光透射   cell-r1c1（质地/半透明度） */
const CELLS = ["cell-r0c0.png", "cell-r1c0.png", "cell-r1c1.png"];

console.log(`\n[1] 装配 3 格输入（ABC）${PROXY ? `（经代理 ${PROXY}）` : "（直连）"}`);
const imageUrls = CELLS.map((name) => {
  const buf = readFileSync(resolve(IMAGE_DIR, name));
  console.log(`  · ${name}  ${(buf.length / 1024).toFixed(0)} KB`);
  return `data:image/png;base64,${buf.toString("base64")}`;
});

/* ── 2. 建任务 ───────────────────────────────────────────────── */

console.log("\n[2] POST /multi-image-to-3d …");
const created = curlJson("POST", `${API}/multi-image-to-3d`, {
  image_urls: imageUrls,
  target_formats: ["glb"], // 只生成 glb，缩短任务时间（官方参数）
});
if (!created.result) {
  console.error(`✗ 建任务异常：${JSON.stringify(created).slice(0, 400)}`);
  process.exit(1);
}
const taskId = created.result;
console.log(`  task id: ${taskId}`);

/* ── 3. 监听：优先 SSE（curl -N 流式），失败退化轮询 ──────────── */

/** SSE：spawn curl -N，逐行解析 data: 帧；返回最终任务对象。 */
function waitViaSse(id) {
  return new Promise((resolveP, rejectP) => {
    const args = [...CURL_BASE, "-N", "-X", "GET", `${API}/multi-image-to-3d/${id}/stream`,
      "-H", `Authorization: Bearer ${key}`, "-H", "Accept: text/event-stream"];
    const child = spawn(args[0], args.slice(1));
    let last = null, buf = "";
    const timer = setTimeout(() => { child.kill(); rejectP(new Error("SSE 超时 8 分钟")); }, 8 * 60 * 1000);

    child.stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        try {
          const task = JSON.parse(line.slice(5).trim());
          if (task.status !== undefined) {
            last = task;
            console.log(`  [SSE] status=${task.status} progress=${task.progress ?? "?"}%`);
            if (["SUCCEEDED", "FAILED", "CANCELED"].includes(task.status)) {
              clearTimeout(timer); child.kill(); resolveP(task);
            }
          }
        } catch { /* 心跳/非 JSON 帧忽略 */ }
      }
    });
    child.stderr.on("data", (c) => console.error(`  [SSE stderr] ${c.toString().trim()}`));
    child.on("error", (e) => { clearTimeout(timer); rejectP(e); });
    child.on("close", () => { clearTimeout(timer); last ? resolveP(last) : rejectP(new Error("SSE 流结束但无数据")); });
  });
}

/** 轮询兜底（3s 间隔）。 */
async function waitViaPolling(id) {
  for (let i = 0; i < 160; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const task = curlJson("GET", `${API}/multi-image-to-3d/${id}`);
    console.log(`  [poll] status=${task.status} progress=${task.progress ?? "?"}%`);
    if (["SUCCEEDED", "FAILED", "CANCELED"].includes(task.status)) return task;
  }
  throw new Error("轮询超时（8 分钟）");
}

let task;
try {
  console.log("\n[3] 监听任务（SSE）…");
  task = await waitViaSse(taskId);
} catch (e) {
  console.log(`SSE 不可用（${e.message}），退化轮询…`);
  task = await waitViaPolling(taskId);
}

if (task.status !== "SUCCEEDED") {
  console.error(`✗ 任务终态 ${task.status}：${JSON.stringify(task.task_error ?? {})}`);
  process.exit(1);
}

/* ── 4. 下载 glb（临时签名 URL，即刻落盘）────────────────────── */

const glbUrl = task.model_urls?.glb;
if (!glbUrl) {
  console.error(`✗ 无 glb 产物：${JSON.stringify(Object.keys(task.model_urls ?? {}))}`);
  process.exit(1);
}
console.log(`\n[4] 下载 glb（任务产物 expires_at=${new Date(task.expires_at).toISOString()} 前有效）`);
execFileSync(CURL_BASE[0], [...CURL_BASE.slice(1), "-o", OUT_GLB, glbUrl]);
const mb = readFileSync(OUT_GLB).length / 1024 / 1024;
console.log(`✅ glb 已落盘：${OUT_GLB}  ${mb.toFixed(1)} MB`);
console.log(`   credits=${task.consumed_credits}  thumbnail=${task.thumbnail_url ? "有" : "无"}`);
