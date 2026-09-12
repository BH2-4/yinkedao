# 印可道 — AI 篇刻定制

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
| `/api/design-intent` | 访谈意图结构化 API |
| `/api/design-render` | 质感层生图 API（文字层由字体引擎后叠加） |

印章文化数据来自 `data/SealCulture-v1`（source-first 知识库，8 类实体 +
文化匹配层），由 `lib/heritage/` 三件套（match / guardrail / evidence）消费，
文化断言分级只降不升，无来源不写事实。

## 技术栈

- **框架** Next.js 16 (App Router) · React 19 · TypeScript 5
- **样式** Tailwind CSS v4 — 宣纸朱砂视觉体系
- **动画** Motion
- **文本 AI** Anthropic 协议（Claude 或智谱 GLM 兼容端点，可选，缺省 DEMO 模式）
- **生图** gpt-image-2（以 `public/seal-references/` 真实印章照片为参考图）
- **校验** Zod 端到端 schema

## 环境变量

复制 `.env.example` 为 `.env.local` 按需填写：

| 变量 | 说明 |
|---|---|
| `DEMO_MODE` | `true` 时无 AI Key 也能跑通全流程（UI 明确标注演示） |
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

## 脚本

```bash
npm run dev        # 本地开发
npm run build      # 生产构建
npm run start      # 生产启动
npm run lint       # ESLint（0 警告阈值）
npm run typecheck  # tsc --noEmit
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
