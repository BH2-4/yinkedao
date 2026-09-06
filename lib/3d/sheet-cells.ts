import sharp from "sharp";

/**
 * 六宫格 → Meshy 选格拆解（B 线 Phase 1 服务端核心）。
 *
 * 输入是 /api/design-render 产出的标本档案 SVG（dataUrl）：照片以
 * <image href> 内嵌一整张 1024×1536 无字原图——分格标签、白色格缝、
 * 信息栏全是 SVG 覆盖层，不在照片像素里。因此「避开标签条」不是问题：
 * 从 SVG 提取照片原图后按 512 网格裁切，得到的天然是无标签纯照片格
 * （spike 02-split-sheet 已用同几何验证）。
 *
 * 选格语义（Meshy multi-image 限 4 张，第 1 张为主视图）：
 *   r0c0 白底正面（几何主输入） / r1c0 低角度侧光（体积感）
 *   r2c0 局部特写（表面质地）   / r2c1 整体多角度（形状互证）
 */

/** 标本档案照片版面（与 lib/design/specimen-sheet.ts 的常量同源；
 *  此处不 import 是为了按实际 metadata 比例自适应，仅用于校验档位）。 */
const EXPECTED_SHEET_W = 1024;
const EXPECTED_SHEET_H = 1536;

/** 六宫格行 × 列 */
const GRID_COLS = 2;
const GRID_ROWS = 3;

/** 选格（行, 列）——顺序即 Meshy image_urls 顺序，第 1 格为主视图 */
const SELECTED_CELLS: ReadonlyArray<{
  row: number;
  col: number;
  label: string;
}> = [
  { row: 0, col: 0, label: "front-white" },
  { row: 1, col: 0, label: "raking-light" },
  { row: 2, col: 0, label: "macro" },
  { row: 2, col: 1, label: "multi-angle" },
];

export interface SheetCell {
  label: string;
  /** PNG buffer（512×512，可直接 base64 进 Meshy data URI） */
  png: Buffer;
}

export class SheetParseError extends Error {}

/**
 * 从标本档案 SVG dataUrl 中提取内嵌的照片原图 buffer。
 *
 * specimen-sheet 是本仓库确定性代码产出的 SVG，<image href="...">
 * 结构固定——用单次正则提取即可，不引 XML 解析依赖。提取结果必须是
 * data URL（PNG/JPEG），否则视为入参不是本管线产物。
 */
export function extractSheetPhoto(sheetDataUrl: string): Buffer {
  const svgBase64 = /^data:image\/svg\+xml;base64,(.+)$/i.exec(sheetDataUrl);
  if (!svgBase64) {
    throw new SheetParseError(
      "效果图不是 SVG dataUrl——请传入 /api/design-render 返回的 image.data_url 原文",
    );
  }
  const svg = Buffer.from(svgBase64[1], "base64").toString("utf8");
  const imageTag = /<image\s[^>]*href="([^"]+)"/.exec(svg);
  if (!imageTag) {
    throw new SheetParseError("SVG 中未找到内嵌照片 <image href>——版面结构已变化，需同步本模块");
  }
  const photoHref = imageTag[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  const photoBase64 = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(photoHref);
  if (!photoBase64) {
    /* 演示模式（无生图 key）的照片是占位 SVG——给出人话而非技术错误 */
    if (/^data:image\/svg\+xml/i.test(photoHref)) {
      throw new SheetParseError(
        "当前效果图来自演示模式的占位渲染，不是真实六宫格照片——3D 效果图需在配置生图 API 的环境使用",
      );
    }
    throw new SheetParseError("内嵌照片不是 PNG/JPEG dataUrl，无法进入裁切");
  }
  return Buffer.from(photoBase64[2], "base64");
}

/**
 * 照片原图 → 4 张选格 PNG。
 *
 * 裁切窗口按实际尺寸 / 网格数计算（而非硬编码 512）：即使未来生图
 * 档位变化，比例几何依然正确。输出统一 PNG 无损（保石纹细节，
 * 与 spike 03 送 Meshy 的输入一致）。
 */
export async function splitSheetCells(photo: Buffer): Promise<SheetCell[]> {
  const meta = await sharp(photo).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < GRID_COLS * 64 || height < GRID_ROWS * 64) {
    throw new SheetParseError(`照片尺寸异常（${width}×${height}），无法按 ${GRID_COLS}×${GRID_ROWS} 网格裁切`);
  }
  // 档位漂移告警（不阻断）：1024×1536 是当前生图契约
  if (width !== EXPECTED_SHEET_W || height !== EXPECTED_SHEET_H) {
    console.warn(
      `[3d-model] 照片档位 ${width}×${height} 不同于契约 ${EXPECTED_SHEET_W}×${EXPECTED_SHEET_H}，按比例网格裁切`,
    );
  }

  const cellW = Math.floor(width / GRID_COLS);
  const cellH = Math.floor(height / GRID_ROWS);

  const cells: SheetCell[] = [];
  for (const { row, col, label } of SELECTED_CELLS) {
    const png = await sharp(photo)
      .extract({
        left: col * cellW,
        top: row * cellH,
        width: cellW,
        height: cellH,
      })
      .png()
      .toBuffer();
    cells.push({ label, png });
  }
  return cells;
}

/** 选格 buffer → Meshy data URI（顺序即数组顺序） */
export function cellsToDataUris(cells: SheetCell[]): string[] {
  return cells.map((c) => `data:image/png;base64,${c.png.toString("base64")}`);
}
