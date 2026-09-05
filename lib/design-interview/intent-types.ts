import { z } from "zod";

/**
 * Stage 0 — 五维度设计访谈 类型定义（篆刻域）。
 *
 * 五维度（PRD 12.1 / F1）：石料 → 用途 → 外形 → 装饰 → 印面。
 * 核心约束：
 *  - Stage 0 只负责理解「用户偏好」，输出结构化 UserDesignIntent。
 *  - 枚举值对齐 02/06 调研石料体系（四大国石 + 老挝石中间价位带）、
 *    05 报告章法枚举（1-4 字）与 PRD 5.1 场景（纪念旅行/人生节点/
 *    赠礼/自用书画）。
 *  - 绝对不允许生成未经溯源的文化断言：不编造石料参数（硬度/密度/
 *    价格数字）、不谈论篆字字形（渲染层的事）、不断言印式典故与
 *    象征意义。文化匹配完全交由溯源知识库完成（M8）。
 */

/* ─── 封闭枚举（五维度） ─────────────────────────────────────── */

/** 用途（PRD 5.1 主 persona 场景） */
export const OCCASIONS = [
  "commemorate-travel",
  "milestone",
  "gift",
  "self-use",
  "unknown",
] as const;

/** 石种（02/06：四大国石 + 老挝石中间价位带主力） */
export const STONE_TYPES = [
  "qingtian",
  "shoushan",
  "changhua",
  "balin",
  "laoshit",
  "unknown",
] as const;

/** 石料质地观感（06 质地语言：蜡状/玻璃/珍珠光泽 + 纹彩） */
export const STONE_LOOKS = [
  "waxy",
  "vitreous",
  "pearly",
  "figured",
  "unknown",
] as const;

/** 价位带倾向（具体数字 PRD 待补——选项不落价格数字） */
export const STONE_BUDGETS = [
  "entry",
  "daily",
  "keepsake",
  "open",
  "unknown",
] as const;

/** 形制 */
export const SEAL_FORMS = [
  "square",
  "rectangle",
  "freeform",
  "unknown",
] as const;

/** 钮制（素钮为主，PRD 11.2-F1；兽钮/龙钮/纹饰顶对应素材库实拍） */
export const FINIAL_TYPES = [
  "plain",
  "beast",
  "dragon",
  "decorated-top",
  "unknown",
] as const;

/** 边款（有无与内容方向） */
export const SIDE_INSCRIPTIONS = [
  "none",
  "short",
  "long",
  "unknown",
] as const;

/** 装饰纹样程度（MVP 极简——PRD 11.3 可砍项） */
export const DECORATION_LEVELS = [
  "plain",
  "partial-relief",
  "full-carving",
  "unknown",
] as const;

/** 印文意向 */
export const TEXT_TYPES = [
  "name",
  "commemorative",
  "studio",
  "pictorial",
  "unknown",
] as const;

/** 字数（05 报告章法枚举：1-4 字排布模式；四字最标准 6 种排法） */
export const TEXT_COUNTS = [
  "one",
  "two",
  "four",
  "flexible",
  "unknown",
] as const;

/** 朱白（PRD 场景二：用户不懂时听推荐） */
export const SEAL_STYLES = [
  "zhuwen",
  "baiwen",
  "recommend",
  "unknown",
] as const;

export type Occasion = (typeof OCCASIONS)[number];
export type StoneType = (typeof STONE_TYPES)[number];
export type StoneLook = (typeof STONE_LOOKS)[number];
export type StoneBudget = (typeof STONE_BUDGETS)[number];
export type SealForm = (typeof SEAL_FORMS)[number];
export type FinialType = (typeof FINIAL_TYPES)[number];
export type SideInscription = (typeof SIDE_INSCRIPTIONS)[number];
export type DecorationLevel = (typeof DECORATION_LEVELS)[number];
export type TextType = (typeof TEXT_TYPES)[number];
export type TextCount = (typeof TEXT_COUNTS)[number];
export type SealStyle = (typeof SEAL_STYLES)[number];

/* ─── UserDesignIntent Schema ────────────────────────────────── */

export const UserDesignIntentSchema = z.object({
  /** 用途（纪念旅行/人生节点/赠礼/自用书画） */
  occasion: z.enum(OCCASIONS),
  /** 石种偏好 */
  stone_type: z.enum(STONE_TYPES),
  /** 石料质地观感偏好 */
  stone_look: z.enum(STONE_LOOKS),
  /** 价位带倾向（不含价格数字） */
  stone_budget: z.enum(STONE_BUDGETS),
  /** 形制（方章/长方章/随形） */
  seal_form: z.enum(SEAL_FORMS),
  /** 钮制（素钮为主；随形章跳过本题） */
  finial_type: z.enum(FINIAL_TYPES),
  /** 边款（无边款/短款/长款） */
  side_inscription: z.enum(SIDE_INSCRIPTIONS),
  /** 装饰纹样程度 */
  decoration_level: z.enum(DECORATION_LEVELS),
  /** 印文意向（姓名/纪念文/斋号闲章/图案印） */
  text_type: z.enum(TEXT_TYPES),
  /** 印文字数（图案印跳过本题） */
  text_count: z.enum(TEXT_COUNTS),
  /** 朱白（朱文/白文/听推荐） */
  seal_style: z.enum(SEAL_STYLES),
  /** 一句话用户偏好画像（仅描述偏好，禁止编造参数与文化断言） */
  user_context: z.string().min(1).max(200),
  /** 综合置信度 0–1（由字段级置信度加权平均） */
  confidence: z.number().min(0).max(1),
});

export type UserDesignIntent = z.infer<typeof UserDesignIntentSchema>;

/* ─── 访谈答案协议（API 边界） ───────────────────────────────── */

/** 访谈题目 ID，即 UserDesignIntent 的来源字段 */
export type InterviewQuestionId =
  | "stone_type"
  | "stone_look"
  | "stone_budget"
  | "occasion"
  | "seal_form"
  | "finial_type"
  | "side_inscription"
  | "decoration_level"
  | "text_type"
  | "text_count"
  | "seal_style";

/**
 * 答案 = 选题 id 数组；null 表示「跳过 / 不确定」。
 * （单选题恰好 1 项；多选题 ≤ maxSelect 项。）
 */
export type InterviewAnswers = Partial<
  Record<InterviewQuestionId, string[] | null>
>;

export const InterviewAnswersSchema = z.record(
  z.string().max(40),
  z.union([z.array(z.string().max(40)).max(3), z.null()]),
);

/** API 响应：intent + 合成来源（ai = AI 润色 user_context / rule = 纯规则） */
export type DesignIntentResponse = {
  intent: UserDesignIntent;
  source: "ai" | "rule";
};

/* ─── 护栏：Stage 0 全链路禁虚构断言（篆刻域反转） ──────────── */

/**
 * Stage 0 任何生成文本（AI 的 user_context、handoff message）都不得
 * 包含以下未经溯源的断言（PRD 10.1 两个最易幻觉点的第一道闸）：
 *  1. 石料参数编造（硬度/密度/折射率等数字——只准来自结构化石料库）
 *  2. 篆字/字形声明（字形只能来自崇羲字体库，访谈层不谈字形）
 *  3. 象征意义断言（寓意/象征需文献溯源，M8 交文化元素库）
 *  4. 价格数字断言（价位带 PRD 待补，访谈层不报价）
 */
const UNSUPPORTED_CLAIM_PATTERNS: RegExp[] = [
  // 石料参数编造（反例库 #8）
  /硬度\s*[0-9.]+|密度\s*[0-9.]+|折射率|摩氏\s*[0-9.]+|Mohs\s*[0-9]/i,
  // 篆字字形（铁律：字形只能来自崇羲库，WHEN-THEN 7.2.5）
  /篆字|篆书|篆形|字形|fonttools/i,
  // 价格数字（升级护栏：不报价，PRD 7.2.6）
  /[0-9]+\s*元|¥\s*[0-9]|报价/i,
  // 象征性断言（需溯源，反例 #6）
  /象征|寓意|意味着|symboliz/i,
  // 品质绝对化承诺（诚实边界 PRD 16.3）
  /无裂无钉保证|绝无瑕疵|完全一样/,
];

/** 检测文本是否含未经溯源的虚构断言（用于 AI 输出后置校验） */
export function containsCulturalClaims(text: string): boolean {
  return UNSUPPORTED_CLAIM_PATTERNS.some((pattern) => pattern.test(text));
}

/*
 * 展示文案（题目、选项、词条、规则模板）全部位于 messages/*.json 的
 * interview 段——见 lib/design-interview/engine.ts 的 makeInterviewLabels。
 */
