/**
 * 石料标本档案版面回归测试 —— 无需 dev server，纯离线校验。
 *
 * 版面是「代码写字叠在模型出图上」的合成结果，没有浏览器兜底排版：
 * 一条特征串多两个字就会压到右下红印上，肉眼在缩略图里根本看不出来。
 * 所以把几何约束写成断言，全石种 × 全形制组合逐个跑。
 *
 *   node scripts/test-specimen-sheet.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.log(`  ✗ ${label}`);
  }
}

/* ─── 从源码提取常量（避免测试与实现各写一份而漂移） ────────── */

const sheetSrc = readFileSync(
  resolve(root, "lib/design/specimen-sheet.ts"),
  "utf8",
);
const factsSrc = readFileSync(
  resolve(root, "lib/design/stone-facts.ts"),
  "utf8",
);
const genSrc = readFileSync(resolve(root, "lib/ai/image-generator.ts"), "utf8");

const num = (src, name) => {
  const m = src.match(new RegExp(`const ${name} = (\\d+)`));
  if (!m) throw new Error(`常量 ${name} 未找到——实现改名了？`);
  return Number(m[1]);
};

const PHOTO_W = num(sheetSrc, "PHOTO_W");
const PHOTO_H = num(sheetSrc, "PHOTO_H");
const CELL = num(sheetSrc, "CELL");
const COLS = num(sheetSrc, "COLS");
const ROWS = num(sheetSrc, "ROWS");
const PAD = num(sheetSrc, "PAD");
const INFO_H = num(sheetSrc, "INFO_H");

/* ─── 1. 格网与生图尺寸必须一致 ─────────────────────────────── */

console.log("\n[1] 格网 / 生图尺寸一致性");

assert(CELL * COLS === PHOTO_W, `CELL×COLS = PHOTO_W (${CELL}×${COLS} vs ${PHOTO_W})`);
assert(CELL * ROWS === PHOTO_H, `CELL×ROWS = PHOTO_H (${CELL}×${ROWS} vs ${PHOTO_H})`);

const sheetSize = genSrc.match(/const SHEET_SIZE = "(\d+)x(\d+)"/);
assert(sheetSize !== null, "image-generator 导出 SHEET_SIZE");
if (sheetSize) {
  // 生图尺寸与标签坐标系不一致 = 全部标签错位，这是最致命的一条
  assert(
    Number(sheetSize[1]) === PHOTO_W && Number(sheetSize[2]) === PHOTO_H,
    `SHEET_SIZE ${sheetSize[1]}x${sheetSize[2]} 应等于版面 ${PHOTO_W}x${PHOTO_H}`,
  );
}

// 只数数组字面量里的条目（`letter: "..."`），不数接口里的 `letter: string`
const panelCount = (sheetSrc.match(/letter: "/g) || []).length;
assert(panelCount === COLS * ROWS, `标签数 ${panelCount} = 格数 ${COLS * ROWS}`);

const promptSrc = readFileSync(resolve(root, "lib/design/seal-prompt.ts"), "utf8");
const promptPanels = (promptSrc.match(/Panel \d \(/g) || []).length;
assert(
  promptPanels === panelCount,
  `prompt 分格数 ${promptPanels} = 标签数 ${panelCount}（顺序错位则标签张冠李戴）`,
);

/* ─── 2. 信息栏文本不得越界或压红印 ─────────────────────────── */

console.log("[2] 信息栏排版（全石种 × 全形制）");

// 与 specimen-sheet.ts 同一套估宽规则
const textWidth = (t, size) => {
  let u = 0;
  for (const ch of t) u += /[⺀-鿿＀-￯]/.test(ch) ? 1 : 0.55;
  return u * size;
};

const colX = [PAD + 24, PAD + 330, PAD + 610];
const GAP = 18;
const infoTop = PAD + PHOTO_H + GAP;
const chopS = 74;
const chopX = PAD + PHOTO_W - chopS - 22;
const chopY = infoTop + INFO_H - chopS - 20;
const sheetRight = PAD + PHOTO_W;
const featureMaxW = sheetRight - 24 - colX[2];

/* 石种档案从源码里解出来，新增石种自动纳入测试 */
const stoneBlocks = [
  ...factsSrc.matchAll(
    /(\w+): \{\s*name: "([^"]+)",\s*origin: "([^"]+)",\s*features: \[([^\]]+)\]/g,
  ),
].map((m) => ({
  key: m[1],
  name: m[2],
  origin: m[3],
  features: [...m[4].matchAll(/"([^"]+)"/g)].map((f) => f[1]),
}));

assert(stoneBlocks.length >= 5, `解析到 ${stoneBlocks.length} 个石种档案`);

const forms = [
  { key: "square", label: "方章", size: "约 2.5 × 2.5 × 5 cm", weight: "约 85 g" },
  { key: "rectangle", label: "长方章", size: "约 2 × 3 × 5.5 cm", weight: "约 90 g" },
  { key: "freeform", label: "随形章", size: "约 3 × 2.5 × 6 cm（外接）", weight: "约 85 g" },
];

const wrap = (text, size, maxW) => {
  const lines = [];
  let line = "";
  for (const ch of text) {
    if (textWidth(line + ch, size) > maxW && line) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
};

for (const stone of stoneBlocks) {
  for (const form of forms) {
    const tag = `${stone.name}/${form.label}`;

    // 列 1、列 2：定长内容，检查不越右界
    const col12 = [
      [colX[0], `名称：${stone.name}`, 20],
      [colX[0], `产地：${stone.origin}`, 20],
      [colX[0], `形制：${form.label}`, 20],
      [colX[1], `尺寸：${form.size}`, 20],
      [colX[1], `重量：${form.weight}`, 20],
      [colX[1], "（按该形制常见规格推算）", 16],
    ];
    for (const [x, text, size] of col12) {
      assert(
        x + textWidth(text, size) <= sheetRight,
        `${tag} 越出纸面右界：${text}`,
      );
    }

    // 列 3：折行后逐行做真正的矩形相交判断（红印在右下角，
    // 只比 x 会把「同一列但不同高度」误判成碰撞）
    const featureLines = [`特征：${stone.features[0]}`, ...stone.features.slice(1)]
      .flatMap((f) => wrap(f, 20, featureMaxW));

    const chopRect = { x0: chopX, x1: chopX + chopS, y0: chopY, y1: chopY + chopS };

    featureLines.forEach((l, i) => {
      const baseline = infoTop + 42 + 34 * i;
      const r = {
        x0: colX[2],
        x1: colX[2] + textWidth(l, 20),
        y0: baseline - 20,
        y1: baseline + 6,
      };
      const hits =
        r.x1 > chopRect.x0 &&
        r.x0 < chopRect.x1 &&
        r.y1 > chopRect.y0 &&
        r.y0 < chopRect.y1;
      assert(!hits, `${tag} 特征行压到右下红印：${l}`);
      assert(r.x1 <= sheetRight, `${tag} 特征行越出纸面右界：${l}`);
    });

    // 折行后行数不得撞穿下方的 AI 声明区
    const noticeTop = infoTop + INFO_H - 52 - 26;
    const lastLineY = infoTop + 42 + 34 * (featureLines.length - 1);
    assert(
      lastLineY < noticeTop,
      `${tag} 特征共 ${featureLines.length} 行，末行 y=${lastLineY} 撞入声明区 (${noticeTop})`,
    );
  }
}

/* ─── 3. 反冒充红线：AI 声明必须在图上 ──────────────────────── */

console.log("[3] 反冒充声明");

assert(sheetSrc.includes("AI 效果示意"), "图上带「AI 效果示意」字样");
assert(sheetSrc.includes("非实物标本照片"), "图上明示非实物标本照片");
assert(
  /重量：\$\{spec\.weightText\}/.test(sheetSrc),
  "重量走 specimenSpec（带「约」的参考值）",
);
assert(
  factsSrc.includes("按该形制常见规格") || sheetSrc.includes("按该形制常见规格"),
  "尺寸/重量标注为推算参考值",
);

/* ─── 4. NO TEXT / NO LABELS 铁律仍在 prompt 里 ─────────────── */

console.log("[4] 生图护栏");

assert(promptSrc.includes("NO TEXT RULE"), "prompt 保留 NO TEXT RULE");
assert(promptSrc.includes("NO LABELS RULE"), "prompt 含 NO LABELS RULE（标签由代码写）");
assert(
  !/multiple stones \(exactly one seal stone\)/.test(promptSrc),
  "负面清单不再禁「多颗石头」（第 6 格是多角度合影）",
);

/* ─── 结果 ───────────────────────────────────────────────────── */

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
