/**
 * 崇曦栈印蜕渲染场景测试（FONT_STACK=chongxi 专用）。
 *
 * Runs against a local dev server (http://localhost:3000) started with
 * SEAL_FONT_STACK=chongxi（字体资产在 assets/fonts/chongxi/）。
 * Exit code is non-zero if any scenario fails. No framework — plain
 * fetch + assertions（与 test-design-render.mjs 同模式）。
 *
 * 覆盖（INTEGRATION-CHONGXI.md §7 步骤②④的核心链路验收）：
 *   [1] 简繁前置映射（刘雨茜→劉雨茜；发→發词典首选）
 *   [2] cmap 命中取形 + SVG 拼装（视觉规格要素 + 确定性：同输入同输出）
 *   [3] 缺字如实告知（绝不造字：missing 回报 + 其余字照排）
 *   [4] 参数校验（空/超字数/非法参数 → typed error envelope）
 *   [5] 朱白两式与变体 seed（换 seed 变体、朱白切换有效）
 *
 * Usage: SEAL_FONT_STACK=chongxi npm run dev &
 *        node scripts/test-seal-face.mjs
 */

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

async function postSealFace(body) {
  const res = await fetch(`${BASE}/api/seal-face`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

function decodeDataUrl(dataUrl) {
  const payload = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Buffer.from(payload, "base64").toString("utf-8");
}

/* ------------------------------ Scenarios ------------------------------- */

async function scenario1VariantMap() {
  console.log("\n[1] 简繁前置映射（OpenCC s2t 基线）");
  const { status, body } = await postSealFace({ text: "刘雨茜" });
  assert(status === 200 && body.success === true, "刘雨茜 → 200 success");
  if (!body.success) return;
  assert(body.mapped_text === "劉雨茜", `mapped = 劉雨茜 (got ${body.mapped_text})`);
  assert(
    body.mapping_changes.length === 1 &&
      body.mapping_changes[0].from === "刘" &&
      body.mapping_changes[0].to === "劉",
    "mapping_changes = [刘→劉]（雨茜无简繁差异不记录）",
  );
  assert(body.missing.length === 0, "劉雨茜 cmap 全命中（missing 为空）");

  const fa = await postSealFace({ text: "发" });
  assert(
    fa.status === 200 &&
      fa.body.success &&
      fa.body.mapped_text === "發",
    "发 → 發（一对多取词典首选）",
  );

  const nonHan = await postSealFace({ text: "印A" });
  assert(
    nonHan.status === 200 &&
      nonHan.body.success &&
      nonHan.body.mapping_changes.every((c) => c.from !== "A"),
    "非汉字透传（A 不进映射）",
  );
}

async function scenario2SvgCompose() {
  console.log("\n[2] cmap 取形 + SVG 拼装（视觉规格要素 + 确定性）");
  const { status, body } = await postSealFace({ text: "劉雨茜", seed: 21 });
  assert(status === 200 && body.success === true, "劉雨茜 → 200 success");
  if (!body.success) return;
  assert(
    body.fontStack === "chongxi" &&
      body.font.num_glyphs === 11603 &&
      body.font.outlines_format === "truetype",
    "字体元信息（11603 glyphs / truetype）",
  );

  const svg = decodeDataUrl(body.svg.data_url);
  assert(svg.startsWith("<svg"), "dataUrl 解码为 SVG 文档");
  assert(svg.includes("#a83527") && svg.includes("#f7f0e2"), "印泥红/纸色同源规格");
  assert(svg.includes("feTurbulence") && svg.includes("feDisplacementMap"), "carved 滤镜参数在位");
  assert(svg.includes("rotate(-2"), "印蜕 -2° 旋转");
  /* 字形 path 带 transform（墨迹紧凑映射）；边框 path 无 transform——据此区分 */
  const glyphPaths = (svg.match(/<path [^>]*transform="translate/g) ?? []).length;
  assert(glyphPaths === 3, `三字三 path（墨迹紧凑，got ${glyphPaths}）`);
  assert((svg.match(/<ellipse /g) ?? []).length === 254, "斑驳 210+44 ellipse 同密度");

  /* 确定性：同输入同输出（路线 A 的 CI 门禁前提） */
  const again = await postSealFace({ text: "劉雨茜", seed: 21 });
  assert(
    again.status === 200 &&
      again.body.success &&
      again.body.svg.data_url === body.svg.data_url,
    "确定性：同 seed 同输入 → 逐字节一致",
  );

  const variant = await postSealFace({ text: "劉雨茜", seed: 22 });
  assert(
    variant.status === 200 &&
      variant.body.success &&
      variant.body.svg.data_url !== body.svg.data_url,
    "换 seed → 变体（dataUrl 变化）",
  );
}

async function scenario3MissingHonesty() {
  console.log("\n[3] 缺字如实告知（绝不造字）");
  /* emoji 非 cmap 收录的确定缺字（非汉字透传映射层，cmap 必未命中） */
  const { status, body } = await postSealFace({ text: "印😀" });
  assert(status === 200 && body.success === true, "含缺字请求 → 仍 200 success");
  if (!body.success) return;
  assert(
    body.missing.length === 1 && body.missing[0] === "😀",
    "missing = [😀]（如实回报）",
  );
  const svg = decodeDataUrl(body.svg.data_url);
  const glyphPaths = (svg.match(/<path [^>]*transform="translate/g) ?? []).length;
  assert(glyphPaths === 1, `缺字格留空（仅「印」一字 path，got ${glyphPaths}）`);

  /* 映射后仍缺的如实链路：U+4DB0（扩展 A 区生僻字，篆体必缺） */
  const obscure = await postSealFace({ text: "印䶰" });
  assert(
    obscure.status === 200 &&
      obscure.body.success &&
      obscure.body.missing.includes("䶰"),
    "扩展 A 区生僻字 → missing 如实回报",
  );
}

async function scenario4Validation() {
  console.log("\n[4] 参数校验（typed error envelope）");
  const empty = await postSealFace({ text: "" });
  assert(empty.status === 400 && empty.body.code === "invalid_input", "空文本 → 400 invalid_input");

  const spaces = await postSealFace({ text: "   " });
  assert(spaces.status === 400, "纯空白 → 400");

  const tooLong = await postSealFace({ text: "天下太平印" });
  assert(tooLong.status === 400 && tooLong.body.code === "invalid_input", "5 字 → 400");

  const badStyle = await postSealFace({ text: "印", style: "reverse" });
  assert(badStyle.status === 400, "非法朱白值 → 400");

  const badFreedom = await postSealFace({ text: "印", freedom: 101 });
  assert(badFreedom.status === 400, "freedom 越界 → 400");
}

async function scenario5Styles() {
  console.log("\n[5] 朱白两式");
  const baiwen = await postSealFace({ text: "天下太平", style: "baiwen", texture: false });
  const zhuwen = await postSealFace({ text: "天下太平", style: "zhuwen", texture: false });
  assert(baiwen.status === 200 && baiwen.body.success, "白文 → 200");
  assert(zhuwen.status === 200 && zhuwen.body.success, "朱文 → 200");
  if (!baiwen.body.success || !zhuwen.body.success) return;
  const bw = decodeDataUrl(baiwen.body.svg.data_url);
  const zw = decodeDataUrl(zhuwen.body.svg.data_url);
  assert(
    (bw.match(/<ellipse /g) ?? []).length === 0 &&
      (zw.match(/<ellipse /g) ?? []).length === 0,
    "texture=false → 斑驳关闭",
  );
  assert(bw !== zw, "朱白两式 SVG 不同（配色生效）");
}

/* ------------------------------ Run ------------------------------------- */

async function main() {
  console.log(`崇曦栈印蜕渲染场景测试 → ${BASE}`);
  await scenario1VariantMap();
  await scenario2SvgCompose();
  await scenario3MissingHonesty();
  await scenario4Validation();
  await scenario5Styles();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("测试脚本异常:", err);
  process.exit(1);
});
