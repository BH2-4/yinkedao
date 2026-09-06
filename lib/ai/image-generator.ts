/**
 * STAGE 5 — AI IMAGE GENERATION · Provider adapter
 *
 * The single seam between the app and whatever image model renders the
 * confirmed design proposal. Pages and the API route only ever call
 * generateDesignImage(); the concrete provider is selected here and can be
 * swapped (replicate / openai / volcengine / …) without touching any stage.
 *
 * V1 ships the MOCK provider: it deterministically draws an SVG concept
 * render from the structured prompt (product category, scale, finish,
 * tier, motif-presence, seed) so the whole Stage 5 UI runs end-to-end with
 * no API key. The mock is honest about what it is — the render is clearly
 * watermarked as a design concept, never as a real artifact.
 *
 * CULTURAL SAFETY in the mock: it never draws a recognizable cultural
 * pattern (that would be inventing heritage imagery). Motif presence is
 * shown as an abstract, clearly-labeled placeholder zone; the motif's
 * documented NAME appears only in the information strip, verbatim.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { OpenAI, toFile } from "openai";
import type { ImagePrompt } from "@/lib/design/render-prompt";

export type ImageProvider = "mock" | "openai-dalle3" | "openai-gpt-image";

export interface DesignImageRequest {
  /** The structured prompt built from the confirmed proposal. */
  prompt: ImagePrompt;
  /** Regeneration seed — varies decorative placement per click. */
  seed: number;
}

export interface DesignImageResult {
  /** Self-contained image the browser can render directly. */
  dataUrl: string;
  mime: "image/svg+xml" | "image/png";
  provider: ImageProvider;
  model: string;
  generatedAt: string;
}

/** Reads the provider selector; unknown values fall back to mock. */
function resolveProvider(): ImageProvider {
  const configured = process.env.IMAGE_PROVIDER?.toLowerCase();
  if (configured === "openai-dalle3" || configured === "openai-gpt-image") {
    if (!process.env.OPENAI_API_KEY) {
      console.warn(
        `[image-generator] IMAGE_PROVIDER=${configured} but OPENAI_API_KEY is not set — falling back to mock.`,
      );
      return "mock";
    }
    return configured;
  }
  return "mock";
}

export async function generateDesignImage(
  request: DesignImageRequest,
): Promise<DesignImageResult> {
  const provider = resolveProvider();
  if (provider === "openai-gpt-image") {
    return generateViaGptImage(request);
  }
  if (provider === "openai-dalle3") {
    return generateViaDalle3(request);
  }
  return {
    dataUrl: renderMockSvg(request),
    mime: "image/svg+xml",
    provider: "mock",
    model: "mock-concept-renderer-v1",
    generatedAt: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*  OpenAI gpt-image-1 provider — reference-grounded generation                */
/* -------------------------------------------------------------------------- */

/**
 * REFERENCE-GROUNDED GENERATION (the fix for "generic web-image" renders).
 *
 * Text-only prompts cannot convey what Guizhou Miao silver looks like — a
 * bare motif name like "花鸟" is invisible to an image model, so results came
 * back as generic modern jewelry. This provider feeds the model REAL photos
 * of documented Miao silver pieces from the project's own collection
 * database (public/collection/assets/images) as visual references, and asks
 * it to design a NEW piece that inherits the material, craft and form
 * language of those references.
 *
 * CULTURAL SAFETY — this stays inside every existing guardrail:
 *   · the references are REAL documented artifacts (not invented patterns);
 *   · the prompt explicitly forbids replicating any reference piece;
 *   · the motif itself still comes only from the confirmed Stage 4 proposal.
 */
const REFERENCE_IMAGE_DIR = path.join(process.cwd(), "public", "collection", "assets", "images");

/** product_type → collection categories that share its form language.
 *  `craftsmanship` (26 craft close-ups) is appended to every mapping so the
 *  model also sees the hand-work texture of the documented crafts. */
const PRODUCT_REFERENCE_CATEGORIES: Record<string, string[]> = {
  earrings: ["earrings", "craftsmanship"],
  ring: ["hand-jewelry", "craftsmanship"],
  bracelet: ["hand-jewelry", "craftsmanship"],
  cuff: ["hand-jewelry", "craftsmanship"],
  anklet: ["hand-jewelry", "craftsmanship"],
  necklace: ["necklaces", "craftsmanship"],
  pendant: ["necklaces", "craftsmanship"],
  brooch: ["chest", "craftsmanship"],
  hairpiece: ["headwear", "craftsmanship"],
  unknown: ["necklaces", "craftsmanship"],
};

/**
 * Picks reference photos for the product category. Deterministic per seed so
 * "regenerate" varies the references too; missing files degrade silently to
 * fewer references (never to an error).
 */
async function pickReferenceImages(
  productType: string,
  seed: number,
): Promise<string[]> {
  const categories =
    PRODUCT_REFERENCE_CATEGORIES[productType] ?? PRODUCT_REFERENCE_CATEGORIES.unknown;

  const candidates: string[] = [];
  for (const category of categories) {
    const dir = path.join(REFERENCE_IMAGE_DIR, category);
    let files: string[] = [];
    try {
      files = (await fs.readdir(dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    } catch {
      continue;
    }
    candidates.push(...files.map((f) => path.join(dir, f)));
  }

  if (candidates.length === 0) return [];

  /* Deterministic rotation: seed spreads which references each render sees. */
  const count = Math.min(3, candidates.length);
  const start = seed % candidates.length;
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(candidates[(start + i * 3) % candidates.length]);
  }
  return picked;
}

async function generateViaGptImage(
  request: DesignImageRequest,
): Promise<DesignImageResult> {
  const { prompt } = request;

  const referenceIntro = [
    "The attached reference photos show real, documented Miao silver pieces from Guizhou, China.",
    "Inherit their material quality, hand-wrought craft texture and construction style — but do NOT replicate or copy any reference piece.",
    "Design an ORIGINAL contemporary piece that clearly belongs to this silver tradition:",
  ].join(" ");

  const safetySuffix = [
    "Do not invent any ethnic, tribal, or traditional patterns not specified below.",
    `Do not add these elements: ${prompt.negative_prompt}.`,
  ].join(" ");

  const fullPrompt = `${referenceIntro} ${prompt.prompt} ${safetySuffix}`;

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    timeout: 180_000,
  });

  const referencePaths = await pickReferenceImages(
    prompt.form.product_type,
    request.seed,
  );

  /* No readable references → pure text generation (same model). */
  if (referencePaths.length === 0) {
    const response = await openai.images.generate({
      model: "gpt-image-2",
      prompt: fullPrompt,
      n: 1,
      size: "1024x1024",
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("gpt-image-2 returned no image data.");
    return {
      dataUrl: `data:image/png;base64,${b64}`,
      mime: "image/png",
      provider: "openai-gpt-image",
      model: "gpt-image-2",
      generatedAt: new Date().toISOString(),
    };
  }

  const files = await Promise.all(
    referencePaths.map(async (p) =>
      toFile(await fs.readFile(p), path.basename(p)),
    ),
  );

  const response = await openai.images.edit({
    model: "gpt-image-2",
    image: files,
    prompt: fullPrompt,
    n: 1,
    size: "1024x1024",
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error(
      "gpt-image-2 returned no image data — the content may have been filtered by the safety layer.",
    );
  }

  return {
    dataUrl: `data:image/png;base64,${b64}`,
    mime: "image/png",
    provider: "openai-gpt-image",
    model: "gpt-image-2",
    generatedAt: new Date().toISOString(),
  };
}



async function generateViaDalle3(
  request: DesignImageRequest,
): Promise<DesignImageResult> {
  const { prompt } = request;

  const systemPrefix = [
    "A single piece of fine jewelry as a professional product photograph.",
    "The design is a contemporary custom piece. No historical artifacts or replicas.",
    "Silver metal must look like real polished/brushed sterling silver with specular highlights.",
  ].join(" ");

  const safetySuffix = [
    "Do not invent any ethnic, tribal, or traditional patterns not specified below.",
    `Do not add these elements: ${prompt.negative_prompt}.`,
  ].join(" ");

  const fullPrompt = `${systemPrefix} ${prompt.prompt} ${safetySuffix}`;

  const dalle = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    timeout: 45_000,
  });
  const response = await dalle.images.generate({
    model: "dall-e-3",
    prompt: fullPrompt,
    n: 1,
    size: "1024x1024",
    response_format: "b64_json",
    quality: "standard",
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error(
      "DALL·E 3 returned no image data — the content may have been filtered by the safety layer.",
    );
  }

  return {
    dataUrl: `data:image/png;base64,${b64}`,
    mime: "image/png",
    provider: "openai-dalle3",
    model: "dall-e-3",
    generatedAt: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Mock concept renderer                                                      */
/* -------------------------------------------------------------------------- */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

/* Controlled geometry per product category (design translation only). */
const CATEGORY_GEOMETRY: Record<
  string,
  { shape: "stud-drop" | "hoop" | "band" | "chain-pendant" | "brooch-bar" }
> = {
  earrings: { shape: "stud-drop" },
  ring: { shape: "band" },
  bracelet: { shape: "hoop" },
  cuff: { shape: "hoop" },
  anklet: { shape: "chain-pendant" },
  necklace: { shape: "chain-pendant" },
  pendant: { shape: "chain-pendant" },
  brooch: { shape: "brooch-bar" },
  hairpiece: { shape: "brooch-bar" },
  unknown: { shape: "chain-pendant" },
};

const FINISH_STOPS: Record<string, [string, string, string]> = {
  "high-polish": ["#f2f4f7", "#b7bdc7", "#8d949f"],
  "satin-matte": ["#dedfe3", "#b3b7bd", "#989da4"],
  "textured-relief": ["#e8eaee", "#a8adb6", "#7f858f"],
};

const TIER_DECOR_COUNT: Record<string, number> = {
  quiet: 5,
  balanced: 9,
  statement: 14,
};

function renderMockSvg({ prompt, seed }: DesignImageRequest): string {
  const rng = mulberry32(seed);
  const { form, material, motif, vision, craft } = prompt;
  const geometry = CATEGORY_GEOMETRY[form.product_type] ?? CATEGORY_GEOMETRY.unknown;
  const [stopA, stopB, stopC] = FINISH_STOPS[material.finish] ?? FINISH_STOPS["high-polish"];

  const W = 1024;
  const H = 1024;
  const cx = W / 2;
  const cy = H / 2 - 40;

  /* Base scale from the confirmed size — the render obeys the proposal. */
  const scaleR: Record<string, number> = { small: 110, medium: 160, large: 215 };
  const R = scaleR[form.scale] ?? 160;

  const decorCount = TIER_DECOR_COUNT[vision.visual_style] ?? 9;

  /* --- the piece, per geometry --------------------------------------- */
  const piece: string[] = [];
  if (geometry.shape === "stud-drop") {
    const dual = form.arrangement === "balanced-dual";
    const drawDrop = (x: number) => {
      piece.push(`<circle cx="${x}" cy="${cy - R * 0.9}" r="${R * 0.18}" fill="url(#silver)"/>`);
      piece.push(`<line x1="${x}" y1="${cy - R * 0.72}" x2="${x}" y2="${cy - R * 0.35}" stroke="url(#silver)" stroke-width="${R * 0.08}" stroke-linecap="round"/>`);
      piece.push(`<ellipse cx="${x}" cy="${cy}" rx="${R * 0.52}" ry="${R * 0.68}" fill="url(#silver)"/>`);
      piece.push(`<ellipse cx="${x - R * 0.16}" cy="${cy - R * 0.18}" rx="${R * 0.1}" ry="${R * 0.22}" fill="rgba(255,255,255,0.55)"/>`);
    };
    if (dual) {
      drawDrop(cx - R * 1.1);
      drawDrop(cx + R * 1.1);
    } else {
      drawDrop(cx);
    }
  } else if (geometry.shape === "hoop") {
    piece.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${R * 1.05}" ry="${R * 0.78}" fill="none" stroke="url(#silver)" stroke-width="${R * 0.22}"/>`,
    );
    piece.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${R * 1.05}" ry="${R * 0.78}" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="${R * 0.04}"/>`,
    );
  } else if (geometry.shape === "band") {
    piece.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.8}" fill="none" stroke="url(#silver)" stroke-width="${R * 0.3}"/>`);
    piece.push(
      `<path d="M ${cx - R * 0.62} ${cy - R * 0.42} A ${R * 0.8} ${R * 0.8} 0 0 1 ${cx - R * 0.2} ${cy - R * 0.74}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="${R * 0.05}" stroke-linecap="round"/>`,
    );
  } else if (geometry.shape === "brooch-bar") {
    piece.push(
      `<rect x="${cx - R * 1.15}" y="${cy - R * 0.28}" width="${R * 2.3}" height="${R * 0.56}" rx="${R * 0.28}" fill="url(#silver)"/>`,
    );
    piece.push(
      `<rect x="${cx - R * 0.9}" y="${cy - R * 0.14}" width="${R * 1.8}" height="${R * 0.1}" rx="${R * 0.05}" fill="rgba(255,255,255,0.45)"/>`,
    );
  } else {
    /* chain-pendant: a soft chain arc + central drop. */
    piece.push(
      `<path d="M ${cx - R * 1.3} ${cy - R * 1.35} Q ${cx} ${cy - R * 0.55} ${cx + R * 1.3} ${cy - R * 1.35}" fill="none" stroke="url(#silver)" stroke-width="${R * 0.1}" stroke-linecap="round"/>`,
    );
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const x = cx + (t - 0.5) * 2 * R * 1.3;
      const y =
        cy - R * 1.35 + (1 - (1 - Math.abs(t - 0.5) * 2) ** 2) * R * 0.8;
      piece.push(`<circle cx="${x}" cy="${y}" r="${R * 0.055}" fill="url(#silver)"/>`);
    }
    piece.push(`<path d="M ${cx} ${cy - R * 0.62} L ${cx + R * 0.5} ${cy} L ${cx} ${cy + R * 0.62} L ${cx - R * 0.5} ${cy} Z" fill="url(#silver)"/>`);
    piece.push(
      `<path d="M ${cx - R * 0.15} ${cy - R * 0.3} L ${cx + R * 0.1} ${cy - R * 0.05}" stroke="rgba(255,255,255,0.5)" stroke-width="${R * 0.05}" stroke-linecap="round"/>`,
    );
  }

  /* --- motif placeholder: abstract dot/arc cluster, never a pattern ---- */
  const motifZone: string[] = [];
  if (motif !== null) {
    const zoneR = R * 0.34;
    for (let i = 0; i < decorCount; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = zoneR * (0.25 + rng() * 0.75);
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist * 0.8;
      const r = R * (0.025 + rng() * 0.045);
      motifZone.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="rgba(80,88,100,0.5)"/>`);
    }
    for (let i = 0; i < 3; i++) {
      const x = cx + (rng() - 0.5) * zoneR;
      const y = cy + (rng() - 0.5) * zoneR * 0.7;
      const r = zoneR * (0.3 + rng() * 0.3);
      motifZone.push(
        `<path d="M ${x - r} ${y} A ${r} ${r} 0 0 1 ${x + r} ${y}" fill="none" stroke="rgba(80,88,100,0.35)" stroke-width="${R * 0.025}"/>`,
      );
    }
  }

  /* --- textured-relief surface strokes -------------------------------- */
  const relief: string[] = [];
  if (material.finish === "textured-relief") {
    for (let i = 0; i < 6; i++) {
      const x = cx - R * 0.4 + (i / 5) * R * 0.8;
      relief.push(
        `<path d="M ${x} ${cy - R * 0.5} q ${R * 0.06} ${R * 0.5} 0 ${R}" fill="none" stroke="rgba(120,126,136,0.4)" stroke-width="${R * 0.02}"/>`,
      );
    }
  }

  const motifLabel = motif !== null
    ? `MOTIF · ${escapeXml(motif.name)} (visual subject only)`
    : "FORM-LED · NO MOTIF";

  const info = [
    `CATEGORY ${escapeXml(form.product_type.toUpperCase())}`,
    `SCALE ${form.scale.toUpperCase()} · ${form.thickness.toUpperCase()}`,
    `FINISH ${escapeXml(material.finish)}`,
    `CRAFT ${escapeXml(craft.primary)}`,
    `TIER ${vision.visual_style.toUpperCase()}`,
  ].join("  ·  ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="80%">
      <stop offset="0%" stop-color="#f8f6f1"/>
      <stop offset="100%" stop-color="#e0ddd4"/>
    </radialGradient>
    <linearGradient id="silver" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${stopA}"/>
      <stop offset="55%" stop-color="${stopB}"/>
      <stop offset="100%" stop-color="${stopC}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="${cx}" cy="${cy + R * 1.25}" rx="${R * 1.7}" ry="${R * 0.22}" fill="rgba(60,64,70,0.12)"/>
  ${piece.join("\n  ")}
  ${relief.join("\n  ")}
  ${motifZone.join("\n  ")}
  ${motif !== null
    ? `<circle cx="${cx}" cy="${cy}" r="${R * 0.5}" fill="none" stroke="rgba(80,88,100,0.28)" stroke-dasharray="4 6" stroke-width="1.5"/>`
    : ""}
  <g font-family="ui-monospace, monospace" text-anchor="middle">
    <text x="${cx}" y="${H - 118}" font-size="17" letter-spacing="4" fill="#4a5058">DESIGN CONCEPT · AI VISUALIZATION</text>
    <text x="${cx}" y="${H - 88}" font-size="13" letter-spacing="2" fill="#6b7280">${motifLabel}</text>
    <text x="${cx}" y="${H - 62}" font-size="11" letter-spacing="1.5" fill="#8a8f98">${info}</text>
    <text x="${cx}" y="${H - 36}" font-size="11" letter-spacing="2" fill="#9aa0a8">NOT A REAL ARTIFACT · 非实物复刻 · 不代表真实非遗纹样</text>
  </g>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* -------------------------------------------------------------------------- */
/*  SEAL PIPELINE — 印章质感层（质感层/文字层分离架构，PRD 8.1）              */
/*                                                                             */
/*  与上方首饰管线的区别：印章的印面文字是产品核心，生图只负责「无文字       */
/*  章体质感层」——石材质感、形制轮廓、钮制、装饰氛围。印文与边款文字       */
/*  由崇羲字体引擎在质感层之上确定性叠加（lib/design/seal-prompt.ts 的       */
/*  NO TEXT RULE 是第一道闸，本渲染器不绘制任何文字）。                       */
/* -------------------------------------------------------------------------- */

import type { SealImagePrompt } from "@/lib/design/seal-prompt";

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
