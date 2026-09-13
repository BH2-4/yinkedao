#!/usr/bin/env node
import '../lib/register-ts.cjs';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { renderSealFace } = require('../../lib/seal-face/render.ts');
const { parseSealText } = require('../../lib/seal-face/layout.ts');
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const text = option('--text');
if (!text || !parseSealText(text)) {
  console.error('用法：node scripts/seal-3d-face/make-face-textures.mjs --text 印可道 [--out tmp/seal-face]');
  process.exit(1);
}
const out = path.resolve(option('--out') ?? 'tmp/seal-face');
const decode = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
for (const style of ['zhuwen', 'baiwen']) {
  const result = await renderSealFace({ text, style, seed: 21, freedom: 50, texture: true, include_textures: true });
  if (!result.textures) throw new Error(`字体缺字：${result.missing.join('、')}；未输出贴图。`);
  mkdirSync(out, { recursive: true });
  for (const view of ['front', 'mirrored']) writeFileSync(path.join(out, `${style}-${view}.png`), decode(result.textures[view]));
  writeFileSync(path.join(out, `${style}-proof.svg`), decode(result.svg.data_url).toString('utf8'), 'utf8');
  writeFileSync(path.join(out, '署名.txt'), '崇羲篆體·中研院小學堂\n王心怡・季旭昇・莊德明／中央研究院\nCC BY-ND 3.0 TW or later\nhttps://xiaoxue.iis.sinica.edu.tw/chongxi/\n', 'utf8');
  console.log(`${result.mapped_text} · ${style} 正反贴图已输出至 ${out}`);
}
