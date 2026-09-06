/**
 * SealCulture-v1 数据完整性断言（E 批验收 · 可复跑）
 *
 * Usage: node scripts/verify-sealculture.mjs
 * 断言范围：
 *   1. source-first 100%：每个实体必带 source_ids（且全部可解析到 sources.json）
 *      与 evidence_level（枚举内）；每个 source 至少被一个实体引用（来源覆盖率 100%）。
 *   2. 实体数达标：sources ≥8 / motifs ≥15 / crafts ≥6 / heritage_items ≥10 /
 *      projects ≥1（带复核标注）/ regional_styles =0 / people =0 / rules ≥6。
 *   3. 引导层 cultural-match.json：9 场景 × 恰 3 元素、元素注册表/系列引用闭合、
 *      CE-01~CE-19 并入映射与 manifest 声明一致。
 *   4. 护栏预检：motif 描述（documented_meaning=null）不含「寓意/象征」词
 *      （guardrail RULE-007(d) 的数据侧预检）。
 *   5. manifest counts 与实际一致。
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA = resolve(ROOT, "data", "SealCulture-v1", "data");

let passed = 0;
let failed = 0;
const fails = [];
function assert(cond, label) {
  if (cond) {
    passed++;
  } else {
    failed++;
    fails.push(label);
    console.error(`  ✗ ${label}`);
  }
}
const load = (name) => JSON.parse(readFileSync(resolve(DATA, name), "utf8"));

const sources = load("sources.json");
const motifs = load("motifs.json");
const crafts = load("crafts.json");
const items = load("heritage_items.json");
const styles = load("regional_styles.json");
const projects = load("projects.json");
const people = load("people.json");
const rules = load("cultural_rules.json");
const cm = load("cultural-match.json");
const manifest = load("dataset_manifest.json");

const sourceIds = new Set(sources.map((s) => s.id));
const EVIDENCE = new Set(["official", "interview", "museum", "academic", "inference"]);

/* 1. source-first 100% */
const entityGroups = {
  motifs, crafts, heritage_items: items, projects, people,
};
let totalEntities = 0;
for (const [group, arr] of Object.entries(entityGroups)) {
  for (const e of arr) {
    totalEntities++;
    assert(
      Array.isArray(e.source_ids) && e.source_ids.length >= 1,
      `${group}/${e.id} carries non-empty source_ids`,
    );
    assert(
      (e.source_ids ?? []).every((id) => sourceIds.has(id)),
      `${group}/${e.id} source_ids all resolve (${(e.source_ids ?? []).join(",")})`,
    );
    assert(
      typeof e.evidence_level === "string" && EVIDENCE.has(e.evidence_level),
      `${group}/${e.id} evidence_level in enum (${e.evidence_level})`,
    );
  }
}
for (const r of rules) {
  totalEntities++;
  assert(Array.isArray(r.source_ids) && r.source_ids.length >= 1 && r.source_ids.every((id) => sourceIds.has(id)),
    `cultural_rules/${r.id} source_ids resolve`);
  assert(typeof r.evidence_level === "string" && EVIDENCE.has(r.evidence_level),
    `cultural_rules/${r.id} evidence_level in enum`);
}
console.log(`  · source-first 扫描实体 ${totalEntities} 个（含 rules）`);

const cited = new Set();
for (const arr of Object.values(entityGroups)) for (const e of arr) for (const id of e.source_ids ?? []) cited.add(id);
for (const r of rules) for (const id of r.source_ids ?? []) cited.add(id);
const uncited = [...sourceIds].filter((id) => !cited.has(id));
assert(uncited.length === 0, `every source cited by ≥1 entity (uncited: ${uncited.join(",") || "none"})`);

/* 2. 实体数达标 */
assert(sources.length >= 8, `sources ≥ 8 (got ${sources.length})`);
assert(motifs.length >= 15, `motifs ≥ 15 (got ${motifs.length})`);
assert(crafts.length >= 6, `crafts ≥ 6 (got ${crafts.length})`);
assert(items.length >= 10, `heritage_items ≥ 10 (got ${items.length})`);
assert(projects.length >= 1, `projects ≥ 1 (got ${projects.length})`);
assert(styles.length === 0, `regional_styles 空置 (got ${styles.length})`);
assert(people.length === 0, `people 空置 (got ${people.length})`);
assert(rules.length >= 6, `cultural_rules ≥ 6 (got ${rules.length})`);
const proj = projects[0];
assert(
  /复核/.test(`${proj?.batch ?? ""}${proj?.description ?? ""}`),
  "project carries 对外使用前需官方源复核 annotation",
);

/* 3. 引导层契约 */
const cmIds = new Set(cm.elements.map((e) => e.id));
assert(cm.scenarios.length === 9, `9 scenarios (got ${cm.scenarios.length})`);
assert(cm.elements.length >= 19, `elements ≥ 19 (got ${cm.elements.length})`);
assert(new Set(cm.items.map((i) => i.sku)).size === cm.items.length, "item skus unique");
for (const sc of cm.scenarios) {
  assert(sc.culture_elements.length === 3, `${sc.id} has exactly 3 culture elements`);
  for (const el of sc.culture_elements) {
    assert(!!el.source?.doc && !!el.source?.evidence, `${sc.id}/${el.id} carries source{doc,evidence}`);
    assert(cmIds.has(el.id), `${sc.id}/${el.id} exists in element registry`);
  }
  for (const sid of sc.series_refs) {
    assert(cm.series.some((s) => s.id === sid), `${sc.id} series_ref ${sid} exists`);
  }
}
/* CE 并入映射与 manifest 声明一致 */
const absorbed = manifest.domain_swap.ce_absorption.absorbed;
const ceToMotif = manifest.domain_swap.ce_absorption.ce_to_motif;
const f6Only = Object.keys(manifest.domain_swap.ce_absorption.f6_only);
const motifNames = new Set(motifs.map((m) => m.name));
for (const ce of absorbed) {
  const el = cm.elements.find((e) => e.id === ce);
  assert(!!el, `${ce} exists in F6 element registry`);
  assert(!!ceToMotif[ce], `${ce} has a CE→motif mapping in manifest`);
  assert(motifNames.has(ceToMotif[ce] ?? ""), `${ce} → motif "${ceToMotif[ce]}" exists in motifs.json`);
}
for (const ce of f6Only) {
  const el = cm.elements.find((e) => e.id === ce);
  assert(!!el && !motifNames.has(el.name), `${ce} stays F6-only (not absorbed)`);
}
const allCe = cm.elements.map((e) => e.id);
assert(
  allCe.every((id) => absorbed.includes(id) || f6Only.includes(id)),
  "every CE id accounted for in manifest absorption map",
);

/* 4. 护栏预检：motif 描述不含 寓意/象征（documented_meaning=null 时） */
for (const m of motifs) {
  assert(m.documented_meaning === null, `${m.id} documented_meaning honestly null`);
  assert(m.documented_visual_subject === true, `${m.id} documented as visual subject`);
  assert(!/寓意|象征/.test(m.description), `${m.id} description free of 寓意/象征 (meaning-less record)`);
}

/* 5. manifest counts 自洽 */
const actual = {
  sources: sources.length, motifs: motifs.length, crafts: crafts.length,
  heritage_items: items.length, regional_styles: styles.length,
  projects: projects.length, people: people.length, cultural_rules: rules.length,
};
for (const [k, v] of Object.entries(manifest.counts)) {
  assert(actual[k] === v, `manifest counts.${k} = ${v} matches actual ${actual[k]}`);
}

/* 6. SilverHeritage-GZ-v1 原样保留（F 批夹具，本批不删不改） */
const shDir = resolve(ROOT, "data", "SilverHeritage-GZ-v1");
const shFiles = ["README.md", "docs/schema.md", "data/dataset_manifest.json",
  "data/sources.json", "data/motifs.json", "data/crafts.json",
  "data/heritage_items.json", "data/regional_styles.json",
  "data/projects.json", "data/people.json", "data/cultural_rules.json"];
for (const f of shFiles) assert(existsSync(resolve(shDir, f)), `SilverHeritage preserved: ${f}`);

console.log(`\nverify-sealculture: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(fails.map((f) => `  FAIL: ${f}`).join("\n"));
  process.exit(1);
}
