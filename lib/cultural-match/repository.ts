import { z } from "zod";
import dataJson from "@/data/SealCulture-v1/data/cultural-match.json";

/**
 * 文化匹配引导层（F6 · MVP 简化形态）——数据契约与只读仓储。
 *
 * source-first（对齐 SilverHeritage 三件套精神）：
 *  - 每条文化元素必带 source{doc, evidence}——无证据不入库；
 *  - 宁缺毋滥：不编造谐音寓意与典故，只述调研报告（02/05/06/PRD）
 *    与素材实有元素；
 *  - M8 灰度版由 heritage match/guardrail/evidence 三件套接管本 schema
 *    （guardrail 白名单 = elements 总表 + 系列/单品库）。
 */

/* ─── Schema ─────────────────────────────────────────────────── */

const SourceSchema = z.object({
  doc: z.string().min(1),
  evidence: z.string().min(1),
});

const AssetSourceSchema = z.object({
  repo: z.string().min(1),
  file: z.string().min(1),
  origin: z.string().min(1),
  usage: z.literal("internal"),
});

const SeriesSchema = z.object({
  id: z.string().min(1),
  prefix: z.string().min(1),
  name: z.string().min(1),
  theme: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  story: z.string().min(1),
});

const ItemSchema = z.object({
  sku: z.string().min(1),
  series: z.array(z.string().min(1)).min(1),
  name: z.string().min(1),
  img: z.string().min(1),
  views: z.array(z.string().min(1)),
  stone: z.object({
    type: z.string().min(1),
    type_note: z.string(),
    color: z.string().min(1),
    luster: z.string().min(1),
    translucency: z.string().min(1),
  }),
  form: z.string().min(1),
  button: z.string().min(1),
  seal_face: z
    .object({
      type: z.enum(["白文", "朱文"]),
      script: z.string(),
      layout: z.string(),
    })
    .nullable(),
  inscription: z.string().nullable(),
  texture_tags: z.array(z.string().min(1)),
  source: AssetSourceSchema,
});

const ElementSchema = z.object({
  id: z.string().regex(/^CE-\d{2}$/),
  name: z.string().min(1),
  description: z.string().min(1),
  source: SourceSchema,
  asset_ref: z.string().nullable(),
});

const ScenarioSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  prd_ref: z.string().min(1),
  /** 恰好 3 个文化元素（M8 验收口径） */
  culture_elements: z.array(ElementSchema).length(3),
  series_refs: z.array(z.string().min(1)).min(1),
  design_hints: z.object({
    form: z.array(z.string().min(1)).min(1),
    button: z.array(z.string().min(1)).min(1),
    stone_color: z.array(z.string().min(1)).min(1),
    zhu_bai: z.string().min(1),
    reason: z.string().min(1),
  }),
});

export const SealCultureV1Schema = z.object({
  version: z.string().min(1),
  note: z.string().min(1),
  elements: z.array(ElementSchema).min(1),
  series: z.array(SeriesSchema).min(1),
  items: z.array(ItemSchema).min(1),
  scenarios: z.array(ScenarioSchema).min(1),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type Series = z.infer<typeof SeriesSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type CultureElement = z.infer<typeof ElementSchema>;

/* ─── 只读仓储（静态 import + 校验 + 模块级缓存） ──────────────── */

let cache: z.infer<typeof SealCultureV1Schema> | null = null;

export class CultureDataError extends Error {
  constructor(cause: unknown) {
    super(
      `seal-culture-v1.json failed validation: ${cause instanceof z.ZodError ? cause.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : String(cause)}`,
    );
    this.name = "CultureDataError";
  }
}

export function loadSealCulture() {
  if (!cache) {
    const parsed = SealCultureV1Schema.safeParse(dataJson);
    if (!parsed.success) throw new CultureDataError(parsed.error);
    cache = parsed.data;
  }
  return cache;
}

/** 访谈用途（occasion）→ 文化场景；细分场景由子场景芯片切换。 */
export function scenariosForOccasion(occasion: string): Scenario[] {
  const all = loadSealCulture().scenarios;
  switch (occasion) {
    case "commemorate-travel":
      return all.filter((s) => s.id === "travel-memento");
    case "milestone":
      return all.filter((s) => s.id.startsWith("life-"));
    case "gift":
      return all.filter((s) => s.id.startsWith("gift-"));
    case "self-use":
      return all.filter((s) => s.id === "self-calligraphy");
    default:
      return [];
  }
}

export function getScenario(id: string): Scenario | null {
  return loadSealCulture().scenarios.find((s) => s.id === id) ?? null;
}

/** 系列关联真实成品（引导层直观展示用）。 */
export function itemsForSeries(seriesIds: string[]): Item[] {
  return loadSealCulture().items.filter((item) =>
    item.series.some((sid) => seriesIds.includes(sid)),
  );
}

export function getSeries(id: string): Series | null {
  return loadSealCulture().series.find((s) => s.id === id) ?? null;
}

/* ─── 倾向芯片 → SealOrder 字段回填映射 ───────────────────────── */

export interface HintPatch {
  field: "seal_form" | "finial_type" | "seal_style";
  token: string;
}

/**
 * design_hints 文本倾向 → 参数单 token（点击芯片即预填，用户后续
 * 可在对应题目改选）。映射保守：文本不含可识别关键词则不回填。
 */
export function hintToPatch(
  kind: "form" | "button" | "zhu_bai",
  text: string,
): HintPatch | null {
  switch (kind) {
    case "form":
      if (text.includes("随形")) return { field: "seal_form", token: "freeform" };
      if (text.includes("长方")) return { field: "seal_form", token: "rectangle" };
      if (text.includes("方章") || text.includes("正格"))
        return { field: "seal_form", token: "square" };
      return null;
    case "button":
      if (text.includes("素")) return { field: "finial_type", token: "plain" };
      if (text.includes("龙")) return { field: "finial_type", token: "dragon" };
      if (/[兽狮螭马]/.test(text))
        return { field: "finial_type", token: "beast" };
      if (/[薄意纹饰瓦]/.test(text))
        return { field: "finial_type", token: "decorated-top" };
      return null;
    case "zhu_bai":
      if (text.includes("白文")) return { field: "seal_style", token: "baiwen" };
      if (text.includes("朱文")) return { field: "seal_style", token: "zhuwen" };
      return null;
  }
}
