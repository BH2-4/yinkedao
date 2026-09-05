# 印可道 Vercel 部署方案

> 目标域名：**yinkedao.eurekadelta.com**（DNS 在 Cloudflare）
> 首版策略：**DEMO_MODE=true**（无 Key 完整体验），真实 Key 后补配
> 代码：`github.com/BH2-4/yinkedao`（私有，production = main）
> 部署 agent 维护；工程代码不在本方案范围内

---

## 0. 预检结论（2026-09-05）

| 项 | 结果 |
|---|---|
| vercel CLI | 已装，59.10.0（/opt/homebrew/bin/vercel） |
| CLI 登录态 | **未登录**（`vercel whoami` → Logged out）——当前唯一阻塞项 |
| vercel.json | 不存在，也不需要（部署相关配置已在 next.config.ts / 路由文件内） |
| outputFileTracingIncludes | 已配置：`/api/design-render` ← `./public/collection/assets/images/**/*` |
| maxDuration=60 | 已在 `app/api/design-render/route.ts` 导出 |
| 构建 | 标准 Next.js 16（`next build` 自动检测），无自定义构建命令 |
| git 状态 | 本地 main 领先 origin/main 多个 commit（等工程 agent 完成后由主对话统一 push）；fork 自 SilverForgedGui |

## 1. 项目创建方式：**GitHub Git 集成（推荐）**

**推荐：Vercel 项目连接 GitHub 仓库，push 即部署。**

理由：
- 同 org 的银中贵已用此方式（production branch `silver-forged-gui`），说明 **Vercel GitHub App 已安装到 BH2-4 org**，链路已验证可行；
- 主对话统一 push 的流程不冲突——push 到 main 自动触发 production 构建；
- 回滚、预览、部署历史全部免费获得；CLI 本地 `vercel deploy` 需手动逐次执行，且 `.vercel/` 目录需维护 gitignore，无收益。

不采用：CLI link + 本地直推（仅作应急通道）。

## 2. 环境变量

### 2.1 首版（DEMO_MODE，Production）

| 变量 | 值 | 说明 |
|---|---|---|
| `DEMO_MODE` | `true` | 显式声明（优先级高于 Key 探测；即使误配 Key 也保持 demo） |
| `NEXT_PUBLIC_3D_SEAL_URL` | （空字符串） | 3D 印章站未上线，留空隐藏入口（代码默认即空，显式配置留档） |
| `NEXT_PUBLIC_COLLECTION_URL` | （不配） | 默认 `#`，成品独立站走站内 `/collection/` 路径，无需外链 |

其余变量**全部不配**即处于安全默认：
- 无 `ANTHROPIC_API_KEY` → AI 走 demoProvider（UI 标注 DEMO MODE）
- 无 `IMAGE_PROVIDER` / `OPENAI_API_KEY` → 生图走内置 mock SVG

### 2.2 真实 Key 版（后续补配，完整清单）

| 变量 | 值 | 说明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 真实 Key | 官方或兼容端点的 Key |
| `ANTHROPIC_BASE_URL` | 如 `https://<兼容端点>/` | **可选**。代码用 `@anthropic-ai/sdk@0.122` 标准构造（无显式 baseURL），SDK 自动读取此环境变量 → 接第三方 Claude 兼容端点**零代码改动** |
| `AI_MODEL` | `claude-opus-4-7`（默认，可不配） | 模型名 |
| `AI_MAX_TOKENS` | `2400`（默认） | 含 adaptive thinking 余量 |
| `AI_TIMEOUT_MS` | `45000`（默认） | 结构化 JSON 任务 15–30s 的余量 |
| `DEMO_MODE` | 改为 `false` 或删除 | `false` = 仅当 Key 缺失才回退 demo；删除 = 同 `false` |
| `IMAGE_PROVIDER` | `openai-dalle3` 或 `openai-gpt-image` | 其他值/未配 → mock 生图 |
| `OPENAI_API_KEY` | 生图端点 Key | 未配时即使 IMAGE_PROVIDER 正确也回退 mock（有 console.warn） |
| `OPENAI_BASE_URL` | 生图兼容端点 | 可选，OpenAI 兼容协议 baseURL |

> 配置层级：环境变量加 **Production + Preview** 两个环境（`vercel env add` 需分别指定）。
> 注意 `NEXT_PUBLIC_*` 属构建期内联，改动需重新部署才生效；服务端变量 redeploy 即生效。

## 3. 用户需做的两步（当前等待中）

### 3.1 Vercel CLI 登录（阻塞 Vercel 侧所有操作）

终端执行：

```bash
vercel login
```

选择 **GitHub** 方式登录，且必须登录到**拥有 BH2-4 org 权限的账号**（即银中贵项目所在账号）。
登录成功后告知部署 agent，后续 Vercel 侧操作全部由 agent 执行。

### 3.2 GitHub 侧确认 Vercel App 仓库权限（连仓库时可能需要）

GitHub → Settings → Applications → Vercel：
- 若 org 的 Vercel App 是「All repositories」→ 无需操作；
- 若是「Only select repositories」→ 把 `BH2-4/yinkedao` 加入列表。

## 4. 授权后由部署 agent 执行的动作

```bash
cd /Users/arco/yinkedao

# 1. 创建/关联项目（scope 选 BH2-4 所在 team）
vercel project add yinkedao    # 或 vercel link 交互创建
vercel link -p yinkedao

# 2. 连接 GitHub 仓库（此后 push main 即自动构建）
vercel git connect BH2-4/yinkedao

# 3. 环境变量（Production，逐个）
vercel env add DEMO_MODE production        # 值: true
vercel env add NEXT_PUBLIC_3D_SEAL_URL production   # 值: （空）

# 4. 添加域名（触发证书预签发，Vercel 会返回待验证 DNS 记录）
vercel domains add yinkedao.eurekadelta.com yinkedao
```

要点：
- 项目创建后即使远端 main 还是旧代码，可先连上——旧代码会构建一次 production，无害；push 新代码后自动重建覆盖。
- Production branch 保持默认 `main`（银中贵改过 branch 名，本项目不需要）。
- `vercel domains add` 的输出（待验证 DNS 记录）会回填到下方第 5 节。

## 5. Cloudflare DNS 操作指引（用户在 Cloudflare 后台做）

域名：`eurekadelta.com` → DNS → 添加记录：

| 类型 | 名称 | 目标 | 代理状态 |
|---|---|---|---|
| CNAME | `yinkedao` | `cname.vercel-dns.com` | **仅 DNS（灰云）** |

以第 4 步 `vercel domains add` 实际返回值为准（子域预期即上述 CNAME；若给的是 A 记录 `76.76.21.21` 则照抄）。

**代理状态（橙云）决策——两阶段：**

1. **先灰云（仅 DNS）**：Vercel 需完成域名验证并经 HTTP-01 签发 Let's Encrypt 边缘证书。橙云会拦截/代理验证请求，存在验证失败或证书卡 Pending 的风险。
2. **证书 Active 后再决定是否开橙云**：
   - 开橙云前提：Cloudflare SSL/TLS 模式必须设 **Full (strict)**（Cloudflare 以 HTTPS 回源 Vercel 有效证书）；
   - **严禁 Flexible**：HTTP 回源 + Vercel 强制 HTTPS → 无限重定向循环；
   - 橙云收益：CF WAF/缓存/隐藏源站；代价：Vercel 侧部分 Header/地域信息失真。本站是动态 AI 应用，缓存收益小，**建议长期保持灰云**，除非另有 Cloudflare 安全需求。

## 6. 部署时序

```
工程 agent 完成内容迁移
        │
        ▼
主对话 git push origin main ──► Vercel 自动构建（production=main）
        │                              │
        │（可与 push 并行）             ▼
        │                       构建产物就绪（*.vercel.app 可访问）
        ▼
agent: vercel domains add yinkedao.eurekadelta.com
        │
        ▼
用户: Cloudflare 加 CNAME（灰云）
        │
        ▼
Vercel 证书签发 → Domains 页状态变 Active（通常几分钟，最长数小时）
        │
        ▼
https://yinkedao.eurekadelta.com 上线 ──► 按第 7 节验证
```

## 7. 上线验证清单

```bash
# 首页
curl -sI https://yinkedao.eurekadelta.com | head -1          # 期望 200

# 五步流程页 + 提案页（7 个页面路由）
for p in design-interview global-design cultural-match \
         design-translation design-render design-proposal; do
  curl -sI https://yinkedao.eurekadelta.com/$p | head -1     # 各期望 200
done

# API demo 链路（POST 期望 200 + demo 数据返回，非 500）
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://yinkedao.eurekadelta.com/api/design-render \
  -H 'Content-Type: application/json' -d '{}'
```

- [ ] 上述 curl 全部 200
- [ ] 页面呈现 **DEMO MODE 标注**（demoMode 状态贯穿 InterviewFlow / StudioForm 等组件，视觉可见）
- [ ] 五步流程端到端可走完（引导→全局→文化→转译→渲染→提案）
- [ ] `curl -sI https://yinkedao.eurekadelta.com/collection/` → 200（若首版包含成品独立站）
- [ ] HTTP→HTTPS 自动跳转正常
- [ ] Vercel Domains 页证书状态 **Valid / Active**

## 8. 回滚方式

- **Dashboard**：项目 → Deployments → 找到上一个正常 deployment → 右侧菜单 **Promote to Production**（秒级，指向既有构建产物，不重新构建）。
- **CLI**：`vercel rollback`（回滚到上一个 production）或 `vercel promote <deployment-url>`（指定任意历史版本）。
- 域名/DNS 层不动，仅切流量指向。
- 若新部署构建失败：production 仍指向上一个成功构建，**线上不受影响**，修复代码再 push 即可。

## 9. 已知遗留（不阻塞部署）

- `next.config.ts` 含 fork 遗留的 `shop.randomplayx.com` host 301 规则与 `/collection` 重写——在 yinkedao 域名下 host 永不命中，无害；是否清理由工程 agent 决定。
- `.env.example` / `.env.local` 内容受权限保护未直接读取，环境变量清单已从源码 `process.env.*` 引用全量重建（本文档第 2 节即完整清单）。
