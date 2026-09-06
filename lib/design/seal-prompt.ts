import { z } from "zod";
import type { SealOrder } from "@/lib/design/seal-order";

/**
 * 印章质感层 Prompt 组装器（F4 参考图编辑管线 · 质感层）。
 *
 * 架构铁律（PRD 8.1 质感层/文字层分离）：本模块产出的 prompt 只描述
 * **无文字的章体质感层**——石材质感、形制轮廓、钮制、装饰氛围。
 * 印面文字与边款文字永远由崇羲字体引擎在质感层之上后叠加合成，
 * 生图管线不接触一个字的字形。
 *
 * 纯确定性翻译：SealOrder → SealImagePrompt，零发明、零文化断言。
 */

/* ─── 章型 → 英文（PRODUCT LOCK 同源机制：形制锁死） ──────────── */

const FORM_NOUN: Record<string, string> = {
  square: "a square-section seal stone with a flat top (Chinese scholar seal)",
  rectangle: "an elongated rectangular seal stone (Chinese scholar seal)",
  freeform: "a freeform baroque seal stone following the natural rock shape",
  unknown: "a Chinese scholar seal stone",
};

/** 形制互斥清单（负面镜像——方章不得渲染成长方/随形） */
const FORM_OTHERS: Record<string, string> = {
  square: "an elongated or freeform outline",
  rectangle: "a squat square or freeform outline",
  freeform: "a strictly geometric square or rectangular outline",
  unknown: "",
};

/** 钮制 → 视觉语言（素材库实拍对应：素钮/兽钮/龙钮/纹饰顶） */
const FINIAL_VISUAL: Record<string, string> = {
  plain: "an undecorated plain polished top",
  beast: "a recumbent guardian lion (beast) finial carved on top",
  dragon: "a coiled dragon finial carved on top",
  "decorated-top": "a top carved with shallow bas-relief ornament (thin Yi style)",
  unknown: "a simply finished top",
};

/** 石种 → 质感语言（02/06 调研石料体系；不写参数数字） */
const STONE_VISUAL: Record<string, string> = {
  qingtian: "Qingtian stone: pale celadon-green paste, waxy luster, fine even grain",
  shoushan: "Shoushan stone: warm ivory-to-cream tone with subtle pearlescent sheen",
  changhua: "Changhua stone: warm ground with vivid vermilion cinnabar streaks",
  balin: "Balin stone: translucent frost-like body with soft candle-light glow",
  laoshit: "Laos stone: mellow honey-amber translucency with gentle cloud banding",
  unknown: "fine Chinese seal stone with gentle translucency",
};

/** 观感修饰（06 质地语言：蜡状/玻璃/珍珠光泽） */
const LOOK_VISUAL: Record<string, string> = {
  waxy: "waxy subdued luster",
  vitreous: "glassy vitreous transparency",
  pearly: "soft pearly satiny reflection",
  figured: "multi-colored figural patterning with natural veins",
  unknown: "gentle natural luster",
};

/** 装饰程度 */
const DECOR_VISUAL: Record<string, string> = {
  plain: "plain uncarved body surfaces",
  "partial-relief": "one face carved with a shallow mountain-and-water bas-relief, other faces left plain",
  "full-carving": "the whole body carved with continuous shallow relief scenery",
  unknown: "minimal surface carving",
};

/* ─── 结构化 Prompt 契约 ─────────────────────────────────────── */

export const SealImagePromptSchema = z.object({
  /** 参数单回显（UI「为什么这样生成」面板用，不进 prompt 正文） */
  order_echo: z.object({
    seal_form: z.string(),
    finial_type: z.string(),
    stone_type: z.string(),
    stone_look: z.string(),
    decoration_level: z.string(),
    side_inscription: z.string(),
    text_type: z.string(),
    seal_style: z.string(),
  }),

  /* B — 形制决策 */
  form: z.object({
    seal_form: z.string(),
    finial_type: z.string(),
  }),
  /* C — 石料质感 */
  stone: z.object({
    stone_type: z.string(),
    stone_look: z.string(),
  }),
  /* D — 装饰（纹样程度；边款仅留位置氛围，不留文字） */
  decoration: z.object({
    decoration_level: z.string(),
    side_inscription: z.string(),
  }),
  /* E — 印面元信息（仅记录；质感层不渲染任何文字） */
  face: z.object({
    text_type: z.string(),
    text_count: z.string(),
    seal_style: z.string(),
  }),

  /* F — 安全约束（质感层/文字层分离铁律） */
  constraints: z.array(z.string()).min(1),

  /* 组装串（确定性派生） */
  prompt: z.string().min(1),
  negative_prompt: z.string().min(1),
});

export type SealImagePrompt = z.infer<typeof SealImagePromptSchema>;

/* ─── 组装器 ─────────────────────────────────────────────────── */

/**
 * 纯确定性 SealOrder → SealImagePrompt 翻译。
 * 形制锁死（FORM LOCK）+ 素坯无字铁律（NO TEXT）双闸。
 */
export function buildSealImagePrompt(order: SealOrder): SealImagePrompt {
  const formNoun = FORM_NOUN[order.seal_form] ?? FORM_NOUN.unknown;
  const finial = FINIAL_VISUAL[order.finial_type] ?? FINIAL_VISUAL.unknown;
  const stone = STONE_VISUAL[order.stone_type] ?? STONE_VISUAL.unknown;
  const look = LOOK_VISUAL[order.stone_look] ?? LOOK_VISUAL.unknown;
  const decor = DECOR_VISUAL[order.decoration_level] ?? DECOR_VISUAL.unknown;
  const formOthers = FORM_OTHERS[order.seal_form] ?? FORM_OTHERS.unknown;

  /* 六宫格标本档案版面：一次生成保证六格是同一方石头（分次生成会漂）。
     顺序必须与 lib/design/specimen-sheet.ts 的 PANEL_LABELS 逐格对应，
     否则标签会张冠李戴——两处都留了这条注释。 */
  const panels: string[] = [
    "Panel 1 (top-left): front view, even soft studio light, pure white seamless background",
    "Panel 2 (top-right): the same front view, even soft light, dark charcoal slate background",
    "Panel 3 (middle-left): low-angle raking side light on a dark background, grazing light revealing surface relief",
    "Panel 4 (middle-right): strong backlight transmission — a flashlight behind the stone making it glow translucent from within",
    "Panel 5 (bottom-left): extreme macro close-up of the stone surface showing crystalline grain, veining and tiny mineral specks, shallow depth of field",
    "Panel 6 (bottom-right): a group arrangement of the same stone photographed from four different angles on a light grey background",
  ];

  /* 石料本体描述——六格共用同一份，模型据此保持跨格一致 */
  const subject: string[] = [
    `THE SAME IDENTICAL STONE APPEARS IN EVERY PANEL — ${formNoun}, crowned with ${finial}`,
    `carved from ${stone}, showing ${look}`,
    `${decor}`,
  ];

  /* 边款氛围：只留「刻痕区域」的视觉暗示，绝不出现文字 */
  if (order.side_inscription !== "none" && order.side_inscription !== "unknown") {
    subject.push(
      "one side face carries a narrow vertical band of fine shallow engraved lines (an uncarved inscription area, NO readable characters)",
    );
  }

  /* 印面区域：完整平面留白，供文字层后叠加 */
  subject.push(
    "the bottom seal face is a clean flat polished plane left completely blank",
  );

  const segments: string[] = [
    "A photographic specimen contact sheet of ONE single Chinese seal stone, arranged as a clean 2-column by 3-row grid of six separate photographs separated by thin white gutters, each photograph filling its cell edge to edge",
    ...subject,
    ...panels,
    "sharp product photography, high detail, neutral and consistent color across all six panels",
  ];

  const constraints = [
    // 质感层/文字层分离第一道闸（PRD 8.1 架构说明）
    "NO TEXT RULE: the stone must be completely free of any characters, letters, numerals, seal script, calligraphy or readable engraving — text layers are composited later by a deterministic font engine",
    // 档案版面第二道闸：标签栏与信息栏由 specimen-sheet.ts 用代码写上去，
    // 模型画的任何文字都会与真标签重叠，必须全域禁止
    "NO LABELS RULE: do not draw any panel labels, captions, titles, borders with text, measurement scales, rulers, coins or watermarks anywhere in the grid — the sheet is annotated later in code",
    "no symbolic or cultural meaning should be depicted; the stone is a material object only",
    "present as a contemporary custom design concept, not a replica of any historical artifact",
  ];

  const negative: string[] = [
    "any characters, letters, numbers, Chinese seal script, calligraphy, inscriptions or text of any kind",
    "readable engraved writing on any face",
    "panel labels, captions, titles, annotations, measurement scales, rulers or coins",
    "human hands, face or model",
    "complex scene, busy background",
    "gold, jade jewelry, beads or beads-string",
    // 注意：不能禁「多颗石头」——第 6 格就是同一方石头的多角度合影。
    // 要禁的是「不同的石头」，即六格之间石头本体发生变化。
    "a different stone in different panels, mismatched colour or pattern between panels",
    "watermark",
    "logo",
  ];
  if (formOthers) negative.push(formOthers);

  const prompt =
    segments.join(", ") + ". " + constraints.join(". ") + ".";
  const negative_prompt = negative.join(", ");

  return {
    order_echo: {
      seal_form: order.seal_form,
      finial_type: order.finial_type,
      stone_type: order.stone_type,
      stone_look: order.stone_look,
      decoration_level: order.decoration_level,
      side_inscription: order.side_inscription,
      text_type: order.text_type,
      seal_style: order.seal_style,
    },
    form: { seal_form: order.seal_form, finial_type: order.finial_type },
    stone: { stone_type: order.stone_type, stone_look: order.stone_look },
    decoration: {
      decoration_level: order.decoration_level,
      side_inscription: order.side_inscription,
    },
    face: {
      text_type: order.text_type,
      text_count: order.text_count,
      seal_style: order.seal_style,
    },
    constraints,
    prompt,
    negative_prompt,
  };
}
