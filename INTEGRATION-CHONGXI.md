# 崇曦篆体全量主线接入调研（正式版替换峄山碑 demo 栈）

> 定位：印蜕文字层（lib/seal-face + SealFaceProof）的字体源从峄山碑 demo 栈切换至崇曦篆体正式栈的接入方案。
> 用户拍板：崇曦仍为正式版全量主线（与此前「峄山碑 demo 阶段入栈」拍板并存——demo 栈是过渡，崇曦是终态）。
> 本文件为只读调研产物，未改任何源代码。日期：2026-09-06。

---

## 0. 一页结论

- **推荐路线 A（服务端原始文件渲染）**：opentype.js 直读崇曦原始 OTF（不转换、不分片、不分发字体文件），取 glyph path + bbox 在服务端拼印蜕 SVG——合规最干净（ND 条款零接触边缘），且带来正式版刚需的三个额外收益：确定性渲染可进 D 桶 CI（PRD 16-C blocking 门禁）、水印队列统一、与质感层管线同构。
- **最大风险**：字体获取可达性——官网下载对大陆 IP 返回 Access Restricted（本调研环境实测：直连/wayback 均不可达），需用户侧经台湾 IP/VPN 或镜像网盘获取后**入库为私有资产**（git-lfs），否则 Vercel 构建期与后续迭代均无稳定源。
- **工作量**：**4–6 人日**（服务端取形 1–1.5、简繁映射 1、双栈切换与渲染 API 1–1.5、覆盖测试与联调 1）+ 半天预跑（opentype.js × 崇曦 OTF 兼容性）。

---

## 1. 字体获取与文件实况（官网直查）

### 1.1 下载页实况（webReader 代理读取，2026-09-06）

来源：https://xiaoxue.iis.sinica.edu.tw/chongxi/download.htm

| 下载项 | 链接 | 字数口径 |
|---|---|---|
| 崇羲篆體字形表（《說文解字》） | `…/chongxi/files/chongxi_SmallSeal.pdf` | 10,393 字（**字形对照 PDF，非字体文件**） |
| 崇羲篆體字形表（《常用字表》） | `…/chongxi/files/chongxi_CommonWords.pdf` | 4,808 字（同上，PDF） |
| **崇羲篆體（字体本体）** | **`…/chongxi/files/chongxi_seal.zip`** | **11,596 字合集**（单 zip，内为 OTF） |

- 版本：v1.00，2022-06-23/26 发布；制作工具 FontCreator 11.5（字嗨著录）。
- 格式：**OTF**（CFF 轮廓；zfont/字体站一致口径）。PostScript 名 `Chong Xi Small Seal`，字体全名「崇羲篆體」。
- 作者群：王心怡（书篆）、季旭昇（文字学）、莊德明（信息处理），缘起謝清俊教授提议，中研院史语所/资讯所出品（小学堂平台分发）。
- 形体口径：以《说文解字》大徐本为据、择善而从；字形体系是**《说文》字头（繁体）**——这是简繁映射层的根因。
- **非国标字形警示**（zfont 指数 −15）：不符合大陆《通用规范汉字表》用字标准——对「篆字还原度」反而是正资产（《说文》正统），但简体直查命中率低（见 §4 覆盖对比）。

### 1.2 本环境下载实测

- 官网直连（curl）：返回 36KB HTML 拦截页（ASCDC Access Restricted——台湾区域访问策略）。
- web.archive.org：SSL 连接失败（网络出口策略）。
- 镜像站（zfont/100font/pptland）：存在但需登录/公众号/网盘客户端交互，无直链。
- **结论：字体文件本次未落盘**。`~/seal-ai-hackathon/fonts/` 已建空目录待用户侧获取（获取路径见 §7 风险 R1）。

### 1.3 许可条款（授权页 + zfont 著录）

- 授权页：https://xiaoxue.iis.sinica.edu.tw/chongxi/copyright.htm
- 条款：**創用CC 姓名標示-禁止改作 3.0 臺灣及其後版本（CC BY-ND 3.0 TW or later）**；授权范围允许复制、散布、传输及商业用途之合理使用。
- CC BY-ND 3.0 标准署名三要素（产出物标注格式建议）：
  1. 作者姓名（崇羲篆體：王心怡・季旭昇・莊德明／中央研究院）；
  2. 来源（https://xiaoxue.iis.sinica.edu.tw/chongxi/ ）；
  3. 许可（CC BY-ND 3.0 TW，链接 https://creativecommons.org/licenses/by-nd/3.0/tw/ ）。
  ——现有 SealFaceProof 的字体来源标注（sealFaceFontCredit）已为峄山碑实现同款机制，切换时换文案即可。

---

## 2. 合规红线分析：ND 条款 × 格式转换/子集化

**问题**：TTF/OTF→woff2 转换与 unicode-range 子集化（cn-font-split 现栈做法）是否构成 ND 禁止的「改作（Derivative Works）」？

**CC 官方口径**（CC 3.0 许可正文与 FAQ）：
- **格式转换明确豁免**：仅改变格式或编码以在不同设备呈现，不构成演绎作品（format-shifting 允许）——woff2 转换本身有豁免空间；
- **但子集化（删减字符集）不在明确豁免内**：对字库内容做裁剪更接近「修改作品」——CC FAQ 对 ND 的口径是「除格式转换外不得以任何方式改动」（台湾 3.0 版正文同旨）。**灰色地带**：cn-font-split 式分片是「按 unicode-range 切片分发」而非删减（字符总量不减、可重组），主张不构成改作有讨论空间，但非无争议；
- **分发义务**：无论转换与否，客户端 @font-face 分发即触发署名义务（技术上可做，实践中易漏标——尤其分片被 CDN 缓存剥离上下文的场景）。

### 路线 A（保守 · 推荐）：服务端原始文件渲染

- 做法：原始 OTF 进服务端私有资产（不进 public/、不转 woff2、不分片）；`opentype.js`（Node）读 cmap/glyph → 输出 SVG path 给客户端；客户端只收 path 数据，**永不见字体文件**。
- 合规：零接触 ND 边缘（无转换无子集化无分发）——署名只落在产出物页面/水印，一次做对。
- 工程红利：①确定性渲染（同输入同输出）——PRD 16-C「篆字零错误 CI 门禁」的前提；②水印/署名队列统一（服务端拼 SVG 时直接嵌入）；③与质感层 /api/design-render 同构，合成层（sharp/SVG 叠加）天然衔接；④印面视图镜像/白文反相等后处理在服务端做，逻辑闭环。
- 代价：印蜕渲染从「客户端即时」变「API 往返」（本地 mock 层可保 demo 体验）；需 Node 端 opentype.js 依赖（~300KB）。

### 路线 B（宽松）：客户端 woff2 分片（cn-font-split 同峄山碑现栈）

- 做法：崇曦 OTF→woff2 子集分片→@font-face unicode-range，SealFaceProof 换字体栈即用。
- 合规：格式转换有豁免口径，但**子集化灰色 + 分发署名易漏**；对 CC BY-ND 的台湾版条款从严解读时存在被认定改作的风险。
- 体验红利：与现栈完全一致、零延迟、字体按需加载。
- 判断：**不推荐用于正式版**。若仅内部 demo 期过渡可用，公开部署前必须切 A。

### 推荐：路线 A（正式版全量主线）

合规、质量红线（C 桶 CI）、管线架构三重理由一致指向服务端方案；B 的体验优势在印蜕这种「低频、重正确性」的输出上不构成决定性差异。

---

## 3. 简繁映射层（峄山碑没有的新问题）

**根因**：崇曦字形挂在《说文》字头（繁体体系）；峄山碑是简码直映。用户输入「刘雨茜」需映射「劉雨茜」才能命中 cmap。

### 3.1 方案：OpenCC（s2t）+ 印文特例覆写层

- **基线转换**：[OpenCC](https://github.com/BYVoid/OpenCC)（`opencc-js` 纯 JS 可进 Node/serverless；词典成熟 s2twp/s2t）。印文场景用 **s2t（不做台湾地区词汇替换）**：`刘→劉`、`茜→茜`（茜本身无简繁差异）。
- **特例覆写表**（印文场景差异，独立 JSON，文化评审后启用）：
  - **异体字偏好**：篆刻传统可能偏好某异体（如「峰/峯」「群/羣」）——每条覆写必须给依据（《说文》正篆/名家印谱用例），**宁缺毋滥**（对齐 cultural-match 的 source-first 纪律）；
  - **姓名用字**：姓名用字应尊重户籍写法（用户写「于」不强制转「於」）——**映射默认开启但逐字可回退**（UI 在缺字/映射提示时展示映射前后对照，用户可锁定原字）；
  - **一对多**（s2t 的「发→發/髮」类）：按词义消歧不可靠——印文短文本（1-4 字）无上下文，**默认取首选并提示候选**，由用户定夺（符合「从不替用户做情感决定」人设）。
- **落点**：`lib/seal-face/variant-map.ts`（独立模块：`mapForChongxi(text): { mapped: string; changes: {from,to,alternatives?}[] }`）——PRD 14 已列「映射规则需文化评审」，模块化即评审单元。
- **工作量**：基线 0.5 天；特例表初版 0.5 天（先空表跑基线，评审后增量）。

### 3.2 缺字告知（沿用现有机制，语义升级）

峄山碑栈的 unicodeRange 检查在服务端不可用——崇曦服务端栈改查 **cmap**（opentype.js `font.charToGlyphIndex(ch)`）：
- cmap 命中 → 取形渲染；
- cmap 未命中 → 如实告知（沿用 sealFaceMissing 文案），并增加**映射候选提示**（「刘→劉 已自动映射；『X』《说文》未收，无标准篆形，绝不造字」）。
- 《说文》未收后起字（简体新字、俗字）正是缺字主力——11,596 口径下「常用字表」4,808 已兜大部分日常字。

---

## 4. 覆盖对比（峄山碑 vs 崇曦）

| 维度 | 峄山碑篆体（demo 栈） | 崇曦篆体（正式栈） |
|---|---|---|
| 总字数 | 3,754（GB2312 口径） | **11,596**（说文 10,393 + 常用字 4,808，去重合集） |
| 简体直查（通用规范汉字表） | 3,751/8,105 | 4,341/8,105（zfont 实测）——**直查仍有限** |
| 繁体（BIG5） | 2,550/13,060 | **8,591/13,060** |
| 简繁映射后命中 | —（简码直映无需映射） | **映射后有效覆盖 ≈ 8,591+ 说文字头域**——显著高于峄山碑 |
| 字形体系 | 峄山碑临摹+说文推衍（简转繁式直映） | **《说文》正统**（PRD 字体铁律的既定基准） |
| 质量口碑 | 社区报 kern 损坏/「汉」字形疑误 | 文字学团队三年制作、发布后无负面报告（持续观察） |

**抽样验证思路（实施时落地为 CI 用例）**：测试集三层——①PRD 例字「劉雨茜」（繁体直查）；②高频姓名 500 字（映射后查 cmap，PRD 16-C 首版口径）；③已知缺字 20 个（《说文》未收后起字，如「镕」「哒」类）验证如实告知而非造字。

---

## 5. 替换实施设计（双栈并存渐进切换）

### 5.1 字体源抽象（不硬切）

`lib/seal-face/layout.ts` 已是纯逻辑层（排布/错落/斑驳三件**字体无关**——紧凑算法基于墨迹 bbox，两字体同适用；验证点：崇曦字形 bbox 分布与峄山碑差异大时紧凑参数需微调，属调参不属改结构）。新增：

```
lib/seal-face/
├─ layout.ts          # 现有（字体无关，不动）
├─ variant-map.ts     # 新：简繁映射（§3）
├─ glyph-chongxi.ts   # 新：服务端取形（opentype.js × 崇曦 OTF：
│                     #   loadFont 缓存 / charToGlyphIndex 查字 /
│                     #   getGlyphPath+bbox / mapForChongxi 前置）
└─ font-stack.ts      # 新：FONT_STACK=chongxi|yishan（env 切换，
                      #   chongxi 资产缺失时自动回退 yishan 并标注）
```

- **切换开关**：`SEAL_FONT_STACK=chongxi`（.env；默认 yishan 直到崇曦资产与预跑通过）——回退链保证 demo 永不断。
- **SealFaceProof 注入点**：组件加 `fontStack` prop（默认走 env）；chongxi 栈时印蜕区由「客户端 DOM 渲染」切为「调 `/api/seal-face`（新，POST {text, style, seed} → SVG dataUrl）」——请求体与响应复用现有 SealRenderApiResponse 风格；缺字提示从响应带回（映射前后对照一并返回）。

### 5.2 渲染 API（崇曦栈的客户端形态）

- 新 `app/api/seal-face/route.ts`：text → 映射 → cmap 查字 → layout.ts 排布 → glyph path 拼印蜕 SVG（含斑驳/朱白/紧凑——三件逻辑从客户端组件下沉复用）→ 嵌水印与字体署名 → dataUrl 返回。
- 峄山碑栈（B 形态）保持现状不动——两栈同一组件两种数据源，视觉规格逐一对齐（同尺寸/同色值/同斑驳密度）后切默认。

### 5.3 与 M4 管线的时序

不变：质感层（/api/design-render，NO TEXT RULE）→ 文字层（seal-face）→ 合成。崇曦栈让文字层与质感层同为服务端产物，合成（sharp/SVG overlay 印面区域）成为纯服务端闭环——D 桶「叠字位置无漂移」判据由确定性好保障。

---

## 6. 工作量与风险

**工作量**：4–6 人日——glyph-chongxi 取形 1–1.5；variant-map 基线 0.5+特例 0.5；font-stack 双栈与 seal-face API 1–1.5；SealFaceProof 双源接入与视觉对齐 0.5；覆盖 CI 用例与联调 1。另有**半天预跑**（R2，先于一切）。

| # | 风险 | 等级 | 处置 |
|---|---|---|---|
| R1 | **字体获取可达性**：官网拦大陆 IP（实测）、wayback 不通、镜像需交互 | 高 | 用户侧获取（台湾 IP/VPN 直下 `chongxi_seal.zip`；或 100font 夸克盘镜像 https://www.100font.com/thread-434.htm ）→ 落 `~/seal-ai-hackathon/fonts/`（已建）→ **入 git-lfs 私有资产**（Vercel 构建稳定源）；联系作者 iis.cdpservice@gmail.com 备案商用为最稳 |
| R2 | opentype.js × 崇曦 OTF（FontCreator/CFF）兼容性未验证 | 中 | 半天预跑：loadFont→charToGlyphIndex('劉')→getPath→bbox 全链打印；fallback＝fonttools 离线预取全量 glyph JSON（构建期产物，运行时零解析） |
| R3 | 简繁映射准确性（一对多/姓名用字/异体偏好） | 中 | variant-map 独立模块+空特例表起步；映射前后对照透出给用户可锁定；文化评审人过表（PRD 14 既定） |
| R4 | 简体直查覆盖仅 4,341/8,105——不映射则缺字率高 | 中 | 映射层为 chongxi 栈**必选前置**（不是可选）；映射后覆盖问题大幅缓解 |
| R5 | ND 合规长期演进（台湾 3.0「及其後版本」措辞） | 低 | 路线 A 服务端零分发形态对条款演进最免疫；署名三要素固化在产出物模板 |
| R6 | 双栈并存期的视觉规格漂移 | 低 | 两栈同参数快照比对（同 text/seed 出图叠 compare）进 CI |

---

## 7. 实施步骤（依赖序）

```
⓪ 用户侧获取 chongxi_seal.zip → ~/seal-ai-hackathon/fonts/（git-lfs 入库）
① 半天预跑：opentype.js 全链验证（R2）——不过则转 fonttools 预取方案
② variant-map.ts 基线（OpenCC s2t）+ 空特例表 + 单测（劉雨茜/发→發髮候选）
③ glyph-chongxi.ts 取形 + font-stack.ts 双栈开关（回退链）
④ /api/seal-face + SealFaceProof 双源接入（chongxi 默认关，yishan 不动）
⑤ 覆盖 CI：高频 500 字 + 缺字 20 用例（16-C 门禁前身）
⑥ 视觉对齐与调参（紧凑 bbox 参数/斑驳密度）→ SEAL_FONT_STACK=chongxi 切默认
⑦ 署名文案切换（sealFaceFontCredit → 崇曦三要素）；峄山碑栈降级为应急回退
```
