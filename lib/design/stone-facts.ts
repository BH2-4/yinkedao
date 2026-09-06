import type { SealOrder } from "@/lib/design/seal-order";

/**
 * 石料标本档案的事实层 —— 信息栏里每一格数据的来源。
 *
 * 真值分层（与 lib/heritage 的双轴证据体系同源精神）：
 *
 *  · 名称 / 产地 / 特征  = 石种的公认属性，写死在下表，逐字上图。
 *  · 尺寸 / 重量        = **参考值**，由形制的常见毛坯规格按密度推算，
 *                        上图时强制带「参考」二字。
 *
 * 铁律：绝不为一张 AI 效果图编造具体实物的实测数据。访谈没有采集尺寸
 * 维度，所以这里给的是「该形制的常见规格」而非「这方石头的尺寸」——
 * 措辞与标注必须让用户一眼看出区别（PRD 9.1 反冒充红线）。
 */

/* ─── 石种档案 ───────────────────────────────────────────────── */

export interface StoneFacts {
  /** 石种正式名（含料级限定） */
  name: string;
  /** 主产地 */
  origin: string;
  /** 质感特征描述（逐条上图，每条一行） */
  features: string[];
}

const STONE_FACTS: Record<string, StoneFacts> = {
  qingtian: {
    name: "青田石",
    origin: "浙江青田",
    features: [
      "青绿色为主，夹青白、乳白色",
      "质地细腻，温润柔和",
      "具天然纹理与少量杂质",
    ],
  },
  shoushan: {
    name: "寿山石",
    origin: "福建福州寿山",
    features: [
      "乳白至米黄色调，色泽温润",
      "蜡状光泽，微透至半透",
      "质地细腻，受刀爽利",
    ],
  },
  changhua: {
    name: "昌化石",
    origin: "浙江临安昌化",
    features: [
      "暖色地子上现朱砂红斑",
      "红白对比强烈，色界分明",
      "质地略脆，需避开砂钉",
    ],
  },
  balin: {
    name: "巴林石",
    origin: "内蒙古赤峰巴林右旗",
    features: [
      "冻质半透，霜白至浅黄色调",
      "光泽柔和，观感通润",
      "质地均匀，易于奏刀",
    ],
  },
  laoshit: {
    name: "老挝石",
    origin: "老挝北部",
    features: [
      "蜜黄至琥珀色，半透明",
      "常见云状色带与淡色晕",
      "质地绵密，油脂光泽",
    ],
  },
  unknown: {
    name: "印章石料",
    origin: "产地未指定",
    features: ["天然印石，具自然纹理", "质地细腻，适合奏刀"],
  },
};

export function stoneFacts(stoneType: string): StoneFacts {
  return STONE_FACTS[stoneType] ?? STONE_FACTS.unknown;
}

/* ─── 形制规格（参考值来源） ─────────────────────────────────── */

interface FormSpec {
  label: string;
  /** 常见毛坯规格 [宽, 深, 高] cm */
  size: [number, number, number];
  /** 体积填充率——随形章非规则体，按外接长方体折算 */
  fill: number;
  /** 标注的尺寸是否为外接尺寸 */
  bounding: boolean;
}

/**
 * 常见篆刻毛坯规格。方章取 2.5cm 见方（最通行的自用章规格），
 * 长方章取 2.0×3.0，随形章按外接尺寸计并折算 0.72 填充率。
 */
const FORM_SPECS: Record<string, FormSpec> = {
  square: { label: "方章", size: [2.5, 2.5, 5.0], fill: 1, bounding: false },
  rectangle: { label: "长方章", size: [2.0, 3.0, 5.5], fill: 1, bounding: false },
  freeform: { label: "随形章", size: [3.0, 2.5, 6.0], fill: 0.72, bounding: true },
  unknown: { label: "方章", size: [2.5, 2.5, 5.0], fill: 1, bounding: false },
};

/**
 * 印石参考密度 g/cm³。印石主成分为叶蜡石类，取 2.65 作单一参考值——
 * 不按石种细分，避免把「石种密度差异」这种需要实测支撑的精度伪装出来。
 */
const REFERENCE_DENSITY = 2.65;

/* ─── 信息栏数据 ─────────────────────────────────────────────── */

export interface SpecimenSpec {
  facts: StoneFacts;
  /** 形制中文名 */
  formLabel: string;
  /** 尺寸串，已含「约」与外接标注 */
  sizeText: string;
  /** 重量串，已含「约」 */
  weightText: string;
}

/** SealOrder → 信息栏所需的全部字段（纯确定性推导，无 AI 参与）。 */
export function specimenSpec(order: SealOrder): SpecimenSpec {
  const form = FORM_SPECS[order.seal_form] ?? FORM_SPECS.unknown;
  const [w, d, h] = form.size;
  const grams = w * d * h * form.fill * REFERENCE_DENSITY;

  return {
    facts: stoneFacts(order.stone_type),
    formLabel: form.label,
    sizeText: `约 ${w} × ${d} × ${h} cm${form.bounding ? "（外接）" : ""}`,
    // 取整到 5g——推算值给到个位数会显得像实测数据
    weightText: `约 ${Math.round(grams / 5) * 5} g`,
  };
}
