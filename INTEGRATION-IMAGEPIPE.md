# 生图管线嵌入方案（PRD F4 · 参考图编辑 → 质感层）

> **定位调整（2026-09-06 用户拍板）**：生图工作流**主要用于演示初期**；**后期准备用 3D 模型替换**（`~/seal-ai-hackathon/3d篆章/` 三 glb 为成品视觉管线核心：Blender 离线渲染成品图/序列帧 + 崇曦叠字 = 确定性成品，替代生图随机质感）。影响：§2.7 的 Pro 升级投入可缓（3D 替换后生图退居辅助）；demo 日最小路径（S1-S3+S6）即本方案的主要交付范围；3D 渲染管线设计提前与 M5 序列帧合并规划。
>
> 定位：把 demo mock 生图切换为**真实生图管线**——选参考图 → 材质 prompt 组装 →
> `images.edit` 生成质感层 →（崇羲文字层后叠加，另线见 INTEGRATION-XIAOZHUAN.md）→
> 「AI 效果示意」水印。
> 本文件为只读调研与设计方案，未改动任何源代码。日期：2026-09-06。
> Key 治理：tokenx24 key 存放于 `/Users/arco/seal-ai-hackathon/tools/tokenx24.key`（权限 600，短期授权），本文档不出现 key 明文。

---

## 0. 一页结论

- **主接缝已存在**：`lib/ai/image-generator.ts` 的 `generateSealDesignImage` 已实现
  gpt-image-2 参考图编辑全链路（toFile 参考图 + images.edit + seed 轮转），且支持
  `OPENAI_BASE_URL` 环境变量。**接通 tokenx24 中转只需配三个 env，零代码改动即可出真图**。
- **最大差距点**：`maxDuration=60` vs tokenx24 实测单张 50-70s（+偶发 502 重试再 +50-70s）。
  60s 内放不下主路径，重试更无从谈起。对策已确认：Hobby 计划开 Fluid Compute 后
  `maxDuration` 可至 **300s**（Vercel 官方口径），一行改动化解。
- **部署线关键约束（RELEASE-SOP.md 额度核查）**：Hobby 计划**函数并发执行仅 1 个**
  ——单次生图占函数 50-70s 期间，所有后续 `/api/*` 请求（含访谈 AI）排队等锁。
  单靠 maxDuration 解决时长解决不了吞吐；对策见 §2.7（推荐：demo 日：本地跑真图，
  线上真实生图 = 升 Pro，Hobby 商用限制条款本也要求如此）。
- **其余差距**：参考图映射未用上 D 批钮制目录（beast/龙钮/纹饰顶共 19 张闲置）、
  真实管线无水印合成（反冒充红线）、无 502 重试、DEMO_MODE 不 gate 生图。
- **工作量**：核心嵌入 2.5-3.5 人日（不含文字层线、不含多角度组图扩展）。

---

## 1. 现状与差距

### 1.1 seal 管线现状（代码事实）

`lib/ai/image-generator.ts` 第 479-762 行：`generateSealDesignImage` 判断
`IMAGE_PROVIDER=openai-gpt-image` 且 `OPENAI_API_KEY` 存在 → `generateSealViaGptImage`
（`openai.images.edit`，`toFile` 喂参考图，`OPENAI_BASE_URL` 可选注入）；否则 mock
章型 SVG。参考图选取 `pickSealReferences` 按 `seal_form` 三态映射目录，seed 确定性
轮转（`start = seed % len`，取 `min(3, len)` 张）。prompt 由
`lib/design/seal-prompt.ts` 的 `buildSealImagePrompt` 纯确定性组装（含 NO TEXT RULE）。
路由 `app/api/design-render/route.ts`：`maxDuration=60`，无重试无缓存。
`next.config.ts` 已把 `public/seal-references/{forms,craftsmanship}` 打包进
`/api/design-render`（serverless fs 读取可用）。

参考图库实测（`public/seal-references/`）：forms 6 目录 28 张 / craftsmanship 3 目录
6 张 / seal-faces 30 张（baiwen 14 + zhuwen 12 + zhubai-mixed 4）。

### 1.2 差距表（现状 vs PRD F4 / tokenx24 实测）

| # | 维度 | 现状 | F4 真实管线要求 | 差距判定 |
|---|---|---|---|---|
| 1 | Provider 激活 | 代码就绪，env 未配（线上 DEMO_MODE=true，本地 .env.local 仅 15 字节） | OPENAI_BASE_URL 指 tokenx24 中转 + key | **零代码，只配 env** |
| 2 | 参考图选取映射 | 仅 `seal_form` 三态：square/rectangle/freeform → 3 目录 | 章型×钮制×装饰（×石色）映射 | **钮制维度缺失**：beast/dragon 钮未路由到 `forms/square-beast`（7 张），decorated-top 未路由到 `forms/ornamented-top`（12 张）；`forms/oval-round`（2 张）无对应形制枚举，暂闲置；石色无 materials 目录（M1 待建） |
| 3 | prompt 组装对接 | `buildSealImagePrompt` 输出英文 prompt + negative，`generateSealViaGptImage` 拼 referenceIntro + prompt + negative | 同左 | **已对接**。NO TEXT RULE 在 constraints 内随 prompt 正文注入真实管线 ✓。但参考图**本身带边款/印面文字**（如「满刻边款」「附印蜕」「隶书刻款」），现有 referenceIntro 只说 do NOT replicate，未显式说「参考图上的文字不得出现在新设计上」——需补一句 |
| 4 | 超时与重试 | route `maxDuration=60`；OpenAI client `timeout=180s`；无重试 | 单张 50-70s；edit 端点偶发 502/504 → 等 3s 重试 1 次；401 不重试 | **最尖锐矛盾**：60s < 50-70s 主路径即有相当概率被 Vercel 掐断；502 重试（最坏 ~143s）完全放不下 |
| 5 | 水印合成 | mock SVG 自带「AI 效果示意·素坯质感层」文字条；真实管线返回**裸 PNG** | 所有 AI 效果图必带「AI 效果示意」水印（PRD 9.1 反冒充红线，D 桶二元判据） | **真实路径无水印**，必须补服务端合成 |
| 6 | 降级链 | 参考图目录缺失→纯文本生成（同模型）；再无降级 | PRD 10.2 四级：0 演示模式 / 1 预渲染图库 / 2 表单 / 3 留资 | 现有仅覆盖「目录缺失」一种；线上断 Key/超时应回 mock 或预渲染，而非 500 |
| 7 | DEMO_MODE 优先级 | `isDemoMode()`（lib/env.ts）只 gate 文本 AI；生图只看 IMAGE_PROVIDER+KEY | DEMO_MODE=true 应全线 demo（DEPLOY-PLAN §2.1 语义：「即使误配 Key 也保持 demo」） | **生图不受 DEMO_MODE 约束**：误配 IMAGE_PROVIDER+KEY 时文本走 demo、生图走真实，语义割裂 |
| 8 | 多角度组图 | 单张 1024x1024 | F4 ③：斜视图+印面图+边款图+多角度组图（角度结构 M6 待固化） | 首版单张可跑通主线；组图 = n 次调用 × 50-70s，同步路线放不进 300s，列后续迭代 |
| 9 | **并发吞吐** | Hobby 并发执行 = **1**（RELEASE-SOP.md 实测口径） | demo 日 ~10 并发生成（PRD 14） | **一个人生图，全站 API 排队 50-70s**（含文本 AI 路由若同函数）；10 人并发生成最后一人等 ~10 分钟。时长对策（#4）不解决吞吐，见 §2.7 |

---

## 2. 嵌入设计

### 2.1 Provider 激活（env 方案）

代码零改动——`generateSealViaGptImage` 构造 `new OpenAI({ apiKey, baseURL })` 已读
`OPENAI_BASE_URL`，tokenx24 是 OpenAI 兼容协议（`/v1/images/edits`，注意 edits 复数，
与 SDK 的 `images.edit` 一致）。

**本地开发（.env.local，值从 `tools/tokenx24.key` 读出后手工粘贴，不进 git）：**

```bash
IMAGE_PROVIDER=openai-gpt-image
OPENAI_API_KEY=<值：cat /Users/arco/seal-ai-hackathon/tools/tokenx24.key>
OPENAI_BASE_URL=https://tokenx24.com/v1
```

**Vercel（上线真实生图时，DEPLOY-PLAN §2.2 已留位）：**
`vercel env add` 上述三项（Production + Preview 两环境）+ `DEMO_MODE` 改 `false` 或删除。
切换点即「上线前替换正式 Key」的动作：tokenx24 短期 key 到期后，换正式 key 重跑
`PATCH /v10/projects/{prj_77ye01EbrzMmoOnBGYSb4f2mIoTD/env/{envId}`（模板见
DEPLOY-PLAN §3 备注）。

**selectProvider 三态沿用**：首饰管线的 `resolveProvider()`（mock/dalle3/gpt-image 三态）
不动；seal 管线的内联判断（只认 `openai-gpt-image`）也保持——dalle3 不支持
`images.edit` 参考图编辑，被 seal 管线排除是正确设计。唯一建议的小改：在
`generateSealDesignImage` 入口加 `if (isDemoMode()) return mock`（从 `@/lib/env`
引入），使 DEMO_MODE=true 成为全线 demo 的总闸，与文本管线语义对齐，防误配。

### 2.2 参考图选取：「章型 × 钮制 × 装饰（× 石色）」映射

替换 `SEAL_REFERENCE_CATEGORIES` 的静态三态表，改为按 SealOrder 三字段路由：

```
主目录（seal_form × finial_type）：
  square + plain            → forms/square-plain（4 张）
  square + beast/dragon     → forms/square-beast（7 张）        ← 现缺失，最大增量
  square + decorated-top    → forms/ornamented-top（12 张）      ← 现缺失
  rectangle（任意钮制）      → forms/rectangle-chang（2 张）
  freeform（任意钮制）       → forms/freeform（1 张）
  unknown 兜底              → forms/square-plain

工艺目录（decoration_level × side_inscription，动态附加 1-2 个）：
  decoration_level = partial-relief → craftsmanship/bask-relief（2 张）
  decoration_level = full-carving   → craftsmanship/deep-carving（1 张）+ bask-relief
  side_inscription ≠ none/unknown   → craftsmanship/side-inscription（3 张）
  decoration_level = plain 且无边款 → 不附工艺目录（纯素坯）

石色软过滤（过渡方案，M1 前的启发式）：
  materials/<石种> 目录仍属 M1 待建（采购拍摄后启用，届时置顶优先）。
  过渡期按 stone_type 色系关键词过滤候选文件名——D 批文件名自带石色描述：
    qingtian → 「青白」「青」；shoushan → 「芙蓉」「金黄」「橙黄」；
    changhua → 「红」（朱红/柿红/红斑）；balin → 「冻」「白」；laoshit → 「金黄」「蜜」
  命中则收缩候选集，零命中则保留全集（宁滥勿空）。诚实标注：文件名描述不完整，
  过滤只是相关性加权，不是石种保证——质感正确性的主责仍在 prompt 的 STONE_VISUAL。
```

seed 确定性轮转机制原样沿用（`pickSealReferences` 的 `start = seed % candidates.length`
取法与「换 seed 重生成 = 换参考图组合」的 F4 变体机制等价，前端 RenderStudio 的
「重新生成」按钮已接 seed 递增）。`forms/oval-round`（2 张）暂无对应 `SEAL_FORMS`
枚举值，列为未来扩展 oval 形制时的现成资源。

**排除规则（新增一条铁律）**：`seal-faces/` 30 张（印面带字实物/印蜕）**永远不进
质感层参考**——与 NO TEXT RULE 直接冲突，会把印面文字「教」给模型。代码上不加入
映射表即可，并在 `pickSealReferences` 注释中写明排除原因。

### 2.3 prompt 组装对接（NO TEXT 条款确认）

`buildSealImagePrompt` 的输出契约与 `generateSealViaGptImage` 的拼接已经打通：
`fullPrompt = referenceIntro + prompt + safetySuffix`。其中 `prompt` 正文由
`segments + constraints` 组成，**NO TEXT RULE 位于 constraints[0]，随正文注入真实
管线，素坯无字铁律在真实路径同样强制生效 ✓**（seal-prompt.ts 第 149-154 行）。

唯一增强点（差距表 #3）：referenceIntro 补一句——
`"Some reference photos show inscriptions or seal faces; treat those purely as craft evidence — the new design must carry NO characters on any face."`
对应参考图实况（forms/craftsmanship 目录大量带边款/印蜕图）。

### 2.4 时序与降级：50-70s vs maxDuration 的矛盾及对策

**矛盾本质**：tokenx24 实测单张 50-70s（含 502 重试最坏 ~143s）；route
`maxDuration=60` 连主路径的单张都可能掐断，route 注释里「60s 覆盖 30-90s」的说法
在 90s 端本就兜不住。

**对策（按优先级）**：

1. **`maxDuration` 60 → 300**（route.ts 一行）。依据：Vercel Hobby 计划启用 Fluid
   Compute 后函数上限 300s（Pro 800s；非 fluid 旧路径 Hobby 上限 60s）。本项目 2026-09
   建于 Vercel，新项目默认 Fluid。**验证方式零成本**：改成 300 后 push，若构建报
   「maxDuration between 1 and 60 for plan hobby」即说明未开 Fluid → Dashboard →
   Settings → Functions 开启后重建即可。300s 覆盖「单张 70s + 3s 退避 + 重试 70s」
   仍有 150s 余量。
2. **前端等待体验**：RenderStudio 的 generating 态已有转圈 + 阶段文案，补「预计
   50-70 秒」口径（messages/*.json 文案改动，PRD 12.4 等待体验设计）。fetch 不设
   前端超时（浏览器默认连接超时 >300s，天然兼容）。
3. **服务端降级链（route 层）**：真实管线抛错时不返回 500 了事，按 PRD 10.2 落两级：
   - 超时/502 重试仍失败 → **回 mock SVG 渲染**并在响应体标注 provider=mock（体验降
     级主线不断，等价于预渲染兜底的最低实现）；
   - 401 INVALID_API_KEY（key 到期）→ 直接回 mock + `console.warn`（demo 日兜底口径）。
   - 预渲染图库（每「石料×章型×朱白」组合预存底图）是降级一级的完整形态，依赖真实
     管线先批量产图，列为 D 桶评测的副产品（跑 golden set 时顺带沉淀底图库）。
4. **多角度组图不进首版**（差距表 #8）：n 张 × 50-70s 串行在 300s 内只够 3 张且无
   余量，前端逐张请求可绕但等待体验崩坏。待 M6 角度结构固化后与异步化一起做。

### 2.5 502 重试策略移植（gen_image.sh → TS）

shell 版语义（gen_image.sh 57-88 行）：HTTP 502/504 → `sleep 3` → 重试**恰好 1 次**；
401 不重试；其余非 200 直接失败。TS 移植（放 `lib/ai/image-generator.ts` 内部）：

```ts
// edit 端点上游偶发 502/504 —— 移植 gen_image.sh 的重试语义：等 3s 重试 1 次。
// 401（key 失效）与 429（限流）不重试；仅本地/300s 预算内启用。
async function withEditRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const status = err instanceof OpenAI.APIError ? err.status : undefined;
    if (status !== 502 && status !== 504) throw err;
    console.warn(`[image-generator] edit 端点网关抖动(${status})，3s 后重试一次`);
    await new Promise((r) => setTimeout(r, 3000));
    return fn();
  }
}
```

包裹 `openai.images.edit(...)` 调用即可。`images.generate`（纯文本降级分支）同样
包裹无妨。OpenAI client `timeout: 180_000` 保持——单次 180s 上限，重试后最坏 ~363s
超出 300s，故**建议把 client timeout 收到 120s**，使「70s 均值 + 3s + 重试」全程
可控在 300s 内（120+3+120=243s）。

### 2.6 Key 治理（tokenx24 短期授权）

- **本地开发**：key 值从 `tools/tokenx24.key`（600 权限）读出人工粘贴进
  `.env.local`；`.env.local` 已在 .gitignore（不进 git）。key 到期：删 key 文件 +
  清 `.env.local` 三行，生图自动回落 mock（代码现成的缺 Key 降级）。
- **上线切换点**：Vercel env 配置即切换动作（§2.1）。**上线正式版必须换正式 key**
  ——短期授权 key 不配进 Production；如需线上灰度真图（demo 日前演练），配 Preview
  环境 + 预览域名验证，Production 保持 DEMO_MODE=true 直到最后切换。
- 任何文档/issue/聊天记录不复制 key 明文（本文件遵守：只引用路径）。
- 401 处理：route 层识别后回 mock 并 warn（§2.4-3），不静默吞。

### 2.7 并发对策（Hobby 并发=1 约束，部署线 2026-09-06 传入）

**问题本质**：maxDuration=300 只解决「单请求时长合法性」，不解决吞吐——Hobby
函数同时仅 1 个执行，生图占函数 50-70s 期间**全站 API（含访谈文本 AI 路由）都在
排队等锁**。PRD 14 口径 demo 日 ~10 并发生成，纯排队下最后一人等待 ~10 分钟。
另注意： RELEASE-SOP.md 同表列出 Hobby **商用限制条款**——印可道带成交留资，
商用属性明确，Hobby 本就不是合规的长期宿主。

三个候选 + 一个部署线未列的事实方案：

| 选项 | 做法 | 评估 |
|---|---|---|
| a) 路由层串行队列 | 模块级信号量：busy 时立即返回 202 + 排队位次，前端轮询/进度提示 | 并发=1 恰好保证单实例内存信号量有效（无跨实例竞态）。但**只把隐性排队显性化，吞吐仍 1 张/分钟**；10 人排队体验依旧崩坏。价值在于做**降级触发器**：排队 >2 人时直接回 mock/预渲染图（§2.4-3 降级链的并发维度扩展） |
| b) 生图移出 serverless（客户端直调 tokenx24，Key 经代理隐藏） | 代理签发受限凭证，浏览器直调 images.edit | **不推荐**。tokenx24 是裸 Bearer key 的 OpenAI 兼容端点，无代理签名/匿名 key 机制；「经代理隐藏」实为自建一次性限次凭证的防滥用工程（限 prompt、限次数、限预算），工作量远超收益。且任何客户端可见凭证一旦提取即可任意生图烧钱——demo 日风险不对称 |
| c) 升级 Vercel Pro（$20/月） | 解锁并发（Fluid Compute 下 Pro 函数并发默认 8）+ maxDuration 800s + **商用合规** | **线上真实生图的正解**。8 并发 × 50-70s 覆盖 PRD ~10 并发口径（少量排队可被 a) 的提示吸收）；商用限制条款本就要求商业用途上 Pro——这笔钱是合规成本不只是性能成本。Fluid 按用量计费下，生图等待期 CPU 几乎闲置，增量费用主要即 $20 底价 |
| d) demo 日演示机本地跑真图（部署线未列，事实存在的第 0 级延伸） | 演示机 `npm run dev` 直连 tokenx24（本地无 Vercel 并发/时长限制），线上 Vercel 保持 DEMO_MODE | **零成本零改造**，与 PRD 10.2 第 0 级（路演生死兜底）精神一致：现场可控网络、可控 key、无额度焦虑 |

**推荐结论（分场景双轨）**：

1. **demo 日/路演** → **d)**：演示机本地跑真图 + 线上 DEMO_MODE 兜底。不花一分钱，
   不改一行代码（S1 的 .env.local 即全部准备工作）。
2. **线上真实生图（demo 日后对外）** → **c) Pro 为主 + a) 轻量版为辅**：升 Pro
   解并发与商用合规；a) 只取其「排队显性化 + 超限自动降级 mock」那半截（不做完整
   队列），作为 Pro 并发耗尽时的体验保护闸。
3. **b) 否决**，理由见表。

**对 §4.1 清单的影响**：a) 轻量版拆为一项可选改造（S8，0.5 天：route 入口
`if (busy) 走降级` + 前端「排队中」文案），仅在确定走「线上真实生图但不升 Pro」
的死路时才有完整队列的必要——不推荐该组合。

---

## 3. 测试与验收

### 3.1 golden set D 桶怎么跑（20 组参数单）

- **参数单构成**：覆盖差距表主映射的格子——3 形制 × 4 钮制代表组合 + 5 石种 +
  3 装饰档 + 边款有无，抽 20 组正交组合（含 1 组全 unknown 兜底）。
- **跑法**：`node scripts/golden-set-d.mjs`（新增脚本，不进 CI）——直接 `import
  { generateSealDesignImage }`（绕过 HTTP 层，避免 dev server 超时干扰），每组
  固定 seed=1，落盘 `tmp/golden-d/<参数指纹>.png` + 一份 `manifest.json`（记录
  order、seed、耗时、provider、参考图路径）。
- **成本**：tokenx24 **未见单张成本标注**（IMAGE_API_GUIDE 无计费信息）——跑批前
  先问询计费口径或查后台账单。量级：20 组 × 2 seed = 40 张；串行 50-70s/张 ≈
  35-50 分钟，并行 2-3 路压到 15-25 分钟（上游并发上限未知，先 2 路试探）。
- **人工评分 ≥3/5**：每张按四维打分（水印存在为二元独立判据）：
  ① 形制/钮制与参数单一致；② 石色/质感与该石种库图特征一致；③ 无任何文字
  （NO TEXT 验收）；④ 整体质感真实度。任一二元项不过即该组失败。
  评分表随 manifest 落盘，D 桶发布前人工过一遍（PRD 16.2）。

### 3.2 水印二元素项

- 判据：输出图必带「AI 效果示意」标识（PRD 16.1 D 桶第一条，二元，不过即失败）。
- 实现归 §4-S5 的 sharp 合成层：真实 PNG 与（改造后的）mock 输出统一过
  `applyAiWatermark(buffer)` ——单测断言合成函数输出含水印图层；D 桶人工复核
  视觉可见性（字号/对比度在深浅底图上均可读）。
- 水印文案对齐 mock 现行口径：「AI 效果示意」主标 + 「非实物·不代表任何真实藏品」
  副标（中英均可，与现有 SVG 文字条一致）。

---

## 4. 实施步骤（文件级）+ 工作量 + 与文字层线的时序衔接

### 4.1 分步改造清单

| # | 文件 | 改动 | 量 |
|---|---|---|---|
| S1 | `.env.local` | 配 IMAGE_PROVIDER / OPENAI_API_KEY / OPENAI_BASE_URL 三行，`npm run dev` 冒烟一张真图 | 0.5h |
| S2 | `lib/ai/image-generator.ts` | `pickSealReferences` 升级：seal_form×finial_type 主路由 + decoration/side_inscription 动态附工艺目录 + 石色文件名软过滤；seal-faces 排除注释 | 0.5天 |
| S3 | `lib/ai/image-generator.ts` | `withEditRetry` 移植（§2.5）；client timeout 180s→120s | 0.25天 |
| S4 | `app/api/design-render/route.ts` | maxDuration 60→300（含 Fluid 验证）；catch 块加降级：真图失败/401 → 回 mock + provider 标注 | 0.5天 |
| S5 | `lib/design/watermark.ts`（新）+ route | sharp 水印合成层：真实 PNG 与 mock 统一过水印；`package.json` +sharp | 1天 |
| S6 | `lib/ai/image-generator.ts` | `generateSealDesignImage` 入口加 `isDemoMode()` 总闸 | 0.5h |
| S7 | `scripts/golden-set-d.mjs`（新） | D 桶批跑脚本 + manifest + 评分表模板 | 0.5-1天 |
| S8 | route.ts + messages 文案 | （可选，§2.7-a 轻量版）busy 时降级提示；仅线上真实生图且不升 Pro 时才需要完整队列——不推荐该组合 | 0.5天(可选) |

**合计：2.5-3.5 人日**（S1 可与 S2-S3 并行先行验证；S5 sharp 管线与文字层线
INTEGRATION-XIAOZHUAN.md 的③质感合成层是同一件基础设施，见下）。
demo 日的推荐路径（§2.7-d：本地跑真图）只需 S1-S3 + S6，约 1-1.5 人日。

### 4.2 与文字层线（INTEGRATION-XIAOZHUAN.md）的合成时序衔接

- 文字层方案 B 已定的衔接点：`/api/design-render` 第二阶段 =「质感层生成（现状
  不动）→ seal_text 非空时叠加文字层 → 输出组图」。**本方案不改这个顺序**：
  质感层产物（含水印前的素坯 PNG）仍是两线的交接物。
- 时序原则（PRD F4 五步）：①②③ 质感层（本线）→ ④ 崇羲叠字（文字层线）→
  ⑤ 水印（最后，覆盖合成后的成图）。**建议把 S5 的 sharp 管线设计成
  「叠加队列」**：`composite(basePng, [文字层?, 水印层])`——文字层线接入时只是
  往队列里插一层，水印永远在队尾，红线不可绕过。
- **交接契约需两线对齐一个点**：质感层斜视图里「印面留白平面」的定位。现 prompt
  已要求「bottom seal face is a clean flat polished plane」，但斜视角下印面未必可
  见/可定位。给文字层线的建议（决策权在彼线）：首版成品图组 = 斜视质感图（本线
  产物）+ 印蜕视图文字图（文字层独立渲染，红底白字形态本就不需要质感底图）两张
  并列——规避斜视图叠字漂移（D 桶「叠字位置无漂移」判据天然满足）；斜视图叠字
  待 M6 视角规格固化后再做。
- sharp 依赖两线共用，先到先加（本线 S5 或文字线③，加进 package.json 一次）。

---

## 5. 风险

| 风险 | 等级 | 应对 |
|---|---|---|
| tokenx24 中转稳定性（偶发 502/504；单张耗时波动） | 高 | §2.5 重试；§2.4 降级回 mock；上线后监控 `generation_result` 埋点的失败/降级率（PRD 15.1 已有事件位） |
| 短期 key 到期（401） | 高 | §2.6 治理：本地删 key 文件即回落 mock；route 层 401 显式降级 + warn，不静默 |
| 成本未知（无单张计费标注） | 中 | D 桶跑批前问询口径；单会话生成次数上限（PRD 8.2 经济风险，建议 8-12 次）作为前端硬闸后补 |
| maxDuration=300 依赖 Fluid Compute | 中 | 构建报错即信号（§2.4-1 验证法）；未开 Fluid 则 Dashboard 开启，或退回「线上 demo + 本地真图」的演示形态（DEMO_MODE 兜底，PRD 10.2 第 0 级） |
| **Hobby 并发=1：一人生图全站 API 排队**（RELEASE-SOP.md） | 高（线上多用户场景） | §2.7 双轨：demo 日：本地跑真图（d）；线上真实生图升 Pro（c，$20/月，兼解决商用合规）+ 排队超限降级 mock（a 轻量版）；客户端直调方案否决 |
| Hobby 商用限制条款 | 中 | 印可道含成交留资属商业用途；上线对外即升 Pro（与并发行合并处理，一次切换） |
| 参考图带字污染（边款/印面文字诱导生成） | 中 | prompt 补显式禁令（§2.3）；seal-faces 硬排除（§2.2）；D 桶「无文字」二元判据把关 |
| 参考图版权（故宫 DPM / 印鼎 yinding 系列馆藏照片） | 中 | 生成物不复制单品（prompt 已有 do NOT replicate + 原创设计要求）；参考图仅内部喂给模型不分发；上线前核对 D 批图库授权记录（若为馆方开放图录范围较稳，需留档来源） |
| b64 响应体膨胀（单张 ~1.4MB JSON） | 低 | Vercel 响应上限 4.5MB 内；组图时代需改分次请求或对象存储 + URL |
| 429/并发限制未实测 | 低 | 跑批先 2 路并行试探；route 错误码已含 rate_limited 分支 |
| 模型出图与 prompt 严重不符（IMAGE_API_GUIDE 已知问题） | 低 | 属模型质量非接口故障：改写 prompt 重试；D 桶评分暴露系统性偏差时回查 STONE_VISUAL/FORM_NOUN 词表 |

---

## 附：验证清单（嵌入完成的验收口径）

- [ ] 本地 `npm run dev`：`IMAGE_PROVIDER=openai-gpt-image` 下 POST
      `/api/design-render` 返回 `provider: "openai-gpt-image"`、`mime: image/png`，
      耗时 50-70s，图上无任何文字、带水印
- [ ] 同 seed 重放出同款参考图组合（manifest 可复核）；换 seed 参考图组合变化
- [ ] beast/dragon 钮参数单的路由命中 `forms/square-beast`（manifest 记录参考图路径）
- [ ] DEMO_MODE=true 时即使配齐 Key 也回 mock（S6 总闸生效）
- [ ] Vercel 部署：maxDuration=300 构建通过（或按 §2.4-1 处理）；真图失败自动降
      级 mock，UI 主线不断
- [ ] 并发行为符合 §2.7 选定路线（本地演示：两窗同发生图互不阻塞；若上 Pro：
      ≥2 并发生图均 200 且耗时不叠加）
- [ ] D 桶 20 组：水印二元 100% 通过；人工四维评分均 ≥3/5

---

## 附 2：部署侧关联事实（部署线 2026-09-06 传入，与本线的交界）

- build 预检已通过：next/font 在本机需系统代理（127.0.0.1:12450）拉取字体，
  属本机网络现象，Vercel 构建机无此问题——**生图嵌入方案不受影响**。
- Hobby 额度核查详情见 `RELEASE-SOP.md`（并发=1 / 带宽 100GB / maxDuration 等）；
  本方案 §2.4 与 §2.7 的对策以其为输入。注意 RELEASE-SOP 表中「单次最长 60s 顶格」
  为非 Fluid 口径，与本方案 §2.4-1 的「Fluid 下 300s」不冲突，以 Fluid 验证结果为准。
