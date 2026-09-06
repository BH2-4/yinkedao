/**
 * SealCulture-v1 × heritage 三件套冒烟（E 批验收 · 可复跑）
 *
 * Usage: node scripts/smoke-sealculture-trio.mjs
 *
 * 目的：证明 lib/heritage/ 三件套（match/guardrail/evidence）机制在
 * SealCulture-v1 数据上照常工作——「换的是内容，不换的是机制」。
 *
 * 手法（不改 lib/heritage 任何一行、不走路由）：
 *   1. 用仓库内自带的 typescript 把 lib/heritage/*.ts 与
 *      lib/cultural-match/repository.ts 转译到临时目录（scripts/.tmp-trio-smoke，
 *      跑完即删）；
 *   2. 注册 Module._resolveFilename 钩子，把三件套仓库里写死的
 *      `@/data/SilverHeritage-GZ-v1/*` 重映射到 `data/SealCulture-v1/data/*`
 *      ——即"临时脚本 import 三件套指向新数据集"。M8 正式接线时由
 *      lib/heritage/repository.ts 改 import 路径完成，届时本脚本的重映射
 *      自动变成无操作（幂等可复跑）。
 *
 * 四例：
 *   [1] match     —— matchCulturalHeritage 在新数据集上产出 3 条文化方向匹配，
 *                     全部实体/来源可解析到 SealCulture-v1。
 *   [2] guardrail —— 合法匹配全过；库外编造元素（无来源+寓意断言+抬升断言级）
 *                     被 RULE-001/003/007 拦截。
 *   [3] evidence  —— 分级正确且只降不升：museum/academic→documented、
 *                     inference→interpretive、无来源→unknown；全库推导结果
 *                     永不出现 official；无 documented_meaning 的 motif 不产寓意事实。
 *   [4] 引导层     —— lib/cultural-match Zod 契约全过；纪念旅行场景出 3 卡 +
 *                     系列图（图片文件实存）；芯片回填不回归。
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TMP = resolve(__dirname, ".tmp-trio-smoke");
const require = createRequire(import.meta.url);

/* ---------------- 模块重映射钩子（指向新数据集） ---------------- */
const SILVER_PREFIX = "data/SilverHeritage-GZ-v1/";
const resolveOrig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) {
    let rel = request.slice(2);
    if (rel.startsWith(SILVER_PREFIX)) {
      rel = "data/SealCulture-v1/" + rel.slice(SILVER_PREFIX.length);
    }
    return resolveOrig.call(this, resolve(ROOT, rel), ...rest);
  }
  return resolveOrig.call(this, request, ...rest);
};

/* ---------------- 转译 lib 到临时目录 ---------------- */
function compile(relTs, outName) {
  const src = readFileSync(resolve(ROOT, relTs), "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  writeFileSync(resolve(TMP, outName), out);
}

const results = [];
let failed = 0;
function check(cond, label) {
  results.push({ cond, label });
  if (!cond) {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

try {
  mkdirSync(TMP, { recursive: true });
  for (const f of ["types", "evidence", "glossary", "repository", "match", "guardrail", "search"]) {
    compile(`lib/heritage/${f}.ts`, `${f}.js`);
  }
  compile("lib/cultural-match/repository.ts", "cm-repository.js");

  const repository = require(resolve(TMP, "repository.js"));
  const match = require(resolve(TMP, "match.js"));
  const guardrail = require(resolve(TMP, "guardrail.js"));
  const evidence = require(resolve(TMP, "evidence.js"));
  const cmRepo = require(resolve(TMP, "cm-repository.js"));

  const sealSources = new Set(
    JSON.parse(readFileSync(resolve(ROOT, "data/SealCulture-v1/data/sources.json"), "utf8")).map((s) => s.id),
  );
  const sealEntityIds = new Set();
  for (const f of ["motifs", "crafts", "heritage_items", "regional_styles", "projects", "people"]) {
    for (const e of JSON.parse(readFileSync(resolve(ROOT, `data/SealCulture-v1/data/${f}.json`), "utf8"))) {
      sealEntityIds.add(e.id);
    }
  }

  /* ─────────────── [1] match：新数据集上出场景匹配 ─────────────── */
  console.log("\n[1] match 引擎 —— SealCulture-v1 实体参与匹配");
  const brief = {
    market: "China",
    consumer_profile: "为纪念旅行定制印章的年轻旅行者，偏好清雅",
    product_type: "square",
    style: ["minimal", "refined"],
    occasion: "travel",
    emotion: ["connection"],
    cultural_interest: "open to subtle seal-culture motifs",
    cultural_visibility: "balanced",
    wearability: "medium",
    complexity: "medium",
    size_preference: "medium",
    weight_preference: "medium",
    price_sensitivity: "medium",
    design_keywords: ["seal", "travel", "stone"],
    avoid: [],
    confidence: 0.8,
    reasoning: "smoke test brief",
    inspiration_analysis: null,
  };
  const matches = match.matchCulturalHeritage(brief);
  check(matches.length === 3, `match returns Top-3 directions (got ${matches.length})`);
  for (const m of matches) {
    check(sealEntityIds.has(m.id), `match ${m.id} (${m.name}) is a SealCulture-v1 entity`);
    check(
      m.source_ids.length >= 1 && m.source_ids.every((id) => sealSources.has(id)),
      `match ${m.id} source_ids resolve in SealCulture-v1 sources`,
    );
    check(
      m.match_score >= 0 && m.match_score <= 100 && m.evidence_level.length > 0,
      `match ${m.id} score/evidence well-formed (score=${m.match_score}, level=${m.evidence_level})`,
    );
  }
  console.log(
    `  · top: ${matches.map((m) => `${m.name}[${m.type}]${m.match_score}`).join(" | ")}`,
  );

  /* ─────────────── [2] guardrail：拦截库外编造元素 ─────────────── */
  console.log("\n[2] guardrail —— 合法匹配放行，库外编造元素拦截");
  const legit = guardrail.runCulturalGuardrail(matches);
  check(legit.passed === true, `legit matches pass guardrail (warnings: ${legit.warnings.length})`);

  const fabricated = {
    id: "FAKE-001",
    name: "貔貅钮招财印",
    type: "motif",
    region: null,
    product_compatibility: "compatible",
    match_score: 99,
    score_breakdown: {},
    score_breakdown_weighted: {},
    matched_reasons: ["貔貅钮象征招财纳福，刻上即保平安"],
    cultural_evidence: ["貔貅钮寓意招财纳福——库外编造元素，数据集无此条目"],
    cultural_meaning: null,
    meaning_status: "not_documented",
    source_ids: ["SRC-999"],
    evidence_level: "official",
    region_info: { raw: null, province: null, prefecture: null, county: [], subregions: [], unattributed: true },
    why: {
      preference_links: [],
      visual_links: [],
      cultural_facts: [
        {
          sourceId: "SRC-999",
          sourceTitle: null,
          sourceType: null,
          claim: "貔貅钮象征招财纳福",
          claimLevel: "official",
          region: null,
          relatedMotifs: ["貔貅"],
          citation: null,
        },
      ],
      cultural_claim_level: "official",
      design_suggestions: [],
      cultural_boundary: "culturalMatch.why.boundaryVisualOnly",
    },
    claim_level: "official",
  };
  const blocked = guardrail.runCulturalGuardrail([fabricated]);
  check(blocked.passed === false, "fabricated out-of-library element is intercepted (passed=false)");
  const failedRules = blocked.checks.filter((c) => !c.passed).map((c) => c.rule_id);
  check(failedRules.includes("RULE-001"), `RULE-001 catches unresolvable source SRC-999 (failed: ${failedRules.join(",")})`);
  check(failedRules.includes("RULE-003"), `RULE-003 catches 象征 claim without documented meaning`);
  check(failedRules.includes("RULE-007"), `RULE-007 catches fabricated source + claim integrity`);

  /* ─────────────── [3] evidence：分级正确、只降不升 ─────────────── */
  console.log("\n[3] evidence —— claim 分级映射与只降不升");
  check(evidence.claimLevelFromEvidence("official", 2) === "official", "official + sourced → official");
  check(evidence.claimLevelFromEvidence("museum", 1) === "documented", "museum → documented");
  check(evidence.claimLevelFromEvidence("academic", 2) === "documented", "academic → documented");
  check(evidence.claimLevelFromEvidence("inference", 1) === "interpretive", "inference → interpretive");
  check(evidence.claimLevelFromEvidence("museum", 0) === "unknown", "no sources → unknown (无来源不抬升)");
  check(evidence.strongestClaimLevel([]) === "unknown", "empty facts → unknown");
  check(
    evidence.strongestClaimLevel([{ claimLevel: "visual_only" }, { claimLevel: "interpretive" }]) === "interpretive",
    "strongest level derived from facts only, ≤ documented",
  );
  check(
    evidence.strongestClaimLevel([{ claimLevel: "visual_only" }]) === "visual_only",
    "visual_only stays visual_only",
  );

  // 全库扫描：SealCulture-v1 无 official 源 → 推导结果永不出现 official（结构性只降不升）
  let nonOfficial = true;
  let sawAny = false;
  for (const f of ["motifs", "crafts", "heritage_items", "projects"]) {
    for (const e of JSON.parse(readFileSync(resolve(ROOT, `data/SealCulture-v1/data/${f}.json`), "utf8"))) {
      sawAny = true;
      const cl = evidence.claimLevelFromEvidence(e.evidence_level, e.source_ids.length);
      if (cl === "official") nonOfficial = false;
    }
  }
  check(sawAny && nonOfficial, "全库推导永不产生 official 断言（断言强度只降不升）");

  // 无 documented_meaning 的 motif：只产生视觉存在事实，不产寓意事实
  const sealMotif = repository.loadMotifs().find((m) => m.id === "MOTIF-014");
  check(!!sealMotif && sealMotif.documented_meaning === null, "loadMotifs reads SealCulture-v1 (MOTIF-014 乾卦团纹饰面, meaning null)");
  const facts = evidence.motifFacts(sealMotif);
  check(facts.length === 1, `meaning-less motif emits NO meaning fact (got ${facts.length})`);
  check(facts[0].claim === sealMotif.description, "claim is verbatim dataset text");
  check(
    facts[0].sourceId !== null && sealSources.has(facts[0].sourceId),
    `fact source resolves in SealCulture-v1 (${facts[0].sourceId})`,
  );

  /* ─────────────── [4] 引导层：Zod 契约 + 纪念旅行 3 卡 + 系列图 ─────────────── */
  console.log("\n[4] cultural-match 引导层 —— Zod 契约 / 纪念旅行 / 芯片回填");
  const culture = cmRepo.loadSealCulture();
  check(culture.scenarios.length === 9 && culture.elements.length >= 19, "loadSealCulture validates via Zod (9 scenarios / ≥19 elements)");
  const travel = cmRepo.scenariosForOccasion("commemorate-travel");
  check(travel.length === 1 && travel[0].id === "travel-memento", "纪念旅行 → travel-memento 场景");
  check(travel[0].culture_elements.length === 3, `纪念旅行场景出 3 张文化元素卡 (got ${travel[0].culture_elements.length})`);
  const seriesItems = cmRepo.itemsForSeries(travel[0].series_refs);
  check(seriesItems.length >= 1, `系列关联成品 ≥1 (got ${seriesItems.length})`);
  const missingImg = seriesItems.filter((i) => !existsSync(resolve(ROOT, "public", i.img.replace(/^\//, ""))));
  check(missingImg.length === 0, `系列图文件全部实存 (missing: ${missingImg.map((i) => i.sku).join(",") || "none"})`);
  check(!!cmRepo.getSeries("landscape-mood"), "getSeries(landscape-mood) 非空");
  check(
    JSON.stringify(cmRepo.hintToPatch("form", "随形章")) === JSON.stringify({ field: "seal_form", token: "freeform" }),
    "hintToPatch 芯片回填不回归",
  );

  /* ---------------- 汇总 ---------------- */
  const total = results.length;
  console.log(`\nsmoke-sealculture-trio: ${total - failed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("  ✓ 三件套机制在 SealCulture-v1 数据上照常工作（换的是内容，不换的是机制）");
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
