# 印可道 发布与持续更新 SOP

> 维护：上线与持续更新 agent。每次迭代按 §1 流水线执行；Key/回滚/额度见对应节。
> 固定参数：项目 `prj_77ye01EbrzMmoOnBGYSb4f2mIoTD` · team `team_IU5cDGEtZ0O2qfP44ai7oeu9`
> Token：`TOKEN=$(cat /Users/arco/yinkedao/.vercel-token)`（已 gitignore，**任何输出/文件禁止回显明文**）
> 本机网络注意：vercel CLI / dig / Google Fonts 直连均不通；API 直连 curl 通；本地 build 需带
> 代理 `HTTP_PROXY=http://127.0.0.1:12450 HTTPS_PROXY=http://127.0.0.1:12450`。

---

## 1. 迭代流水线（每次代码更新走这条链）

```
commit（工程 agent）→ push main（主对话）→ Vercel 自动构建
  → API 查状态 READY → 上线验证 curl → 发布记录
```

### 步骤与现成命令

**S0 本地门禁**（push 前；详细版见 RELEASE-CHECKLIST §①）

```bash
cd /Users/arco/yinkedao
HTTP_PROXY=http://127.0.0.1:12450 HTTPS_PROXY=http://127.0.0.1:12450 npm run build
npm run typecheck && npm run lint
# 冒烟需先 npm run dev，再逐个 node scripts/*.mjs
```

**S1 push**（主对话统一执行，本 agent 只监控）

```bash
git push origin main
```

**S2 构建监控**（push 后轮询，1-3 分钟出结果）

```bash
TOKEN=$(cat /Users/arco/yinkedao/.vercel-token)
curl -s "https://api.vercel.com/v6/deployments?projectId=prj_77ye01EbrzMmoOnBGYSb4f2mIoTD&teamId=team_IU5cDGEtZ0O2qfP44ai7oeu9&limit=1&target=production" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['deployments'][0]; print(d['uid'], d['readyState'], d['url'])"
```

- `READY` → 进 S3；`ERROR` → `GET /v2/deployments/{uid}/events?...&limit=100` 拉日志定位，报主对话。
  production 指针不动，线上不受影响。

**S3 上线验证**（7 项清单见 RELEASE-CHECKLIST §④；日常快速版）

```bash
B=https://yinkedao.eurekadelta.com
curl -sI $B | head -1
for p in design-interview design-render; do curl -sI $B/$p | head -1; done   # 按当日 Route 表增减
curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/api/design-render -H 'Content-Type: application/json' -d '{}'
```

**S4 发布记录**（追加到本文件末尾表格）

## 2. 环境变量演进（真实 Key 接入规程）

### 安全红线

- Key **只进 Vercel env API**（加密存储，构建/运行时注入），**绝不**进 git、`.env.example`、
  任何文档或聊天输出明文。
- `.env.local` 仅限本地开发，已 gitignore。
- 泄露处置：立即 Vercel 后台删除变量 + 到 Key 提供方轮换。

### 写入模板（以 ANTHROPIC_API_KEY 为例）

```bash
TOKEN=$(cat /Users/arco/yinkedao/.vercel-token)
API=https://api.vercel.com/v9/projects/prj_77ye01EbrzMmoOnBGYSb4f2mIoTD/env
TEAM=team_IU5cDGEtZ0O2qfP44ai7oeu9

# 新增（先查是否已存在，存在则用 PATCH）
curl -s -X POST "$API?teamId=$TEAM" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '[{"key":"ANTHROPIC_API_KEY","value":"sk-实际值","type":"encrypted","target":["production","preview"]}]'

# 更新已有值（envId 从 GET $API 列表拿；重复 POST 会报 ENV_CONFLICT）
curl -s -X PATCH "$API/{envId}?teamId=$TEAM" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"value":"sk-新值","target":["production","preview"]}'
```

### 真实 Key 完整清单与顺序

1. `ANTHROPIC_API_KEY`（+可选 `ANTHROPIC_BASE_URL` 兼容端点——SDK 自动读，零代码）
2. 生图线：`IMAGE_PROVIDER`（`openai-dpt-image`/`openai-dalle3`）+ `OPENAI_API_KEY`（+可选 `OPENAI_BASE_URL`）
3. 可选微调：`AI_MODEL`/`AI_MAX_TOKENS`/`AI_TIMEOUT_MS`（不配走默认，见 DEPLOY-PLAN §2.2）
4. **每次改完 env 必须 redeploy**（服务端变量下次部署生效；`NEXT_PUBLIC_*` 构建期内联必须重构建）：
   触发方式 = 任意 push，或后台 Deployments → Redeploy

### DEMO_MODE 切换策略

**建议：配 Key 后把值改为 `false`，保留变量不删。**

依据 `lib/env.ts` 逻辑：`DEMO_MODE=false` 时仅当 Key 缺失才回退 demo——Key 意外失效（额度耗尽/端点故障）
时线上自动降级为 DEMO 形态而非报错，这本来就是产品的设计降级形态。删除变量行为等同 false，
但保留显式 `false` 可在后台一眼看出"已切真实模式"。

## 3. 回滚 SOP

```bash
TOKEN=$(cat /Users/arco/yinkedao/.vercel-token)
TEAM=team_IU5cDGEtZ0O2qfP44ai7oeu9
PID=prj_77ye01EbrzMmoOnBGYSb4f2mIoTD

# 1. 找历史可用部署（READY 的 production）
curl -s "https://api.vercel.com/v6/deployments?projectId=$PID&teamId=$TEAM&state=READY&target=production&limit=5" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import json,sys
for d in json.load(sys.stdin)['deployments']:
    print(d['uid'], d['createdAt'], d['url'])"

# 2. 把目标 deployment 提为 production（秒级，不重新构建）
curl -s -X POST "https://api.vercel.com/v13/deployments/{目标uid}/promote?teamId=$TEAM" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
```

原则：代码坏 → 优先回滚（promote 旧部署）再慢慢修；构建失败无需回滚（production 未动过）。
域名/DNS 层永远不动。

## 4. 更新节奏（挂钩 PRD 里程碑）

| 节点 | 触发的 SOP 动作 |
|---|---|
| 首版 DEMO 上线 | 全量：CHECKLIST ①→④ + 本 SOP S1-S4 |
| M4 生图管线接入 | S0-S4 + env 演进 §2（OPENAI 三件套）+ 上线后加验 `/api/design-render` 真图出图 |
| 崇羲文字层上线 | S0-S4 + 冒烟脚本若有新增一并跑 |
| 真实 Key 切换 | §2 全程 + DEMO_MODE→false + 验证 DEMO 标注消失 |
| 3D 印章站上线 | env 改 `NEXT_PUBLIC_3D_SEAL_URL`（**NEXT_PUBLIC 必须重部署**）+ 验证入口出现 |

日常纪律：每次主对话 push 后，本 agent 主动跑 S2-S4 并回传结果；不攒批。

## 5. Vercel Hobby 额度注意项

| 项 | Hobby 限制 | 本项目风险 |
|---|---|---|
| 带宽 | 100 GB/月（软限，超了可能拦停） | 见下方粗估，DEMO 期无虞 |
| 函数时长 | 单次最长 60s（maxDuration=60 已顶格用） | 生图路由超 60s 会 504——真图管线若超时需改流式/异步任务模式 |
| 并发执行 | **同时仅 1 个 serverless 执行** | 最大坑：一个用户在生图（占 60s）时，其他用户的 API 请求排队等锁。DEMO 期影响小；上线真图后若多用户并发 → 升 Pro 或改架构 |
| 部署数 | 每天 ~100 次构建 | 正常迭代节奏够用 |
| 镜像/缓存 | 商用限制条款 | 印可道若商用需升 Pro（$20/月），留意 |

**D 批 64 张图带宽粗估**：按单图 300KB（WebP/压缩后）计，全量浏览一轮 ≈ 64 × 300KB ≈ **19MB**；
100GB/月 ≈ 全量浏览 5000+ 轮。DEMO 展示期（个位数访客）完全无虞；真图管线接入后若单图 2MB+
（未压缩 PNG），一轮 ≈ 130MB，月预算 ≈ 700 轮，需开始做图片压缩/CDN 策略。

---

## 发布记录

| 日期 | deployment | 变更摘要 | 验证结果 |
|---|---|---|---|
| 2026-09-06 | dpl_ZxaAq26jZkdWBrFg3DQJABetxQmG | c102ab9..68c6810（7 commit，含小篆印蜕+白主题） | 门禁全过（worktree 独立验证 68c6810：build/tsc/smoke/render）；构建 ~90s READY；vercel.app 被 Standard Protection 拦（预期，见 §6）；正式域名验证待 DNS |

## 6. 部署保护说明（2026-09-06 实测发现）

- 本项目 Hobby 计划默认 **Vercel Authentication + Standard Protection**：`*.vercel.app` 域名（含 production deployment URL）匿名访问 302 到 SSO、API 401 "Protected deployment"——**这是预期行为，非故障**；
- **production 自定义域名（yinkedao.eurekadelta.com）不受保护、公开可访问**（Hobby 仅 Standard 可用，All Deployments 是 Pro 特性）；
- 因此上线验证必须在正式域名做（或浏览器登录 Vercel 账号访问 vercel.app）；
- 判别方法：302 的 `location` 指向 `vercel.com/sso-api` / 401 body 含 `"Protected deployment"` 即是保护拦截，不要误判为部署故障。
