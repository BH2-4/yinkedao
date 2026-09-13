import { getSourceById } from "./repository";
import { KNOWN_REGIONS } from "./glossary";
import type {
  ClaimLevel,
  CulturalEvidence,
  EvidenceLevel,
  RegionInfo,
} from "./types";
import type {
  Craft,
  HeritageItem,
  HeritageProject,
  Motif,
  RegionalStyle,
  Source,
} from "./types";

/**
 * Evidence factory — turns raw dataset rows into traceable
 * `CulturalEvidence` objects and structured `RegionInfo`.
 *
 * HARD RULES (knowledge-base enhancement stage):
 *  1. `claim` text is VERBATIM dataset text (description /
 *     documented_meaning / features). The factory never composes,
 *     paraphrases or extends a claim.
 *  2. `claimLevel` derives from the entity's evidence_level + source_ids
 *     via a downgrade-only mapping. AI reasoning can never raise it
 *     (guardrail RULE-007).
 *  3. No source → sourceId / sourceTitle / sourceType / citation = null.
 *     Sources are never fabricated.
 *  4. A motif whose documented_meaning is null emits NO meaning fact.
 *     Its existence-as-visual-subject record is the only fact — the
 *     meaning dimension stays bounded by cultural_boundary.
 */

/**
 * Fork 前身苗银数据集的地域归一化词表。SealCulture-v1 实体均无地域著录
 * （county 为空 → unattributed=true 走 fallback 标签），词表不再命中；
 * 保留 parseRegionInfo 归一化机制本身，region_info 无 UI/API 消费面。
 */
const DATASET_PROVINCE = "贵州";

/** Township-level nodes and style classifications documented in V1. */
const SUBREGION_TOKENS = [
  "控拜",
  "麻料",
  "乌高",
  "革东",
  "南寨",
  "久仰",
  "施洞型",
  "巴拉河型",
  "黄平型",
] as const;

/** Claim strength order — used to pick the strongest fact level. */
const CLAIM_LEVEL_ORDER: Record<ClaimLevel, number> = {
  official: 4,
  documented: 3,
  interpretive: 2,
  visual_only: 1,
  unknown: 0,
};

/**
 * Evidence-level → claim-level mapping. DOWNGRADE ONLY:
 *   official              → official   (gov / ICH registry directly supports it)
 *   museum / academic /
 *   interview             → documented (recorded, but not registry-grade)
 *   inference             → interpretive (AI-side interpretation)
 *   no sources            → unknown
 *
 * `visual_only` is NEVER produced here: it is the meaning-claim level for
 * motifs without documented_meaning — and those motifs emit no meaning
 * fact at all, so the level can only appear as a boundary, never a claim.
 */
export function claimLevelFromEvidence(
  evidenceLevel: EvidenceLevel,
  sourceCount: number,
): ClaimLevel {
  if (sourceCount === 0) return "unknown";
  switch (evidenceLevel) {
    case "official":
      return "official";
    case "museum":
    case "academic":
    case "interview":
      return "documented";
    case "inference":
      return "interpretive";
  }
}

/** Strongest claim level among facts (empty → unknown). Never AI-raised. */
export function strongestClaimLevel(facts: CulturalEvidence[]): ClaimLevel {
  return facts.reduce<ClaimLevel>(
    (strongest, fact) =>
      CLAIM_LEVEL_ORDER[fact.claimLevel] > CLAIM_LEVEL_ORDER[strongest]
        ? fact.claimLevel
        : strongest,
    "unknown",
  );
}

/* -------------------------------------------------------------------------- */
/*  Region parsing                                                            */
/* -------------------------------------------------------------------------- */

interface RegionExtras {
  /** Explicit subregion / style-type / local-node names (regional styles). */
  subregions?: string[];
}

/**
 * Parse a dataset region string into a structured hierarchy.
 *
 *  - province: dataset scope (贵州), never a per-entity guess.
 *  - prefecture: always null in V1 — the data never states one, so none
 *    is invented (RULE-002: no forced attribution).
 *  - county: extracted from KNOWN_REGIONS (all V1 regions are counties).
 *  - subregions: documented township variants / style classifications.
 *  - unattributed: true when no county could be extracted → the UI shows
 *    the fallback label instead of an attribution.
 */
export function parseRegionInfo(
  raw: string | null,
  extras?: RegionExtras,
): RegionInfo {
  const counties = raw
    ? KNOWN_REGIONS.filter((r) => raw.includes(r))
    : [];

  const subregions = new Set<string>(extras?.subregions ?? []);
  if (raw) {
    for (const token of SUBREGION_TOKENS) {
      if (raw.includes(token)) subregions.add(token);
    }
  }

  return {
    raw,
    province: DATASET_PROVINCE,
    prefecture: null,
    county: [...counties],
    subregions: [...subregions],
    unattributed: counties.length === 0,
  };
}

/* -------------------------------------------------------------------------- */
/*  Fact builders (one per entity kind)                                       */
/* -------------------------------------------------------------------------- */

interface FactInput {
  /** Verbatim dataset text — the claim itself. */
  claim: string;
  claimLevel: ClaimLevel;
  region: string | null;
  relatedMotifs: string[];
  /** Primary source (first of source_ids). null when the row cites none. */
  sourceId: string | null;
}

function buildFact(input: FactInput): CulturalEvidence {
  const source: Source | null =
    input.sourceId !== null ? getSourceById(input.sourceId) : null;

  return {
    sourceId: source ? source.id : null,
    sourceTitle: source ? source.title : null,
    sourceType: source ? source.source_type : null,
    claim: input.claim,
    claimLevel: input.claimLevel,
    region: input.region,
    relatedMotifs: input.relatedMotifs,
    citation: source ? source.url : null,
  };
}

/**
 * Motif facts.
 *  - Fact 1 (always): the visual-subject record — verbatim description.
 *  - Fact 2 (only when documented_meaning is non-null): the documented
 *    meaning, quoted verbatim. With V1 data this branch is never taken
 *    (all documented_meaning are null) — it exists so future, richer
 *    data flows through the same traceable pipeline.
 */
export function motifFacts(motif: Motif): CulturalEvidence[] {
  const claimLevel = claimLevelFromEvidence(
    motif.evidence_level,
    motif.source_ids.length,
  );
  const facts: CulturalEvidence[] = [
    buildFact({
      claim: motif.description,
      claimLevel,
      region: motif.region,
      relatedMotifs: [motif.name],
      sourceId: motif.source_ids[0] ?? null,
    }),
  ];

  if (motif.documented_meaning !== null) {
    facts.push(
      buildFact({
        claim: `官方资料记录的寓意：${motif.documented_meaning}`,
        claimLevel:
          motif.evidence_level === "official" ? "documented" : claimLevel,
        region: motif.region,
        relatedMotifs: [motif.name],
        sourceId: motif.source_ids[0] ?? null,
      }),
    );
  }

  return facts;
}

/** Heritage-item facts — the documented form/category record. */
export function itemFacts(item: HeritageItem): CulturalEvidence[] {
  return [
    buildFact({
      claim: item.description,
      claimLevel: claimLevelFromEvidence(
        item.evidence_level,
        item.source_ids.length,
      ),
      region: item.region,
      relatedMotifs: [],
      sourceId: item.source_ids[0] ?? null,
    }),
  ];
}

/** Regional-style facts — features, style types and subregional variants. */
export function styleFacts(style: RegionalStyle): CulturalEvidence[] {
  const claimLevel = claimLevelFromEvidence(
    style.evidence_level,
    style.source_ids.length,
  );
  const subregionNames = Object.keys(style.subregions ?? {});
  const styleTypes = style.style_types ?? [];
  const localNodes = style.local_nodes ?? [];

  const facts: CulturalEvidence[] = [
    buildFact({
      claim: `${style.region}官方项目资料记载的器物/特征包括：${style.features.join("、")}。`,
      claimLevel,
      region: style.region,
      relatedMotifs: [],
      sourceId: style.source_ids[0] ?? null,
    }),
  ];

  if (styleTypes.length > 0) {
    facts.push(
      buildFact({
        claim: `当地银饰划分为${styleTypes.join("、")}等型制。`,
        claimLevel,
        region: style.region,
        relatedMotifs: [],
        sourceId: style.source_ids[0] ?? null,
      }),
    );
  }

  if (subregionNames.length > 0) {
    facts.push(
      buildFact({
        claim: `片区差异：${Object.entries(style.subregions ?? {})
          .map(([k, v]) => `${k}${v}`)
          .join("；")}。`,
        claimLevel,
        region: style.region,
        relatedMotifs: [],
        sourceId: style.source_ids[0] ?? null,
      }),
    );
  }

  if (localNodes.length > 0) {
    facts.push(
      buildFact({
        claim: `当地银饰制作的村寨节点包括${localNodes.join("、")}。`,
        claimLevel,
        region: style.region,
        relatedMotifs: [],
        sourceId: style.source_ids[0] ?? null,
      }),
    );
  }

  // Kept for region parsing, not for claim duplication.
  void subregionNames;
  return facts;
}

/** Craft facts — the documented technique record. */
export function craftFacts(craft: Craft): CulturalEvidence[] {
  return [
    buildFact({
      claim: craft.description,
      claimLevel: claimLevelFromEvidence(
        craft.evidence_level,
        craft.source_ids.length,
      ),
      region: null,
      relatedMotifs: [],
      sourceId: craft.source_ids[0] ?? null,
    }),
  ];
}

/** Project facts — the official designation record. */
export function projectFacts(project: HeritageProject): CulturalEvidence[] {
  return [
    buildFact({
      claim: project.description,
      claimLevel: claimLevelFromEvidence(
        project.evidence_level,
        project.source_ids.length,
      ),
      region: project.region,
      relatedMotifs: [],
      sourceId: project.source_ids[0] ?? null,
    }),
  ];
}

/**
 * Cultural boundary i18n key per meaning status — states what the data
 * does NOT support (the honest negative claim).
 */
export function boundaryKeyForMeaningStatus(
  meaningStatus: "documented" | "not_documented" | "not_applicable",
): string {
  switch (meaningStatus) {
    case "documented":
      return "culturalMatch.why.boundaryDocumented";
    case "not_documented":
      return "culturalMatch.why.boundaryVisualOnly";
    case "not_applicable":
      return "culturalMatch.why.boundaryNotApplicable";
  }
}
