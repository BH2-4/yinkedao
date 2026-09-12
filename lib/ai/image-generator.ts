/**
 * AI IMAGE GENERATION · 印章质感层 Provider adapter（印可道）
 *
 * 印章生图的唯一入口是 generateSealDesignImage()：生图只负责「无文字
 * 章体质感层」——石材质感、形制轮廓、钮制、装饰氛围；印文与边款文字
 * 由崇羲字体引擎在质感层之上确定性叠加（lib/design/seal-prompt.ts 的
 * NO TEXT RULE 是第一道闸，本渲染器不绘制任何文字）。具体 provider
 * （gpt-image / mock）在此选择，路由层无感。
 *
 * fork 前身的首饰管线（generateDesignImage / dalle3 / 首饰 mock SVG）
 * 已随 F 批银饰清理移除。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { OpenAI, toFile } from "openai";
import type { SealImagePrompt } from "@/lib/design/seal-prompt";

export type ImageProvider = "mock" | "openai-gpt-image";

export interface DesignImageResult {
  /** Self-contained image the browser can render directly. */
  dataUrl: string;
  mime: "image/svg+xml" | "image/png";
  provider: ImageProvider;
  model: string;
  generatedAt: string;
}

/** Deterministic PRNG — the same seed always draws the same render. */
/** Deterministic PRNG — the same seed always draws the same render. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SealImageRequest {
  prompt: SealImagePrompt;
  /** Regeneration seed — varies reference picks per click. */
  seed: number;
}

const SEAL_REFERENCE_DIR = path.join(process.cwd(), "public", "seal-references");

/**
 * 生图模型名（env 可换，不改代码）。
 *
 * 官方端点用 `gpt-image-2`；走中转站时按其型号表填——例如 DMXAPI 推荐
 * `gpt-image-2-ssvip`（更稳更快）。注意各中转站开通的型号不同：同一个
 * key 上 `gpt-image-2` 可用而 `gpt-image-1` 返回 model_not_found 是常态，
 * 换站必先验型号。
 */
function getImageModel(): string {
  return process.env.IMAGE_MODEL?.trim() || "gpt-image-2";
}

/**
 * 生图请求超时。必须 ≤ 路由的 maxDuration（见 app/api/design-render/route.ts），
 * 否则线上函数先被平台杀掉，SDK 还在空等，客户端只能收到平台的超时页而非
 * 我们的 typed error envelope。
 * 240s：DMXAPI gpt-image-2-ssvip 单张常态 30-60s，偶发网关抖动 + 一次
 * 3s 退避重试最坏 ~150s——留足头部，且仍在 maxDuration=300 之内。
 */
const IMAGE_TIMEOUT_MS = Number(process.env.IMAGE_TIMEOUT_MS) || 240_000;

/**
 * 标本档案版面尺寸：2 列 × 3 行、单格 512²，故为竖版 1024×1536。
 * 必须与 lib/design/specimen-sheet.ts 的 PHOTO_W/PHOTO_H 一致——
 * 标签是按格网坐标绝对定位的，尺寸对不上标签就会错位。
 */
const SHEET_SIZE = "1024x1536" as const;

/**
 * 形制 → 参考图目录（forms/ 章型钮制 + craftsmanship/ 工艺特写必附）。
 * materials/（M1 石料实拍库，7 张已落盘）由 pickMaterialReference 单独
 * 处理：命中石种则占 1 张参考位。全部缺失时走纯文本生成（同模型）。
 */
const SEAL_REFERENCE_CATEGORIES: Record<string, string[]> = {
  square: ["forms/square-plain", "forms/square-beast", "craftsmanship/side-inscription"],
  rectangle: ["forms/rectangle-chang", "craftsmanship/bask-relief"],
  freeform: ["forms/freeform", "craftsmanship/bask-relief"],
  unknown: ["forms/square-plain", "craftsmanship/side-inscription"],
};

/**
 * M1 石料实拍的石种匹配词——对齐 materials/ 实际文件名（01_昌化鸡血石…
 * 07_瑕疵练习料一组）。零命中不补位：错石种实拍会反向引导色感（如寿山
 * 单拉一张鸡血石图），宁缺毋滥，forms 池仍在。
 */
const MATERIAL_STONE_KEYWORDS: Record<string, string[]> = {
  changhua: ["昌化"],
  balin: ["巴林"],
  laoshit: ["老挝"],
  qingtian: ["青田"],
  shoushan: ["寿山", "田黄"],
};

/** 按订单石种挑 1 张石料实拍（seed 轮转同款石头多张时换图）。 */
async function pickMaterialReference(
  stoneType: string,
  seed: number,
): Promise<string[]> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(path.join(SEAL_REFERENCE_DIR, "materials")))
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  } catch {
    return []; // 目录缺失（M1 前）静默降级
  }
  const keywords = MATERIAL_STONE_KEYWORDS[stoneType] ?? [];
  const hit = files.filter((f) => keywords.some((k) => f.includes(k)));
  if (hit.length === 0) return [];
  return [path.join(SEAL_REFERENCE_DIR, "materials", hit[seed % hit.length])];
}

async function pickSealReferences(
  sealForm: string,
  stoneType: string,
  seed: number,
): Promise<string[]> {
  const categories =
    SEAL_REFERENCE_CATEGORIES[sealForm] ?? SEAL_REFERENCE_CATEGORIES.unknown;

  const candidates: string[] = [];
  for (const category of categories) {
    const dir = path.join(SEAL_REFERENCE_DIR, category);
    let files: string[] = [];
    try {
      files = (await fs.readdir(dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    } catch {
      continue; // 目录未建（D 批前）静默降级
    }
    candidates.push(...files.map((f) => path.join(dir, f)));
  }

  /* 石料实拍置顶占 1 位（INTEGRATION-IMAGEPIPE §2.2），forms/craft 池让位：
     命中时 3 张 = materials 1 + 池 2；未命中回落池 3 张。 */
  const materialPicked = await pickMaterialReference(stoneType, seed);
  if (candidates.length === 0) return materialPicked;
  const count = Math.min(3 - materialPicked.length, candidates.length);

  /* 步长与候选数互质才能不重复取样：原先固定步长 3 在候选数为 3 的倍数时
     （freeform = freeform 1 张 + bask-relief 2 张）三次全落同一张图，
     等于把「三张参考图」退化成一张。 */
  const step = candidates.length % 3 === 0 ? 1 : 3;
  const start = seed % candidates.length;
  const picked: string[] = [...materialPicked];
  for (let i = 0; i < count; i++) {
    picked.push(candidates[(start + i * step) % candidates.length]);
  }
  return picked;
}

/** 印章质感层生成入口（gpt-image 参考图编辑 / mock 章型 SVG）。 */
export async function generateSealDesignImage(
  request: SealImageRequest,
): Promise<DesignImageResult> {
  const configured = process.env.IMAGE_PROVIDER?.toLowerCase();
  if (configured === "openai-gpt-image" && process.env.OPENAI_API_KEY) {
    return generateSealViaGptImage(request);
  }
  return {
    dataUrl: renderSealMockSvg(request),
    mime: "image/svg+xml",
    provider: "mock",
    model: "mock-seal-renderer-v1",
    generatedAt: new Date().toISOString(),
  };
}

/**
 * edit 端点上游偶发 502/504 网关抖动（中转 API 实测）——等 3s 重试一次；
 * 401（key 失效）/429（限流）等不重试直接抛，避免无谓等待。
 */
async function withEditRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const status = err instanceof OpenAI.APIError ? err.status : undefined;
    if (status !== 502 && status !== 504) throw err;
    console.warn(`[image-generator] edit 端点网关抖动(HTTP ${status})，3s 后重试一次`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return fn();
  }
}

async function generateSealViaGptImage(
  request: SealImageRequest,
): Promise<DesignImageResult> {
  const { prompt } = request;

  const referenceIntro = [
    "The attached reference photos show real, documented Chinese seal stones and their carving craft.",
    "Inherit their material quality, lapidary form language and hand-carved texture — but do NOT replicate or copy any reference piece.",
    "Design an ORIGINAL seal stone:",
  ].join(" ");

  const fullPrompt = `${referenceIntro} ${prompt.prompt} Do not add these elements: ${prompt.negative_prompt}.`;

  const model = getImageModel();
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    timeout: IMAGE_TIMEOUT_MS,
  });

  const referencePaths = await pickSealReferences(
    prompt.form.seal_form,
    prompt.stone.stone_type,
    request.seed,
  );

  if (referencePaths.length === 0) {
    const response = await openai.images.generate({
      model,
      prompt: fullPrompt,
      n: 1,
      size: SHEET_SIZE,
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error(`${model} returned no image data.`);
    return {
      dataUrl: `data:image/png;base64,${b64}`,
      mime: "image/png",
      provider: "openai-gpt-image",
      model,
      generatedAt: new Date().toISOString(),
    };
  }

  const files = await Promise.all(
    referencePaths.map(async (p) =>
      toFile(await fs.readFile(p), path.basename(p)),
    ),
  );

  const response = await withEditRetry(() =>
    openai.images.edit({
      model,
      image: files,
      prompt: fullPrompt,
      n: 1,
      size: SHEET_SIZE,
    }),
  );

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error(`${model} returned no image data for the seal render.`);
  return {
    dataUrl: `data:image/png;base64,${b64}`,
    mime: "image/png",
    provider: "openai-gpt-image",
    model,
    generatedAt: new Date().toISOString(),
  };
}

/* ─── 印章 mock 渲染器：章型轮廓 + 石色渐变 + 素坯无字 ─────────────── */

/** 石种 → 石色渐变三停（06 调研石色语言） */
const SEAL_STONE_STOPS: Record<string, [string, string, string]> = {
  qingtian: ["#e9f0e6", "#b9cbb6", "#8ea48b"],
  shoushan: ["#f6efe2", "#e2d4bd", "#c0ae92"],
  changhua: ["#f4e5da", "#dcab97", "#b0604a"],
  balin: ["#f1ede3", "#d3dad4", "#a6b0a8"],
  laoshit: ["#f5e6c6", "#dfb883", "#bb8f50"],
  unknown: ["#eee9df", "#cfc7b8", "#a89e8c"],
};

function renderSealMockSvg({ prompt, seed }: SealImageRequest): string {
  const rng = mulberry32(seed);
  const { form, stone, decoration } = prompt;

  const W = 1024;
  const H = 1024;
  const cx = W / 2;

  const [stopA, stopB, stopC] =
    SEAL_STONE_STOPS[stone.stone_type] ?? SEAL_STONE_STOPS.unknown;

  /* 章型几何（按形制画轮廓，钮制画顶部） */
  const bw = 300; // 章体宽
  const bh = 560; // 章体高
  const bx = cx - bw / 2;
  const by = (H - bh) / 2 + 40;

  const piece: string[] = [];
  const r = 26;

  if (form.seal_form === "rectangle") {
    const w = bw * 0.68;
    const h = bh * 1.05;
    const x = cx - w / 2;
    const y = (H - h) / 2 + 30;
    piece.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r * 0.8}" fill="url(#stone)"/>`);
    piece.push(`<rect x="${x + w * 0.12}" y="${y + h * 0.08}" width="${w * 0.28}" height="${h * 0.5}" rx="14" fill="rgba(255,255,255,0.35)"/>`);
  } else if (form.seal_form === "freeform") {
    const x = cx - bw * 0.55;
    const y = (H - bh) / 2 + 40;
    const w = bw * 1.1;
    const h = bh;
    piece.push(
      `<path d="M ${x + 50} ${y} Q ${x + w - 20} ${y - 26} ${x + w} ${y + 90} Q ${x + w + 18} ${y + h * 0.5} ${x + w - 40} ${y + h - 60} Q ${x + w * 0.55} ${y + h + 26} ${x + 24} ${y + h - 24} Q ${x - 30} ${y + h * 0.55} ${x + 50} ${y} Z" fill="url(#stone)"/>`,
    );
    piece.push(
      `<path d="M ${x + 70} ${y + 60} Q ${x + w * 0.42} ${y + 20} ${x + w * 0.66} ${y + 90}" stroke="rgba(255,255,255,0.4)" stroke-width="10" fill="none" stroke-linecap="round"/>`,
    );
  } else {
    /* square（默认方章） */
    piece.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${r}" fill="url(#stone)"/>`);
    piece.push(`<rect x="${bx + bw * 0.14}" y="${by + bh * 0.06}" width="${bw * 0.26}" height="${bh * 0.42}" rx="16" fill="rgba(255,255,255,0.38)"/>`);
  }

  /* 钮制（顶部） */
  const topY = form.seal_form === "rectangle" ? (H - bh * 1.05) / 2 + 30 : by;
  const topCx = cx;
  if (form.finial_type === "beast" || form.finial_type === "dragon") {
    piece.push(`<ellipse cx="${topCx}" cy="${topY - 46}" rx="92" ry="58" fill="url(#stone)"/>`);
    piece.push(`<ellipse cx="${topCx - 26}" cy="${topY - 66}" rx="16" ry="10" fill="rgba(60,58,52,0.45)"/>`);
    piece.push(`<path d="M ${topCx - 60} ${topY - 30} q 24 -26 60 -20 q 36 -6 60 20" stroke="rgba(255,255,255,0.45)" stroke-width="8" fill="none" stroke-linecap="round"/>`);
  } else if (form.finial_type === "decorated-top") {
    for (let i = 0; i < 4; i++) {
      const fx = topCx - 60 + i * 40;
      piece.push(`<path d="M ${fx} ${topY - 18} q 20 -22 40 0" stroke="rgba(255,255,255,0.4)" stroke-width="7" fill="none" stroke-linecap="round"/>`);
    }
  }

  /* 装饰（纹样程度） */
  const faceRight =
    form.seal_form === "rectangle" ? cx + (bw * 0.68) / 2 : form.seal_form === "freeform" ? cx + bw * 0.42 : bx + bw;
  if (decoration.decoration_level === "partial-relief" || decoration.decoration_level === "full-carving") {
    const bands = decoration.decoration_level === "full-carving" ? 5 : 2;
    for (let i = 0; i < bands; i++) {
      const ry = by + 110 + i * 90 + rng() * 24;
      const rw = 70 + rng() * 40;
      piece.push(
        `<path d="M ${faceRight - 10} ${ry} q ${rw * 0.5} -${28 + rng() * 18} ${rw} 0 q ${rw * 0.4} ${16 + rng() * 14} ${rw * 0.8} -6" stroke="rgba(120,110,95,0.4)" stroke-width="6" fill="none" stroke-linecap="round"/>`,
      );
    }
  }

  /* 边款位置示意（细刻痕带，无文字） */
  if (decoration.side_inscription !== "none" && decoration.side_inscription !== "unknown") {
    const ix = bx + bw * 0.16;
    for (let i = 0; i < 5; i++) {
      const iy = by + bh * 0.32 + i * 34;
      piece.push(`<line x1="${ix}" y1="${iy}" x2="${ix}" y2="${iy + 20}" stroke="rgba(90,82,70,0.35)" stroke-width="4" stroke-linecap="round"/>`);
    }
  }

  /* 天然石纹微线（rng 驱动——素面也有石纹，seed 变化可见） */
  for (let i = 0; i < 5; i++) {
    const vy = by + bh * 0.15 + rng() * bh * 0.7;
    const vx = bx + 20 + rng() * (bw - 40);
    const vw = 30 + rng() * 60;
    piece.push(
      `<path d="M ${vx} ${vy} q ${vw * 0.4} ${-10 - rng() * 14} ${vw} ${4 - rng() * 8}" stroke="rgba(120,110,95,0.16)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    );
  }

  /* 印面留白占位（文字层后叠加的位置示意） */
  const faceY = form.seal_form === "rectangle" ? (H - bh * 1.05) / 2 + 30 + bh * 1.05 : by + bh;
  piece.push(
    `<ellipse cx="${cx}" cy="${faceY + 26}" rx="${bw * 0.52}" ry="14" fill="rgba(60,58,52,0.14)"/>`,
  );

  /* 六宫格版面：把上面画好的单方章体（1024² 坐标系）实例化进 6 个
     512² 格，各格换背景与取景，复刻标本档案的六种拍法。尺寸与格网
     必须对齐 SHEET_SIZE 与 specimen-sheet.ts 的 PHOTO_W/PHOTO_H——
     标签是按格网绝对定位的。文字一律不画（交给合成层）。 */
  const body = piece.join("\n    ");
  const CELL = 512;

  /** 单格：背景 + 章体（scale 把 1024² 缩进 512² 格） */
  const cellMarkup = (
    col: number,
    row: number,
    bg: string,
    inner: string,
  ) => `  <g clip-path="url(#cell)" transform="translate(${col * CELL},${row * CELL})">
    <rect width="${CELL}" height="${CELL}" fill="${bg}"/>
    ${inner}
  </g>`;

  const stoneAt = (scale: number, dx = 0, dy = 0) =>
    `<g transform="translate(${dx},${dy}) scale(${scale * 0.5})">\n    ${body}\n    </g>`;

  const cells = [
    // A 白底 / A 黑底 / B 侧光（深底，章体偏移模拟斜光）
    cellMarkup(0, 0, "#ffffff", stoneAt(1)),
    cellMarkup(1, 0, "#2a2c2e", stoneAt(1)),
    cellMarkup(0, 1, "#1c1e20", stoneAt(1, -18, 8)),
    // C 强光透射：深底 + 石体后方一团高光
    cellMarkup(
      1,
      1,
      "#141618",
      `<ellipse cx="${CELL / 2}" cy="${CELL / 2}" rx="150" ry="170" fill="rgba(255,240,190,0.5)"/>${stoneAt(1)}`,
    ),
    // D 局部特写：放大到只见质地
    cellMarkup(0, 2, stopB, stoneAt(3.1, -430, -520)),
    // 多角度：同一方章体的三个小副本
    cellMarkup(
      1,
      2,
      "#eceae5",
      `${stoneAt(0.52, 40, 30)}${stoneAt(0.52, 210, 30)}${stoneAt(0.52, 125, 200)}`,
    ),
  ];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL * 2}" height="${CELL * 3}" viewBox="0 0 ${CELL * 2} ${CELL * 3}" role="img">
  <defs>
    <clipPath id="cell"><rect width="${CELL}" height="${CELL}"/></clipPath>
    <linearGradient id="stone" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${stopA}"/>
      <stop offset="55%" stop-color="${stopB}"/>
      <stop offset="100%" stop-color="${stopC}"/>
    </linearGradient>
  </defs>
${cells.join("\n")}
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
