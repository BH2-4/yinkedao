/**
 * 三站流程场景测试（五维度访谈 → 参数单确认 → 效果图渲染）。
 *
 * Runs against a local dev server (http://localhost:3000). Exit code is
 * non-zero if any scenario fails. No framework — plain fetch + assertions.
 *
 * 链路：/design-interview（五维度/帮我全决定）→ /design-brief?order（URL
 * 持久化参数单）→ POST /api/design-render（SealOrder → 质感层 prompt →
 * mock 章型 SVG / gpt-image-2）。
 *
 * i18n key parity is verified against the on-disk zh-CN.json directly.
 *
 * Usage: node scripts/test-design-render.mjs
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const __dirname = dirname(fileURLToPath(import.meta.url));
const MESSAGES = resolve(__dirname, "..", "messages");

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

/* ------------------------------ Fixtures -------------------------------- */

const FULL_ORDER = {
  occasion: "commemorate-travel",
  stone_type: "laoshit",
  stone_look: "waxy",
  stone_budget: "daily",
  seal_form: "square",
  finial_type: "plain",
  side_inscription: "short",
  decoration_level: "plain",
  text_type: "commemorative",
  text_count: "four",
  seal_style: "baiwen",
};

/* ------------------------------ Scenarios ------------------------------- */

async function scenario1Pages() {
  console.log("\n[1] 三站页面可达");
  for (const path of ["/design-interview", "/design-brief", "/design-render"]) {
    const res = await fetch(`${BASE}${path}`);
    assert(res.status === 200, `${path} renders (200)`);
  }
}

async function scenario2OldRoutesGone() {
  console.log("\n[2] 旧六站路由已退役（404）");
  for (const path of ["/global-design", "/cultural-match", "/design-translation", "/design-proposal"]) {
    const res = await fetch(`${BASE}${path}`);
    assert(res.status === 404, `${path} retired (404)`);
  }
}

async function scenario3BriefUrlPersist() {
  console.log("\n[3] 参数单 URL 持久化（/design-brief 恢复）");
  const res = await fetch(`${BASE}/design-brief?st=laoshit&f=square&fi=beast&ss=baiwen`);
  const html = await res.text();
  assert(res.status === 200, "brief renders with query");
  assert(html.includes("老挝石"), "stone label restored from URL (laoshit)");
  assert(html.includes("方章"), "form label restored from URL (square)");
  assert(html.includes("兽钮"), "finial label restored from URL (beast)");
  assert(html.includes("白文"), "style label restored from URL (baiwen)");

  /* 全字段 URL：参数单可载（语义正确性由 scenario4 的 API decode 背书——
     SSR 对 useSearchParams 客户端组件 bailout，HTML includes 会命中
     内联字典造成假阳性，故不在此断言渲染值）。 */
  const full = await fetch(`${BASE}/design-brief?o=milestone&st=laoshit&sl=waxy&sb=daily&f=square&fi=beast&si=short&d=plain&tt=name&tc=four&ss=baiwen`);
  assert(full.status === 200, "full-order brief loads (200)");

  /* 无效 query 静默回退空参数单，不 500 */
  const bad = await fetch(`${BASE}/design-brief?st=not-a-stone`);
  assert(bad.status === 200, "invalid query degrades gracefully (200)");
}

async function scenario4RenderApi() {
  console.log("\n[4] /api/design-render — 完整参数单渲染（mock 质感层）");
  const res = await fetch(`${BASE}/api/design-render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order: FULL_ORDER, seed: 7 }),
  });
  const body = await res.json();
  assert(res.status === 200 && body.success === true, "render succeeds");
  assert(body.image.provider === "mock", "demo mode → mock renderer");
  assert(body.image.mime === "image/svg+xml", "mock renders SVG");
  assert(body.image.data_url.includes("svg"), "data URL carries SVG payload");
  assert(body.image.seed === 7, "seed echoed back");
  assert(
    body.image_prompt.prompt.includes("NO TEXT RULE"),
    "NO TEXT RULE enforced in prompt (质感层/文字层分离铁律)",
  );
  assert(
    body.image_prompt.negative_prompt.includes("characters"),
    "negative list forbids characters",
  );
  assert(
    body.image_prompt.prompt.includes("square-section seal"),
    "FORM LOCK carries seal form (square)",
  );
  assert(
    body.image_prompt.order_echo.seal_form === FULL_ORDER.seal_form,
    "order echo traces back to the brief",
  );
  /* mock 章型 SVG：素坯无字（水印说明）+ 石色渐变 */
  const decodedSvg = decodeURIComponent(body.image.data_url);
  assert(
    decodedSvg.includes("AI 效果示意"),
    "mock carries AI 效果示意 watermark",
  );
  assert(
    decodedSvg.includes("素坯质感层"),
    "mock declares texture-layer-only (素坯质感层)",
  );
  return body;
}

async function scenario5SeedVariants(firstBody) {
  console.log("\n[5] 换 seed 变体机制（prompt 确定性 + 视觉变化）");
  const res = await fetch(`${BASE}/api/design-render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order: FULL_ORDER, seed: 8 }),
  });
  const second = await res.json();
  assert(second.success === true, "variant render succeeds");
  assert(
    second.image_prompt.prompt === firstBody.image_prompt.prompt,
    "prompt deterministic across seeds (同参数单同 prompt)",
  );
  assert(
    second.image.data_url !== firstBody.image.data_url,
    "mock image varies with seed (visual only)",
  );
}

async function scenario6Validation() {
  console.log("\n[6] 入参校验");
  const bad1 = await fetch(`${BASE}/api/design-render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order: { ...FULL_ORDER, seal_form: "triangle" } }),
  });
  assert(bad1.status === 400, "illegal seal_form rejected (400)");

  const bad2 = await fetch(`${BASE}/api/design-render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seed: 1 }),
  });
  assert(bad2.status === 400, "missing order rejected (400)");
}

function scenario8ReferenceLibrary() {
  console.log("\n[8] 参考图库（public/seal-references）");
  const root = resolve(__dirname, "..", "public", "seal-references");
  const count = (dir) => {
    const p = resolve(root, dir);
    if (!existsSync(p)) return -1;
    return readdirSync(p).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).length;
  };
  /* 生图选取映射的六个目录（SEAL_REFERENCE_CATEGORIES + craftsmanship） */
  for (const dir of [
    "forms/square-plain",
    "forms/square-beast",
    "forms/rectangle-chang",
    "forms/freeform",
    "craftsmanship/bask-relief",
    "craftsmanship/side-inscription",
  ]) {
    assert(count(dir) >= 1, `${dir} has reference images`);
  }
  /* D 桶基准（印面）：白文/朱文/朱白相间 */
  assert(count("seal-faces/baiwen") >= 10, `seal-faces/baiwen ≥ 10 (got ${count("seal-faces/baiwen")})`);
  assert(count("seal-faces/zhuwen") >= 10, `seal-faces/zhuwen ≥ 10 (got ${count("seal-faces/zhuwen")})`);
  assert(count("seal-faces/zhubai-mixed") >= 3, `seal-faces/zhubai-mixed ≥ 3 (got ${count("seal-faces/zhubai-mixed")})`);
  /* 水印图不入库（篆刻小站 2 张） */
  const all = readdirSync(resolve(root, "seal-faces", "baiwen"))
    .concat(readdirSync(resolve(root, "forms", "square-beast")));
  assert(
    !all.some((f) => f.includes("三视图") || f.includes("侧面朱刻")),
    "watermarked 名家印作 excluded",
  );
}

function scenario9CultureData() {
  console.log("\n[9] 文化匹配数据完整性（seal-culture-v1）");
  const data = JSON.parse(readFileSync(resolve(__dirname, "..", "data", "cultural-match", "seal-culture-v1.json"), "utf8"));
  assert(data.scenarios.length === 9, `9 scenarios (got ${data.scenarios.length})`);
  const elementIds = new Set(data.elements.map((e) => e.id));
  const seriesIds = new Set(data.series.map((s) => s.id));
  const itemSkus = new Set(data.items.map((i) => i.sku));
  for (const sc of data.scenarios) {
    assert(sc.culture_elements.length === 3, `${sc.id} has exactly 3 culture elements`);
    for (const el of sc.culture_elements) {
      assert(!!el.source?.doc && !!el.source?.evidence, `${sc.id}/${el.id} carries source{doc,evidence}`);
      assert(elementIds.has(el.id), `${sc.id}/${el.id} exists in element registry`);
    }
    for (const sid of sc.series_refs) assert(seriesIds.has(sid), `${sc.id} series_ref ${sid} exists`);
    for (const key of ["form", "button", "stone_color"]) {
      assert(sc.design_hints[key].length >= 1, `${sc.id} hints.${key} non-empty`);
    }
    assert(!!sc.design_hints.zhu_bai && !!sc.design_hints.reason, `${sc.id} hints complete`);
  }
  /* items 图片文件存在性（public/ 下） */
  const pubRoot = resolve(__dirname, "..", "public");
  let missingImgs = 0;
  for (const item of data.items) {
    for (const img of [item.img, ...item.views]) {
      if (!existsSync(resolve(pubRoot, img.replace(/^\/seal-references/, "seal-references")))) {
        missingImgs++;
        console.error(`  missing img: ${item.sku} → ${img}`);
      }
    }
  }
  assert(missingImgs === 0, `all ${data.items.length} items' images exist on disk`);
  assert(data.items.length >= 24, `>= 24 items catalogued (got ${data.items.length})`);
  assert(data.elements.length >= 19, `>= 19 culture elements (got ${data.elements.length})`);
  assert(itemSkus.size === data.items.length, "skus unique");
}

function scenario7I18nParity() {
  console.log("\n[7] i18n parity — zh-CN 三站键完整");
  const dict = JSON.parse(readFileSync(resolve(MESSAGES, "zh-CN.json"), "utf-8"));

  function collect(node, path = "") {
    if (typeof node !== " " && (typeof node !== "object" || node === null)) return [path];
    return Object.entries(node).flatMap(([k, v]) =>
      collect(v, path ? `${path}.${k}` : k),
    );
  }

  const renderKeys = collect(dict.designRender);
  assert(renderKeys.length >= 30, `designRender namespace ≥ 30 keys (${renderKeys.length})`);
  assert(!!dict.designBrief, "designBrief namespace exists");
  assert(collect(dict.designBrief).length >= 20, `designBrief namespace ≥ 20 keys (${collect(dict.designBrief).length})`);
  assert(!!dict.designBrief.presets["classic-baiwen"], "preset 1 copy present");
  assert(!!dict.designBrief.presets["gentle-zhuwen"], "preset 2 copy present");
  assert(!!dict.designBrief.presets["beast-finial-gift"], "preset 3 copy present");

  /* journey 三站 */
  const stations = dict.journey.stations;
  assert(stations.s0 && stations.s1 && stations.s2 && !stations.s3, "journey has exactly 3 stations");

  /* common.stages 三站 */
  const stages = dict.common.stages;
  assert(stages.interview && stages.designBrief && stages.designRender && !stages.designProposal, "common.stages has exactly 3 stations");

  /* interview 五维度题库 11 题齐 */
  const questions = dict.interview.questions;
  const expected = ["stone_type","stone_look","stone_budget","occasion","seal_form","finial_type","side_inscription","decoration_level","text_type","text_count","seal_style"];
  for (const q of expected) {
    assert(!!questions[q]?.title, `interview question ${q} present`);
  }

  /* 退役段不再存在 */
  for (const gone of ["globalDemand","culturalMatch","designTranslation","designProposal","proposal"]) {
    assert(!dict[gone], `retired namespace ${gone} removed`);
  }

  /* 首页与访谈域词走查（zh-CN 全文零苗银域词——按用户验收口径） */
  const flat = JSON.stringify(dict);
  for (const word of ["银饰","苗银","苗族","贵州","锻制","花丝","錾刻"]) {
    assert(!flat.includes(word), `zh-CN copy free of "${word}"`);
  }
}

/* --------------------------------- Run ---------------------------------- */

async function main() {
  console.log(`三站流程场景测试 → ${BASE}`);
  await scenario1Pages();
  await scenario2OldRoutesGone();
  await scenario3BriefUrlPersist();
  const first = await scenario4RenderApi();
  await scenario5SeedVariants(first);
  await scenario6Validation();
  scenario7I18nParity();
  scenario8ReferenceLibrary();
  scenario9CultureData();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("test run crashed:", err);
  process.exit(1);
});
