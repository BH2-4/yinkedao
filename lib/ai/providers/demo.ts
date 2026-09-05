import type { DemandProvider } from "./types";
import type {
  ClarificationQuestion,
  GlobalDemandInput,
  GlobalDemandResult,
  GlobalDesignBrief,
} from "@/lib/ai/schemas";

/**
 * Deterministic heuristic engine used when no real AI provider is available.
 *
 * Its job is NOT to fake AI — the UI clearly labels this as Demo Mode.
 * Its job is to make the whole pipeline demoable end-to-end:
 *  - Recognises product, style, occasion, emotion, visibility, wearability,
 *    complexity, size, weight, and price signals from natural language.
 *  - Merges structured chip selections with parsed signals.
 *  - Returns a ClarificationQuestion when the combined input is too sparse.
 *
 * Hard rule: never invents seal-stone parameters (hardness/density),
 * seal-script forms or cultural claims (篆刻域护栏，PRD 10.1)。 `cultural_interest`
 * is a *stance* on visibility, not a factual claim about motifs.
 */

type Product = GlobalDesignBrief["product_type"];
type Occasion = GlobalDesignBrief["occasion"];
type Visibility = GlobalDesignBrief["cultural_visibility"];
type Level = "low" | "medium" | "high" | "unknown";
type Size = "small" | "medium" | "large" | "unknown";
type Weight = "light" | "medium" | "heavy" | "unknown";

interface Signals {
  product: Product | null;
  styles: Set<string>;
  occasion: Occasion | null;
  emotions: Set<string>;
  visibility: Visibility | null;
  wearability: Level | null;
  complexity: Level | null;
  size: Size | null;
  weight: Weight | null;
  price: Level | null;
  market: string | null;
  keywords: Set<string>;
  avoid: Set<string>;
}

const emptySignals = (): Signals => ({
  product: null,
  styles: new Set(),
  occasion: null,
  emotions: new Set(),
  visibility: null,
  wearability: null,
  complexity: null,
  size: null,
  weight: null,
  price: null,
  market: null,
  keywords: new Set(),
  avoid: new Set(),
});

/* ------------------------------ Vocabulary ------------------------------ */

/* 篆刻域：章型 × 石种词表（product_type 自由 string，承载章型 token） */
const PRODUCT_MAP: Record<string, Product> = {
  seal: "square",
  "seal stone": "square",
  stamp: "square",
  chop: "square",
  square: "square",
  rectangle: "rectangle",
  oblong: "rectangle",
  freeform: "freeform",
  baroque: "freeform",
  qingtian: "qingtian",
  shoushan: "shoushan",
  changhua: "changhua",
  balin: "balin",
  laos: "laoshit",
  laoshit: "laoshit",
};

/* 篆刻域：石料观感词（06 质地语言） */
const STYLE_MAP: Record<string, string> = {
  waxy: "waxy",
  warm: "waxy",
  mellow: "waxy",
  vitreous: "vitreous",
  translucent: "vitreous",
  glassy: "vitreous",
  pearly: "pearly",
  soft: "pearly",
  satiny: "pearly",
  figured: "figured",
  colorful: "figured",
  patterned: "figured",
  veined: "figured",
  minimal: "minimal",
  simple: "minimal",
  plain: "minimal",
  classic: "minimal",
  ornate: "ornate",
  carved: "ornate",
  sculptural: "ornate",
};

/* 篆刻域：印章用途词（闭集内近似——travel≈纪念旅行、wedding/formal≈人生节点） */
const OCCASION_MAP: Record<string, Occasion> = {
  everyday: "everyday",
  daily: "everyday",
  practice: "everyday",
  study: "everyday",
  "self-use": "everyday",
  travel: "travel",
  trip: "travel",
  vacation: "travel",
  journey: "travel",
  memorial: "travel",
  milestone: "wedding",
  wedding: "wedding",
  graduation: "wedding",
  birth: "wedding",
  housewarming: "wedding",
  gift: "gift",
  present: "gift",
};

/* 篆刻域：印文情绪词 */
const EMOTION_MAP: Record<string, string> = {
  memory: "memory",
  remembrance: "memory",
  memorial: "memory",
  love: "love",
  blessing: "protection",
  protection: "protection",
  guardian: "protection",
  beginning: "new-beginning",
  fresh: "new-beginning",
  renewal: "new-beginning",
  connection: "connection",
  family: "connection",
  growth: "transformation",
  strength: "strength",
  peace: "peace",
  calm: "peace",
  serenity: "peace",
};

const MARKET_MAP: Record<string, string> = {
  america: "United States",
  american: "United States",
  us: "United States",
  usa: "United States",
  "new york": "United States",
  california: "United States",
  japan: "Japan",
  tokyo: "Japan",
  japanese: "Japan",
  korea: "Korea",
  korean: "Korea",
  seoul: "Korea",
  singapore: "Singapore",
  europe: "Europe",
  european: "Europe",
  paris: "Europe",
  london: "Europe",
  berlin: "Europe",
  milan: "Europe",
  china: "China",
  chinese: "China",
  shanghai: "China",
  beijing: "China",
  hongkong: "Hong Kong",
  "hong kong": "Hong Kong",
  taiwan: "Taiwan",
};

/* ------------------------------ Parser --------------------------------- */

function parseText(text: string, signals: Signals) {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ")} `;

  const hit = (word: string) => t.includes(` ${word} `) || t.includes(`-${word} `) || t.includes(` ${word}-`);

  for (const [k, v] of Object.entries(PRODUCT_MAP)) {
    if (hit(k) && signals.product == null) signals.product = v;
  }
  for (const [k, v] of Object.entries(STYLE_MAP)) {
    if (hit(k)) signals.styles.add(v);
  }
  for (const [k, v] of Object.entries(OCCASION_MAP)) {
    if (hit(k) && signals.occasion == null) signals.occasion = v;
  }
  for (const [k, v] of Object.entries(EMOTION_MAP)) {
    if (hit(k)) signals.emotions.add(v);
  }
  for (const [k, v] of Object.entries(MARKET_MAP)) {
    if (t.includes(` ${k} `) && signals.market == null) signals.market = v;
  }

  // Visibility
  if (/\b(subtle|understated|hidden|discreet|quiet)\b/.test(t))
    signals.visibility ??= "subtle";
  else if (/\b(statement|bold|strong|striking|prominent)\b/.test(t))
    signals.visibility ??= "strong";
  else if (/\b(balanced|moderate)\b/.test(t))
    signals.visibility ??= "balanced";

  // Wearability
  if (/\b(everyday|daily|comfortable|wearable|casual)\b/.test(t))
    signals.wearability ??= "high";
  if (/\b(occasional|special\s+occasion|rarely)\b/.test(t))
    signals.wearability ??= "low";

  // Complexity
  if (/\b(intricate|elaborate|detailed|ornate|complex)\b/.test(t))
    signals.complexity ??= "high";
  if (/\b(simple|clean|minimal|plain)\b/.test(t))
    signals.complexity ??= "low";

  // Size
  if (/\b(tiny|small|petite|dainty|delicate)\b/.test(t)) signals.size ??= "small";
  else if (/\b(large|big|oversized|statement)\b/.test(t)) signals.size ??= "large";

  // Weight
  if (/\b(light|lightweight|feather)\b/.test(t)) signals.weight ??= "light";
  else if (/\b(heavy|substantial|solid)\b/.test(t)) signals.weight ??= "heavy";

  // Price
  if (/\b(luxury|premium|high-end|no\s+budget|expensive)\b/.test(t))
    signals.price ??= "low";
  else if (/\b(affordable|budget|cheap|inexpensive)\b/.test(t))
    signals.price ??= "high";

  // Avoid signals
  if (/\b(no\s+gemstone|without\s+gems)\b/.test(t)) signals.avoid.add("gemstone-heavy");
  if (/\b(not\s+too\s+traditional|less\s+traditional)\b/.test(t))
    signals.avoid.add("overtly-traditional");
  if (/\b(not\s+heavy|no\s+heavy)\b/.test(t)) signals.avoid.add("heavy-ornamentation");
  if (/\b(no\s+bright|muted|monochrome)\b/.test(t)) signals.avoid.add("bright-color");
}

function mergeStructured(signals: Signals, input: GlobalDemandInput) {
  if (input.productType) {
    const key = input.productType.toLowerCase();
    if (PRODUCT_MAP[key]) signals.product ??= PRODUCT_MAP[key];
  }
  for (const s of input.styles ?? []) {
    const mapped = STYLE_MAP[s.toLowerCase()] ?? s.toLowerCase();
    signals.styles.add(mapped);
  }
  if (input.occasion) {
    const key = input.occasion.toLowerCase();
    if (OCCASION_MAP[key]) signals.occasion ??= OCCASION_MAP[key];
  }
  for (const e of input.emotions ?? []) {
    const mapped = EMOTION_MAP[e.toLowerCase()] ?? e.toLowerCase().replace(/\s+/g, "-");
    signals.emotions.add(mapped);
  }
  if (input.culturalVisibility) {
    const v = input.culturalVisibility.toLowerCase();
    if (v === "subtle" || v === "balanced" || v === "strong") {
      signals.visibility ??= v;
    }
  }
}

/* --------------------------- Clarification ----------------------------- */

function clarify(signals: Signals): ClarificationQuestion | null {
  const emotionCount = signals.emotions.size;
  const styleCount = signals.styles.size;

  if (signals.product == null && emotionCount === 0 && styleCount === 0) {
    return {
      needs_clarification: true,
      question: "What kind of meaning feels closest to you?",
      options: ["Love", "Protection", "New Beginning", "Connection", "Transformation"],
      targets: ["emotion"],
    };
  }

  if (emotionCount > 0 && styleCount === 0 && signals.product == null) {
    return {
      needs_clarification: true,
      question: "Which aesthetic feels most like you?",
      options: ["Minimal", "Modern", "Bohemian", "Luxury", "Vintage"],
      targets: ["style"],
    };
  }

  if (signals.product == null && styleCount > 0 && emotionCount === 0) {
    return {
      needs_clarification: true,
      question: "Where would you wear this?",
      options: ["Everyday", "Date", "Festival", "Wedding", "Gift"],
      targets: ["occasion", "product_type"],
    };
  }

  return null;
}

/* ------------------------------ Compose -------------------------------- */

function compose(signals: Signals, input: GlobalDemandInput): GlobalDesignBrief {
  const styles = [...signals.styles];
  const emotions = [...signals.emotions];

  const product = signals.product ?? "unknown";
  const occasion = signals.occasion ?? "unknown";
  const visibility = signals.visibility ?? (styles.includes("minimal") ? "subtle" : "balanced");
  const wearability =
    signals.wearability ??
    (occasion === "everyday" || styles.includes("minimal") ? "high" : "medium");
  const complexity =
    signals.complexity ??
    (styles.includes("minimal") ? "low" : styles.includes("luxury") ? "high" : "medium");
  const size = signals.size ?? (wearability === "high" ? "small" : "medium");
  const weight = signals.weight ?? (wearability === "high" ? "light" : "medium");
  const price = signals.price ?? "medium";
  const market = signals.market ?? "unknown";

  const keywords = new Set<string>([
    ...styles,
    ...emotions,
    "seal",
    "stone",
    ...(product !== "unknown" ? [product] : []),
    ...signals.keywords,
  ]);

  const avoid = new Set<string>(signals.avoid);
  if (visibility === "subtle") avoid.add("overtly-traditional");
  if (complexity === "low") avoid.add("heavy-ornamentation");

  const consumerProfile = buildProfile({
    styles,
    occasion,
    emotions,
    visibility,
    market,
  });

  const culturalInterest = buildCulturalInterest(visibility, styles);
  const reasoning = buildReasoning({
    styles,
    emotions,
    occasion,
    product,
    visibility,
    hasStory: (input.message ?? "").trim().length > 0,
  });

  // Confidence: fraction of key axes explicitly resolved (not `unknown`).
  const axes: Array<string | null> = [
    signals.product,
    styles.length > 0 ? "styles" : null,
    signals.occasion,
    emotions.length > 0 ? "emotions" : null,
    signals.visibility,
    signals.wearability,
    signals.market,
  ];
  const resolved = axes.filter((v) => v != null).length;
  const confidence = Math.min(0.92, 0.35 + 0.08 * resolved);

  return {
    market,
    consumer_profile: consumerProfile,
    product_type: product,
    style: styles.length > 0 ? styles.slice(0, 6) : ["unspecified"],
    occasion,
    emotion: emotions.length > 0 ? emotions.slice(0, 6) : ["unspecified"],
    cultural_interest: culturalInterest,
    cultural_visibility: visibility,
    wearability,
    complexity,
    size_preference: size,
    weight_preference: weight,
    price_sensitivity: price,
    design_keywords: [...keywords].slice(0, 10),
    avoid: [...avoid].slice(0, 10),
    confidence: Number(confidence.toFixed(2)),
    reasoning,
    // Demo Mode performs no vision analysis — a real analysis is never
    // fabricated (the demo provider has no image understanding).
    inspiration_analysis: null,
  };
}

function buildProfile(args: {
  styles: string[];
  occasion: Occasion;
  emotions: string[];
  visibility: Visibility;
  market: string;
}): string {
  const parts: string[] = [];
  const styleWord = args.styles[0] ?? "considered";
  const marketWord = args.market !== "unknown" ? args.market : "global";
  parts.push(`A ${marketWord} wearer with ${styleWord} taste`);
  if (args.occasion !== "unknown") parts.push(`seeking pieces for ${args.occasion} moments`);
  if (args.emotions.length > 0)
    parts.push(`drawn to jewelry that carries ${args.emotions[0].replace("-", " ")}`);
  if (args.visibility === "subtle")
    parts.push("who values meaning worn quietly");
  else if (args.visibility === "strong")
    parts.push("who wants heritage to be visible and confident");
  return parts.join(", ") + ".";
}

function buildCulturalInterest(visibility: Visibility, styles: string[]): string {
  if (visibility === "subtle")
    return "open to subtle cultural motifs woven into modern silhouettes";
  if (visibility === "strong")
    return "eager to wear pronounced heritage elements";
  if (visibility === "balanced")
    return "comfortable with a balanced blend of modern and cultural language";
  if (styles.includes("minimal"))
    return "receptive to quiet cultural references";
  return "unknown";
}

function buildReasoning(args: {
  styles: string[];
  emotions: string[];
  occasion: Occasion;
  product: Product;
  visibility: Visibility;
  hasStory: boolean;
}): string {
  const bits: string[] = [];
  if (args.styles.length > 0)
    bits.push(`aesthetic reads as ${args.styles.slice(0, 2).join(" and ")}`);
  if (args.emotions.length > 0)
    bits.push(`emotional anchor is ${args.emotions[0].replace("-", " ")}`);
  if (args.occasion !== "unknown") bits.push(`primary context is ${args.occasion}`);
  if (args.product !== "unknown") bits.push(`favoring a ${args.product}`);
  if (args.visibility !== "unknown")
    bits.push(`cultural presence should feel ${args.visibility}`);

  if (bits.length === 0) {
    return "Signal is thin; the brief leans on default preferences and should be sharpened in the next stage.";
  }
  const lead = args.hasStory ? "From your story," : "Based on your selections,";
  return `${lead} ${bits.join(", ")}.`;
}

/* ------------------------------ Provider ------------------------------- */

export const demoProvider: DemandProvider = {
  id: "demo",
  async analyze(input: GlobalDemandInput): Promise<GlobalDemandResult> {
    const signals = emptySignals();
    mergeStructured(signals, input);
    parseText(input.message ?? "", signals);

    // Fold in earlier clarification answers from the conversation history.
    for (const turn of input.history ?? []) {
      if (turn.role === "user") parseText(turn.content, signals);
    }

    const clar = clarify(signals);
    if (clar) return clar;

    const brief = compose(signals, input);
    return { needs_clarification: false, brief };
  },
};
