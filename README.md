# 印可道 — AI 篆刻定制

AI 驱动的中文印章定制平台。从记忆访谈到文化匹配，再到参数单确认与 AI 效果图，
完整走通一条「用户记忆 × 篆刻文化」的定制印章设计链路：用户讲述一段想被刻下的
记忆，AI 从印章文化知识库中匹配文化元素并生成设计参数单，最终以真实印章参考图
驱动生图模型产出章体质感层效果图。

## 站点结构

| 路径 | 定位 |
|---|---|
| `/` | 品牌首页 — 四幕叙事 + 3D 篆章展厅入口 |
| `/design-interview` | 记忆访谈 — 引导式问答，挖掘定制需求 |
| `/design-brief` | 参数单 — 确认章型 / 石种 / 印文等设计参数 |
| `/design-render` | 效果图 — 印章质感层 AI 生图（参考图驱动） |
| `/3d-preview` | 3D 章体、参数化印文、虚拟钤印与 GLB 导出 |
| `/about` | 印可道介绍、崇羲字体署名与授权来源 |
| `/api/design-intent` | 访谈意图结构化 API |
| `/api/design-render` | 质感层生图 API（文字层由字体引擎后叠加） |
| `/api/seal-face` | 崇曦印蜕 SVG 与按需生成的正反 PNG 贴图 |
| `/api/3d-model` | 带持久化去重和余额检查的建模任务 |
| `/api/3d-model/retexture` | 无字章体的 4K 石料重贴图 |
| `/api/cultural-match` | SealCulture 文化匹配灰度 API |

印章文化数据来自 `data/SealCulture-v1`（source-first 知识库，8 类实体 +
文化匹配层），由 `lib/heritage/` 三件套（match / guardrail / evidence）消费，
文化断言分级只降不升，无来源不写事实。

## 技术栈

- **框架** Next.js 16 (App Router) · React 19 · TypeScript 5
- **样式** Tailwind CSS v4 — 宣纸朱砂视觉体系
- **动画** Motion
- **文本 AI** 智谱通用 API（glm-4.7）及 Anthropic 兼容服务，缺 Key 自动使用规则模板
- **生图** gpt-image-2（以 `public/seal-references/` 真实印章照片为参考图）
- **校验** Zod 端到端 schema

## 环境变量

复制 `.env.example` 为 `.env.local` 按需填写：

| 变量 | 说明 |
|---|---|
| `DEMO_MODE` | `true` 时无 AI Key 也能跑通全流程（UI 明确标注演示） |
| `TEXT_AI_PROVIDER` | `bigmodel` 或 `anthropic` |
| `BIGMODEL_API_KEY` / `BIGMODEL_BASE_URL` | 智谱通用 API Key 与端点；不能使用 Coding Plan Key 替代 |
| `ANTHROPIC_API_KEY` | 文本 AI Key（Anthropic 协议） |
| `ANTHROPIC_BASE_URL` | 兼容端点 base URL（如智谱） |
| `AI_MODEL` | 文本模型名 |
| `AI_MAX_TOKENS` / `AI_TIMEOUT_MS` | 文本 AI 调参 |
| `NEXT_PUBLIC_PARTICLE_EFFECT` | 全局粒子背景开关 |
| `IMAGE_PROVIDER` | `mock`（SVG 占位图）或 `openai-gpt-image`（推荐） |
| `OPENAI_API_KEY` | 生图 Key |
| `OPENAI_BASE_URL` | 生图中转站 base URL（国内网络必填） |
| `IMAGE_MODEL` | 生图模型名（中转站按其型号表填） |
| `IMAGE_TIMEOUT_MS` | 生图超时（须 ≤ 路由 maxDuration） |
| `NEXT_PUBLIC_3D_SEAL_URL` | 独立 3D 篆章展厅地址（空值时入口隐藏） |
| `MESHY_API_KEY` | Meshy 建模服务 Key，仅服务端使用 |
| `BLOB_READ_WRITE_TOKEN` | GLB 持久化所用 Blob 读写凭证 |
| `MESHY_GENERATION_ENABLED` | 仅 `true` 允许收费创建；默认关闭，缓存仍可读 |
| `SEAL_FONT_STACK` | 默认 `chongxi`；`yishan` 为应急开关 |
| `SEAL_CULTURE_ENABLED` | `true` 启用 M8；否则沿用静态文化引导 |

## 脚本

```bash
npm run dev        # 本地开发
npm run build      # 生产构建
npm run start      # 生产启动
npm run lint       # ESLint（0 警告阈值）
npm run typecheck  # tsc --noEmit
npm run test:backend # 阻塞执行全部离线后端检查，不消耗外部 credits
```

## 验证脚本

```bash
node scripts/smoke-sealculture-trio.mjs    # heritage 三件套 × SealCulture 冒烟
node scripts/verify-sealculture.mjs        # SealCulture 数据集全量校验
DEMO_MODE=true IMAGE_PROVIDER=mock OPENAI_API_KEY= \
  node scripts/test-specimen-sheet.mjs     # 标本档案 242 断言
```

## 线上地址

https://yinkedao.eurekadelta.com （Vercel 部署，别名 yinkedao.vercel.app）

## 本轮本地开发

当前工作位于 `feature/3d-production`，只开发、不部署。执行记录、限制和后续验收见 [DEVELOPMENT-STATUS.md](DEVELOPMENT-STATUS.md)。

字体样本可通过共享渲染引擎生成：

```bash
node scripts/seal-3d-face/make-face-textures.mjs --text 劉雨茜 --out tmp/seal-face
```

500 字姓名回归集是人工整理样本，不代表官方频率排名；当前映射后收录 483 字，17 字缺失已显式冻结记录。CI 检查映射、收录状态、缺字告知、印文格位与镜像方向，不能替代篆字识读和实际刻制审核。
