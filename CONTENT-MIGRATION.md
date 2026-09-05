# 内容域迁移清单（苗银域 → 篆刻域）

> 用户指令：fork 库的图片、文字、模型等内容全部从苗银域更换为篆刻域——先梳理清单，再准备映射替换材料；不强求一一对应，不合适的删除或保留。
> 本文件为**梳理产物，未执行任何替换/删除/移动**。基线盘点见同目录 `FORK-NOTES.md`（机制层），本文件聚焦**内容层**。
> 素材源：`/Users/arco/seal-ai-hackathon/篆刻资料库/`（RENAME-LOG.md 全量日志）、`/Users/arco/seal-ai-hackathon/yinding/`、调研报告 02/05/06/07。
> 日期：2026-09-05。

---

## 0. 一页结论

| 决策类 | 计数 | 说明 |
|---|---|---|
| **可直接替换**（有素材对应） | 15 项 | 品牌文案、首页三图（✅ A 批已换）、访谈题库文案、lib 词表、data 数据集内容、story-url 外链机制（✅ A 批已改）等 |
| **需新制作**（无素材但必需） | 7 项 | 石料素坯照库、伪 3D 序列帧、崇羲印面渲染产出、朱白对比示意图等 |
| **删除** | 5 项 | collection 独立站全套、水印图 2 张、苗银原始图库等（story-url 原#30 改策为【替】，见下） |
| **保留不动** | 7 项 | 机制代码、i18n 基建、errors/common 文案段、Motion 动效等 |
| **3D 素材源新增** | 3 项 | `~/seal-ai-hackathon/3d篆章/` 三个真 glb——**定位为独立 3D 站资产，不进本库**（详见第 6 节专项） |

- **最大缺口**：① 真实石料素坯照片（生图参考图的质感基准，现有 45 张章体/馆藏图均为**成品章含雕工**，非石种材质照——M1 采购拍摄项）；② 崇羲印面渲染产出（最终印面图必须管线生成，现有 25 张印面素材只能作参考与 D 桶评测基准）。
- **3D 路线已拍板（2026-09-05 用户决策）**：**外链独立 3D 站架构**（银中贵同构）——story-url 外链机制保留、env 改名 `NEXT_PUBLIC_3D_SEAL_URL`（空值时入口隐藏）、文案改「3D 篆章展厅」；三个 glb 定位为独立 3D 站资产（不进本库）；站内 F2 渐显动效仍按 PRD 12.2 序列帧实现。详见第 6 节专项。
- **版权风险两处**：名家印作 2 张带「篆刻小站」水印；yinding 32 张为博物馆馆藏棚拍——demo 内部使用风险低，公开商用前需核授权（详见第 7 节）。
- **建议执行批次**：A 品牌与首页（零机制风险）→ B 文案域重写（i18n 内）→ C lib 词表与 prompt → D 参考图库搭建与迁移 → E 数据集换域 → F 删除线（D 完成后才能删 collection）。详见第 5 节。

---

## 1. 扫描明细

### 1.1 public/ 静态资产

| 路径 | 规模 | 用途 | 引用处 |
|---|---|---|---|
| `public/atelier/hero-silver.jpg` | 237KB | 首页 Hero 主视觉 | `app/page.tsx` / `components/home/HeroIntroScene.tsx` |
| `public/atelier/culture-silver.jpg` | 275KB | 首页「传承」章节配图 | 同上 |
| `public/atelier/detail-silver.jpg` | 530KB | 首页「材质」章节工艺特写 | 同上 |
| `public/collection/assets/images/` | **10 品类 144 张**（headwear 28 / craftsmanship 26 / hand-jewelry 23 / certificates 17 / craft-objects 14 / patterns 10 / earrings 8 / necklaces 8 / garment 6 / chest 4） | ① 生图参考图库（`lib/ai/image-generator.ts` 按品类映射 + seed 轮转选 3）② 文化匹配展示图（`components/cultural-match/archive-images.ts`）③ collection 独立站商品图 | 三处；`next.config.ts` outputFileTracingIncludes 打包进 /api/design-render |
| favicon / logo / icon | **不存在** | — | layout 无 icon 配置，浏览器取默认 |

### 1.2 messages/zh-CN.json（1259 行，14 顶层段）

关键词命中（银/苗/贵州/黔/侗/首饰/饰品/品类词/佩戴/Silver）：

| 段 | 行数 | 命中 | 域判定 | 处置 |
|---|---|---|---|---|
| meta | 4 | 2 | 品牌名+描述，全换 | **替换** |
| common | 63 | 3 | 通用 UI（按钮/阶段名，3 处「银饰」字样微调） | **保留**（微调 3 处） |
| journey | 34 | 7 | 六站名与描述 → 五维度站名 | **替换** |
| home | 31 | 13 | Hero 全套叙事（「让贵州银艺走向世界」等） | **替换**（整段重写） |
| globalDemand | 46 | 6 | 需求分析站文案 | **待决策**（随 global-demand 线去留，见 FORK-NOTES 3.2-1） |
| culturalMatch | 73 | 4 | 匹配机制文案（通用）+ 少量域词 | **保留**（4 处换词） |
| designTranslation | 49 | 1 | 机制文案 | **保留**（1 处换词） |
| designDirections | 121 | 12 | 三方向机制（通用）+ 品类/材质值 | **替换值表**，机制句保留 |
| designProposal | 175 | 8 | 提案文档模板句 | **替换域词**（银→石/章） |
| proposal | 49 | 15 | 材质/工艺段（silver 高密度） | **替换**（材质段重写） |
| interview | 302 | 20 | **最大段**：九题题库文案+选项值表 | **替换**（五维度题库整体重设计，机制键保留） |
| errors | 23 | 0 | 纯通用 | **保留** |
| values | 217 | 20 | token 值表（product/style/material/finish 等枚举中文标签） | **替换**（品类→章型/石料值域） |
| designRender | 70 | 4 | 渲染站文案 | **替换域词** |

**估算**：需改写约 **500-600 行**（interview 302 整段 + values 约 150 + home/journey/meta 约 70 + 各段域词散点）；纯保留约 130 行（errors + common 主体）。

### 1.3 data/SilverHeritage-GZ-v1/（8 json，机制保留、内容换域）

| 文件 | 现内容 | → 篆刻域映射建议 | 源材料 | 里程碑 |
|---|---|---|---|---|
| sources.json（8 条） | 非遗网/博物馆等来源著录 | 印章文化元素库来源：调研报告 02/05/06/07、印谱著录、博物馆藏印（yinding 系列） | 07/05/06 报告尾注 | M8 |
| motifs.json（8 条：龙/虎/花鸟…） | 苗银纹样（documented_meaning 全 null） | 印章文化纹样/边款意象（如纪念场景→西湖意象→边款薄意建议，F6） | 需新调研整理（05 报告+文化评审人） | M8 |
| crafts.json（8 条：拉丝/錾花/捶打…） | 苗银工艺 | 篆刻技法：薄意/边款刻制/深雕/做旧/砂地… | 05/02 报告 | M2 |
| heritage_items.json（22 条） | 苗银器物条目 | 传统印式与名品（汉印/满白文/元朱文/九叠篆官印…） | yinding 05-5/13-4 九叠篆实例、05 报告 | M8 |
| regional_styles.json（4 条：雷山/台江/剑河/黄平） | 黔东南地域风格 | 印风流派（浙派/皖派/海派/齐派——**需调研核实字段**，宁缺毋滥） | 需新调研（可先空置跑机制） | M8 |
| projects.json（4 条） | 苗银非遗项目 | 篆刻非遗项目（「篆刻」2009 入选人类非遗代表作名录——对外使用前官方源复核，PRD 20.3） | 08 报告 | M8 |
| people.json（3 条） | 传承人 | 印人/匠人背书（**待 O3 落实**，先空置） | 供应链并行线 | M7/M8 |
| cultural_rules.json（6 条） | 文化护栏规则 | 印章文化规则（不臆造印式典故/不虚构寓意——规则文案微调） | 现有规则直译 | M8 |

数据集骨架（manifest 的 source-first 方法论、schema.md、每实体 source_ids+evidence_level）**原样保留**，新数据集建议命名 `SealCulture-v1`。

### 1.4 lib/ 域内容（词表与 prompt）

| 位置 | 内容 | 处置 |
|---|---|---|
| `lib/ai/providers/demo.ts` 5 张 map | PRODUCT_MAP（9 首饰品类）/ STYLE_MAP（12 风格）/ OCCASION_MAP（10 场合）/ EMOTION_MAP（12 情绪）/ MARKET_MAP（市场国别） | **替换**：品类→章型+石料维度词表；场合/情绪表大部分可映射到五维度（纪念/婚庆/毕业/赠礼…） |
| `lib/heritage/glossary.ts`（402 行） | VISUAL_SUBJECT_AFFINITY（8 纹样亲和）、CRAFT_AESTHETICS、PRODUCT_CATEGORY_FIT、KNOWN_REGIONS（雷山/台江/剑河/黄平）、REGION_PROFILE、ITEM_KEYWORDS 等全套语义桥 | **替换**（M8 随数据集换域全重写；机制=透明可查表，保留模式） |
| `lib/design/render-prompt.ts` 词汇表 | MOTIF_EN（8 纹样中→英）、CRAFT_VISUAL（8 工艺→视觉语言）、PRODUCT_NOUN（9 品类→英文）、REGION_ANCHOR（miao/dong）、FINISH_TEXT（high-polish/satin-matte/textured-relief 银表面） | **替换**：PRODUCT_NOUN→章型英文（square seal/beast-finial seal/freeform seal…）；CRAFT_VISUAL→薄意(bas-relief)/边款(side inscription)/做旧(antiqued patina)…；FINISH→石材质感语言（waxy luster/pearl luster/vitreous…）；**新增强制「素坯无文字」条款**（质感层/文字层分离） |
| `lib/ai/image-generator.ts` | PRODUCT_REFERENCE_CATEGORIES（品类→图目录）、referenceIntro 英文文案（Miao silver pieces）、mock SVG 的 CATEGORY_GEOMETRY（首饰几何）+ FINISH_STOPS（银灰渐变）+ 水印文案 | **替换**：目录映射→「章型+石种」；几何→方章/随形/钮制轮廓；FINISH_STOPS→石色系渐变（田黄橙黄/芙蓉青白/鸡血红…）；水印文案改「AI 效果示意」中文版（对齐 PRD 9.1） |
| `lib/ai/prompts/global-demand.ts` | 苗银定制域系统提示词 | **待决策**（随 global-demand 线去留；若保留则重写为五维度域） |
| `lib/design-interview/engine.ts` | INTENT_SYNTHESIS_SYSTEM_PROMPT（禁词表：龙/蝴蝶/苗/贵州/台江/剑河/雷山/银角/银冠/牛角） | **替换**：禁词表反转为「篆刻域禁虚构项」（禁编造：石料参数/篆字形态/印式典故）——对齐 PRD 反例库 #8/#10 |
| `lib/design-interview/intent-types.ts` | containsCulturalClaims 正则 | **替换**（新域断言词） |
| `lib/design/translate.ts` / `proposal.ts` / `prompt.ts` 散点 | 各 1-3 处域词（银材质假设） | **替换**（材质假设 silver→stone） |
| `lib/constants/storage.ts` | key 前缀 `silver-future:`（6 处） | **保留**（技术 key 非用户可见；如改需同步所有读写点，收益低） |

### 1.5 app/ + components/ 硬编码（grep 命中 26 文件）

| 文件 | 命中 | 内容 | 处置 |
|---|---|---|---|
| `app/page.tsx` | 7 | 首页叙事文案 + atelier 图引用 | **替换**（随 home 段重写） |
| `components/home/HeroIntroScene.tsx` | 7 | Hero 场景文案与图 | **替换** |
| `components/home/HeroTypography.tsx` / `HeroArtifact.tsx` | 2/1 | hero 字标/器物说明 | **替换** |
| `components/shared/BrandMark.tsx` | 5 | 品牌标识（站名/字标） | **替换**（新品牌名，O1 定名后） |
| `components/cultural-match/archive-images.ts` | 1 | 素材库图路径 `/collection/assets/images` | **替换**（指向新参考图库路径） |
| `components/design-render/RenderStudio.tsx` | 1 | 渲染页域词 | **替换** |
| `app/design-interview/page.tsx` | 2 | metadata description | **替换** |
| `components/journey/journey-stages.ts` / `visual/ParticleField.tsx` | 1/1 | 注释级 | 保留（注释顺手改） |
| `app/layout.tsx` | — | meta 走 i18n `meta.title`（「银中贵 — 全球设计工作室」） | 随 meta 段替换 |

### 1.6 3D 资产

- **库内零 3D 模型文件**（全格式 find 为空）。
- 唯一「3D」是 `lib/story-url.ts` 外链 `https://3d.randomplayx.com`（`NEXT_PUBLIC_3D_STORY_URL`），引用点 `app/page.tsx` + `SiteTopBar.tsx` → **删除**。
- 印石 3D 需求口径（PRD 12.2/N2）：M5 伪 3D = **预渲染序列帧 + 模型替换 + shader**，非真 3D 引擎、非可操控交互。所需素材=「未雕素石→印面字→边款→纹样渐显」的分层渲染序列（≤15MB 预算）——**素材源已到位**：`~/seal-ai-hackathon/3d篆章/` 三个真模型可作离线渲染源（结构与五维度显现层高度对应，详见**第 6 节专项**）。

### 1.7 品牌 meta

| 位置 | 现值 | 处置 |
|---|---|---|
| `messages/zh-CN.json` meta 段 | 「银中贵 — 全球设计工作室」/「AI 驱动的贵州银饰全球共创设计平台…」 | 替换（**O1 产品名待定**，暂用「印可道」占位） |
| `package.json` name/description | silver-future / Guizhou silver jewelry | 替换（如 yinkedao-seal，技术性） |
| `README.md` | 全文苗银域 | 替换（低优先，随 M3 后重写） |
| `BrandMark.tsx` / `SiteTopBar.tsx` / footer ©2026 银中贵 | 品牌字样 | 替换 |

---

## 2. 替换材料盘点（对照源）

### 2.1 篆刻资料库（`/Users/arco/seal-ai-hackathon/篆刻资料库/`）

| 子库 | 数量 | 内容概览 | 主要用途 |
|---|---|---|---|
| 章体/ | 13 张 jpg | 素顶方章×4、兽/龙/狮/纹饰钮×5、随形×1、长方×2、对章×2；石色覆盖朱红/金黄冻/青白冻/柿红/浅粉/棕褐/橙黄冻；含薄意山水/云纹/花卉、深雕、满刻边款等多角度棚拍 | **参考图库 forms/ 首批种子**；首页 hero 备选 |
| 名家印作/ | 4 张 | 齐白石「白石」白文 1、组图十二方 1、印面三视图 1、侧款 1（**2 张带「篆刻小站」水印**） | 文化展示/印面参考；水印 2 张限内部（见第 7 节） |
| 工具/ | 5 张 jpg | 刻刀/印床（夹素石）/蓝瓷印泥盒/黑瓷空盒/印纸+青花印泥盒 | 装饰维度素材、文化匹配展示、教育内容 |
| 篆刻AI_印面高清素材_2026-09-05/ | 25 文件 | 结构：01_实物印面（阴刻白文：方形/圆形）+ 02_印蜕（阳刻朱文）+ 03_朱白相间 + 配对对照 + 素材索引.json + 分类规范 HTML + 图录 PDF | **D 桶评测基准 + 印面质感参考**（如 DPM228502_处世若大梦胡为劳其生_10字_实物印面.png）；最终印面产出必须崇羲管线生成 |

### 2.2 yinding/（`/Users/arco/seal-ai-hackathon/yinding/`，32 张）

博物馆藏印棚拍：兽/狮/龙/马/双螭/太狮少狮/瓦钮/法轮钮/缠枝冠钮等钮制全覆盖；**多角度组**（11 瓦钮 3 视、12 双兽拱团牌 5 视、13 象牙印 5 视——对 M6 成品图「多角度组图规格」的直接范本）；永乐敕赐印九叠篆印面 2 张。石色：田黄样×5、橙黄冻×5、寿山红白×2、青白冻、芙蓉、象牙。

### 2.3 调研报告（文本源）

| 报告 | 迁移用途 |
|---|---|
| 02-石料与雕刻性质 | 石料库字段内容源（ Mohs/绺裂/砂钉/种水） |
| 05-篆刻章法与布局规则 | 章法规则引擎内容源（字序/枚举/界格）+ crafts/rules 数据 |
| 06-印石瑕疵分类与鉴别 | 石料库瑕疵字段 + 选石提示话术 |
| 07-字形生成AI开源 | 崇羲字体管线依据（CC BY-ND 3.0 条款） |
| 08-同类获奖案例 | projects.json 非遗条目核验 |

---

## 3. 逐项迁移决策表

> 决策原则：苗银特有且篆刻无对应→删；通用机制/基建→保留；有素材→替换；无素材但必需→新制作（附规格）。
> 图例：【替】替换【制】新制作【删】删除【留】保留【决】待决策

### 3.1 图片资产

| # | 原资产 | 决策 | 替换源 / 规格 | 里程碑 | 风险注记 |
|---|---|---|---|---|---|
| 1 | `public/atelier/hero-silver.jpg` | 【替】 | `章体/画3_深雕山水人物方柱章_一对_青白玉质绿顶.jpg` 或 yinding-10（朱红雕龙钮对章，视觉冲击强）；或【制】篆刻工作台场景图（横构图 ≥1600px，深色调配黑底棚拍风） | M5 | 现图为银饰棚拍，章体图为单件竖构图，构图适配需裁切 |
| 2 | `public/atelier/culture-silver.jpg`（传承章节） | 【替】 | `yinding-05_法轮钮象牙方章_正面_永乐二十二年款.jpg`（历史感）或 `工具/` 组图（工艺传承叙事） | M5 | 馆藏图授权（第 7 节） |
| 3 | `public/atelier/detail-silver.jpg`（材质特写） | 【替】 | `章体/句2_素顶方章_金黄冻石_满刻边款.jpg`（石质+刻款特写） | M5 | — |
| 4 | `public/collection/assets/images/`（参考图库本体，144 张） | 【替】 | 新建 `public/seal-references/`（设计见第 4 节）：首批种子 = 章体 13 + yinding 32（钮制/章型多角度）+ 印面素材 PNG（01/02 段实物印面与印蜕） | M1/M4 | **石种材质素坯照缺口**（现有全是成品章）——M1 采购每石种 ≥5 张（PRD M1 验收） |
| 5 | collection 商品图（同上目录，独立站用途） | 【删】 | 无对应（L1 电商后置）——参考图迁出后整目录随 collection 删 | 后置 | 删前必须先完成 #4 迁移 |
| 6 | certificates/ 17 张（鉴定证书） | 【删】 | 无对应；未来石料证书属 L1 电商，后置 | 后置 | — |
| 7 | 伪 3D 序列帧 | 【制】 | **素材源已到位**：`3d篆章/` 三模型作 Blender 离线渲染源（路线 A，见第 6 节）。规格：未雕素石 360° 序列（24-36 帧）+ 印面字/边款/纹样分层显现序列，单序列 ≤15MB（PRD 12.2 预算），WebP 输出 | M5 | 帧数/体积需移动端实测（PRD 待实测项）；渲染需 Blender 人力/脚本 |
| 8 | 印面渲染产出 | 【制】 | 崇羲管线生成（fonttools 取形+排布+朱白处理），**不可用现成印面素材图顶替**（F3 确定性要求）；素材库 25 张仅作 D 桶基准 | M4 | 管线无现成轮子（R4），先预跑 |
| 9 | 五维度引导示意图（朱白对比/章法排布示意等） | 【制】 | 场景二明确需要「两张对比示意图」；规格：简洁示意 SVG/图（朱文红字白底 vs 白文红底白字、2×2 字序图等），前端可内联绘制 | M3 | 可先用 CSS/SVG 实现，零图片依赖 |
| 10 | favicon / logo | 【制】 | 现库无 favicon（默认态）；新品牌名定（O1）后配 SVG icon 一枚即可 | M5 | 低优 |

### 3.2 文案资产（messages/zh-CN.json + 硬编码）

| # | 原资产 | 决策 | 替换源 / 规格 | 里程碑 | 风险注记 |
|---|---|---|---|---|---|
| 11 | meta 段（站名/描述） | 【替】 | 「印可道（占位）— AI 篆刻定制设计工作室」类；description 按 PRD 产品一句话改写 | A 批 | O1 定名前用占位 |
| 12 | home 段 31 行（首页全套叙事） | 【替】 | 按 PRD 场景叙事重写（纪念/人生节点/赠礼三章结构可对应现 act2-act5 结构）；首图引用同步 #1-3 | A 批 | 纯文案，零机制 |
| 13 | journey 段（六站名） | 【替】 | 五维度站名（石料/用途/外形/装饰/印面 + 提案/渲染），结构键保留 | B 批 | 随 Stage 语义重构（FORK-NOTES 3.2-1） |
| 14 | interview 段 302 行（九题题库） | 【替】 | 五维度题库：engine.ts QUESTIONS 重设计后同步全部选项文案（题/选项/跳过/进度/规则合成句 30+ 模板） | M3 | **最大文案段**；WHEN-THEN 话术（7.2 协议 10 条）一并落此 |
| 15 | values 段 217 行（token 值表） | 【替】 | 品类→章型/石料/钮制/朱白/界格值域中文标签（枚举随 schema 定） | M2/M3 | 与 lib 词表必须同步改（i18n 键是引擎与 UI 的契约） |
| 16 | proposal/designProposal/designDirections/designRender 域词（约 40 处散点） | 【替】 | 银→石/章域词替换；材质段（proposal.material silver 三态 finish）重写为石种质感 | B 批 | finish 枚举改动会波及 schema+mock SVG（联动 3.3-#17） |
| 17 | culturalMatch/designTranslation 机制文案 | 【留】 | 仅 4+1 处域词换字（「非遗数据库」→「印章文化元素库」等） | M8 | 机制句零改动 |
| 18 | common/errors 段 | 【留】 | 仅 common 3 处「银饰」字样微调 | — | — |
| 19 | app/page.tsx + Hero* + BrandMark 硬编码 | 【替】 | 随 #11/#12；BrandMark 待 O1 定名 | A 批 | — |
| 20 | README.md | 【替】 | 篆刻域重写（低优先，M3 后） | 后置 | — |

### 3.3 lib 词表与数据

| # | 原资产 | 决策 | 替换源 / 规格 | 里程碑 | 风险注记 |
|---|---|---|---|---|---|
| 21 | demo.ts 5 张 map（约 120 词项） | 【替】 | 五维度域词表：章型/石料/场合（纪念/婚庆/毕业/乔居/赠礼，PRD 5.1）/情绪；MARKET_MAP 删或改用途分布 | M3 | 演示模式体验直接依赖此表 |
| 22 | glossary.ts 语义桥全套 | 【替】 | 印章域 token 亲和表（M8 随数据集）；区域表→流派表（**待调研核实**，可先空置跑机制） | M8 | 透明表机制不变，内容全换 |
| 23 | render-prompt.ts 词汇表（MOTIF_EN/CRAFT_VISUAL/PRODUCT_NOUN/REGION_ANCHOR/FINISH_TEXT） | 【替】 | 章型/技法/石色英文视觉语言表（薄意→bas-relief landscape carving 等）；**新增素坯无字强制条款** | M2/M4 | 视觉语言质量决定生图质感（D 桶） |
| 24 | image-generator.ts（参考图映射+referenceIntro+mock SVG 几何/石色） | 【替】 | 目录映射→seal-references；几何→章型轮廓（方柱/长方/随形/圆钮）；FINISH_STOPS→石色渐变组；水印中文化 | M4 | mock SVG 是演示模式生图兜底，体验必需 |
| 25 | engine.ts 禁词表 + intent-types.ts 正则 | 【替】 | 反转为篆刻域禁虚构项（禁编造石料参数/篆形/印式典故——PRD 反例 #8/#10） | M3 | 与 WHEN-THEN 5 号条款对齐 |
| 26 | data/SilverHeritage-GZ-v1 8 json 内容 | 【替】 | SealCulture-v1 新数据集（字段映射见 1.3 表；源=05/06/07 报告+RENAME-LOG 著录） | M8 | 篆刻文化数据需文化评审人抽检（PRD M8 验收）；宁缺毋滥，可先空集跑通机制 |
| 27 | prompts/global-demand.ts + globalDemand 段 + global-demand 组件线 | 【决】 | 决策点：五维度访谈吸收其自由文本输入则整线删；保留 NaturalLanguageInput 则提示词重写 | M3 | 决策建议已在 FORK-NOTES 3.2-1 |
| 28 | storage.ts key 前缀 silver-future: | 【留】 | 技术性 key，改动需同步全部读写点，收益低 | — | — |

### 3.4 结构性删除

| # | 资产 | 决策 | 条件 | 里程碑 |
|---|---|---|---|---|
| 29 | `public/collection/` 独立站（7 HTML + data.js + manifest.json + css + inquiry.js） | 【删】 | **#4 参考图迁移完成后**；连带 next.config.ts 三项 collection 适配 + `lib/collection-url.ts` + SiteTopBar/首页入口 | 后置 |
| 30 | `lib/story-url.ts` + 3D 外链入口（app/page.tsx / SiteTopBar） | 【替】✅ A 批已执行 | **改策（用户拍板）：外链独立 3D 站架构**——机制保留，env 改名 `NEXT_PUBLIC_3D_SEAL_URL`（空值时 Act3/页脚入口整体隐藏），导出改 `SEAL_3D_URL`，文案「3D 篆章展厅」；glb 三模型为独立站资产不进本库 | 已完成 | 随机 3D 站上线后填 env 即出现入口 |
| 31 | `messages/{en,ja,fr}.json` + LanguageSwitcher | 【删→留壳】 | N5 中文优先；删三份翻译，i18n 基建与 zh-CN 保留 | B 批后 |
| 32 | `data/苗族银饰非遗数据库（已分类）/` 144 张 | 【删】 | 代码零引用（已 grep 确认），素材备份性质——与团队确认后删 | 无依赖 |
| 33 | 名家印作 2 张水印图（篆刻小站） | 【删】（不入新库） | 商用授权风险；齐白石「白石」1 张无水印可留作展示 | — |
| 34 | certificates 品类整体概念 | 【删】 | 石料证书随 L1 电商后置 | — |

---

## 4. 参考图库设计建议（`public/seal-references/`）

设计原则：替换现「品类目录」制，改**双轴制**——生图选取按「章型 × 石色」双键命中（对齐 PRD F4「石料照片库按章型选参考图」）。

```
public/seal-references/
├── forms/                      # 章型 × 钮制（形态语言，种子=章体13 + yinding32）
│   ├── square-plain/           # 素顶方章      ← 章体/素顶方章×2、句2、句5
│   ├── square-beast/           # 兽/狮/龙/马钮方章 ← 句1、句3、句6、yinding-02/03/07/09/10
│   ├── rectangle-chang/        # 长方章（日字格形态参照）← 句3
│   ├── freeform/               # 随形章        ← 句4
│   ├── ornamented-top/         # 纹饰顶/瓦钮/团牌钮 ← 句7、yinding-11/12
│   └── oval-round/             # 椭圆/圆章     ← yinding-01/08
├── craftsmanship/              # 工艺特写（每类生图必附，继承银中贵 craftsmanship 模式）
│   ├── bask-relief/            # 薄意山水/云纹/花卉 ← 章体/画1、画2、画4、素顶方章_薄意花卉
│   ├── deep-carving/           # 深雕          ← 画3
│   └── side-inscription/       # 边款刻面      ← 句2、句6、句7、yinding-05 组、09
├── materials/                  # 石种质感素坯（⭐ 缺口，M1 采购拍摄）
│   └── <石种>/ 每种 ≥5 张      # 老挝石/青田/寿山芙蓉/昌化鸡血/巴林…
│                               # 规格：自然光多角度+强光透射各≥1（对齐 06 报告验裂口径与 PRD 2.2 反仙图诉求），禁过度滤镜
└── seal-faces/                 # 印面（参考+D桶基准，不作生图参考主体）
    ├── zhuwen/                 # ← 印面素材 02_朱文_阳文
    ├── baiwen/                 # ← 印面素材 01_白文_阴文（方/圆）
    └── zhubai-mixed/           # ← 03_朱白相间
```

- 选取映射改造（`image-generator.ts`）：`章型 → forms/<dir> + craftsmanship/<匹配工艺>` + `石种 → materials/<石种>`（seed 轮转 3 张机制原样）。
- `next.config.ts` 的 `outputFileTracingIncludes` 路径同步改为 `./public/seal-references/**/*`。
- **首批可用量**：forms 45 张（章体 13 + yinding 32，去重钮制覆盖 10+ 类）+ craftsmanship 约 12 张 + seal-faces 约 10 张 PNG；materials 0 张（M1 采购）——M4 最小管线（一种石料一个章型）可先用 forms+craftsmanship 跑通，materials 补齐后达 M1 验收。

## 5. 执行批次建议（每批可独立验收）

| 批 | 内容 | 前置 | 验收 |
|---|---|---|---|
| **A 品牌与首页** ✅ **已执行（2026-09-05）** | #11 #12 #19 #30（meta/home/common+journey 域词/Hero 三件/BrandMark/story-url 改策替换）+ 三图替换（hero=句6 狮钮金黄田黄 3119×3200；culture=yinding-05 永乐法轮钮；detail=句2 金黄冻满刻边款） | O1 占位名（已用「印可道」） | 首页 200、中文域词零命中、72/72 测试通过、typecheck 通过、lint 无新增（33 项均为 fork 原有） |
| **B 文案域重写** | #13-#16 #31（journey/interview/values/proposal 各段+删三语种） | Stage 语义方案定稿（FORK-NOTES 3.2-1 决策） | 全站文案走查零苗银词；`test-design-render.mjs` i18n 校验通过（改后重跑） |
| **C lib 词表** | #21 #23 #24 #25 | B 批 values 枚举定稿 | DEMO 模式全流程可跑；mock SVG 出章型轮廓+石色 |
| **D 参考图库** | #4（建 seal-references + 迁 55 张 + 改映射与 tracing） | 素材复核定稿（水印图剔除） | 生图选取命中新库；无 Key mock 正常 |
| **E 数据集换域** | #22 #26 | 05/06/07 内容结构化 + 文化评审 | heritage 三件套跑通空集/新集；M8 验收三条件 |
| **F 删除线** | #29 #32 #33（collection/苗银库/水印图） | **D 批完成**（参考图已迁出） | 全链路测试 72 项重跑通过 |

持续缺口（不阻塞批次）：materials 石料照（M1 采购）、序列帧渲染产出（M5，**素材源 3d篆章 三模型已到位**，见第 6 节）、崇羲印面产出（M4）。

## 6. 3D 资产专项（增补 2026-09-05）

### 6.1 资产实况（已命令行实测，GLB JSON chunk 解包）

来源：`/Users/arco/seal-ai-hackathon/3d篆章/`，共 3 个，~332MB：

| 模型 | 大小 | 网格（实测） | 贴图（实测） | 压缩 | 结构对应 |
|---|---|---|---|---|---|
| `篆章1.glb` | 112.3MB | 单 mesh 单 prim，顶点 ~154 万，三角 **~302 万** | 3 张 jpeg 共 ~7MB | 无（未压缩） | 素章基型 |
| `篆章2顶祥瑞中题字.glb` | 111.1MB | 顶点 ~156 万，三角 ~305 万 | 3 张 jpeg 共 ~4.6MB | 无 | **顶部祥瑞钮 + 中部题字**——正好对应印章「钮制-章体-边款」三段结构（PRD 外形/装饰两维度） |
| `篆章3阁楼小舟.glb` | 109.7MB | 顶点 ~155 万，三角 ~302 万 | 3 张 jpeg 共 ~4.2MB | 无 | 阁楼小舟——**薄意山水类**（装饰维度薄意/山水意象，对应章体素材画1-3 的 3D 版） |

实测要点：① 体积**全在几何**（贴图仅 4-7MB，几何 float32 占 ~100MB）；② 三个模型均为照片级/雕塑级高密度网格，无动画、单材质；③ **302 万三角远超移动端实时渲染安全线（一般 <50 万三角/帧）**。

### 6.2 路线评估（只评估给建议，**不替用户定**）

**路线 A：Blender 预渲染序列帧的素材源（建议采纳）**

- 做法：模型进 Blender 离线渲染——360° 旋转序列（24-36 帧）+ 按五维度分层渲染显现通道（素坯/印面字/边款/纹样），WebP 压缩进 `public/`，前端按 PRD 12.2 播放。
- 优点：**完全符合 PRD 现规格**（决策③伪 3D + 序列帧 ≤15MB + 移动端零 WebGL 负担）；302 万三角的细节在离线渲染中是资产（光追级质感），在浏览器里是负债；篆章2 的三段结构可天然拆出「维度渐显」分层渲染；微信内置浏览器兼容性最好（只解码图片）。
- 成本：Blender 渲染管线搭建（脚本化相机环拍 + 分层渲染 + WebP 压缩，约 2-4 天）；每序列需控制 ≤15MB（1024px WebP q75 下 24 帧 ≈ 3-6MB，余量充足）。
- 风险：无交互自由视角（固定轨迹旋转，用户下滑/拖动触发预设旋转——与 PRD 12.2「下滑/拖动触发 360° 旋转一周」的交互定义吻合）。

**路线 B：Three.js 直载 + Draco/meshopt 压缩（需用户拍板改规格，不建议 MVP 采纳）**

- 做法：gltf-transform 减面（302 万→20-30 万三角）+ Draco/meshopt 压缩（实测未压缩态：几何 ~100MB，压缩后预估 5-15MB/个），Three.js 加载 + 程序化旋转/渐显 shader。
- 优点：真可交互（任意角度拖动、光照实时变化）；「渐显」可用 shader 实现比序列帧更细腻的维度叠加。
- 成本与风险：**超 PRD 现方案**（N2 明确「不做可操控真 3D」、12.2 定格序列帧——采纳 B 需改 PRD 并重新评估工期）；三重前置加工（减面必然损失雕刻细节、压缩管线、加载进度设计）；15MB 预算被单个模型吃满，三模型全上则 ~15-45MB 下载量；低端机/微信浏览器 WebGL 兼容与发热需专项测试。
- 若未来转 B：模型先减面到 30-50 万三角保细节下限，且 demo 场景按需懒加载单模型。

**建议（已被用户拍板取代）**：原建议 MVP 走 A；**用户实际拍板（2026-09-05）：外链独立 3D 站架构**——银中贵怎么做我们怎么做。即：三个 glb 作为独立 3D 站资产（不进本库，6.3 方案一不变），本站仅通过 `NEXT_PUBLIC_3D_SEAL_URL` 外链入口导流（✅ A 批已实施：env 改名 + 空值隐藏 + 文案「3D 篆章展厅」）；**站内 F2 伪 3D 渐显动效仍按 PRD 12.2 序列帧方案实现**（序列帧素材源可从三模型离线渲染，路线 A 的渲染管线部分依然有效，服务站内动效而非 3D 展厅）。

### 6.3 与 3D 外链清理项的衔接

- `lib/story-url.ts` 外链（randomplayx 3D 展厅）**照删不误**——它指向的是苗银 3D 叙事站，与本资产无关。
- 三个 glb **不建议进 fork 库常规目录**（~332MB 会毁 git 与 Vercel 部署）：建议二选一——
  - 方案一（推荐）：放库外资产源目录（如 `~/seal-ai-hackathon/3d篆章/` 原位），fork 库 `.gitignore` 加 `assets-src/` 并以软链或拷贝方式供渲染脚本本地引用；**只有渲染产物（序列帧 WebP）进 `public/seal-3d/`**。
  - 方案二：若团队要版本化模型，用 git-lfs 单独资产仓，主仓不存。
- 新增公共目录规划：`public/seal-3d/{square-plain,beast-finial,bask-relief}/`——与第 4 节参考图库同级的渲染产物区，M5 落地。

### 6.4 计数与结论更新

- 四类决策计数（2026-09-05 拍板后）：替换 15（#30 由删改替）/ 新制作 7 / 删除 5 / 保留 7；3D 三模型为**独立 3D 站资产**（不进本库，单独计数 3 项）。
- 批次表更新：A 批已执行（含 #30 改策替换）；序列帧属 M5，不在 A-F 批内，其素材源（三模型离线渲染）服务站内 F2 渐显动效。

## 7. 版权与诚实性注记

1. **「篆刻小站」水印图 2 张**（名家印作三视图/侧款）：不入公开站；齐白石图无水印，展示标注「图源公开资料」。
2. **yinding 32 张博物馆馆藏棚拍**：demo/内部使用风险低；公开部署前核授权，或替换为自摄/授权图（M1 采购时可顺带自制多角度棚拍）。
3. **RENAME-LOG 识读原则**（宁缺毋滥、未识标「待识」）与本项目诚实边界（PRD 20.3/16.3）同构——9 项【待复核】素材入库时保留标注，不编造款识印文。
4. **崇曦字体 CC BY-ND 3.0**：禁改字型、需署名、只渲染不分发（07 报告）——产出物署名规则在 M4 管线内实现。
5. 「篆刻 2009 入选人类非遗代表作名录」对外文案使用前官方源复核一次（PRD 20.3，影响 projects.json 条目）。
