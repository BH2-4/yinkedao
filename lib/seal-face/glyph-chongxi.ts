/**
 * 崇曦篆体服务端取形模块（INTEGRATION-CHONGXI.md §5.1 · 路线 A）。
 *
 * opentype.js 直读崇曦原始 OTF——不转换、不分片、不分发（CC BY-ND
 * 3.0 TW 合规路线：客户端只收 path 数据，永不见字体文件）。
 *
 * 预跑实证（2026-09-06，opentype.js 2.0.0）：
 *   - outlinesFormat: truetype（.otf 扩展名误导，实为 glyf 非 CFF）
 *   - numGlyphs: 11,603 / unitsPerEm: 1024
 *   - charToGlyphIndex + getPath + getBoundingBox 全链可用
 *   - 简体「寿万无灵龟凤变体」cmap 全未命中 → 映射层为必选前置
 *
 * 本模块只做取形（查字/路径/墨迹边界）；排布在 layout.ts，拼装在
 * svg-proof.ts——三层互不感知，峄山碑栈与崇曦栈共用同一排布层。
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as opentype from "opentype.js";

/* ─── 字体资产定位 ─────────────────────────────────────────── */

/**
 * 崇曦 OTF 路径解析：env 覆写 → 仓库内默认位置。
 *
 * 字体文件不入 git（.gitignore /assets/fonts/——安置方式待决）：
 * 缺文件时本模块返回不可用，font-stack.ts 据此回退峄山碑栈——
 * demo 永不断。
 */
export function resolveChongxiFontPath(): string {
  const fromEnv = process.env.SEAL_CHONGXI_FONT_PATH?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  // process.cwd() 在 Next.js API route 运行时 = 项目根（serverless
  // bundle 内由 outputFileTracingIncludes 携带资产时亦如此解析）。
  return path.join(process.cwd(), "assets", "fonts", "chongxi", "chongxi_seal.otf");
}

/** 字体资产是否就位（font-stack 回退链的探测点）。 */
export function chongxiFontAvailable(): boolean {
  return existsSync(resolveChongxiFontPath());
}

/* ─── 字体单例（21.2MB 解析一次，进程级缓存） ────────────────── */

let fontPromise: Promise<opentype.Font> | null = null;

async function loadFont(): Promise<opentype.Font> {
  if (!fontPromise) {
    fontPromise = (async () => {
      const filePath = resolveChongxiFontPath();
      const buffer = readFileSync(filePath);
      // readFileSync 返回的 Buffer 持有池化内存，parse 需要“干净”的
      // ArrayBuffer 视图——按预跑验证过的切片方式传入。
      return opentype.parse(
        buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ) as ArrayBuffer,
      );
    })().catch((error: unknown) => {
      // 失败不缓存：下次请求重试（字体被中途删除/换路径的场景）。
      fontPromise = null;
      throw error;
    });
  }
  return fontPromise;
}

/* ─── 取形结果契约 ─────────────────────────────────────────── */

/** 单字墨迹边界（fontSize=100 基准，与客户端 GlyphBox 的 100px measureText 同标尺）。 */
export interface GlyphBoxMetrics {
  /** SVG path d 字符串（fontSize=100 坐标系，y 向下） */
  d: string;
  /** 墨迹边界（fontSize=100 坐标系） */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ChongxiGlyph {
  char: string;
  metrics: GlyphBoxMetrics;
}

export type ChongxiGlyphLookup =
  | { ok: true; glyph: ChongxiGlyph }
  | { ok: false; reason: "missing" };

/** cmap 查字 + 取形。未命中返回 missing——绝不造字（产品铁律）。 */
export async function lookupChongxiGlyph(
  char: string,
): Promise<ChongxiGlyphLookup> {
  const font = await loadFont();
  const glyphIndex = font.charToGlyphIndex(char);
  if (glyphIndex === 0) return { ok: false, reason: "missing" };
  const glyph = font.glyphs.get(glyphIndex);
  // fontSize=100：与客户端版 GlyphBox（canvas 100px measureText）同标尺，
  // 紧凑排布参数（97% 格占位/±0.6% 错落）在两栈间直接可比。
  const p = glyph.getPath(0, 0, 100);
  const box = p.getBoundingBox();
  return {
    ok: true,
    glyph: {
      char,
      metrics: {
        d: p.toPathData(3),
        x1: box.x1,
        y1: box.y1,
        x2: box.x2,
        y2: box.y2,
      },
    },
  };
}

/* ─── 字体元信息（署名/诊断用） ─────────────────────────────── */

export interface ChongxiFontInfo {
  numGlyphs: number;
  unitsPerEm: number;
  outlinesFormat: string;
}

export async function getChongxiFontInfo(): Promise<ChongxiFontInfo> {
  const font = await loadFont();
  return {
    numGlyphs: font.numGlyphs,
    unitsPerEm: font.unitsPerEm,
    outlinesFormat: font.outlinesFormat,
  };
}
