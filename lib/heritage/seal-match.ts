import type { SealOrder } from "@/lib/design/seal-order";
import { loadMotifs } from "./repository";
import { boundaryKeyForMeaningStatus, motifFacts, strongestClaimLevel } from "./evidence";
import { runCulturalGuardrail } from "./guardrail";
import { MATCH_WEIGHTS, type CulturalMatchResult, type ScoreBreakdown } from "./types";

/** 偏好相关性仅用于排序；文化事实保留资料原文并通过现有护栏。 */
export function matchSealCulture(order: SealOrder) {
  const priorities: string[] = [];
  if (order.occasion === "commemorate-travel" || order.side_inscription === "short" || order.side_inscription === "long") priorities.push("MOTIF-001");
  if (order.seal_form === "freeform") priorities.push("MOTIF-003");
  if (order.seal_form === "rectangle") priorities.push("MOTIF-009");
  if (order.occasion === "gift" || order.occasion === "milestone") priorities.push("MOTIF-004");
  if (order.text_type === "studio" || order.occasion === "self-use") priorities.push("MOTIF-013");
  if (order.decoration_level === "partial-relief") priorities.push("MOTIF-002");
  if (order.finial_type === "dragon") priorities.push("MOTIF-005");
  if (order.text_count === "four" || order.seal_form === "square") priorities.push("MOTIF-006");
  if (order.seal_style === "zhuwen" || order.seal_style === "baiwen") priorities.push("MOTIF-010");
  const ids = [...new Set([...priorities, "MOTIF-006", "MOTIF-010", "MOTIF-003"])];
  const motifs = new Map(loadMotifs().map((m) => [m.id, m]));
  const matches: CulturalMatchResult[] = [];
  for (const id of ids) {
    const motif = motifs.get(id);
    if (!motif) continue;
    const facts = motifFacts(motif);
    const level = strongestClaimLevel(facts);
    const meaning = motif.documented_meaning === null ? "not_documented" : "documented";
    const score: ScoreBreakdown = { visual_style_fit: 0.5, product_fit: 1, wearability_fit: 0.5, regional_fit: 0, keyword_fit: priorities.includes(id) ? 1 : 0, evidence_confidence: level === "documented" ? 0.8 : 0.4 };
    const weighted = Object.fromEntries(Object.entries(score).map(([key, value]) => [key, value * MATCH_WEIGHTS[key as keyof ScoreBreakdown]])) as ScoreBreakdown;
    const match: CulturalMatchResult = {
      id, name: motif.name, type: "motif", region: motif.region, product_compatibility: "compatible",
      match_score: Math.round(Object.values(weighted).reduce((a, b) => a + b, 0)),
      score_breakdown: score, score_breakdown_weighted: weighted,
      matched_reasons: [priorities.includes(id) ? "依据已选择的用途、形制或装饰偏好推荐，供设计参考。" : "印章设计的基础参考，具体方案由你确认。"],
      cultural_evidence: facts.map((f) => f.claim), cultural_meaning: motif.documented_meaning,
      meaning_status: meaning, source_ids: motif.source_ids, evidence_level: motif.evidence_level,
      region_info: { raw: motif.region, province: null, prefecture: null, county: [], subregions: [], unattributed: true },
      why: { preference_links: priorities.includes(id) ? [order.occasion, order.seal_form] : [], visual_links: [], cultural_facts: facts, cultural_claim_level: level, design_suggestions: [], cultural_boundary: boundaryKeyForMeaningStatus(meaning) },
      claim_level: level,
    };
    // 单条不合格直接淘汰，再从候选补足；不向用户回显失败断言。
    if (runCulturalGuardrail([match]).passed) matches.push(match);
    if (matches.length === 3) break;
  }
  const guardrail = runCulturalGuardrail(matches);
  return { matches: guardrail.passed ? matches : [], guardrail };
}
