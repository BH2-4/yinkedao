import type { GlobalDesignBrief } from "@/lib/ai/schemas";
import {
  CATEGORY_EVERYDAY,
  CRAFT_AESTHETICS,
  ITEM_KEYWORDS,
  ITEM_ORNATE,
  PRODUCT_CATEGORY_FIT,
  PRODUCT_TERMS,
  REGION_PROFILE,
  classifyItemProductCompatibility,
  deriveBriefSignals,
  extractRegions,
  motifAffinity,
  type BriefSignals,
} from "./glossary";
import {
  loadCrafts,
  loadHeritageItems,
  loadMotifs,
  loadProjects,
  loadRegionalStyles,
} from "./repository";
import {
  boundaryKeyForMeaningStatus,
  craftFacts,
  itemFacts,
  motifFacts,
  parseRegionInfo,
  projectFacts,
  strongestClaimLevel,
  styleFacts,
} from "./evidence";
import {
  MATCH_WEIGHTS,
  type CulturalEvidence,
  type CulturalMatchResult,
  type MatchEntityKind,
  type MatchWhy,
  type MatchWhyItem,
  type ProductCompatibility,
  type RegionInfo,
  type ScoreBreakdown,
  type ScoreBreakdownWeighted,
} from "./types";

/**
 * Cultural Match Engine — Stage 2.
 *
 * Translates a Stage-1 GlobalDesignBrief into ranked heritage directions
 * drawn from the SilverHeritage-GZ knowledge base.
 *
 * Scoring model (transparent, published, no black box):
 *   product_fit        30  HARD CONSTRAINT — the requested product type
 *                          filters the pool first (incompatible entities
 *                          never enter the results), then ranks highest
 *   visual_style_fit    22  aesthetic affinity with the brief's style tokens
 *   wearability_fit     12  everyday-wear spectrum vs. wearability preference
 *   regional_fit        12  cultural-visibility affinity of the region
 *   keyword_fit         12  explicit keyword/emotion gloss hits
 *   evidence_confidence 12  evidence level + source corroboration
 *
 * PRODUCT COMPATIBILITY (hard constraint):
 *   Candidates are classified against the brief's product_type BEFORE
 *   ranking. "incompatible" entities (a different product category) are
 *   filtered out entirely; "exact" matches outrank "compatible"
 *   translations so a documented form of the requested product can never
 *   be displaced by a semantically-similar different product.
 *
 * FACT/INFERENCE SEPARATION (RULE-005):
 *   - `matched_reasons` are AI-side scoring rationale (labeled as such).
 *   - `cultural_evidence` contains ONLY statements sourced from the
 *     dataset descriptions, plus the honest meaning-status disclosure.
 *   - A motif with no documented meaning can still match on visual
 *     affinity — it is presented as a visual subject, never as symbolism.
 */

/** Only the Top 3 cultural directions are surfaced to the customer. */
const TOP_N = 3;

/**
 * Per-kind caps keep the Top-N list diverse. heritage_item gets 3 — the
 * item catalogue (22 entries) is the largest and most product-relevant
 * part of the knowledge base. Projects are capped at 2 and displayed
 * with a region prefix ("台江 · 银饰锻制技艺") because several national
 * designations share the same project name and would otherwise look
 * like duplicate cards.
 */
const KIND_CAPS: Record<MatchEntityKind, number> = {
  motif: 2,
  heritage_item: 3,
  regional_style: 2,
  craft: 2,
  project: 2,
};

/** "贵州省雷山县" → "雷山" — short region label for display names. */
function regionShort(region: string): string {
  return region.replace(/^贵州省/, "").replace(/县$/, "");
}

interface Candidate {
  kind: MatchEntityKind;
  id: string;
  name: string;
  region: string | null;
  compatibility: ProductCompatibility;
  breakdown: ScoreBreakdown;
  reasons: string[];
  evidence: string[];
  culturalMeaning: string | null;
  meaningStatus: CulturalMatchResult["meaning_status"];
  sourceIds: string[];
  evidenceLevel: CulturalMatchResult["evidence_level"];
  /** Structured region hierarchy (knowledge-base enhancement). */
  regionInfo: RegionInfo;
  /** Layer A — traceable cultural facts from the dataset. */
  facts: CulturalEvidence[];
  /** Brief tokens that drove the match (customer preference layer). */
  preferenceLinks: string[];
  /** Layer B — design interpretation items (i18n key + vars). */
  visualLinks: MatchWhyItem[];
  /** Layer C — AI design suggestion items (i18n key + vars). */
  suggestions: MatchWhyItem[];
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/* -------------------------------------------------------------------------- */
/*  Shared dimension helpers                                                  */
/* -------------------------------------------------------------------------- */

function evidenceConfidence(
  evidenceLevel: string,
  sourceCount: number,
): number {
  const base =
    evidenceLevel === "official"
      ? 0.85
      : evidenceLevel === "inference"
        ? 0.3
        : 0.7;
  const corroboration =
    sourceCount >= 2 ? 0.15 : sourceCount === 1 ? 0.05 : 0;
  return Math.min(1, base + corroboration);
}

function evidenceReasons(
  evidenceLevel: string,
  sourceCount: number,
): string[] {
  const reasons: string[] = [];
  if (evidenceLevel === "official") {
    reasons.push(
      sourceCount >= 2
        ? `Grounded in ${sourceCount} independent official sources (corroborated).`
        : "Grounded in official intangible-heritage project data.",
    );
  } else if (evidenceLevel === "inference") {
    reasons.push("Marked as AI inference — not an official cultural record.");
  } else {
    reasons.push(`Evidence level: ${evidenceLevel}.`);
  }
  return reasons;
}

/** Wearability fit for item categories, conditioned on the brief. */
function categoryWearabilityFit(
  category: string,
  brief: GlobalDesignBrief,
  _signals: BriefSignals,
): number {
  const everyday = CATEGORY_EVERYDAY[category];
  if (everyday === undefined) return 0.5;

  switch (brief.wearability) {
    case "high":
      return everyday;
    case "medium":
    case "unknown":
      return clamp01(0.5 + (everyday - 0.5) * 0.5);
    case "low":
      // Special-occasion appetite → ceremonial pieces fit better.
      return clamp01(1 - everyday);
    default:
      return 0.5;
  }
}

/* -------------------------------------------------------------------------- */
/*  Per-kind scorers                                                          */
/* -------------------------------------------------------------------------- */

function scoreMotif(brief: GlobalDesignBrief, signals: BriefSignals): Candidate[] {
  const out: Candidate[] = [];

  for (const motif of loadMotifs()) {
    const affinity = motifAffinity(motif.name, signals.tokens);

    // visual_style_fit — subject affinity (aesthetic only, no meaning).
    const visual = affinity.score;

    // product_fit — motifs apply across product categories: neutral base,
    // lightly raised for e.g. hairpiece × documented headpiece motifs is NOT
    // claimed (no data links motifs to products) — stays neutral, honestly.
    const product = 0.5;

    // wearability_fit — a visual subject adapts to any wearability; neutral
    // with a slight lift when the brief wants low complexity.
    const wear =
      brief.complexity === "low" ? 0.6 : brief.complexity === "high" ? 0.45 : 0.5;

    // regional_fit — visibility affinity of the motif's documented region.
    const regions = extractRegions(motif.region);
    const regional = regions.length
      ? Math.max(...regions.map((r) =>
        REGION_PROFILE[r].visibilityAffinity[
        brief.cultural_visibility === "strong"
          ? "high"
          : brief.cultural_visibility === "balanced"
            ? "medium"
            : brief.cultural_visibility === "subtle"
              ? "low"
              : "unknown"
        ],
      ))
      : 0.5;

    // keyword_fit — explicit token hits against the subject affinity table.
    const keyword = affinity.score >= 0.9 && affinity.gloss ? 1 : affinity.score >= 0.6 ? 0.6 : 0;

    const evidence = evidenceConfidence(motif.evidence_level, motif.source_ids.length);

    const breakdown: ScoreBreakdown = {
      visual_style_fit: visual,
      product_fit: product,
      wearability_fit: wear,
      regional_fit: regional,
      keyword_fit: keyword,
      evidence_confidence: evidence,
    };

    const reasons: string[] = [];
    if (affinity.gloss) {
      reasons.push(
        `Your style signals resonate with the ${affinity.gloss} (${motif.name}) — an aesthetic affinity, not a symbolic claim.`,
      );
    } else {
      reasons.push(
        `${motif.name} is a documented visual subject with no conflicting style signals.`,
      );
    }
    if (regions.length) {
      reasons.push(
        `Documented in official data for ${regions.join(" / ")} — an affinity heuristic for "${brief.cultural_visibility}" cultural visibility.`,
      );
    }
    reasons.push(
      "Official sources record it as a visual subject; no cultural meaning is documented, so none is inferred.",
    );
    reasons.push(...evidenceReasons(motif.evidence_level, motif.source_ids.length));

    out.push({
      kind: "motif",
      id: motif.id,
      name: motif.name,
      region: motif.region,
      // A motif is a visual subject applicable to any product type —
      // design-language material, never claimed as the product form.
      compatibility: "compatible",
      breakdown,
      reasons,
      evidence: [
        motif.description,
        motif.documented_meaning
          ? `Documented meaning: ${motif.documented_meaning}`
          : "Cultural meaning is not documented in the official sources consulted.",
      ],
      culturalMeaning: motif.documented_meaning,
      meaningStatus: motif.documented_meaning ? "documented" : "not_documented",
      sourceIds: motif.source_ids,
      evidenceLevel: motif.evidence_level,
      regionInfo: parseRegionInfo(motif.region),
      facts: motifFacts(motif),
      preferenceLinks: affinity.hits,
      visualLinks: affinity.gloss
        ? [
          {
            key: "culturalMatch.why.visualAffinity",
            vars: { motif: motif.name },
          },
        ]
        : [
          {
            key: "culturalMatch.why.subjectNoConflict",
            vars: { motif: motif.name },
          },
        ],
      suggestions: [
        brief.wearability === "low"
          ? {
            key: "culturalMatch.why.suggestionMotifStatement",
            vars: { motif: motif.name },
          }
          : {
            key: "culturalMatch.why.suggestionMotifLocal",
            vars: { motif: motif.name },
          },
      ],
    });
  }

  return out;
}

function scoreHeritageItems(brief: GlobalDesignBrief, signals: BriefSignals): Candidate[] {
  const out: Candidate[] = [];
  const productFitTable =
    PRODUCT_CATEGORY_FIT[brief.product_type] ?? PRODUCT_CATEGORY_FIT.unknown;

  for (const item of loadHeritageItems()) {
    // PRODUCT COMPATIBILITY — hard constraint. A different product
    // category (e.g. a ring for a bracelet request) never enters the
    // results, so it can never masquerade as a match.
    const compatibility = classifyItemProductCompatibility(
      brief.product_type,
      item.name,
      item.category,
    );
    if (compatibility === "incompatible") continue;

    // visual_style_fit — distance on the ornate spectrum.
    const ornate = ITEM_ORNATE[item.name] ?? 0.5;
    const visual = clamp01(1 - Math.abs(ornate - signals.ornate));

    // product_fit — exact documented form ranks above translatable
    // structures; the fit table carries the translation distance.
    const product =
      compatibility === "exact"
        ? 1
        : (productFitTable[item.category] ?? 0.3);

    // wearability_fit — everyday-wear spectrum vs. wearability preference.
    const wear = categoryWearabilityFit(item.category, brief, signals);

    // regional_fit — visibility affinity of the item's region.
    const regions = extractRegions(item.region);
    const regional = regions.length
      ? Math.max(...regions.map((r) =>
        REGION_PROFILE[r].visibilityAffinity[
        brief.cultural_visibility === "strong"
          ? "high"
          : brief.cultural_visibility === "balanced"
            ? "medium"
            : brief.cultural_visibility === "subtle"
              ? "low"
              : "unknown"
        ],
      ))
      : 0.5;

    // keyword_fit — item-specific keyword affinities.
    let keyword = 0;
    const keywordHits: string[] = [];
    const keywordHitTokens: string[] = [];
    for (const entry of ITEM_KEYWORDS[item.name] ?? []) {
      const hitTokens = entry.tokens.filter((t) => signals.tokens.includes(t));
      if (hitTokens.length > 0) {
        keyword = clamp01(keyword + 0.5);
        keywordHits.push(entry.gloss);
        keywordHitTokens.push(...hitTokens);
      }
    }

    const evidence = evidenceConfidence(item.evidence_level, item.source_ids.length);

    const breakdown: ScoreBreakdown = {
      visual_style_fit: visual,
      product_fit: product,
      wearability_fit: wear,
      regional_fit: regional,
      keyword_fit: keyword,
      evidence_confidence: evidence,
    };

    const reasons: string[] = [];
    if (compatibility === "exact") {
      reasons.push(
        `${item.name} is the documented form of your "${brief.product_type}" request — an exact match in the official data.`,
      );
    } else {
      reasons.push(
        `${item.name} is a documented ${item.category} form — a translatable structure for your "${brief.product_type}" request, not an exact match.`,
      );
    }
    if (brief.wearability === "high" && wear >= 0.75) {
      reasons.push(
        `Fits your high-wearability preference — ${item.category} scores well for everyday wear.`,
      );
    }
    if (brief.wearability === "low" && wear >= 0.6) {
      reasons.push(
        `Suits a special-occasion direction — ${item.name} sits on the ceremonial end of the documented spectrum.`,
      );
    }
    if (visual >= 0.75) {
      reasons.push(
        `Its documented ornateness matches your style profile (ornate-spectrum distance ${(1 - visual).toFixed(2)}).`,
      );
    }
    if (regions.length) {
      reasons.push(
        `Attributed to ${regions.join(" / ")} by official project data — matched to your "${brief.cultural_visibility}" visibility preference via an affinity heuristic.`,
      );
    }
    for (const hit of keywordHits) {
      reasons.push(`Your keywords resonate with its ${hit}.`);
    }
    reasons.push(...evidenceReasons(item.evidence_level, item.source_ids.length));

    out.push({
      kind: "heritage_item",
      id: item.id,
      name: item.name,
      region: item.region,
      compatibility,
      breakdown,
      reasons,
      evidence: [item.description],
      culturalMeaning: null,
      meaningStatus: "not_applicable",
      sourceIds: item.source_ids,
      evidenceLevel: item.evidence_level,
      regionInfo: parseRegionInfo(item.region),
      facts: itemFacts(item),
      preferenceLinks: keywordHitTokens,
      visualLinks:
        visual >= 0.75
          ? [{ key: "culturalMatch.why.visualOrnate", vars: { name: item.name } }]
          : [],
      suggestions: [
        {
          key: "culturalMatch.why.suggestionItemForm",
          vars: { name: item.name, category: item.category },
        },
      ],
    });
  }

  return out;
}

function scoreRegionalStyles(brief: GlobalDesignBrief): Candidate[] {
  const out: Candidate[] = [];
  const productTerms = PRODUCT_TERMS[brief.product_type] ?? [];

  for (const style of loadRegionalStyles()) {
    const regions = extractRegions(style.region);
    const profile = regions.length ? REGION_PROFILE[regions[0]] : null;

    // visual_style_fit — ornate-spectrum distance of the regional profile.
    const signals = deriveBriefSignals(brief);
    const visual = profile ? clamp01(1 - Math.abs(profile.ornate - signals.ornate)) : 0.5;

    // product_fit — do the region's documented features cover the product?
    let product = 0.5;
    if (productTerms.length > 0) {
      const hits = productTerms.filter((t) => style.features.includes(t)).length;
      product = clamp01(0.5 + 0.5 * (hits / productTerms.length));
    }

    // wearability_fit — regional styles span the spectrum: neutral.
    const wear = 0.5;

    // regional_fit — visibility affinity.
    const regional = profile
      ? profile.visibilityAffinity[
      brief.cultural_visibility === "strong"
        ? "high"
        : brief.cultural_visibility === "balanced"
          ? "medium"
          : brief.cultural_visibility === "subtle"
            ? "low"
            : "unknown"
      ]
      : 0.5;

    // keyword_fit — feature terms hit via the shared gloss logic.
    let keyword = 0;
    const featureText = style.features.join(" ");
    if (signals.tokens.includes("nature-inspired") && /花草|鸟雀|昆虫|花鸟|龙鱼/.test(featureText)) {
      keyword = 0.7;
    }
    if (signals.tokens.includes("dragon") && featureText.includes("龙")) {
      keyword = clamp01(keyword + 0.5);
    }
    if (signals.tokens.includes("butterfly") && featureText.includes("蝴蝶")) {
      keyword = clamp01(keyword + 0.5);
    }

    const evidence = evidenceConfidence(style.evidence_level, style.source_ids.length);

    const breakdown: ScoreBreakdown = {
      visual_style_fit: visual,
      product_fit: product,
      wearability_fit: wear,
      regional_fit: regional,
      keyword_fit: keyword,
      evidence_confidence: evidence,
    };

    const reasons: string[] = [];
    if (profile) {
      reasons.push(
        `${style.region} documents ${profile.character} — matched to your style profile via an ornate-spectrum heuristic.`,
      );
      reasons.push(
        `Visibility affinity heuristic: ${style.region} × your "${brief.cultural_visibility}" cultural-visibility preference.`,
      );
    }
    if (product > 0.5 && productTerms.length > 0) {
      const hits = productTerms.filter((t) => style.features.includes(t));
      if (hits.length > 0) {
        reasons.push(
          `Its officially documented forms include ${hits.join("、")} — directly relevant to a "${brief.product_type}".`,
        );
      }
    }
    if (style.subregions && Object.keys(style.subregions).length > 0) {
      reasons.push(
        `Official data distinguishes ${Object.keys(style.subregions).join("、")} subregional variants — documented local specificity.`,
      );
    }
    reasons.push(...evidenceReasons(style.evidence_level, style.source_ids.length));

    out.push({
      kind: "regional_style",
      id: style.id,
      name: `${style.region}银饰风格`,
      region: style.region,
      // A regional style is a documented visual system spanning product
      // categories — always translatable design language.
      compatibility: "compatible",
      breakdown,
      reasons,
      evidence: [
        `${style.region}官方项目资料记载的器物/特征包括：${style.features.join("、")}。`,
        style.style_types
          ? `当地银饰划分为${style.style_types.join("、")}等型制。`
          : null,
        style.subregions
          ? `片区差异：${Object.entries(style.subregions)
            .map(([k, v]) => `${k}${v}`)
            .join("；")}。`
          : null,
      ].filter((s): s is string => s !== null),
      culturalMeaning: null,
      meaningStatus: "not_applicable",
      sourceIds: style.source_ids,
      evidenceLevel: style.evidence_level,
      regionInfo: parseRegionInfo(style.region, {
        subregions: [
          ...Object.keys(style.subregions ?? {}),
          ...(style.style_types ?? []),
          ...(style.local_nodes ?? []),
        ],
      }),
      facts: styleFacts(style),
      preferenceLinks: signals.tokens.filter((t) =>
        /nature-inspired|dragon|butterfly/.test(t),
      ),
      visualLinks: profile
        ? [
          {
            key: "culturalMatch.why.visualRegionProfile",
            vars: { region: style.region, character: profile.character },
          },
        ]
        : [],
      suggestions:
        product > 0.5 && productTerms.length > 0
          ? [
            {
              key: "culturalMatch.why.suggestionRegionForm",
              vars: {
                region: style.region,
                terms: productTerms.filter((t) => style.features.includes(t)).join("、"),
              },
            },
          ]
          : [],
    });
  }

  return out;
}

function scoreCrafts(brief: GlobalDesignBrief): Candidate[] {
  const out: Candidate[] = [];
  const signals = deriveBriefSignals(brief);

  for (const craft of loadCrafts()) {
    const aesthetics = CRAFT_AESTHETICS[craft.name];
    const hit = aesthetics?.tokens.some((t) => signals.tokens.includes(t));

    // visual_style_fit — technique aesthetics.
    const visual = hit && aesthetics ? aesthetics.score : 0.5;

    // product_fit — techniques apply across categories: neutral.
    const product = 0.5;

    // wearability_fit — light techniques fit high wearability slightly better.
    let wear = 0.5;
    if (craft.name === "拉丝" && brief.wearability === "high") wear = 0.65;
    if (craft.name === "拉丝" && brief.wearability === "low") wear = 0.4;

    // regional_fit — crafts are documented across regions: neutral, no
    // regional attribution is claimed (RULE-002).
    const regional = 0.5;

    // keyword_fit — technique token hits.
    const keyword = hit ? clamp01(aesthetics!.score * 0.8) : 0;

    const evidence = evidenceConfidence(craft.evidence_level, craft.source_ids.length);

    const breakdown: ScoreBreakdown = {
      visual_style_fit: visual,
      product_fit: product,
      wearability_fit: wear,
      regional_fit: regional,
      keyword_fit: keyword,
      evidence_confidence: evidence,
    };

    const reasons: string[] = [];
    if (hit && aesthetics) {
      reasons.push(
        `Your style signals resonate with ${craft.name} — ${aesthetics.gloss} (a technique aesthetic, not a cultural claim).`,
      );
    } else {
      reasons.push(
        `${craft.name} is a documented foundational technique in the official forging process.`,
      );
    }
    reasons.push(
      "Documented across regions in official data — no single-region attribution is made.",
    );
    reasons.push(...evidenceReasons(craft.evidence_level, craft.source_ids.length));

    out.push({
      kind: "craft",
      id: craft.id,
      name: craft.name,
      region: null,
      // A forging technique applies to any product type.
      compatibility: "compatible",
      breakdown,
      reasons,
      evidence: [craft.description],
      culturalMeaning: null,
      meaningStatus: "not_applicable",
      sourceIds: craft.source_ids,
      evidenceLevel: craft.evidence_level,
      regionInfo: parseRegionInfo(null),
      facts: craftFacts(craft),
      preferenceLinks: hit && aesthetics
        ? aesthetics.tokens.filter((t) => signals.tokens.includes(t))
        : [],
      visualLinks:
        hit && aesthetics
          ? [
            {
              key: "culturalMatch.why.visualCraftAesthetic",
              vars: { craft: craft.name, gloss: aesthetics.gloss },
            },
          ]
          : [{ key: "culturalMatch.why.subjectNoConflict", vars: { motif: craft.name } }],
      suggestions: [
        {
          key: "culturalMatch.why.suggestionCraft",
          vars: { craft: craft.name },
        },
      ],
    });
  }

  return out;
}

function scoreProjects(brief: GlobalDesignBrief): Candidate[] {
  const out: Candidate[] = [];
  const signals = deriveBriefSignals(brief);

  for (const project of loadProjects()) {
    const regions = extractRegions(project.region);
    const profile = regions.length ? REGION_PROFILE[regions[0]] : null;

    // visual_style_fit — ornate-spectrum distance of the regional profile.
    const visual = profile ? clamp01(1 - Math.abs(profile.ornate - signals.ornate)) : 0.5;

    // product_fit / wearability — a project entry is grounding context, not
    // a product spec: neutral.
    const product = 0.5;
    const wear = 0.5;

    // regional_fit — visibility affinity.
    const regional = profile
      ? profile.visibilityAffinity[
      brief.cultural_visibility === "strong"
        ? "high"
        : brief.cultural_visibility === "balanced"
          ? "medium"
          : brief.cultural_visibility === "subtle"
            ? "low"
            : "unknown"
      ]
      : 0.5;

    // keyword_fit — official designations carry no style tokens: 0.
    const keyword = 0;

    const evidence = evidenceConfidence(project.evidence_level, project.source_ids.length);

    const breakdown: ScoreBreakdown = {
      visual_style_fit: visual,
      product_fit: product,
      wearability_fit: wear,
      regional_fit: regional,
      keyword_fit: keyword,
      evidence_confidence: evidence,
    };

    const reasons: string[] = [];
    reasons.push(
      `Official grounding: ${project.region} holds a national-level designation (${project.batch}) — the institutional root of this direction.`,
    );
    if (profile) {
      reasons.push(
        `Regional affinity heuristic: ${regions[0]} × your "${brief.cultural_visibility}" visibility preference.`,
      );
    }
    reasons.push(...evidenceReasons(project.evidence_level, project.source_ids.length));

    out.push({
      kind: "project",
      id: project.id,
      /* Region prefix disambiguates the four national designations,
         several of which share the same project name. */
      name: `${regionShort(project.region)} · ${project.name}`,
      region: project.region,
      // Institutional grounding context, not a product form.
      compatibility: "compatible",
      breakdown,
      reasons,
      evidence: [project.description],
      culturalMeaning: null,
      meaningStatus: "not_applicable",
      sourceIds: project.source_ids,
      evidenceLevel: project.evidence_level,
      regionInfo: parseRegionInfo(project.region),
      facts: projectFacts(project),
      preferenceLinks: [],
      visualLinks: profile
        ? [
          {
            key: "culturalMatch.why.visualRegionProfile",
            vars: { region: regions[0], character: profile.character },
          },
        ]
        : [],
      suggestions: [
        {
          key: "culturalMatch.why.suggestionProjectGrounding",
          vars: { region: project.region },
        },
      ],
    });
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*  Assembly                                                                  */
/* -------------------------------------------------------------------------- */

function weighted(breakdown: ScoreBreakdown): ScoreBreakdownWeighted {
  return {
    visual_style_fit: breakdown.visual_style_fit * MATCH_WEIGHTS.visual_style_fit,
    product_fit: breakdown.product_fit * MATCH_WEIGHTS.product_fit,
    wearability_fit: breakdown.wearability_fit * MATCH_WEIGHTS.wearability_fit,
    regional_fit: breakdown.regional_fit * MATCH_WEIGHTS.regional_fit,
    keyword_fit: breakdown.keyword_fit * MATCH_WEIGHTS.keyword_fit,
    evidence_confidence:
      breakdown.evidence_confidence * MATCH_WEIGHTS.evidence_confidence,
  };
}

function buildWhy(candidate: Candidate): MatchWhy {
  return {
    preference_links: candidate.preferenceLinks,
    visual_links: candidate.visualLinks,
    cultural_facts: candidate.facts,
    cultural_claim_level: strongestClaimLevel(candidate.facts),
    design_suggestions: candidate.suggestions,
    cultural_boundary: boundaryKeyForMeaningStatus(candidate.meaningStatus),
  };
}

function assemble(candidate: Candidate): CulturalMatchResult {
  const weightedBreakdown = weighted(candidate.breakdown);
  const score = Math.round(
    Object.values(weightedBreakdown).reduce((sum, v) => sum + v, 0),
  );

  return {
    id: candidate.id,
    name: candidate.name,
    type: candidate.kind,
    region: candidate.region,
    product_compatibility: candidate.compatibility,
    match_score: score,
    score_breakdown: candidate.breakdown,
    score_breakdown_weighted: weightedBreakdown,
    matched_reasons: candidate.reasons,
    cultural_evidence: candidate.evidence,
    cultural_meaning: candidate.culturalMeaning,
    meaning_status: candidate.meaningStatus,
    source_ids: candidate.sourceIds,
    evidence_level: candidate.evidenceLevel,
    region_info: candidate.regionInfo,
    why: buildWhy(candidate),
    claim_level: strongestClaimLevel(candidate.facts),
  };
}

/**
 * Match a GlobalDesignBrief against the heritage knowledge base.
 * Returns the Top-3 heritage directions after the product-compatibility
 * hard filter, with per-kind diversity caps.
 * Pure, deterministic, no AI calls — AI inference lives in Stage 1 only.
 */
export function matchCulturalHeritage(
  designBrief: GlobalDesignBrief,
): CulturalMatchResult[] {
  const signals = deriveBriefSignals(designBrief);

  const candidates: Candidate[] = [
    ...scoreMotif(designBrief, signals),
    ...scoreHeritageItems(designBrief, signals),
    ...scoreRegionalStyles(designBrief),
    ...scoreCrafts(designBrief),
    ...scoreProjects(designBrief),
  ];

  candidates.sort((a, b) => {
    const scoreA = Object.values(weighted(a.breakdown)).reduce((s, v) => s + v, 0);
    const scoreB = Object.values(weighted(b.breakdown)).reduce((s, v) => s + v, 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    // Tie-break: an exact documented form of the requested product always
    // outranks a compatible translation.
    const tier: Record<ProductCompatibility, number> = {
      exact: 0,
      compatible: 1,
      incompatible: 2,
    };
    return tier[a.compatibility] - tier[b.compatibility];
  });

  const perKindCount = new Map<MatchEntityKind, number>();
  const selected: Candidate[] = [];
  for (const candidate of candidates) {
    const count = perKindCount.get(candidate.kind) ?? 0;
    if (count >= KIND_CAPS[candidate.kind]) continue;
    perKindCount.set(candidate.kind, count + 1);
    selected.push(candidate);
    if (selected.length >= TOP_N) break;
  }

  return selected.map(assemble);
}
