# Silver Forged Gui · 银中贵

AI 驱动的贵州苗银全球共创设计平台。从需求访谈到文化匹配，再到设计方向、提案与 AI 效果图，完整走通一条「用户记忆 × 苗银非遗」的定制首饰设计链路。

## 核心流程 · Stage 0 → 5

| 阶段 | 页面 | 定位 |
|---|---|---|
| Stage 0 | `/design-interview` | 记忆访谈 — 引导式问答，挖掘用户自己都未察觉的佩戴需求 |
| Stage 1 | `/global-design` | 需求分析 — 自然语言输入，结构化为设计偏好 |
| Stage 2 | `/cultural-match` | 文化匹配 — 从非遗数据库中匹配 3 个文化方向 |
| Stage 3 | `/design-translation` | 设计翻译 — 将文化匹配结果转译为 3 个可理解的设计方向 |
| Stage 4 | `/design-proposal` | 设计提案 — 选定方向深化为完整设计提案 |
| Stage 5 | `/design-render` | 效果图 — 基于真实苗银参考图生成 AI 定制效果图 |

另有 **成品系列** 独立站（`/collection/`，91 件产品、7 个页面），与主站双向导流。

## 技术栈

- **框架** Next.js 16 (App Router) · React 19 · TypeScript
- **样式** Tailwind CSS v4 — 黑底银字博物馆级视觉，全站无衬线 (Inter)
- **动画** Motion — 慢速、克制、电影感的页面过渡
- **AI 文本** Anthropic Claude（可选，缺省走内置演示模式）
- **AI 生图** gpt-image-2，以真实苗银收藏照片为视觉参考
- **校验** Zod 端到端 schema

## 生图管线

Stage 5 效果图不是凭空生成：

1. 按用户选择的**品类**（头饰/项链/耳饰/手饰…）从 144 张真实苗银收藏照片中选取参考图
2. 将纹样名、工艺名映射为英文视觉语言写入 Prompt
3. 通过 `images.edit` 参考图编辑模式生成——继承真实苗银的材质与工艺质感，但不复制任何一件
4. 换 seed 重生成会更换参考图组合，产生不同变体

文化元素严格来自确认的非遗数据库，AI 不臆造民族纹样。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:3000
```

无任何 Key 也可完整体验——文本 AI 自动进入演示模式，生图回落到占位渲染。

### 环境变量

复制 `.env.example` 为 `.env.local` 并按需填写：

```bash
# 文本 AI（不填则自动演示模式）
DEMO_MODE=true
ANTHROPIC_API_KEY=

# AI 生图（不填则使用占位图）
IMAGE_PROVIDER=openai-gpt-image
OPENAI_API_KEY=
OPENAI_BASE_URL=          # 支持中转站，如 https://tokenx24.com/v1

# 3D 效果图（B 线 · 不填则 /api/3d-model 返回配置错误）
MESHY_API_KEY=            # Meshy openapi key（msy_ 前缀）
BLOB_READ_WRITE_TOKEN=    # @vercel/blob 读写 token（glb 转存公开桶）

# 成品系列独立站地址
NEXT_PUBLIC_COLLECTION_URL=/collection
```

## 部署（Vercel）

Production Branch 设置为 `silver-forged-gui`，并在环境变量中填入上表 Key。

代码已做 Serverless 适配：参考图通过 `outputFileTracingIncludes` 打包进 `/api/design-render` 函数，`maxDuration=60` 覆盖 30-90 秒的生图耗时。

## 目录结构

```
app/                    页面路由与 API（design-* 全流程 + collection）
components/             各阶段 UI 组件（cultural-match / design-* / global-demand…）
lib/
  ├─ heritage/          非遗数据库、文化匹配引擎、类型
  ├─ design/            设计 schema、生图 Prompt 组装
  ├─ ai/                文本/生图 Provider 适配层
  └─ design-interview/  访谈问题引擎
messages/               i18n 文案（zh-CN / en / fr / ja）
data/                   苗族银饰非遗数据库（已分类，10 大类）
public/
  ├─ collection/        成品系列独立站（纯静态）
  └─ atelier/           主站视觉素材
```

## 许可

内部项目，未设开源许可。
