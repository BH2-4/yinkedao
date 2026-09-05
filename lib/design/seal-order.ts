import { z } from "zod";
import {
  DECORATION_LEVELS,
  FINIAL_TYPES,
  OCCASIONS,
  SEAL_FORMS,
  SEAL_STYLES,
  SIDE_INSCRIPTIONS,
  STONE_BUDGETS,
  STONE_LOOKS,
  STONE_TYPES,
  TEXT_COUNTS,
  TEXT_TYPES,
} from "@/lib/design-interview/intent-types";

/**
 * 五维度设计参数单（SealOrder）—— 印可道的中枢数据契约。
 *
 * 从 Stage 0 访谈（UserDesignIntent）继承五维度取值，加上确认态
 * 补充字段。整条三站流程围绕它流转：
 *
 *   Stage 0 访谈/全权委托 → SealOrder（URL 持久化）→ /design-brief
 *   参数单确认（可回改字段）→ /design-render 效果图（质感层渲染，
 *   文字层由崇羲引擎另行叠加）。
 *
 * URL 持久化（方案 A，PRD 12.1）：参数单序列化进 URL query，
 * /design-brief 与 /design-render 刷新可恢复、链接可分享。
 * Zod parse 保证反序列化安全——任何非法 query 静默回退空参数单。
 */

/* ─── 参数单 Schema ──────────────────────────────────────────── */

export const SealOrderSchema = z.object({
  /** 用途 */
  occasion: z.enum(OCCASIONS),
  /** 石种 */
  stone_type: z.enum(STONE_TYPES),
  /** 石料质地观感 */
  stone_look: z.enum(STONE_LOOKS),
  /** 价位带倾向（不含价格数字） */
  stone_budget: z.enum(STONE_BUDGETS),
  /** 形制 */
  seal_form: z.enum(SEAL_FORMS),
  /** 钮制 */
  finial_type: z.enum(FINIAL_TYPES),
  /** 边款 */
  side_inscription: z.enum(SIDE_INSCRIPTIONS),
  /** 装饰纹样程度 */
  decoration_level: z.enum(DECORATION_LEVELS),
  /** 印文意向 */
  text_type: z.enum(TEXT_TYPES),
  /** 字数 */
  text_count: z.enum(TEXT_COUNTS),
  /** 朱白 */
  seal_style: z.enum(SEAL_STYLES),

  /* ── 确认态补充 ── */
  /** 实际印文（用户输入；仅元信息，质感层渲染不使用文字） */
  seal_text: z.string().max(12).optional(),
  /** 边款内容方向（同上，仅元信息） */
  inscription_text: z.string().max(40).optional(),
  /** 是否「帮我全决定」产物 */
  decided_by_ai: z.boolean().default(false),
});

export type SealOrder = z.infer<typeof SealOrderSchema>;

/** 一份可展示的空参数单（全 unknown，/design-brief 无参进入时使用） */
export function emptySealOrder(): SealOrder {
  return {
    occasion: "unknown",
    stone_type: "unknown",
    stone_look: "unknown",
    stone_budget: "unknown",
    seal_form: "unknown",
    finial_type: "unknown",
    side_inscription: "unknown",
    decoration_level: "unknown",
    text_type: "unknown",
    text_count: "unknown",
    seal_style: "unknown",
    decided_by_ai: false,
  };
}

/** UserDesignIntent（访谈输出）→ SealOrder */
export function sealOrderFromIntent(intent: {
  occasion: SealOrder["occasion"];
  stone_type: SealOrder["stone_type"];
  stone_look: SealOrder["stone_look"];
  stone_budget: SealOrder["stone_budget"];
  seal_form: SealOrder["seal_form"];
  finial_type: SealOrder["finial_type"];
  side_inscription: SealOrder["side_inscription"];
  decoration_level: SealOrder["decoration_level"];
  text_type: SealOrder["text_type"];
  text_count: SealOrder["text_count"];
  seal_style: SealOrder["seal_style"];
}): SealOrder {
  return { ...intent, decided_by_ai: false };
}

/* ─── URL 序列化（短键，可读且紧凑） ─────────────────────────── */

const SHORT_KEYS: Record<string, string> = {
  occasion: "o",
  stone_type: "st",
  stone_look: "sl",
  stone_budget: "sb",
  seal_form: "f",
  finial_type: "fi",
  side_inscription: "si",
  decoration_level: "d",
  text_type: "tt",
  text_count: "tc",
  seal_style: "ss",
  seal_text: "tx",
  inscription_text: "it",
  decided_by_ai: "ai",
};

/** 序列化为 URL query 字符串（不含 '?'；空值字段跳过）。 */
export function encodeSealOrder(order: SealOrder): string {
  const params = new URLSearchParams();
  for (const [key, short] of Object.entries(SHORT_KEYS)) {
    const value = (order as Record<string, unknown>)[key];
    if (value === undefined || value === null) continue;
    const str = typeof value === "boolean" ? (value ? "1" : "0") : String(value);
    if (str === "" ) continue;
    params.set(short, str);
  }
  return params.toString();
}

/** 从 URL query（含或不含 '?'）安全反序列化；非法/缺失返回 null。 */
export function decodeSealOrder(query: string): SealOrder | null {
  if (!query) return null;
  try {
    const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
    const raw: Record<string, unknown> = {};
    for (const [key, short] of Object.entries(SHORT_KEYS)) {
      const value = params.get(short);
      if (value === null) continue;
      if (key === "decided_by_ai") raw[key] = value === "1";
      else raw[key] = value;
    }
    const parsed = SealOrderSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/* ─── 「帮我全决定」三套预设（PRD 7.1 全权委托 / 场景三） ─────── */

/**
 * 三套完整方案，气质互补（古朴白文方章 / 温润朱文细章 / 瑞兽钮礼品章
 * —— PRD 7.3 正例 #3）。固定映射表形态：MVP 期 F6 的简化实现，
 * 文化元素匹配的完整引擎在 M8 交付。
 */
export const DECIDED_PRESETS: { key: string; order: SealOrder }[] = [
  {
    key: "classic-baiwen",
    order: {
      ...emptySealOrder(),
      occasion: "self-use",
      stone_type: "qingtian",
      stone_look: "waxy",
      stone_budget: "daily",
      seal_form: "square",
      finial_type: "plain",
      side_inscription: "short",
      decoration_level: "plain",
      text_type: "name",
      text_count: "four",
      seal_style: "baiwen",
      decided_by_ai: true,
    },
  },
  {
    key: "gentle-zhuwen",
    order: {
      ...emptySealOrder(),
      occasion: "milestone",
      stone_type: "shoushan",
      stone_look: "pearly",
      stone_budget: "keepsake",
      seal_form: "rectangle",
      finial_type: "decorated-top",
      side_inscription: "long",
      decoration_level: "partial-relief",
      text_type: "commemorative",
      text_count: "flexible",
      seal_style: "zhuwen",
      decided_by_ai: true,
    },
  },
  {
    key: "beast-finial-gift",
    order: {
      ...emptySealOrder(),
      occasion: "gift",
      stone_type: "changhua",
      stone_look: "figured",
      stone_budget: "keepsake",
      seal_form: "square",
      finial_type: "beast",
      side_inscription: "short",
      decoration_level: "plain",
      text_type: "name",
      text_count: "two",
      seal_style: "baiwen",
      decided_by_ai: true,
    },
  },
];
