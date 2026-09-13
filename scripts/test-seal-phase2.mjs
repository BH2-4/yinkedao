import "./lib/register-ts.cjs";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import sharp from "sharp";
const require = createRequire(import.meta.url);
const { mapForChongxi } = require("../lib/seal-face/variant-map.ts");
const { lookupChongxiGlyph } = require("../lib/seal-face/glyph-chongxi.ts");
const { resolveSealFontStack } = require("../lib/seal-face/font-stack.ts");
const { renderSealFace } = require("../lib/seal-face/render.ts");
const { POST } = require("../app/api/seal-face/route.ts");
const fixture = JSON.parse(readFileSync(new URL("./fixtures/seal-name-500.json", import.meta.url), "utf8"));
const options = { text: "刘雨茜", style: "zhuwen", texture: true, freedom: 50, seed: 21 };
const decode = (url) => Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
const paths = (url) => decode(url).toString("utf8").match(/<path [^>]*transform="translate[^>]*>/g) ?? [];
let assertions = 0;
function check(condition, message) { assertions++; assert.ok(condition, message); }

delete process.env.SEAL_FONT_STACK;
delete process.env.SEAL_CHONGXI_FONT_PATH;
check(resolveSealFontStack().stack === "chongxi", "默认使用崇曦");
process.env.SEAL_FONT_STACK = "yishan";
check(resolveSealFontStack().stack === "yishan", "显式应急开关");
process.env.SEAL_FONT_STACK = "chongxi";
process.env.SEAL_CHONGXI_FONT_PATH = "missing-font-for-offline-test.otf";
check(resolveSealFontStack().fallback, "资产缺失回退");
delete process.env.SEAL_CHONGXI_FONT_PATH;

const chars = [...fixture.characters];
check(chars.length === 500 && new Set(chars).size === 500, "500 个不重复姓名用字");
check(mapForChongxi(chars.join("")).mapped === fixture.expected_mapping, "映射不静默漂移");
let covered = 0;
for (const c of chars) {
  const mapped = mapForChongxi(c).mapped;
  const glyph = await lookupChongxiGlyph(mapped);
  check(glyph.ok === !fixture.expected_missing.includes(c), `${c}→${mapped} 收录状态符合冻结记录`);
  if (glyph.ok) covered++;
}
check(fixture.known_missing.length === 20, "20 个已知缺字");
for (const c of fixture.known_missing) {
  const result = await renderSealFace({ ...options, text: `印${c}道`, include_textures: true });
  check(result.missing.includes(mapForChongxi(c).mapped), `缺字 ${c} 如实回报`);
  check(result.textures === null, `缺字 ${c} 不生成合成贴图`);
}

const full = await renderSealFace(options);
const missingMiddle = await renderSealFace({ ...options, text: "刘😀茜" });
check(paths(full.svg.data_url)[2] === paths(missingMiddle.svg.data_url)[1], "中间缺字时第三字保留原格位");
check((await renderSealFace(options)).svg.data_url === full.svg.data_url, "同输入输出一致");
check((await renderSealFace({ ...options, seed: 22 })).svg.data_url !== full.svg.data_url, "换 seed 改变章法及做旧");
check(full.mapped_text === "劉雨茜" && full.missing.length === 0, "计划中的劉雨茜样本取形完整");

for (const style of ["zhuwen", "baiwen"]) {
  const clean = await renderSealFace({ ...options, style, texture: false, include_textures: true });
  const worn = await renderSealFace({ ...options, style, texture: true, include_textures: true });
  check(clean.textures?.size === 1024 && worn.textures?.size === 1024, `${style} 贴图为 1024 像素`);
  const normal = await sharp(decode(worn.textures.front)).ensureAlpha().raw().toBuffer();
  const reflected = await sharp(decode(worn.textures.mirrored)).ensureAlpha().raw().toBuffer();
  const cleanPixels = await sharp(decode(clean.textures.front)).ensureAlpha().raw().toBuffer();
  let cleanInk = 0, wornInk = 0, mirroredDiff = 0;
  for (let i = 0; i < normal.length; i += 4) {
    if (normal[i] > normal[i + 1] * 1.3) wornInk += normal[i + 3];
    if (cleanPixels[i] > cleanPixels[i + 1] * 1.3) cleanInk += cleanPixels[i + 3];
    const pixel = i / 4, y = Math.floor(pixel / 1024), x = pixel % 1024;
    const j = (y * 1024 + 1023 - x) * 4;
    for (let c = 0; c < 4; c++) mirroredDiff += Math.abs(normal[i + c] - reflected[j + c]);
  }
  const wearRatio = 1 - wornInk / cleanInk;
  check(wearRatio > 0.005 && wearRatio < 0.15, `${style} 做旧有可测损耗且保留笔画 (${(wearRatio * 100).toFixed(2)}%)`);
  check(mirroredDiff / normal.length < 1, `${style} 印面为正字贴图的镜像`);
}
for (const body of [{ text: "" }, { text: "天下太平印" }, { text: "印", seed: -1 }]) {
  const res = await POST(new Request("http://localhost/api/seal-face", { method: "POST", body: JSON.stringify(body) }));
  check(res.status === 400, "非法印文或参数返回 400");
}
console.log(`字体 Phase 2：${assertions} 断言通过；姓名字集 ${covered}/500 收录，${500 - covered} 个缺字已明示；20 个缺字回归通过。`);
