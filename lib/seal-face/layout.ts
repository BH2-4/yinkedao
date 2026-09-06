/**
 * 小篆印蜕排布引擎（纯函数层 · 客户端/服务端通用）。
 *
 * 字形源：峄山碑篆体（@chinese-fonts/ysbzt，woff2 unicode-range 分片，
 * 浏览器按需加载）——产品字体栈（用户拍板 2026-09-06）。
 * 合规注记：该字体授权「免费商用 + 禁止修改」——与崇羲同模式
 * 「只渲染不分发」：字体文件不进 public/ 可下载路径，产出物标注
 * 字体来源「峄山碑篆体（字传 · 免费商用）」。
 *
 * 排布算法与斑驳/错落生成器 ported from JackerKun/XiaoZhuan (MIT)，
 * 字序映射按 PRD 05 章法硬约束改为传统读序（先上后下、先右后左）。
 */

/* ─── 网格位置（DOM 序：行主序 a11→a12→a21→a22） ─────────────── */

export type CellPosition = "a11" | "a12" | "a21" | "a22" | "center";

export interface CellAssignment {
  position: CellPosition;
  /** 印文中的第几个字（0-based） */
  charIndex: number;
}

/* ─── 字序映射（PRD 05 传统读序：先上后下、先右后左） ───────────── */

/**
 * 四字标准序：右上→右下→左上→左下（PRD 术语表「字序」条）。
 * DOM 位置 → 印文字序：
 *   a12（右上）= 第 1 字   a22（右下）= 第 2 字
 *   a11（左上）= 第 3 字   a21（左下）= 第 4 字
 * 对照 demo（JackerKun/XiaoZhuan）原映射为现代左起序——已按用户拍板
 * 改为传统字序；三字排法（右列两字 + 左列沉底）为暂定式，待文化
 * 评审人确认（PRD 14「映射规则需文化评审」）。
 */
export function assignCells(charCount: number): CellAssignment[] {
  switch (Math.max(1, Math.min(4, charCount))) {
    case 1:
      return [{ position: "center", charIndex: 0 }];
    case 2:
      /* 二字：右列上下（右上、右下） */
      return [
        { position: "a12", charIndex: 0 },
        { position: "a22", charIndex: 1 },
      ];
    case 3:
      /* 三字：右上、右下、左下（暂定式，待文化评审） */
      return [
        { position: "a12", charIndex: 0 },
        { position: "a22", charIndex: 1 },
        { position: "a21", charIndex: 2 },
      ];
    case 4:
    default:
      /* 四字正格：右上→右下→左上→左下 */
      return [
        { position: "a12", charIndex: 0 },
        { position: "a22", charIndex: 1 },
        { position: "a11", charIndex: 2 },
        { position: "a21", charIndex: 3 },
      ];
  }
}

/* ─── seed 错落参数模型（ported from JackerKun/XiaoZhuan, MIT） ──── */

/** LCG 伪随机（与 demo stamp.js 同参数，可复现） */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface JitterParams {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
}

/**
 * 每字错落参数（位移 ±0.6% / 缩放 ±0.9%，随自由度 0–1 放大）。
 * demo 原参数：位移 ±0.6%、缩放 ±0.9%（amount 加权）。
 */
export function jitterForCells(
  cellCount: number,
  seed: number,
  freedom: number,
): JitterParams[] {
  const random = lcg(seed);
  const amount = Math.max(0, Math.min(1, freedom));
  return Array.from({ length: cellCount }, () => ({
    dx: (random() - 0.5) * 1.2 * amount,
    dy: (random() - 0.5) * 1.2 * amount,
    sx: 1 + (random() - 0.5) * 0.018 * amount,
    sy: 1 + (random() - 0.5) * 0.018 * amount,
  }));
}

/* ─── 印泥斑驳 / 边缘磨损生成器（ported, MIT） ──────────────────── */

export interface Fleck {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotate: number;
}

/**
 * 印面 400×400 坐标系：210 个随机 fleck + 44 个浅边缘磨损
 * （边缘磨损保持浅刻，保证印面边界可读——demo 原注释同义）。
 */
export function generateFlecks(seed: number): { flecks: Fleck[]; edges: Fleck[] } {
  const random = lcg(seed);
  const rot = () => random() * 180;
  const flecks: Fleck[] = Array.from({ length: 210 }, () => ({
    cx: random() * 400,
    cy: random() * 400,
    rx: 0.25 + random() * 1.2,
    ry: 0.3 + random() * 1.8,
    rotate: rot(),
  }));
  const edges: Fleck[] = Array.from({ length: 44 }, (_, i) => {
    const side = i % 4;
    const p = random() * 400;
    const edge = random() * 4;
    return {
      cx: side === 0 ? edge : side === 1 ? 400 - edge : p,
      cy: side === 2 ? edge : side === 3 ? 400 - edge : p,
      rx: 1 + random() * 3,
      ry: 1 + random() * 4,
      rotate: rot(),
    };
  });
  return { flecks, edges };
}

/* ─── 印文输入整理 ───────────────────────────────────────────── */

/** 拆字（去空白）；>4 字返回 null 由调用方如实提示。 */
export function parseSealText(text: string): string[] | null {
  const chars = Array.from(text.replace(/\s/g, ""));
  if (chars.length === 0) return null;
  if (chars.length > 4) return null;
  return chars;
}
