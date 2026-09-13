/**
 * 崇曦栈印蜕 SVG 拼装（服务端 · 纯函数）。
 *
 * 视觉规格与峄山碑客户端版（SealFaceProof + globals.css .seal-proof
 * 系列）逐项同源——INTEGRATION-CHONGXI.md §5.2「两栈同一组件两种
 * 数据源，视觉规格逐一对齐」：
 *   - 色值：印泥红 #a83527 / 纸色 #f7f0e2（同 CSS --stamp-ink/paper）
 *   - 坐标系：400×400（同 wear 生成器原生坐标系）
 *   - 结构：8px 边框（400 系 10.67）+ 2px 内衬 + 2×2 格 + 墨迹盒
 *     紧凑（每格 97%、非均匀拉伸——客户端 GlyphBox 同规则）
 *   - 质感：斑驳 ellipse（layout.generateFlecks 同 seed 同密度）+
 *     carved 滤镜（feTurbulence+feDisplacementMap 同参数）
 *   - 朱白：白文=红底纸字 / 朱文=纸底红字；边框恒红（同 CSS）
 *
 * 排布三件（字序/错落/斑驳）全部复用 layout.ts——两栈共用同一排布
 * 层，只换字形来源。字形是 path 数据（非字体引用），产出 SVG 经
 * dataUrl <img> 渲染零字体依赖——路线 A「客户端永不见字体文件」。
 */

import {
  assignCells,
  generateFlecks,
  jitterForCells,
  type CellPosition,
} from "./layout";
import type { GlyphBoxMetrics } from "./glyph-chongxi";

/* ─── 视觉常量（客户端 CSS 的 400 系换算，300px→400 units ×4/3） ── */

const INK = "#a83527";
const PAPER = "#f7f0e2";

/** 印面区：400×400，含 8px 边框与 2px 内衬（CSS 原值 8/2px） */
const FACE = 400;
const BORDER = 10.67;
const PADDING = 2.67;
/** 内容区起点与尺寸（grid 外沿） */
const CONTENT = FACE - 2 * (BORDER + PADDING); // 373.33
const CONTENT_X0 = BORDER + PADDING;

/** 画布：印面外留纸边（客户端 .seal-proof-paper 的简化对称版） */
const MARGIN = 30;
const CANVAS = FACE + 2 * MARGIN; // 460

/** 墨迹盒占格比例（客户端 GlyphBox width/height 97%） */
const GLYPH_FILL = 0.97;

/** 白文描边加粗（客户端 white-style text-shadow 1px 的 400 系近似） */
const STROKE_BW = 1.33;
const STROKE_ZW = 0.8;

export interface SealProofGlyphInput {
  char: string;
  metrics: GlyphBoxMetrics;
}

export interface SealProofSvgInput {
  /** 已通过 cmap 的字形序列（顺序 = 印文字序） */
  glyphs: SealProofGlyphInput[];
  /** 朱白（白文=红底纸字 / 朱文=纸底红字） */
  style: "baiwen" | "zhuwen";
  /** 印泥斑驳开关 */
  texture: boolean;
  /** 章法错落自由度 0-100 */
  freedom: number;
  /** 变体种子 */
  seed: number;
}

/* ─── 工具 ─────────────────────────────────────────────────── */

const fmt = (n: number): string => Number(n.toFixed(2)).toString();

/** 四角非对称圆角矩形 path（CSS border-radius 4% 2% 5% 2% / 2% 5% 3% 4% 的近似）。 */
function roundedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: [number, number, number, number],
): string {
  const [rtl, rtr, rbr, rbl] = r.map((v) => Math.min(v, w / 2, h / 2));
  return [
    `M${fmt(x + rtl)} ${fmt(y)}`,
    `H${fmt(x + w - rtr)}`,
    `A${fmt(rtr)} ${fmt(rtr)} 0 0 1 ${fmt(x + w)} ${fmt(y + rtr)}`,
    `V${fmt(y + h - rbr)}`,
    `A${fmt(rbr)} ${fmt(rbr)} 0 0 1 ${fmt(x + w - rbr)} ${fmt(y + h)}`,
    `H${fmt(x + rbl)}`,
    `A${fmt(rbl)} ${fmt(rbl)} 0 0 1 ${fmt(x)} ${fmt(y + h - rbl)}`,
    `V${fmt(y + rbl)}`,
    `A${fmt(rtl)} ${fmt(rtl)} 0 0 1 ${fmt(x + rtl)} ${fmt(y)}`,
    "Z",
  ].join(" ");
}

/** 格位置 → grid 坐标（a11=左上 a12=右上 a21=左下 a22=右下 center=全区） */
function cellRect(position: CellPosition): { x: number; y: number; size: number } {
  const half = CONTENT / 2;
  switch (position) {
    case "a11":
      return { x: CONTENT_X0, y: CONTENT_X0, size: half };
    case "a12":
      return { x: CONTENT_X0 + half, y: CONTENT_X0, size: half };
    case "a21":
      return { x: CONTENT_X0, y: CONTENT_X0 + half, size: half };
    case "a22":
      return { x: CONTENT_X0 + half, y: CONTENT_X0 + half, size: half };
    case "center":
      return { x: CONTENT_X0, y: CONTENT_X0, size: CONTENT };
  }
}

/** 单字形元素：墨迹盒非均匀拉伸至格内 97%（±错落）。 */
function glyphNode(
  metrics: GlyphBoxMetrics,
  cell: { x: number; y: number; size: number },
  fill: string,
  strokeWidth: number,
  jitter: { dx: number; dy: number; sx: number; sy: number },
): string {
  const w0 = metrics.x2 - metrics.x1;
  const h0 = metrics.y2 - metrics.y1;
  if (w0 <= 0 || h0 <= 0) return ""; // 空字形防御：绝不输出退化 path

  // 目标盒：格中心 ± 半尺寸×97%×错落缩放；中心偏移=错落位移（% 相对格）
  const cx = cell.x + cell.size / 2 + (jitter.dx / 100) * cell.size;
  const cy = cell.y + cell.size / 2 + (jitter.dy / 100) * cell.size;
  const hw = (cell.size * GLYPH_FILL * jitter.sx) / 2;
  const hh = (cell.size * GLYPH_FILL * jitter.sy) / 2;

  const kx = (2 * hw) / w0;
  const ky = (2 * hh) / h0;
  const tx = cx - hw - kx * metrics.x1;
  const ty = cy - hh - ky * metrics.y1;

  return `<path d="${metrics.d}" transform="translate(${fmt(tx)} ${fmt(
    ty,
  )}) scale(${fmt(kx)} ${fmt(ky)})" fill="${fill}" stroke="${fill}" stroke-width="${fmt(
    strokeWidth / Math.min(kx, ky),
  )}" vector-effect="none"/>`;
}

/* ─── 主装配 ───────────────────────────────────────────────── */

/**
 * 拼装印蜕 SVG（自包含：纸底 + 印面 + 字形 path + 斑驳 + carved 滤镜）。
 * 纯确定性：同输入同输出（CI 可断言）——路线 A 的工程红利。
 */
export function composeSealProofSvg(input: SealProofSvgInput): string {
  const isWhite = input.style === "baiwen";
  const faceFill = isWhite ? INK : PAPER;
  const glyphFill = isWhite ? PAPER : INK;
  const strokeWidth = isWhite ? STROKE_BW : STROKE_ZW;

  const assignments = assignCells(input.glyphs.length);
  const jitters = jitterForCells(
    assignments.length,
    input.seed,
    input.freedom / 100,
  );

  /* 字形层：字序（assignCells 传统读序）→ 格 → 墨迹紧凑 */
  const glyphSvg = assignments
    .map((a, i) => {
      const glyph = input.glyphs[a.charIndex];
      if (!glyph) return "";
      return glyphNode(
        glyph.metrics,
        cellRect(a.position),
        glyphFill,
        strokeWidth,
        jitters[i] ?? { dx: 0, dy: 0, sx: 1, sy: 1 },
      );
    })
    .join("");

  /* 斑驳层：同 seed 同密度（fill 恒纸色——白文=红底漏红、朱文=笔画缺红） */
  let wearSvg = "";
  if (input.texture) {
    const { flecks, edges } = generateFlecks(input.seed);
    const all = [...flecks, ...edges];
    wearSvg =
      `<g fill="${PAPER}" opacity="0.55">` +
      all
        .map(
          (f) =>
            `<ellipse cx="${fmt(f.cx)}" cy="${fmt(f.cy)}" rx="${fmt(
              f.rx,
            )}" ry="${fmt(f.ry)}" transform="rotate(${fmt(f.rotate)} ${fmt(
              f.cx,
            )} ${fmt(f.cy)})"/>`,
        )
        .join("") +
      "</g>";
  }

  /* 印面（边框+底+字+斑驳）整体套 carved 滤镜与 -2° 旋转（同 CSS） */
  const faceSvg =
    `<g transform="rotate(-2 ${fmt(MARGIN + FACE / 2)} ${fmt(MARGIN + FACE / 2)})" filter="url(#seal-carved)">` +
    `<path d="${roundedRect(MARGIN + BORDER / 2, MARGIN + BORDER / 2, FACE - BORDER, FACE - BORDER, [
      16, 8, 20, 8,
    ])}" fill="${faceFill}" stroke="${INK}" stroke-width="${fmt(BORDER)}"/>` +
    glyphSvg +
    wearSvg +
    "</g>";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}" role="img">` +
    "<defs>" +
    `<radialGradient id="paper-grad" cx="20%" cy="30%" r="75%">` +
    `<stop offset="0%" stop-color="rgba(213,198,172,0.25)"/>` +
    `<stop offset="65%" stop-color="rgba(213,198,172,0)"/>` +
    "</radialGradient>" +
    `<filter id="seal-carved" x="-8%" y="-8%" width="116%" height="116%">` +
    '<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="12" result="noise"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6" xChannelSelector="R" yChannelSelector="G"/>' +
    "</filter>" +
    "</defs>" +
    `<rect width="${CANVAS}" height="${CANVAS}" fill="${PAPER}"/>` +
    `<rect width="${CANVAS}" height="${CANVAS}" fill="url(#paper-grad)"/>` +
    faceSvg +
    "</svg>"
  );
}
