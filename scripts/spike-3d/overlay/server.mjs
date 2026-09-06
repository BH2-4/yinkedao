/**
 * overlay spike 本地服务：静态文件 + 接收导出结果落盘。
 *
 *   GET /               → index.html
 *   GET /bundle.js      → esbuild 产物
 *   GET /seal.glb       → ../output/seal.glb（同源加载，无 CORS）
 *   GET /cell-r0c0.png  → ../output/cell-r0c0.png（印面占位贴图）
 *   POST /exported      → 导出 glb 二进制落盘 ../output/seal-overlay.glb
 *
 * 用法：node scripts/spike-3d/overlay/server.mjs （收到导出后自动退出）
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { createWriteStream } from "node:fs";
import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", "output");
const PORT = 8742;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
};

function sendFile(res, filePath) {
  try {
    const size = statSync(filePath).size;
    res.writeHead(200, {
      "content-type": MIME[filePath.slice(filePath.lastIndexOf("."))] ?? "application/octet-stream",
      "content-length": size,
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404).end("not found: " + filePath);
  }
}

const server = createServer((req, res) => {
  if (req.method === "GET") {
    const path = req.url === "/" ? "/index.html" : req.url;
    const map = { "/index.html": join(__dirname, "index.html"),
      "/bundle.js": join(__dirname, "bundle.js"),
      "/seal.glb": join(OUT, "seal.glb"),
      "/cell-r0c0.png": join(OUT, "cell-r0c0.png") };
    const file = map[path];
    if (file) return sendFile(res, file);
    return res.writeHead(404).end("no route: " + path);
  }

  if (req.method === "POST" && req.url === "/exported") {
    const out = join(OUT, "seal-overlay.glb");
    const ws = createWriteStream(out);
    let bytes = 0;
    req.on("data", (c) => (bytes += c.length));
    req.pipe(ws);
    ws.on("finish", () => {
      const source = statSync(join(OUT, "seal.glb")).size;
      console.log(`\n✅ 导出 glb 已落盘：${out}`);
      console.log(`   源     ${(source / 1048576).toFixed(1)} MB`);
      console.log(`   导出后 ${(bytes / 1048576).toFixed(1)} MB（膨胀 ${(bytes / source).toFixed(2)}x）`);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ savedBytes: bytes }));
      setTimeout(() => process.exit(0), 300);
    });
    return;
  }

  res.writeHead(405).end();
});

server.listen(PORT, () => console.log(`overlay spike server: http://127.0.0.1:${PORT}`));
