#!/usr/bin/env node
/**
 * 印面贴图生成器（B 线 · 印面叠字 Phase 1.5）。
 *
 * 取形/排布/视觉规格复刻崇曦 A 线（feature/chongxi-mainline 的
 * lib/seal-face/{glyph-chongxi,layout,svg-proof}.ts——只读参考，
 * 独立实现，不合代码）：
 *   - opentype.js 直读崇曦 OTF（truetype glyf），getPath(0,0,100)
 *     取形 + boundingBox 墨迹边界
 *   - 400 系版面：边框 10.67 + 内衬 2.67 + 2×2 格 + 97% 填格
 *   - 三字排布 a12(右上)→a22(右下)→a21(左下)（PRD 05 传统读序）
 *   - 色值：印泥红 #a83527 / 纸色 #f7f0e2（两栈同源）
 *   - seed 错落（LCG，位移 ±0.6% 缩放 ±0.9% × 自由度）
 *
 * 3D 贴图语境适配（与印蜕 SVG 的差异）：
 *   - 朱文 = 透明底红字 + 红边框（叠在石面上只显字与框）
 *   - 白文 = 红底纸色字（用户拍板「红底白字」）
 *   - 出正字 + 镜像两份：印面贴的是反字（钤出来才是正字）
 *   - rasterize 到 1024×1024（sharp density 放大，400→1024）
 *
 * 用法：
 *   node scripts/seal-3d-face/make-face-textures.mjs [--text 印可道]
 * 字体路径：env SEAL_CHONGXI_FONT_PATH（默认 ~/seal-ai-hackathon/
 *   fonts/chongxi/chongxi_seal.otf，A 线资产位约定）。
 * 输出：public/seal-3d-face/{zhuwen,baiwen}-{front,mirrored}.png ×4
 */

import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import sharp from "sharp";

/* ─── 版面常量（A 线 400 系同源） ─────────────────────────────── */

const INK = "#a83527";
const PAPER = "#f7f0e2";

const FACE = 400;
const BORDER = 10.67;
const PADDING = 2.67;
const CONTENT = FACE - 2 * (BORDER + PADDING);
const CONTENT_X0 = BORDER + PADDING;
const HALF = CONTENT / 2;

/** 墨迹盒占格比例——A 线用 97%，视觉复核教训「字贴框」：3D 贴图
 *  降到 88% 留笔画边距（协调者拍板「留白过紧」修正项） */
const GLYPH_FILL = 0.88;
/** 朱文描边 / 白文描边（A 线 STROKE 常量） */
const STROKE_ZW = 1.33;
const STROKE_BW = 0.8;

/** 输出贴图尺寸 */
const TEX_SIZE = 1024;

/** demo 印文与错落参数（seed 与真图任务一致，可复现） */
const DEFAULT_TEXT = "印可道";
const SEED = 21;
const FREEDOM = 0.35;

/* ─── seed 错落（A 线 layout.ts 的 LCG 同参数 port） ──────────── */

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function jitterForCells(count) {
  const random = lcg(SEED);
  const amount = FREEDOM;
  return Array.from({ length: count }, () => ({
    dx: (random() - 0.5) * 1.2 * amount,
    dy: (random() - 0.5) * 1.2 * amount,
    sx: 1 + (random() - 0.5) * 0.018 * amount,
    sy: 1 + (random() - 0.5) * 0.018 * amount,
  }));
}

/* ─── 三字格位（A 线 assignCells case 3：右上→右下→左下） ─────── */

function cellRect(position) {
  switch (position) {
    case "a11": return { x: CONTENT_X0, y: CONTENT_X0 };
    case "a12": return { x: CONTENT_X0 + HALF, y: CONTENT_X0 };
    case "a21": return { x: CONTENT_X0, y: CONTENT_X0 + HALF };
    case "a22": return { x: CONTENT_X0 + HALF, y: CONTENT_X0 + HALF };
    case "center": return { x: CONTENT_X0, y: CONTENT_X0 };
  }
}

/** N 字格位序（>4 字截断到 4——贴图 demo 上限同 A 线） */
function assignCells(count) {
  switch (Math.max(1, Math.min(4, count))) {
    case 1: return [{ position: "center", charIndex: 0 }];
    case 2:
      return [
        { position: "a12", charIndex: 0 },
        { position: "a22", charIndex: 1 },
      ];
    case 3:
      return [
        { position: "a12", charIndex: 0 },
        { position: "a22", charIndex: 1 },
        { position: "a21", charIndex: 2 },
      ];
    default:
      return [
        { position: "a12", charIndex: 0 },
        { position: "a22", charIndex: 1 },
        { position: "a11", charIndex: 2 },
        { position: "a21", charIndex: 3 },
      ];
  }
}

/* ─── 字形取形（A 线 glyph-chongxi 同法：fontSize=100 坐标系） ─── */

function lookupGlyph(font, char) {
  const glyphIndex = font.charToGlyphIndex(char);
  if (glyphIndex === 0) return null; // 未命中绝不造字（产品铁律）
  const glyph = font.glyphs.get(glyphIndex);
  const p = glyph.getPath(0, 0, 100);
  const box = p.getBoundingBox();
  return { d: p.toPathData(3), x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 };
}

/* ─── SVG 拼装 ─────────────────────────────────────────────── */

const fmt = (n) => Number(n.toFixed(2)).toString();

/** 边框：四角非对称圆角矩形（A 线 border-radius 近似） */
function borderPath() {
  const [rtl, rtr, rbr, rbl] = [16, 8, 20, 8];
  const x = BORDER, y = BORDER, w = FACE - 2 * BORDER, h = FACE - 2 * BORDER;
  return [
    `M${fmt(x + rtl)} ${fmt(y)}`, `H${fmt(x + w - rtr)}`,
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

/** 单字形：墨迹盒非均匀拉伸至格内 97%（±错落）——A 线 glyphNode 同法 */
function glyphNode(m, cell, fill, strokeWidth, jitter) {
  const w0 = m.x2 - m.x1;
  const h0 = m.y2 - m.y1;
  if (w0 <= 0 || h0 <= 0) return "";
  const cx = cell.x + HALF / 2 + (jitter.dx / 100) * HALF;
  const cy = cell.y + HALF / 2 + (jitter.dy / 100) * HALF;
  const hw = (HALF * GLYPH_FILL * jitter.sx) / 2;
  const hh = (HALF * GLYPH_FILL * jitter.sy) / 2;
  const kx = (2 * hw) / w0;
  const ky = (2 * hh) / h0;
  const tx = cx - hw - kx * m.x1;
  const ty = cy - hh - ky * m.y1;
  return `<path d="${m.d}" transform="translate(${fmt(tx)} ${fmt(ty)}) scale(${fmt(kx)} ${fmt(ky)})" fill="${fill}" stroke="${fill}" stroke-width="${fmt(strokeWidth / Math.min(kx, ky))}"/>`;
}

/** 拼装印面 SVG（透明底语境：朱文无底 rect、白文红底 rect 全幅） */
function composeFaceSvg(metrics, style) {
  const parts = [];
  if (style === "baiwen") {
    parts.push(`<path d="${borderPath()}" fill="${INK}"/>`);
  } else {
    parts.push(`<path d="${borderPath()}" fill="none" stroke="${INK}" stroke-width="${fmt(BORDER * 0.75)}"/>`);
  }
  const glyphFill = style === "baiwen" ? PAPER : INK;
  const strokeWidth = style === "baiwen" ? STROKE_BW : STROKE_ZW;
  const assignments = assignCells(metrics.length);
  const jitters = jitterForCells(assignments.length);
  assignments.forEach((a, i) => {
    parts.push(glyphNode(metrics[a.charIndex], cellRect(a.position), glyphFill, strokeWidth, jitters[i]));
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FACE}" height="${FACE}" viewBox="0 0 ${FACE} ${FACE}">${parts.join("\n")}</svg>`;
}

/* ─── 主流程 ─────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);
  const textIdx = args.indexOf("--text");
  const text = textIdx >= 0 ? args[textIdx + 1] : DEFAULT_TEXT;
  const chars = [...text];

  const fontPath =
    process.env.SEAL_CHONGXI_FONT_PATH?.trim() ||
    path.join(process.env.HOME, "seal-ai-hackathon/fonts/chongxi/chongxi_seal.otf");
  const buffer = readFileSync(fontPath);
  const font = opentype.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  console.log(`字体：${font.numGlyphs} 字形 / unitsPerEm=${font.unitsPerEm} / ${font.outlinesFormat}`);

  const metrics = chars.map((ch) => {
    const m = lookupGlyph(font, ch);
    if (!m) {
      console.error(`✗ 「${ch}」cmap 未命中（崇曦缺字，绝不造字）——换字或补映射`);
      process.exit(1);
    }
    return m;
  });
  console.log(`印文「${text}」取形 OK：${metrics.map((m) => `${Math.round(m.x2 - m.x1)}×${Math.round(m.y2 - m.y1)}`).join(" ")}`);

  const outDir = path.join(process.cwd(), "public", "seal-3d-face");
  mkdirSync(outDir, { recursive: true });

  /* 400→1024：density = 72 × 1024/400 */
  const density = (72 * TEX_SIZE) / FACE;

  for (const style of ["zhuwen", "baiwen"]) {
    const svg = composeFaceSvg(metrics, style);
    const base = sharp(Buffer.from(svg), { density }).resize(TEX_SIZE, TEX_SIZE).png();
    const front = path.join(outDir, `${style}-front.png`);
    await base.toFile(front);
    /* 镜像版：水平翻转（印面贴反字，钤出正字） */
    const mirrored = path.join(outDir, `${style}-mirrored.png`);
    await sharp(Buffer.from(svg), { density }).resize(TEX_SIZE, TEX_SIZE).flop().png().toFile(mirrored);
    const kb = (await sharp(front).toBuffer()).length / 1024;
    console.log(`✓ ${style}: front + mirrored（${kb.toFixed(0)}KB/张 @${TEX_SIZE}px）`);
  }
  console.log(`\n输出目录：${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
