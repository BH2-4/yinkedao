# 印可道 上线核对清单（首版 DEMO）

> 维护：上线与持续更新 agent。配合 `DEPLOY-PLAN.md`（Vercel 侧配置记录）食用。
> 项目：`prj_77ye01EbrzMmoOnBGYSb4f2mIoTD` · team：`team_IU5cDGEtZ0O2qfP44ai7oeu9`
> 状态基线：2026-09-06 本地 build 已通过（带代理）；DNS CNAME 尚未生效（`configVerifiedAt=None`）

---

## ① 上线前验证项（push 之前，逐项打勾）

### 1. Production build

```bash
cd /Users/arco/yinkedao
HTTP_PROXY=http://127.0.0.1:12450 HTTPS_PROXY=http://127.0.0.1:12450 npm run build
```

- [ ] 退出码 0
- ⚠ 本机直连拉不到 Google Fonts（next/font 报错），**必须带系统代理**（127.0.0.1:12450）；
  Vercel 构建机无此问题。
- [ ] 记录输出的 `Route (app)` 表——**上线后验证按此表逐项 curl**（路由结构工程 agent 迭代中，
  2026-09-06 快照：`/`、`/design-brief`、`/design-interview`、`/design-render` +
  `/api/design-intent`、`/api/design-render`，勿写死清单）

### 2. 本地冒烟（scripts/，共约 70 断言）

```bash
npm run dev &            # 起 localhost:3000
sleep 5
node scripts/smoke-stage0.mjs          # 页面渲染 + API 规则合成 + 护栏
node scripts/test-design-proposal.mjs
node scripts/test-design-render.mjs
node scripts/test-design-translation.mjs
kill %1
```

- [ ] 四个脚本全绿（70/70）

### 3. 静态检查

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint --max-warnings 0
```

- [ ] typecheck 0 错误
- [ ] lint 0 警告

### 4. Vercel 环境变量核对（对照 DEPLOY-PLAN §2.1）

```bash
TOKEN=$(cat /Users/arco/yinkedao/.vercel-token)   # 禁止回显明文
curl -s "https://api.vercel.com/v9/projects/prj_77ye01EbrzMmoOnBGYSb4f2mIoTD/env?teamId=team_IU5cDGEtZ0O2qfP44ai7oeu9" \
  -H "Authorization: Bearer $TOKEN"
```

- [ ] DEMO_MODE = `true`（production+preview）—— 已配 ✓（2026-09-05）
- [ ] NEXT_PUBLIC_3D_SEAL_URL = 空串（production+preview）—— 已配 ✓（2026-09-05）

## ② push（主对话执行，本 agent 不做）

```bash
git push origin main
```

- push 瞬间触发 Vercel production 构建（Git 集成已挂好，无手动动作）
- 远端 main 若是旧代码被先构建一版：无妨，本次 push 立即覆盖

## ③ 构建监控（push 后立即开始，REST API）

```bash
TOKEN=$(cat /Users/arco/yinkedao/.vercel-token)

# 最新 production 部署状态（readyState: QUEUED|BUILDING|READY|ERROR）
curl -s "https://api.vercel.com/v6/deployments?projectId=prj_77ye01EbrzMmoOnBGYSb4f2mIoTD&teamId=team_IU5cDGEtZ0O2qfP44ai7oeu9&limit=1&target=production" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['deployments'][0]; print(d['uid'], d['readyState'], d['url'])"

# 失败时看构建日志
curl -s "https://api.vercel.com/v2/deployments/{deploymentUid}/events?teamId=team_IU5cDGEtZ0O2qfP44ai7oeu9&limit=100" \
  -H "Authorization: Bearer $TOKEN"
```

- [ ] readyState 变 **READY**（Next 构建一般 1-3 分钟）
- [ ] 若 ERROR：拉 events 定位 → 报主对话转工程 agent，修完重走 ①

## ④ 上线后验证（7 项，域名就绪后）

前置：DNS CNAME 已生效（见 DEPLOY-PLAN §4 操作卡；复查命令如下）

```bash
TOKEN=$(cat /Users/arco/yinkedao/.vercel-token)
# configVerifiedAt 从 None 变时间戳 = CNAME 已被 Vercel 确认
curl -s "https://api.vercel.com/v4/domains/yinkedao.eurekadelta.com?teamId=team_IU5cDGEtZ0O2qfP44ai7oeu9" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import json,sys; print(json.load(sys.stdin)['domain']['configVerifiedAt'])"
```

| # | 验证项 | 方法 | 期望 |
|---|---|---|---|
| 1 | 首页 | `curl -sI https://yinkedao.eurekadelta.com \| head -1` | 200 |
| 2 | 流程页 | 按 ①-1 记录的 Route 表逐项 `curl -sI .../{route}` | 全 200 |
| 3 | DEMO MODE 标注 | 浏览器打开首页/引导页 | 页面呈现 DEMO MODE 标识（demoMode 贯穿 InterviewFlow/StudioForm） |
| 4 | 静态资源 | 浏览器 DevTools → Network | 字体/CSS/JS/图片全 200，无 404 混入 |
| 5 | 控制台 | DevTools → Console 抽查 2-3 页 | 无红色报错 |
| 6 | API 链路 | `curl -s -o /dev/null -w "%{http_code}" -X POST .../api/design-render -H 'Content-Type: application/json' -d '{}'` | 200（demo 数据返回，非 5xx） |
| 7 | HTTPS 跳转 | `curl -sI http://yinkedao.eurekadelta.com \| head -1` | 308/301 → https |

- [ ] 全过 → 在 RELEASE-SOP 的发布记录表补一行
- 3/4/5 需要真实浏览器抽查（UI/排版优先视觉验证）

---

## 当前阻塞项（2026-09-06）

1. **DNS CNAME 未加/未生效**（`configVerifiedAt=None`）——等用户在 DNS 面板加
   `CNAME yinkedao → cname.vercel-dns.com`（灰云），见 DEPLOY-PLAN §4 NS 警示（先确认
   eurekadelta.com 的 CF zone 是否 Active，NS 实测仍指 spaceship.net）。
2. 工程 agent 内容迁移任务链进行中——① 的路由快照会漂移，push 前以当日 build 输出为准。
