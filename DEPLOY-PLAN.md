# 印可道 Vercel 部署方案

> 目标域名：**yinkedao.eurekadelta.com**（DNS 计划在 Cloudflare，见 §5 的 NS 警示）
> 首版策略：**DEMO_MODE=true**（无 Key 完整体验），真实 Key 后补配
> 代码：`github.com/BH2-4/yinkedao`（私有，production = main）
> 部署 agent 维护；工程代码不在本方案范围内
>
> **状态（2026-09-05）：Vercel 侧准备已全部完成**（项目已建 + Git 已连 + 域名已加 + 环境变量已配）。
> 剩余两件事：① 用户在 DNS 侧加一条 CNAME（见 §5 操作卡）；② 主对话 push 代码即自动构建上线（见 §6）。

---

## 0. 预检结论与 API 路线（2026-09-05）

| 项 | 结果 |
|---|---|
| vercel CLI | 已装 59.10.0，但本机所有网络路径（直连/HTTP 代理/SOCKS）均 `fetch failed`，**废弃 CLI** |
| 实际路线 | **curl + Vercel REST API 直连**（api.vercel.com 直连正常；token 账号 bh2-4，Hobby plan，team `team_IU5cDGEtZ0O2qfP44ai7oeu9`） |
| 团队权限 | 已确认：`GET /v9/projects` 列出 4 项目，含参照项目 `silverforgedgui` |
| vercel.json | 不存在，也不需要（部署相关配置已在 next.config.ts / 路由文件内） |
| outputFileTracingIncludes | 已配置：`/api/design-render` ← `./public/collection/assets/images/**/*` |
| maxDuration=60 | 已在 `app/api/design-render/route.ts` 导出 |
| 构建 | 标准 Next.js 16（`next build` 自动检测），无自定义构建命令 |
| git 状态 | 本地 main 领先 origin/main 多个 commit（等工程 agent 完成后由主对话统一 push）；fork 自 SilverForgedGui |

### 参照：银中贵项目配置（API 实测）

`silverforgedgui`（prj_5AFSjQnXFCxhAJj5vr9J7mQHjfbS）：framework=nextjs、nodeVersion=24.x、
Git App credential=`cred_53d67087…`（org BH2-4）、productionBranch=**main**。yinkedao 全部对齐。

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

## 3. Vercel 侧已执行记录（curl + REST API，全部成功）

| # | 动作 | API 调用 | 结果要点 |
|---|---|---|---|
| 1 | 列项目确认权限 | `GET /v9/projects?teamId=…&limit=100` | 4 项目可见（silverforgedgui 等）；银中贵 link 结构作参照 |
| 2 | 创建项目 | `POST /v9/projects`（body: name=yinkedao, framework=nextjs） | **prj_77ye01EbrzMmoOnBGYSb4f2mIoTD**，nodeVersion=24.x，region=iad1 |
| 3 | 连 GitHub 仓库 | `POST /v9/projects/{id}/link`（body: type=github, repo=BH2-4/yinkedao） | link 挂载成功：repoId=1357984555、gitCredentialId 同银中贵、**productionBranch=main**、rootDirectory 默认 `/` |
| 4 | 加自定义域名 | `POST /v10/projects/{id}/domains`（name=yinkedao.eurekadelta.com） | 域名已挂到项目，**verified: true**（apex eurekadelta.com 此前已在团队验证过） |
| 5 | 写环境变量 | `POST /v10/projects/{id}/env`（批量） | DEMO_MODE=`"true"`、NEXT_PUBLIC_3D_SEAL_URL=`""`，target=production+preview，已逐个 GET 核对值 |

API 使用备注（供后续迭代复用）：
- `POST /v9/projects` 的 body **不接受 `link` 字段**（报 `should NOT have additional property "link"`），连仓库必须用独立端点 `POST /v9/projects/{id}/link`，body 为 `{"type":"github","repo":"org/repo"}`；
- 环境变量重复 POST 会报 `ENV_CONFLICT`，更新已有值用 `PATCH /v9/projects/{id}/env/{envId}`；
- GitHub App 对 BH2-4 org 的仓库权限**已就绪**（步骤 3 直接解析出 repoId，未报 repo_not_found），无需网页端补授权。

构建配置核对（无需改动）：rootDirectory=默认根、productionBranch=main、framework=nextjs、buildCommand/installCommand=null（自动检测）、nodeVersion=24.x。

## 4. 唯一待用户操作：DNS 加一条 CNAME

在当前管理 `eurekadelta.com` DNS 的面板里加：

| 类型 | 名称 | 目标 | 代理状态 |
|---|---|---|---|
| **CNAME** | `yinkedao` | `cname.vercel-dns.com` | **仅 DNS（灰云，勿开橙云）** |

- Cloudflare 路径：eurekadelta.com → DNS → Records → Add record → 上述四项照抄（代理状态点成灰色「DNS only」）。
- 记录加完后 Vercel 会自动签发 Let's Encrypt 边缘证书（无需任何额外验证操作，域名 verified 已通过）。

### ⚠ NS 警示（加记录前先确认这一条）

Vercel 侧观察到 `eurekadelta.com` 的权威 NS 当前是 `launch1/launch2.spaceship.net`（**Spaceship 注册商默认 NS，不是 Cloudflare**）。两种情况：

- 若 Cloudflare 面板里该 zone 状态是 **Pending / 待激活**：说明 NS 尚未从 Spaceship 切到 Cloudflare，此时在 CF 加的记录**不生效**。两条路二选一：
  1. 按计划切 NS（Spaceship 域名管理 → 改 NS 为 Cloudflare 分配的两条 → 等 zone 变 Active）→ 再在 CF 加上述 CNAME；
  2. 或直接在 **Spaceship 的 DNS 管理**里加同样的 CNAME（最快，跳过 Cloudflare）。
- 若 CF zone 已 Active（NS 已切，Vercel 数据是旧缓存）：直接在 CF 加 CNAME 即可，忽略本条。

**代理状态（橙云）决策——两阶段：**

1. **先灰云（仅 DNS）**：Vercel 需经 HTTP-01 签发 Let's Encrypt 边缘证书。橙云会拦截/代理验证请求，存在验证失败或证书卡 Pending 的风险。
2. **证书 Active 后再决定是否开橙云**：
   - 开橙云前提：Cloudflare SSL/TLS 模式必须设 **Full (strict)**（Cloudflare 以 HTTPS 回源 Vercel 有效证书）；
   - **严禁 Flexible**：HTTP 回源 + Vercel 强制 HTTPS → 无限重定向循环；
   - 橙云收益：CF WAF/缓存/隐藏源站；代价：Vercel 侧部分 Header/地域信息失真。本站是动态 AI 应用，缓存收益小，**建议长期保持灰云**，除非另有 Cloudflare 安全需求。

## 6. 部署时序（Vercel 侧已就绪，剩两条并行线）

```
【Vercel 侧：全部完成，无需任何操作】
项目 ✓ Git 集成 ✓ 域名 ✓ 环境变量 ✓

【线 A：DNS（用户，§4 操作卡）】          【线 B：代码（主对话）】
用户加 CNAME yinkedao →                 工程agent完成 → git push origin main
cname.vercel-dns.com（灰云）                    │
        │                                       ▼
        ▼                              Vercel 自动构建（production=main）
DNS 生效（秒~分钟级）                    → *.vercel.app 立即可访问
        │                              注：push 前若有人触发构建（如首次
        ▼                              link 时远端 main 是旧代码，会先构建
Vercel 自动签发 Let's Encrypt            一版旧 production，无妨——新 push
边缘证书 → Active                        会重建覆盖）
        │                                       │
        └───────────────┬───────────────────────┘
                        ▼
        https://yinkedao.eurekadelta.com 上线 ──► 按 §7 验证
```

说明：
- **首次自动构建时机**：Git link 已挂好，主对话 `git push origin main` 的瞬间即触发 production 构建，无需任何手动动作；
- 远端 main 当前是 fork 初期的旧代码——若此刻有部署被触发，会构建旧版并占用 production 指针，**无妨**：新代码 push 后自动重建并替换；旧部署还可用作回滚锚点；
- 环境变量（DEMO_MODE=true）已配置在 production 环境，首次构建即为 DEMO 形态。

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
- **API（CLI 不可用，走此路线）**：
  - 查历史部署：`GET /v6/deployments?projectId=prj_77ye01EbrzMmoOnBGYSb4f2mIoTD&teamId=…&state=READY&target=production`
  - 回滚：`POST /v13/deployments/{deploymentId}/promote?teamId=…`（body: `{}`，指定目标 deployment）
- 域名/DNS 层不动，仅切流量指向。
- 若新部署构建失败：production 仍指向上一个成功构建，**线上不受影响**，修复代码再 push 即可。

## 10. Cloudflare 迁移记录（2026-09-06，凭据探索结论）

### 探索结果（全部为否）

| 途径 | 结果 |
|---|---|
| wrangler CLI | 未安装；且其 OAuth scope 不含 Zone DNS 写权限，装了也解不了 DNS 编辑 |
| 环境变量 CF_API_TOKEN / CF_API_KEY | 无 |
| shell 配置（~/.zshrc 等） | 无 CF/Spaceship export |
| ~/.cloudflare/ | 存在但仅 skills 缓存/config 空文件，无凭据 |
| Spaceship API 凭据 | 无 |

**结论：CF 侧当前零自动能力，需用户走 A 或 B 二选一。**

### 路线 A（推荐）：给部署 agent 一个 API Token，后续全自动

1. 用户打开 https://dash.cloudflare.com/profile/api-tokens → **Create Token** → 模板 **「Edit zone DNS」**；
   Zone Resources 选 **Include → Specific zone → eurekadelta.com**（若 zone 尚不存在，先按路线 B 第 1 步建 zone，或临时选 All zones）；
2. 生成的 Token 存到 `~/.yinkedao-cf-token`（或告知路径）；
3. 此后 agent 自动完成：zone 状态检查/创建、3 条 DNS 记录入库、NS 切换后轮询 pending→active、
   Vercel configVerifiedAt 复查、正式域名 7 项上线验证。
   （Spaceship NS 切换无论哪条路线都需用户网页操作——Spaceship API key 未配置）

### 路线 B：用户网页手动（两站各一次）

**① Cloudflare 侧**（https://dash.cloudflare.com）：

- 若 zone 不存在：Add a site → `eurekadelta.com` → Free 计划 → 继续（不用加记录，next 步给全）；
- 记下 Overview 页显示的 **两条 assigned nameservers**（形如 `xxx.ns.cloudflare.com` / `yyy.ns.cloudflare.com`）；
- DNS → Records 加三条（全部**仅 DNS 灰云**）：

| 类型 | 名称 | 内容 | 代理状态 |
|---|---|---|---|
| CNAME | `yinkedao` | `cname.vercel-dns.com` | 仅 DNS |
| A | `@` | `54.149.79.189` | 仅 DNS |
| A | `@` | `34.216.117.25` | 仅 DNS |

**② Spaceship 侧**（https://www.spaceship.com/manage/）：

Domains → eurekadelta.com → **Name servers** → 选 **Custom** → 删掉 launch1/launch2.spaceship.net，
填入 ① 记下的两条 CF nameservers → Save。

**③ 生效**：NS 变更全球传播几分钟~数小时；CF zone 从 pending 变 **active**（会收到邮件）；
随后 agent 复查 Vercel `configVerifiedAt` + 证书签发 + 正式域名 7 项验证。

### 当前状态快照

- Vercel：production 已 READY（dpl_ZxaAq26jZkdWBrFg3DQJABetxQmG），域名 alias 已挂，
  `configVerifiedAt=None`（等 DNS）；
- CF zone：存在性未确认（无凭据不可查）；NS 实测仍指 spaceship.net。

## 9. 已知遗留（不阻塞部署）

- **eurekadelta.com 权威 NS 是 spaceship.net 而非 Cloudflare**（Vercel 侧实测）——见 §4 NS 警示，用户加 CNAME 前需先确认 CF zone 状态，否则记录不生效。
- `next.config.ts` 含 fork 遗留的 `shop.randomplayx.com` host 301 规则与 `/collection` 重写——在 yinkedao 域名下 host 永不命中，无害；是否清理由工程 agent 决定。
- `.env.example` / `.env.local` 内容受权限保护未直接读取，环境变量清单已从源码 `process.env.*` 引用全量重建（本文档第 2 节即完整清单）。
- vercel CLI 本机网络不可用（所有路径 fetch failed），后续运维（域名状态检查/回滚/环境变量迭代）继续走 REST API 路线，命令模板已沉淀在 §3 备注与 §8。
