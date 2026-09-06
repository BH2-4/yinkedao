import type { SealOrder } from "@/lib/design/seal-order";
import { specimenSpec } from "@/lib/design/stone-facts";

/**
 * 石料标本档案合成层 —— 六宫格照片 + 中文标签 + 信息栏。
 *
 * 架构位置：与「文字层」同一性质的确定性合成层。生图模型只出**无字**
 * 的六宫格照片（NO TEXT RULE，见 seal-prompt.ts），一切文字——分格标签、
 * 信息栏、AI 声明——都在这里用代码写上去。
 *
 * 为什么不让模型写字：① 图像模型渲染中文必糊，② 让模型写「产地/重量」
 * 等于让它编造事实数据，③ 代码写的字可校对、可测试、可 i18n。
 *
 * 输出为自包含 SVG（照片以 data URL 内嵌），沿用全站 dataUrl 约定，
 * <img> 直接可显示，零运行时依赖。
 */

/* ─── 版面常量 ───────────────────────────────────────────────── */

/** 照片版面：2 列 × 3 行，单格 512×512。与生图请求的 1024x1536 对应。 */
const PHOTO_W = 1024;
const PHOTO_H = 1536;
const CELL = 512;
const COLS = 2;
const ROWS = 3;

const PAD = 28;
const GAP = 18;
const INFO_H = 250;

const SHEET_W = PHOTO_W + PAD * 2;
const SHEET_H = PAD + PHOTO_H + GAP + INFO_H + PAD;

/** 中日韩字体栈——SVG 经 <img> 渲染时走系统字体，逐级回退。 */
const FONT =
  "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',system-ui,sans-serif";

/**
 * 六格的固定语义（与 seal-prompt.ts 的 SHEET_PANELS 逐格对应，顺序即
 * 阅读顺序：先上后下、先左后右）。改这里必须同步改那边，否则标签会
 * 张冠李戴——两处都留了这条注释。
 */
const PANEL_LABELS: { letter: string; title: string }[] = [
  { letter: "A", title: "正面均匀光（白底）" },
  { letter: "A", title: "正面均匀光（黑底）" },
  { letter: "B", title: "低角度侧光" },
  { letter: "C", title: "强光透射" },
  { letter: "D", title: "局部特写" },
  { letter: "", title: "整体多角度" },
];

/* ─── 工具 ───────────────────────────────────────────────────── */

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 粗略文本宽度：CJK 按 1 字宽、其余按 0.55 字宽估算（用于标签底板）。 */
function textWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of text) units += /[⺀-鿿＀-￯]/.test(ch) ? 1 : 0.55;
  return units * fontSize;
}

/**
 * 按像素宽度折行。石种特征串长度不一，写死列宽迟早会有一条溢出去压到
 * 右下红印上——这里按实际估宽切，新增石种也不会撑破版面。
 */
function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
    if (textWidth(line + ch, fontSize) > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* ─── 合成 ───────────────────────────────────────────────────── */

export interface SpecimenSheetInput {
  /** 六宫格照片的 data URL（PNG 或 SVG 皆可，内嵌为 <image>） */
  photoDataUrl: string;
  order: SealOrder;
  /** 出图来源，写进页脚可追溯串 */
  provider: string;
  model: string;
  seed: number;
}

/** 合成石料标本档案图，返回自包含 SVG 的 data URL。 */
export function composeSpecimenSheet(input: SpecimenSheetInput): string {
  const { photoDataUrl, order, provider, model, seed } = input;
  const spec = specimenSpec(order);

  const parts: string[] = [];

  /* 纸面 */
  parts.push(`<rect width="${SHEET_W}" height="${SHEET_H}" fill="#ffffff"/>`);

  /* 照片（整幅内嵌，六格由模型在一次生成里保证同一方石头） */
  parts.push(
    `<image href="${escapeXml(photoDataUrl)}" x="${PAD}" y="${PAD}" width="${PHOTO_W}" height="${PHOTO_H}" preserveAspectRatio="xMidYMid slice"/>`,
  );

  /* 白色格缝：把模型出的整幅切成视觉上的六格（对齐 CELL 网格） */
  for (let c = 1; c < COLS; c++) {
    parts.push(
      `<rect x="${PAD + c * CELL - 3}" y="${PAD}" width="6" height="${PHOTO_H}" fill="#ffffff"/>`,
    );
  }
  for (let r = 1; r < ROWS; r++) {
    parts.push(
      `<rect x="${PAD}" y="${PAD + r * CELL - 3}" width="${PHOTO_W}" height="6" fill="#ffffff"/>`,
    );
  }
  parts.push(
    `<rect x="${PAD}" y="${PAD}" width="${PHOTO_W}" height="${PHOTO_H}" fill="none" stroke="#e2e2e2" stroke-width="1"/>`,
  );

  /* 分格标签：半透明白底板 + 深色字，白底格与黑底格上都可读 */
  PANEL_LABELS.forEach((panel, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PAD + col * CELL + 13;
    const y = PAD + row * CELL + 13;

    const letterSize = 23;
    const titleSize = 20;
    const letterW = panel.letter ? letterSize * 0.72 + 9 : 0;
    const chipW = 15 + letterW + textWidth(panel.title, titleSize) + 15;
    const chipH = 36;

    parts.push(
      `<rect x="${x}" y="${y}" width="${Math.round(chipW)}" height="${chipH}" rx="3" fill="rgba(255,255,255,0.93)"/>`,
    );
    let tx = x + 15;
    if (panel.letter) {
      parts.push(
        `<text x="${tx}" y="${y + 26}" font-family="Georgia,'Times New Roman',serif" font-size="${letterSize}" font-style="italic" fill="#1a1a1a">${escapeXml(panel.letter)}</text>`,
      );
      tx += letterW;
    }
    parts.push(
      `<text x="${tx}" y="${y + 25}" font-family="${FONT}" font-size="${titleSize}" fill="#1a1a1a">${escapeXml(panel.title)}</text>`,
    );
  });

  /* ── 信息栏 ── */
  const infoY = PAD + PHOTO_H + GAP;
  parts.push(
    `<rect x="${PAD}" y="${infoY}" width="${PHOTO_W}" height="${INFO_H}" fill="#fbfbfa" stroke="#e2e2e2" stroke-width="1"/>`,
  );

  const colX = [PAD + 24, PAD + 330, PAD + 610];
  const line = (
    x: number,
    y: number,
    text: string,
    size = 20,
    fill = "#1a1a1a",
  ) =>
    `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${fill}">${escapeXml(text)}</text>`;

  const t0 = infoY + 42;
  const lh = 34;

  /* 列 1 — 名称与产地（石种档案，逐字上图） */
  parts.push(line(colX[0], t0, `名称：${spec.facts.name}`));
  parts.push(line(colX[0], t0 + lh, `产地：${spec.facts.origin}`));
  parts.push(line(colX[0], t0 + lh * 2, `形制：${spec.formLabel}`));

  /* 列 2 — 尺寸与重量（推算参考值，必须标注） */
  parts.push(line(colX[1], t0, `尺寸：${spec.sizeText}`));
  parts.push(line(colX[1], t0 + lh, `重量：${spec.weightText}`));
  parts.push(
    line(colX[1], t0 + lh * 2, "（按该形制常见规格推算）", 16, "#8a8f98"),
  );

  /* 列 3 — 特征（逐条一行，超宽自动折行） */
  const featureMaxW = PAD + PHOTO_W - 24 - colX[2];
  const featureLines = [
    `特征：${spec.facts.features[0] ?? ""}`,
    ...spec.facts.features.slice(1),
  ].flatMap((f) => wrapText(f, 20, featureMaxW));
  featureLines.forEach((f, i) => {
    parts.push(line(colX[2], t0 + lh * i, f));
  });

  /* AI 声明（反冒充红线：这是效果示意，不是实物标本照片） */
  const noticeY = infoY + INFO_H - 52;
  parts.push(
    `<line x1="${colX[0]}" y1="${noticeY - 26}" x2="${PAD + PHOTO_W - 130}" y2="${noticeY - 26}" stroke="#e2e2e2" stroke-width="1"/>`,
  );
  parts.push(
    line(
      colX[0],
      noticeY,
      "AI 效果示意 · 非实物标本照片；印面文字由标准篆字引擎另行叠加，本图无任何文字",
      16,
      "#8a8f98",
    ),
  );
  parts.push(
    line(
      colX[0],
      noticeY + 24,
      `${provider} · ${model} · SEED ${seed}`,
      13,
      "#a6a6a6",
    ),
  );

  /* 右下红印：对应实物档案的收藏钤记位，此处明示 AI 身份。
     贴信息栏右下角摆放——居中摆会与特征列末行抢同一段横向空间。 */
  const chopS = 74;
  const chopX = PAD + PHOTO_W - chopS - 22;
  const chopY = infoY + INFO_H - chopS - 20;
  parts.push(
    `<rect x="${chopX}" y="${chopY}" width="${chopS}" height="${chopS}" rx="4" fill="none" stroke="#b03a2e" stroke-width="3"/>`,
  );
  parts.push(
    `<text x="${chopX + chopS / 2}" y="${chopY + 32}" text-anchor="middle" font-family="${FONT}" font-size="19" fill="#b03a2e">AI 效果</text>`,
  );
  parts.push(
    `<text x="${chopX + chopS / 2}" y="${chopY + 57}" text-anchor="middle" font-family="${FONT}" font-size="19" fill="#b03a2e">示意图</text>`,
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${SHEET_H}" viewBox="0 0 ${SHEET_W} ${SHEET_H}" role="img">
${parts.join("\n")}
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
