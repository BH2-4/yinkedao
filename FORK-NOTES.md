# Fork 改造盘点笔记（银中贵 → 印可道）

> 基线：BH2-4/SilverForgedGui（银中贵·苗银定制平台），fork 至 `/Users/arco/yinkedao/`。
> 对照文档：`/Users/arco/seal-ai-hackathon/PRD-篆刻定制Agent.md`（v0.3，O9/O10 已决：fork 改造 + heritage 三件套纳入）。
> 盘点日期：2026-09-05。dev server 保持运行中（见文末环境记录）。

---

## 0. 一页结论

- **跑通状态**：npm install 成功；DEMO_MODE 无 Key 全站可跑；6 个 Stage 页面 + collection 独立站全部 200；官方全链路场景测试 `scripts/test-design-render.mjs` **72/72 通过**。
- **三类清单计数**：直接复用 9 项 / 需改造 8 项 / 可删除或后置 6 项。
- **最大改造风险点**：① 崇羲叠字管线全新无现成轮子（白文镜像反相、缺字映射、繁简处理）；② 质感层/文字层分离架构需在现有单层生图管线上插入合成层；③ 六站「漏斗式深化」信息架构 → 五维度「并行参数单」不是换文案，是 Stage 语义重设计。
- **PRD 口径修正一处**：PRD 12.1 称银中贵「URL 持久化当前设计状态」——实际实现是 **sessionStorage**（`lib/constants/storage.ts`，6 个 key，读取即消费）。tab 内刷新可恢复、不可分享链接。fork 时需决策：补 URL 序列化层，或降 PRD 预期。

---

## 1. 结构盘点（对照 PRD 节 17 复用清单）

### 1.1 Stage 路由模式（六站漏斗）

| Stage | 路由 | 定位 | 核心组件目录 |
|---|---|---|---|
| 0 | `/design-interview` | 记忆访谈（引导式问答） | `components/design-interview/`（InterviewFlow/QuestionCard/IntentSummary） |
| 1 | `/global-design` | 需求分析（自然语言→结构化偏好） | `components/global-demand/`（StudioForm/NaturalLanguageInput/ClarificationDialog 等 8 件） |
| 2 | `/cultural-match` | 文化匹配（非遗库匹配 3 方向） | `components/cultural-match/`（CulturalMatchStudio 等 5 件） |
| 3 | `/design-translation` | 设计翻译（方向→3 设计方向→brief） | `components/design-translation/`（TranslationStudio 等 10 件） |
| 4 | `/design-proposal` | 设计提案（完整提案文档） | `components/design-proposal/`（ProposalStudio 等 4 件） |
| 5 | `/design-render` | AI 效果图 | `components/design-render/`（RenderStudio 等 3 件） |

- **路由定义单一事实源**：`components/journey/journey-stages.ts`——`JOURNEY_STAGES` 常量（code/href/i18n key），顶栏菜单、右侧 JourneyRail、首页 JourneySection 三处共用，天然一致。`stageIndexFromPathname()` 定位当前站。
- **页面极薄**：如 `app/design-interview/page.tsx` 仅 17 行——包一个 Studio 组件 + 传 `demoMode={isDemoMode()}`。
- **页面间状态传递：sessionStorage，非 URL**。`lib/constants/storage.ts` 定义 6 个 key（`silver-future:stage0-intent` / `design-brief` / `design-translation` / `stage3-brief` / `stage4-proposal` / `stage5-render`），tab 级瞬态、read-once（Stage 0→1 预填即消费）。Stage 2→3 的 payload 只信任 `id`，文化属性全部服务端重推导（防客户端篡改）。
- **API 路由**（`app/api/*/route.ts`，6 个）：cultural-match / design-intent / design-proposal / design-render / design-translation / global-demand/analyze。全部 Zod 校验入参 → typed error envelope。
- **类型层**：`types/`（cultural-match / design-proposal / design-render / design-translation / global-demand）定义 API 响应联合类型。

### 1.2 lib/ai Provider 适配层（文本 + 生图双套）

**文本（Anthropic 协议）**：
- `lib/ai/providers/types.ts`：`DemandProvider` 接口——单一 `analyze(input): GlobalDemandResult`；`ProviderError`（code: invalid_input/provider_error/timeout/rate_limited/unknown）。约定：模型级歧义不抛错而是返回 `ClarificationQuestion`（判别联合）。
- `lib/ai/providers/index.ts`：`selectProvider()`——DEMO_MODE 显式 true 或无 key → demoProvider；否则 anthropic。
- `lib/ai/providers/anthropic.ts`：SDK 直连；system prompt 在 `lib/ai/prompts/global-demand.ts`；vision 输入（dataUrl→base64 image block）；JSON 容错提取（`firstJsonObject` 括号配平扫描）；Zod safeParse 失败 → ProviderError（**无自动重试**）。
- `lib/ai/providers/demo.ts`：确定性启发式引擎——词表匹配（品类/风格/场合/情绪/市场 5 张 map）+ 澄清问题生成 + 置信度合成；UI 明确标注 DEMO MODE；铁律：不发明文化事实。
- `lib/env.ts`：`isDemoMode()`（true / false+无key / 未设+无key 三态）+ AI_MODEL / AI_MAX_TOKENS / AI_TIMEOUT_MS 读 env。支持 `ANTHROPIC_BASE_URL` 换智谱 GLM 等兼容端点。
- `lib/ai/client.ts`：`analyzeGlobalDemand()` 统一入口，返回 `{ demoMode, result }` 供 UI 诚实标注。

**生图**：
- `lib/ai/image-generator.ts`：`generateDesignImage()` 单一接缝，三档 provider——`mock`（确定性 SVG 概念图，含「DESIGN CONCEPT · AI VISUALIZATION / 非实物复刻」水印与信息安全区）/ `openai-dalle3` / `openai-gpt-image`（推荐）。
- 参考图选取：`PRODUCT_REFERENCE_CATEGORIES` 品类→collection 图片目录映射 + `pickReferenceImages()` seed 确定性轮转选 3 张（换 seed 重生成=换参考图组合→变体机制）。
- `images.edit` 调用：`toFile()` 读真实照片 + gpt-image-2，prompt 明示「继承材质工艺质感、禁止复制任何一件」；无参考图回落 `images.generate`。
- **注意**：文本 Provider 接口是 GlobalDemand 专用（单次 analyze），不是多轮对话接口。印可道五维度访谈 + WHEN-THEN 协议需扩展接口形态。

### 1.3 lib/design schema 体系（Zod 端到端）

- `lib/design/schemas.ts`（657 行）：
  - **编译期 drift guard**：`AssertEqual<z.infer<Schema>, Interface>` 保证 Stage 2⇄Stage 3 契约不漂移（类型不等直接编译失败）。
  - **三层真值分层**：`documented_cultural_facts`（逐字 KB 字符串 + `origin` 指针）→ `design_interpretation`（必须携带字面 `AI DESIGN INTERPRETATION` notice）→ `generation_prompt`（只由结构化字段组装）。
  - `spec_provenance`（size/weight/visibility/wearability 标 user 还是 ai 建议——UI 诚实标注）。
  - `WhyItem { key, vars }`——引擎发 i18n 模板键，UI 渲染文案，引擎零硬编码 copy。
  - 两步协议（`TranslationRequestSchema.step: "directions" | "brief"`）+ `refresh` 轮转（「再看看其他方向」）。
  - `ProposalHandoffSchema`：Stage 4→5 传递的完整确认态。
- `lib/design/verification.ts`（567 行）：RULE-001~007 服务端校验——source_required / regional_attribution / motif_meaning（象征动词正则 `MEANING_VERBS`）/ evidence_level / design_transformation（诠释层不得含事实串）/ **no_unsupported_claim（事实串与 KB 字段逐字节比对）** / claim_level_integrity（claim_level 只能由证据降级推导）。`verifyDesignBrief` / `verifyDesignDirection` / `verifyDesignProposal` 三个入口。
- **与 PRD 16 桶 B 的差距**：银中贵 LLM 输出校验失败是直接 ProviderError（用户手动重试），PRD 要求「失败即重试一次，再失败降级」——fork 时需在 route 层补自动重试+降级。

### 1.4 lib/heritage 三件套（+ 支撑件）

| 文件 | 行数 | 职责 |
|---|---|---|
| `lib/heritage/types.ts` | 344 | 双轴证据体系：`EvidenceLevel`（official/interview/museum/academic/inference，源类型）× `ClaimLevel`（official/documented/interpretive/visual_only/unknown，断言强度）；`CulturalEvidence`（claim 必须逐字数据集文本）；`RegionInfo`（诚实回退 unattributed）；`MatchWhy` 三层 why 契约（偏好链/可溯源事实/AI 建议）；`MATCH_WEIGHTS` 六维透明打分 22/30/12/12/12/12=100；8 类实体 Zod schema |
| `lib/heritage/repository.ts` | 186 | 唯一允许 touch JSON 的模块；静态 import（serverless 兼容）+ Zod 校验 + 模块级缓存；`getHeritageById()` 判别联合返回 |
| `lib/heritage/match.ts` | 882 | `matchCulturalHeritage(brief)` 单入口——**纯规则引擎（无 LLM）**：glossary 语义桥 + 六维加权 + product_compatibility 硬约束过滤（incompatible 直接不进候选） |
| `lib/heritage/guardrail.ts` | 269 | `runCulturalGuardrail()` RULE-001~007（与 verification.ts 同 rule id 体系，全程可比） |
| `lib/heritage/evidence.ts` | 341 | 证据工厂：`claimLevelFromEvidence()` 只降不升；`motifFacts/itemFacts/styleFacts/craftFacts/projectFacts`；`documented_meaning === null` 是 load-bearing——护栏禁止升格为象征断言 |
| `lib/heritage/glossary.ts` | 402 | 英文 DNA token ↔ 中文数据集语义桥（视觉亲和表/工艺美学表/品类适配表/区域档案）——只赋视觉亲和、永不附文化含义 |
| `lib/heritage/search.ts` | 251 | 结构化关键词搜索（非向量，双语 gloss） |

**数据集** `data/SilverHeritage-GZ-v1/`（比赛 Demo 版 v1.0，2026-08-29）：`dataset_manifest.json`（source-first 方法论：无直接证据的寓意/象征/地域归属不写成事实）+ `docs/schema.md` + 8 个 json（sources 8 / projects 4 / regional_styles 4 / items 22 / motifs 8 / crafts 8 / people 3 / cultural_rules 6）。每实体必带 `source_ids` + `evidence_level`。

### 1.5 lib/design-interview 访谈问题引擎

- `lib/design-interview/engine.ts`（489 行）：`QUESTIONS` 题库（9 题：occasion/product_type/form_preference/style/emotional_direction/visual_presence/scale/weight/material_preference，single/multiple 模式）+ `FLOW` 自适应流程（`when(answers)` 条件分支——品类未定则跳过体量题、小体量省略 weight 题）+ `DEPENDENTS` 依赖作废图（改品类→清空下游 form/scale/weight）+ `buildUserDesignIntent()` 确定性规则合成（字段级置信度：单选 1.0/多选 0.9/探索 0.35/跳过 0.25）+ `INTENT_SYNTHESIS_SYSTEM_PROMPT`（AI user_context 合成，文化护栏：禁提龙/苗/贵州等词）。
- **文案与结构分离**：引擎只有题目结构（id/选项 token），全部展示文案在 `messages/*.json` 的 `interview` 段（i18n 单一事实源）。
- `lib/design-interview/handoff.ts`（192 行）：Stage0→1 payload——token→偏好芯片枚举映射 + `containsCulturalClaims` 命中即回退规则模板。
- `lib/design-interview/intent-types.ts`（218 行）：token 枚举 + 文化断言正则。

### 1.6 生图管线（Stage 5 全链）

链路：`ProposalHandoff`（sessionStorage）→ `POST /api/design-render`（`app/api/design-render/route.ts`：Zod 校验 → direction 一致性校验 400 → `verifyDesignProposal()` 重跑护栏 422 → `buildImagePrompt()` → `generateDesignImage()`）→ `{ image: { data_url, provider, model }, image_prompt, verification }`。

- `lib/design/render-prompt.ts`（479 行）：纯确定性翻译 Proposal→`ImagePrompt`。关键机制：**PRODUCT LOCK**（品类锁死，负面清单镜像）、`MOTIF_EN` 中文名→英文（语言翻译非语义添加）、`CRAFT_VISUAL` 工艺→视觉词汇表（拉丝→filigree openwork 等）、`TIER_VISUAL_LANGUAGE` 三档、**条件化负面清单**（客户没选的都禁止——quiet 禁 excessive ornamentation、无 motif 禁一切民族纹样）、prompt 体=设计决策在前+文化边界在后。
- 部署适配（`next.config.ts`）：`outputFileTracingIncludes: { "/api/design-render": ["./public/collection/assets/images/**/*"] }`——参考图随函数 bundle 上 Vercel；route `maxDuration = 60`（覆盖 30-90s 生图实测）。
- **关键架构事实（PRD 8.1 的差异点）**：银中贵是**单层生成**（直接出完整成品图）。印可道需**质感层/文字层分离**——`images.edit` 生成无字章体质感层 + 崇羲引擎后叠加印面文字。image-generator 的 adapter 架构与参考图选取机制可复用，但输出后需插入合成层（新模块）。

### 1.7 /collection 独立站（L1 电商范本）

- `public/collection/`：纯静态多页站（7 页：index / products / detail / about / heritage / certifications / contact）+ `assets/js/data.js`（由 `assets/manifest.json` 自动生成，91 件产品 10 品类）+ `assets/css/site.css`。
- `next.config.ts` 三项适配：`/collection` → `/collection/index.html` redirect（尾斜杠资源解析问题）、shop.randomplayx.com 整域 301、子目录 assets 重写。
- 双向导流：`NEXT_PUBLIC_COLLECTION_URL`（`lib/collection-url.ts`）+ 主站 `app/page.tsx` 与 `components/shared/SiteTopBar.tsx` 的入口按钮。
- **注意**：`public/collection/assets/images/`（10 品类目录，144+ 张）**同时是生图参考图库**（被 `image-generator.ts` 与 `cultural-match/archive-images.ts` 引用）——删 collection 前必须先迁出参考图。

### 1.8 i18n

- `messages/{zh-CN,en,ja,fr}.json` 各 1259 行、14 顶层段（meta/common/journey/home/globalDemand/culturalMatch/designTranslation/designDirections/designProposal/proposal/interview/errors/values/designRender）。
- `lib/i18n/config.ts`（LOCALES/DEFAULT zh-CN/sf_locale cookie/Accept-Language 解析）+ `dictionaries.ts` + `server.ts`；`components/i18n/I18nProvider.tsx`（客户端）+ `LanguageSwitcher.tsx`。SSR/CSR 首绘一致。
- **结构要点**：访谈引擎、match 引擎的说明文案全走 i18n key（引擎层零硬编码 copy）——即使 MVP 中文优先，也不宜拆掉 i18n 基建，只留 zh-CN 一份即可。

### 1.9 data/ 苗银数据库组织

- `data/SilverHeritage-GZ-v1/`：结构化知识库（heritage 三件套数据源，见 1.4）。
- `data/苗族银饰非遗数据库（已分类）/`：10 大类原始图片目录（01_头饰类 … 10_鉴定证书与产品标签，共 144 张）——**代码零引用**（grep 确认仅注释提及），系素材备份。真正被 app 使用的图片在 `public/collection/assets/images/`（按品类英文目录名组织：headwear/necklaces/chest/earrings/hand-jewelry/garment/craft-objects/patterns/craftsmanship/certificates，编号规则 `HW-001` 等）。

---

## 2. 环境跑通记录

| 项 | 结果 |
|---|---|
| Node / npm | v26.5.0 / 11.17.0（Next 16 实测可跑；官方要求 ≥20.9） |
| 包管理器 | **npm**（package-lock.json 243KB 为准；`pnpm-workspace.yaml` 实为 allowBuilds 脚本白名单配置——pnpm v10+/npm 11 的 unrs-resolver postinstall 许可，非 workspace 定义，勿被文件名误导） |
| npm install | exit 0；仅 1 条 allow-scripts 警告（unrs-resolver postinstall 被阻，不影响运行） |
| .env.local | 仅 `DEMO_MODE=true`（无任何真实 Key） |
| dev server | `npm run dev` → Ready in 339ms（Turbopack）；首编译 11.9s，后续页面 0.1-1.1s |
| 页面验证 | `/` `/design-interview` `/global-design` `/cultural-match` `/design-translation` `/design-proposal` `/design-render` `/collection/index.html` 全部 200 |
| API 验证 | POST `/api/global-demand/analyze` 返回 `{"success":true,"demoMode":true,...}`——demo 启发式正常 |
| 全链路测试 | `node scripts/test-design-render.mjs` → **72 passed, 0 failed**（Stage 2→3→4→5 串联 + i18n 键位四语种校验） |

**启停命令**：
- 启动：`cd /Users/arco/yinkedao && npm run dev`（当前已在后台运行，日志 `/tmp/yinkedao-dev.log`）
- 停止：`lsof -ti:3000 | xargs kill`（或让会话保持后台任务）
- 测试：`node scripts/test-design-render.mjs`（需 dev server 在跑）；另有 `scripts/smoke-stage0.mjs`、`scripts/test-design-proposal.mjs`、`scripts/test-design-translation.mjs`

---

## 3. Fork 改造清单

### 3.1 直接复用（不动或仅换文案/品牌）—— 9 项

1. **Next.js 16 脚手架全套**：`package.json`（依赖集：next 16.3.3 / react 19.2 / zod 4 / motion 13 / @anthropic-ai/sdk / openai）、`tsconfig.json`、`eslint.config.mjs`、`postcss.config.mjs`、`app/globals.css`、`app/layout.tsx`。仅换品牌名与 meta。
2. **Stage 路由模式骨架**：`components/journey/journey-stages.ts` 常量驱动 + 薄页面模式 + JourneyRail/SiteTopBar 三处一致导航。
3. **文本 Provider 适配层全套**：`lib/ai/providers/{types,index,anthropic,demo}.ts` + `lib/env.ts` + `lib/ai/client.ts`——DEMO_MODE 三态逻辑、typed error envelope、JSON 容错提取原样保留；换 `lib/ai/prompts/` 提示词即可。
4. **生图 Provider adapter 架构**：`lib/ai/image-generator.ts` 的三档 provider 结构 + mock SVG 渲染器（水印「AI 效果示意 / 非实物复刻」模式与 PRD 9.1 反冒充红线同构，直接沿用）+ seed 确定性变体机制。
5. **Zod 端到端模式**：drift guard（AssertEqual）、三层真值分层、`spec_provenance`、`WhyItem` i18n 模板句——`lib/design/schemas.ts` 的工程范式整体迁移。
6. **Motion 动效语言**：`components/visual/{AtmosphereLayer,MotionReveal,PageTransition,ParticleField}.tsx`——慢速电影感页面过渡 + 等待体验（对应 PRD 12.4）。`NEXT_PUBLIC_PARTICLE_EFFECT` 开关与 prefers-reduced-motion 处理已就位。
7. **i18n 基建**：`lib/i18n/{config,dictionaries,server}.ts` + `components/i18n/`——引擎文案解耦机制必须保留（删 en/ja/fr 三份 json，留 zh-CN）。
8. **API 响应类型模式**：`types/*.ts` 联合类型 + route 层 typed error envelope。
9. **场景测试基建**：`scripts/*.mjs` 无框架 fetch+assert 模式——golden set 四桶（PRD 16）的直接落点。

### 3.2 需改造（改成什么）—— 8 项

1. **design-* 六站 → 五维度 intake（PRD 12.1，M3 核心）**：
   - `lib/design-interview/engine.ts` 题库结构与机制全保留（QUESTIONS/FLOW 条件分支/DEPENDENTS 作废/字段置信度），题目重写为五维度：石料→用途→外形（形制+钮制）→装饰（边款）→印面（印文+朱白+章法）。PRD「帮我全决定」＝跳级直达 3 提案，可复用 Stage 3 directions 的「三方向」机制。
   - 六站语义重排：Stage 0（访谈）吸收 Stage 1（global-demand 自然语言输入）的能力后，`app/global-design` + `components/global-demand/` 整线可删（决策点：五维度 intake 是否保留自由文本输入框——建议保留 NaturalLanguageInput 作为每维度的补充输入）。
   - Stage 3/4（翻译+提案）合并简化为「参数单确认页」（PRD 11.2-F1 输出的 Zod 设计参数单）；Stage 2 文化匹配降级为 F6 简化映射表；Stage 5 渲染保留。
2. **heritage 三件套 → 印章文化元素库（M8，灰度版）**：`types.ts` 双轴证据体系 + `repository.ts` 模式 + `guardrail.ts` RULE-001~007 + `evidence.ts` 只降不升工厂**机制全保留**；数据集从 8 实体换成印章文化元素（传统印式/边款意象/纹样典故，字段并行设计）；`glossary.ts` 语义桥全重写（苗银 token 表→印章 token 表）。验收对齐 PRD M8：用途→3 个带溯源的文化元素建议 + 库外拦截。
3. **render-prompt.ts → 印章质感层 prompt（M2/M4）**：PRODUCT_LOCK 改章型锁死（方章/日字格半通印/随形，禁互漂）；`MOTIF_EN`→钮制与纹样英文映射；`CRAFT_VISUAL`→薄意/边款/做旧视觉词汇表；参考图选取映射改「石种×章型」目录。**prompt 强制声明「素坯无任何文字刻痕」**（质感层/文字层分离的第一道闸）。
4. **崇羲叠字合成层（全新模块，F3/M4）**：fonttools 取形 → 规则引擎排布（05 章法硬约束）→ 白文镜像+笔画反相 → 叠入质感层 → 水印。插在 `/api/design-render` 响应前。**全新无轮子（R4），建议 M3/M4 启动前半天预跑验证**（崇曦字体 CC BY-ND 3.0：只渲染不分发、产出物署名）。
5. **data → 石料库（M1）**：套用 SilverHeritage-GZ-v1 组织方式（manifest 的 source-first 方法论 + schema.md + json 分域 + 每实体 source_ids/evidence_level），建四大国石+国外中间价位带石料库（石种/颜色/纹理/透明度/种水/等级/价位带/名品字段，PRD 10.1 事实库约束的落点）。`lib/heritage/repository.ts` 的 loader 模式照抄。
6. **参考图库迁移**：`public/collection/assets/images/` → 新石料照片库目录（按「石种×章型」组织）；同步改 `image-generator.ts` 的 `PRODUCT_REFERENCE_CATEGORIES` 与 `next.config.ts` 的 `outputFileTracingIncludes`。M4 验收「每种石料 ≥5 张库图」。
7. **LLM 输出校验补「重试一次→降级」（PRD 16 桶 B）**：现状 anthropic.ts safeParse 失败直接 ProviderError；在 route 层或 client.ts 补自动重试 1 次 → 再失败降级表单/规则引擎路径（demoProvider 机制已是降级形态范本）。
8. **URL 持久化层（决策点）**：PRD 12.1 要求 URL 持久化（刷新恢复/分享），现状 sessionStorage。方案 A：设计参数单（Zod schema 已就位）序列化进 URL query；方案 B：降 PRD 预期维持 sessionStorage（tab 内刷新仍可恢复）。建议 A——五维度参数单天然适合 query 化，且 PRD「分享」诉求真实存在。

### 3.3 可删除/后置（苗银特有）—— 6 项

1. `data/苗族银饰非遗数据库（已分类）/`（144 张，代码零引用，素材备份）——确认团队无需后直接删。
2. `public/collection/` 91 件产品独立站（7 个 HTML + `assets/js/data.js` + manifest）——L1 电商预留后置（PRD 19.1）；**删前先迁出 `assets/images/` 参考图**（见 3.2-6）。连带 `next.config.ts` 的 collection redirect/rewrite 与 shop.randomplayx.com 301、`lib/collection-url.ts`。
3. `messages/{en,ja,fr}.json` + `LanguageSwitcher.tsx`——N5 中文优先；保留 zh-CN 与 i18n 基建。
4. `app/global-design` + `components/global-demand/` + `lib/ai/prompts/global-demand.ts`——若五维度访谈吸收其输入能力则整线删（见 3.2-1 决策点）；`demo.ts` 的词表是英文苗银域的，同步换域重写。
5. `lib/story-url.ts` + `NEXT_PUBLIC_3D_STORY_URL` + `app/page.tsx` / `SiteTopBar.tsx` 里的 3D 展厅导流链接——randomplayx 特有。
6. `data/SilverHeritage-GZ-v1/` 全部苗银数据（heritage 数据源）——被印章文化元素库替换后删（M8 交付前保留作机制测试夹具）。

---

## 4. 工作量粗估（对照 PRD M2/M3/M5/M8；单位=理想人日）

| 里程碑 | 内容 | 复用收益 | 粗估 |
|---|---|---|---|
| M2 模板库 | 形制/钮制/章法模板 + 生图参数映射 | render-prompt.ts 范式全在 | 4-6 天 |
| M3 Agent 流程 | 五维度 WHEN-THEN + golden set A 50 条 | 访谈引擎机制 + Provider 层 + 测试基建 | 6-10 天 |
| M5 前端动效 | 伪 3D 序列帧 + 演示模式验收 | Motion 语言/Stage 骨架/DEMO_MODE 全在；序列帧渲染管线全新 | 4-7 天 |
| M8 文化匹配层 | 三件套换印章数据集 | 机制 100% 保留，只换数据+glossary | 4-6 天 |
| 崇羲管线（并入 M4） | 取形/排布/反相/叠字/水印 | 无对应物，全新 | 4-8 天（高风险，先预跑） |

PRD「fork 压缩 M2/M3/M5 工期 30-50%」的估算基本可信（脚手架/Provider/Zod/动效/测试五块基建零成本）。

## 5. 风险与决策点清单

1. **崇羲叠字管线**（R4）：白文镜像反相、缺字如实告知（11,596 字覆盖查询）、繁简映射均无现成轮子——最高优先预跑项。
2. **质感层/文字层分离**：`images.edit` 出无字章体 + 合成叠字的两层时序、印面区域对位（PRD D 桶「叠字位置无漂移」）——银中贵单层生成无此概念，合成层是新架构。
3. **六站→五维度的信息架构**：不是改文案，是 Stage 语义重设计（漏斗深化 vs 并行参数单）；「帮我全决定」跳级路由需新做。
4. **URL 持久化 vs sessionStorage**（见 3.2-8）。
5. **global-demand 线去留**（见 3.2-1）。
6. **参考图库与 collection 耦合**：删站不删图，先迁后删。
