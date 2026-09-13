import { parseSealText } from "./layout";
import { mapForChongxi } from "./variant-map";
import { getChongxiFontInfo, lookupChongxiGlyph } from "./glyph-chongxi";
import { composeSealProofSvg, type SealProofGlyphInput } from "./svg-proof";

export interface SealFaceRenderOptions {
  text: string;
  style: "zhuwen" | "baiwen";
  texture: boolean;
  freedom: number;
  seed: number;
  include_textures?: boolean;
}

const svgUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;

/** 取形只执行一次，印蜕及正反贴图复用同一字形序列。缺字保留原格位。 */
export async function renderSealFace(options: SealFaceRenderOptions) {
  const chars = parseSealText(options.text);
  if (!chars) throw new Error("印文应为 1–4 字");
  const { mapped, changes } = mapForChongxi(chars.join(""));
  const missing: string[] = [];
  const glyphs: (SealProofGlyphInput | null)[] = [];
  for (const char of Array.from(mapped)) {
    const lookup = await lookupChongxiGlyph(char);
    glyphs.push(lookup.ok ? { char, metrics: lookup.glyph.metrics } : null);
    if (!lookup.ok && !missing.includes(char)) missing.push(char);
  }
  const input = { ...options, glyphs };
  const svg = composeSealProofSvg(input);
  let textures: { front: string; mirrored: string; size: number } | null = null;
  // 缺字可看留空的印蜕，不能产出不完整的生产贴图。
  if (options.include_textures && missing.length === 0) {
    const { default: sharp } = await import("sharp");
    const png = async (mirrored: boolean) => {
      const face = composeSealProofSvg({ ...input, surface: "face", mirrored });
      const bytes = await sharp(Buffer.from(face, "utf8"), { density: 184.32 }).resize(1024, 1024).png().toBuffer();
      return `data:image/png;base64,${bytes.toString("base64")}`;
    };
    const [front, mirrored] = await Promise.all([png(false), png(true)]);
    textures = { front, mirrored, size: 1024 };
  }
  const font = await getChongxiFontInfo();
  return {
    success: true as const,
    fontStack: "chongxi" as const,
    svg: { data_url: svgUrl(svg), mime: "image/svg+xml" as const },
    mapped_text: mapped,
    mapping_changes: changes,
    missing,
    textures,
    font: { num_glyphs: font.numGlyphs, units_per_em: font.unitsPerEm, outlines_format: font.outlinesFormat },
    generated_at: new Date().toISOString(),
    seed: options.seed,
  };
}
