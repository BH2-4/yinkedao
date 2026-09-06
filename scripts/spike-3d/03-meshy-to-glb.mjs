/**
 * Meshy 多图转 3D spike —— 纯 node fetch，零 SDK（调研结论：Meshy 无官方
 * JS REST SDK，官方文档仅 curl 示例；data URI 与 SSE 均为官方支持）。
 *
 * 链路：六格 PNG → base64 data URI → POST multi-image-to-3d（异步任务）
 *   → SSE stream 监听进度（不可用则退化 3s 轮询）→ 下载 glb 落盘
 *
 * 用法（key 由环境注入，不进代码不进仓库）：
 *   MESHY_API_KEY=xxx node scripts/spike-3d/03-meshy-to-glb.mjs
 * 可选：IMAGE_DIR=... 格子目录（默认 scripts/spike-3d/output）
 *       OUT_GLB=...  glb 落盘路径（默认同目录 seal.glb）
 *
 * 注意：model_urls.glb 是带 Expires 的临时签名 URL，任务对象也有
 *       expires_at——拿到后立刻下载（生产路径即「即刻转存 Blob」的原因）。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGE_DIR = process.env.IMAGE_DIR ?? resolve(__dirname, "output");
const OUT_GLB = process.env.OUT_GLB ?? resolve(IMAGE_DIR, "seal.glb");
const API = "https://api.meshy.ai/openapi/v1";

const key = process.env.MESHY_API_KEY;
if (!key) {
  console.error("✗ 缺少 MESHY_API_KEY（MESHY_API_KEY=xxx node scripts/spike-3d/03-meshy-to-glb.mjs）");
  process.exit(1);
}

/* ── 1. 六格 PNG → data URI（ Meshy 官方支持 base64 data URI 入参）── */

const CELLS = [
  "cell-r0c0.png", "cell-r0c1.png",
  "cell-r1c0.png", "cell-r1c1.png",
  "cell-r2c0.png", "cell-r2c1.png",
];

const imageUrls = CELLS.map((name) => {
  const buf = readFileSync(resolve(IMAGE_DIR, name));
  console.log(`  · ${name}  ${(buf.length / 1024).toFixed(0)} KB`);
  return `data:image/png;base64,${buf.toString("base64")}`;
});

/* ── 2. 建任务 ───────────────────────────────────────────────── */

console.log("\nPOST /multi-image-to-3d …");
const created = await fetch(`${API}/multi-image-to-3d`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    image_urls: imageUrls,
    target_formats: ["glb"], // 只生成 glb，缩短任务时间（官方参数）
  }),
});

if (!created.ok) {
  console.error(`✗ 建任务失败 ${created.status}：${await created.text()}`);
  process.exit(1);
}
const { result: taskId } = await created.json();
console.log(`  task id: ${taskId}`);

/* ── 3. 监听：优先 SSE，失败退化轮询 ──────────────────────────── */

/** SSE 读任务流；返回最终任务对象。 */
async function waitViaSse(id) {
  const res = await fetch(`${API}/multi-image-to-3d/${id}/stream`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let last = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // SSE 帧：event: xxx\ndata: {...}\n\n
    for (const frame of buf.split("\n\n")) {
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      try {
        const task = JSON.parse(dataLine.slice(5).trim());
        if (task.progress !== undefined || task.status !== undefined) {
          last = task;
          const pct = task.progress ?? "?";
          console.log(`  [SSE] status=${task.status} progress=${pct}%`);
        }
      } catch {
        /* 心跳/非 JSON 帧忽略 */
      }
    }
    buf = buf.slice(buf.lastIndexOf("\n\n") + 2);
  }
  if (!last) throw new Error("SSE 流结束但未收到任务数据");
  return last;
}

/** 轮询兜底（3s 间隔 + 429 退避）。 */
async function waitViaPolling(id) {
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${API}/multi-image-to-3d/${id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.status === 429) {
      console.log("  [poll] 429 限流，退避 15s");
      await new Promise((r) => setTimeout(r, 15000));
      continue;
    }
    if (!res.ok) throw new Error(`poll ${res.status}`);
    const task = await res.json();
    console.log(`  [poll] status=${task.status} progress=${task.progress ?? "?"}%`);
    if (["SUCCEEDED", "FAILED", "CANCELED"].includes(task.status)) return task;
  }
  throw new Error("轮询超时（10 分钟）");
}

let task;
try {
  console.log("\n监听任务（SSE）…");
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
console.log(`\n下载 glb …（任务 expires_at=${new Date(task.expires_at).toISOString()} 前有效）`);
const glb = await fetch(glbUrl);
if (!glb.ok) {
  console.error(`✗ 下载失败 ${glb.status}`);
  process.exit(1);
}
const bytes = Buffer.from(await glb.arrayBuffer());
writeFileSync(OUT_GLB, bytes);
console.log(`✅ glb 已落盘：${OUT_GLB}  ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
console.log(`   credits=${task.consumed_credits}  签名 URL 时效内请及时转存`);
