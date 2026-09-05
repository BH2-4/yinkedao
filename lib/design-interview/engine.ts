import {
  type DecorationLevel,
  type FinialType,
  type InterviewAnswers,
  type InterviewQuestionId,
  type Occasion,
  type SealForm,
  type SealStyle,
  type StoneBudget,
  type StoneLook,
  type StoneType,
  type TextCount,
  type TextType,
  type UserDesignIntent,
} from "./intent-types";

/**
 * Stage 0 五维度访谈引擎：题库结构 + 自适应状态机 + 规则合成（篆刻域）。
 *
 * 五维度序列（PRD F1）：石料 → 用途 → 外形 → 装饰 → 印面。
 * 设计原则（继承银中贵访谈机制，业务域重写）：
 *  - 每次只问一个核心问题，视觉化卡片、短选项，零专业知识门槛。
 *  - 下一题由已答内容动态决定（确定性规则分支，而非自由文本问卷）。
 *  - 任意题目可跳过；跳过 → 字段 unknown，置信度下降。
 *  - 约 7–11 题完成（图案印跳过字数/朱白两题，随形章跳过钮制题）。
 *  - 术语跟白话（PRD 7.2 人设）：朱白、冻地等词必附一句白话。
 *  - 选项值对齐 02/06 石料体系与 05 章法枚举，不出现价格数字。
 *
 * 文案与结构分离：本文件只含题目结构（id / 模式 / 选项 id），
 * 展示文案全部来自 messages/*.json 的 interview 段（i18n 单一事实源）。
 */

/* ─── 题库（仅结构） ─────────────────────────────────────────── */

export type InterviewOption = {
  /** 选项 id（同时是 UserDesignIntent 的 token / "unsure" 探索标记） */
  id: string;
};

export type InterviewQuestion = {
  id: InterviewQuestionId;
  mode: "single" | "multiple";
  maxSelect?: number;
  /** 含「帮我探索」类选项（不算跳过，但置信度较低） */
  hasExploreOption?: boolean;
  options: InterviewOption[];
};

export const QUESTIONS: Record<InterviewQuestionId, InterviewQuestion> = {
  /* ── 维度一 · 石料 ── */
  stone_type: {
    id: "stone_type",
    mode: "single",
    hasExploreOption: true,
    options: [
      { id: "qingtian" },
      { id: "shoushan" },
      { id: "changhua" },
      { id: "balin" },
      { id: "laoshit" },
      { id: "unsure" },
    ],
  },
  stone_look: {
    id: "stone_look",
    mode: "single",
    options: [
      { id: "waxy" },
      { id: "vitreous" },
      { id: "pearly" },
      { id: "figured" },
    ],
  },
  stone_budget: {
    id: "stone_budget",
    mode: "single",
    options: [
      { id: "entry" },
      { id: "daily" },
      { id: "keepsake" },
      { id: "open" },
    ],
  },
  /* ── 维度二 · 用途 ── */
  occasion: {
    id: "occasion",
    mode: "single",
    options: [
      { id: "commemorate-travel" },
      { id: "milestone" },
      { id: "gift" },
      { id: "self-use" },
    ],
  },
  /* ── 维度三 · 外形 ── */
  seal_form: {
    id: "seal_form",
    mode: "single",
    hasExploreOption: true,
    options: [
      { id: "square" },
      { id: "rectangle" },
      { id: "freeform" },
      { id: "unsure" },
    ],
  },
  finial_type: {
    id: "finial_type",
    mode: "single",
    hasExploreOption: true,
    options: [
      { id: "plain" },
      { id: "beast" },
      { id: "dragon" },
      { id: "decorated-top" },
      { id: "unsure" },
    ],
  },
  /* ── 维度四 · 装饰 ── */
  side_inscription: {
    id: "side_inscription",
    mode: "single",
    options: [
      { id: "none" },
      { id: "short" },
      { id: "long" },
    ],
  },
  decoration_level: {
    id: "decoration_level",
    mode: "single",
    options: [
      { id: "plain" },
      { id: "partial-relief" },
      { id: "full-carving" },
    ],
  },
  /* ── 维度五 · 印面 ── */
  text_type: {
    id: "text_type",
    mode: "single",
    hasExploreOption: true,
    options: [
      { id: "name" },
      { id: "commemorative" },
      { id: "studio" },
      { id: "pictorial" },
      { id: "unsure" },
    ],
  },
  text_count: {
    id: "text_count",
    mode: "single",
    options: [
      { id: "one" },
      { id: "two" },
      { id: "four" },
      { id: "flexible" },
    ],
  },
  seal_style: {
    id: "seal_style",
    mode: "single",
    options: [
      { id: "zhuwen" },
      { id: "baiwen" },
      { id: "recommend" },
    ],
  },
};

/* ─── 自适应流程（确定性规则分支） ───────────────────────────── */

type FlowStep = {
  id: InterviewQuestionId;
  /** 是否进入流程（仅依赖流程中更早的题目，保证剩余流程可完全确定） */
  when: (answers: InterviewAnswers) => boolean;
};

/** 印文意向是否已定且非图案印（图案印无字数与朱白概念） */
function textTypewritten(answers: InterviewAnswers): boolean {
  const picked = answers.text_type?.[0];
  return !!picked && picked !== "unsure" && picked !== "pictorial";
}

/** 形制是否为随形章（随形章以薄意/素面为主，跳过钮制题） */
function isFreeform(answers: InterviewAnswers): boolean {
  return answers.seal_form?.[0] === "freeform";
}

const FLOW: FlowStep[] = [
  /* 维度一 · 石料 */
  { id: "stone_type", when: () => true },
  { id: "stone_look", when: () => true },
  { id: "stone_budget", when: () => true },
  /* 维度二 · 用途 */
  { id: "occasion", when: () => true },
  /* 维度三 · 外形 */
  { id: "seal_form", when: () => true },
  // 随形章 → 跳过钮制（随形以薄意/素面为主，钮制认知负担过高）
  { id: "finial_type", when: (a) => !isFreeform(a) },
  /* 维度四 · 装饰 */
  { id: "side_inscription", when: () => true },
  { id: "decoration_level", when: () => true },
  /* 维度五 · 印面 */
  { id: "text_type", when: () => true },
  // 图案印（或待探索）→ 跳过字数与朱白
  { id: "text_count", when: (a) => textTypewritten(a) },
  { id: "seal_style", when: (a) => textTypewritten(a) },
];

/** 条件依赖图：改动某题答案后需要作废的下游题目 */
const DEPENDENTS: Partial<
  Record<InterviewQuestionId, InterviewQuestionId[]>
> = {
  // 用途变 → 印文方向重问（纪念→纪念文，自用→姓名/斋号）
  occasion: ["text_type"],
  // 形制变 → 钮制作废（随形 ↔ 规整形互切）
  seal_form: ["finial_type"],
  // 印文意向变 → 字数与朱白作废
  text_type: ["text_count", "seal_style"],
};

/**
 * 自适应下一题：返回下一道应问的题目；null 表示访谈完成。
 * askedIds 中已答 / 已跳过的题目不再重复。
 */
export function nextQuestionId(
  answers: InterviewAnswers,
  askedIds: ReadonlySet<InterviewQuestionId>,
): InterviewQuestionId | null {
  for (const step of FLOW) {
    if (askedIds.has(step.id)) continue;
    if (step.when(answers)) return step.id;
  }
  return null;
}

/** 当前答案下的完整流程（用于精确进度 X / N） */
export function getFlowQuestionIds(
  answers: InterviewAnswers,
): InterviewQuestionId[] {
  return FLOW.filter((step) => step.when(answers)).map((step) => step.id);
}

/**
 * 回答（或修改）某题后作废受影响的下游答案。
 * 例：把形制从「方章」改成「随形」→ 清空 finial_type，流程自动重新收敛。
 */
export function invalidateDependents(
  answers: InterviewAnswers,
  changedId: InterviewQuestionId,
): InterviewAnswers {
  const next = { ...answers };
  const clear = (id: InterviewQuestionId) => {
    if (id in next) delete next[id];
    const deps = DEPENDENTS[id];
    if (deps) deps.forEach(clear);
  };
  const deps = DEPENDENTS[changedId];
  deps?.forEach(clear);
  return next;
}

/* ─── i18n 标签源（文案注入，单一事实源在 messages/*.json） ──── */

export type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

export interface InterviewLabels {
  /** interview.* 文案模板 */
  t: TranslateFn;
  /** interview.values.<category>.<token> 词条；缺失时回退 token 本身 */
  v: (category: string, token: string) => string;
}

/** 用任意 translate 函数构造标签源（客户端 useI18n / 服务端 translate 均可） */
export function makeInterviewLabels(t: TranslateFn): InterviewLabels {
  return {
    t,
    v: (category, token) => {
      const key = `interview.values.${category}.${token}`;
      const label = t(key);
      return label === key ? token : label;
    },
  };
}

/* ─── 规则合成 UserDesignIntent ──────────────────────────────── */

function pick<T extends string>(answer: string[] | null | undefined): T | null {
  const first = answer?.[0];
  if (!first || first === "unsure") return null; // 探索选项 → unknown（低置信由 fieldConfidence 计）
  return first as T;
}

function joinLabels(
  tokens: string[],
  labelOf: (token: string) => string,
  separator: string,
): string {
  return tokens.map(labelOf).join(separator);
}

/** 规则模板 user_context（AI 不可用 / 校验失败时的兜底，文案经 i18n 注入） */
export function buildRuleUserContext(
  intent: Omit<UserDesignIntent, "user_context" | "confidence">,
  L: InterviewLabels,
): string {
  const sep = L.t("interview.ruleContext.separator");
  const parts: string[] = [];

  if (intent.occasion !== "unknown") {
    parts.push(
      L.t("interview.ruleContext.occasion", {
        occasion: L.v("occasion", intent.occasion),
      }),
    );
  }
  if (intent.stone_type !== "unknown") {
    parts.push(
      L.t("interview.ruleContext.stone", {
        stone: L.v("stone", intent.stone_type),
        look: L.v("stoneLook", intent.stone_look),
      }),
    );
  }
  if (intent.stone_budget !== "unknown") {
    parts.push(
      L.t("interview.ruleContext.budget", {
        budget: L.v("stoneBudget", intent.stone_budget),
      }),
    );
  }
  if (intent.seal_form !== "unknown") {
    parts.push(
      L.t("interview.ruleContext.form", {
        form: L.v("sealForm", intent.seal_form),
        finial: L.v("finialType", intent.finial_type),
      }),
    );
  }
  if (intent.side_inscription !== "unknown") {
    parts.push(
      L.t("interview.ruleContext.inscription", {
        inscription: L.v("sideInscription", intent.side_inscription),
        decoration: L.v("decorationLevel", intent.decoration_level),
      }),
    );
  }
  if (intent.text_type !== "unknown") {
    parts.push(
      L.t("interview.ruleContext.face", {
        textType: L.v("textType", intent.text_type),
        count: L.v("textCount", intent.text_count),
        style: L.v("sealStyle", intent.seal_style),
      }),
    );
  }
  if (parts.length === 0) return L.t("interview.ruleContext.fallback");
  return `${parts.join(sep)}。`;
}

/**
 * 字段级置信度：
 *  - 明确单选 1.0 / 探索选项 0.35
 *  - 跳过或未问 0.25
 */
function fieldConfidence(
  answer: string[] | null | undefined,
  question: InterviewQuestion,
): number {
  if (answer === null) return 0.25; // 明确跳过
  if (!answer || answer.length === 0) return 0.25; // 未问 / 未答
  if (answer[0] === "unsure") return 0.35;
  return 1.0;
}

/** 五维度全部字段的置信度合成（未问题目按 0.25 计） */
function confidencesOf(
  answers: InterviewAnswers,
  intent: Omit<UserDesignIntent, "user_context" | "confidence">,
): number[] {
  return [
    fieldConfidence(answers.stone_type, QUESTIONS.stone_type),
    fieldConfidence(answers.stone_look, QUESTIONS.stone_look),
    fieldConfidence(answers.stone_budget, QUESTIONS.stone_budget),
    fieldConfidence(answers.occasion, QUESTIONS.occasion),
    fieldConfidence(answers.seal_form, QUESTIONS.seal_form),
    // 随形章跳过钮制题：不算低置信，按 0.7 推导计
    isFreeform(answers)
      ? intent.finial_type === "unknown"
        ? 0.7
        : 1.0
      : fieldConfidence(answers.finial_type, QUESTIONS.finial_type),
    fieldConfidence(answers.side_inscription, QUESTIONS.side_inscription),
    fieldConfidence(answers.decoration_level, QUESTIONS.decoration_level),
    fieldConfidence(answers.text_type, QUESTIONS.text_type),
    // 图案印跳过字数/朱白：按 0.7 推导计
    textTypewritten(answers)
      ? fieldConfidence(answers.text_count, QUESTIONS.text_count)
      : intent.text_count === "unknown"
        ? 0.7
        : 1.0,
    textTypewritten(answers)
      ? fieldConfidence(answers.seal_style, QUESTIONS.seal_style)
      : intent.seal_style === "unknown"
        ? 0.7
        : 1.0,
  ];
}

/**
 * 确定性合成：答案 → UserDesignIntent（枚举字段闭合，永不失败）。
 * L 仅用于 user_context 的文案（规则模板走 i18n）。
 */
export function buildUserDesignIntent(
  answers: InterviewAnswers,
  L: InterviewLabels,
): UserDesignIntent {
  const base = {
    occasion: pick<Occasion>(answers.occasion) ?? "unknown",
    stone_type: pick<StoneType>(answers.stone_type) ?? "unknown",
    stone_look: pick<StoneLook>(answers.stone_look) ?? "unknown",
    stone_budget: pick<StoneBudget>(answers.stone_budget) ?? "unknown",
    seal_form: pick<SealForm>(answers.seal_form) ?? "unknown",
    finial_type: pick<FinialType>(answers.finial_type) ?? "unknown",
    side_inscription:
      pick<import("./intent-types").SideInscription>(
        answers.side_inscription,
      ) ?? "unknown",
    decoration_level:
      pick<DecorationLevel>(answers.decoration_level) ?? "unknown",
    text_type: pick<TextType>(answers.text_type) ?? "unknown",
    text_count: pick<TextCount>(answers.text_count) ?? "unknown",
    seal_style: pick<SealStyle>(answers.seal_style) ?? "unknown",
  };

  const confidences = confidencesOf(answers, base);
  const confidence =
    Math.round(
      (confidences.reduce((sum, c) => sum + c, 0) / confidences.length) *
        100,
    ) / 100;

  return {
    ...base,
    user_context: buildRuleUserContext(base, L),
    confidence,
  };
}

/* ─── AI user_context 合成提示词（篆刻域禁虚构护栏） ──────────── */

export const INTENT_SYNTHESIS_SYSTEM_PROMPT = `你是「印可道」篆刻定制平台 Stage 0「五维度设计访谈」的意图合成器。

你会收到一位普通消费者的访谈答案（JSON，字段为石料/用途/外形/装饰/印面五维度的偏好选择），以及指定的输出语言。

你的唯一任务：将答案合成为一句自然、克制、有文化质感的句子（user_context），描述这位用户的印章设计偏好画像。

严格规则：
1. 只描述用户偏好本身（石种观感、用途、形制、钮制、边款、印文意向），像一位懂石料的篆刻工作室店员，不掉书袋。
2. 禁止编造石料参数：不得出现任何硬度、密度、折射率数字，不得虚构产地排名或「最适合XX」的因果断言。
3. 禁止谈论篆字字形：不得描述字会长什么样、笔画画风（字形由字体引擎渲染，访谈层不涉及）。
4. 禁止任何象征意义与文化典故断言（如「龙钮寓意权威」）——未经溯源的文化内容一律不写。
5. 禁止出现价格数字或报价暗示。
6. 禁止编造答案中没有的偏好。
7. 使用指定的输出语言，长度约 40–120 字（或等效），一至两句，以句号结尾。
8. 只输出 JSON 对象：{"user_context": "..."}，不要输出任何其他文本。`;

/** locale → AI 输出语言名（注入用户消息） */
export const OUTPUT_LANGUAGE_NAMES: Record<string, string> = {
  "zh-CN": "简体中文",
};
