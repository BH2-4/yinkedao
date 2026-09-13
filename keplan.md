# 印可道 · 交接计划书（keplan.md）

> 生成于 2026-09-12，供另一台电脑的 agent 接手。本文件自足：不需要原机器的会话记忆即可继续工作。
> **交接模式（用户拍板）：只开发，不部署**——不 push main、不配 Vercel env、不触发上线、不花线上 credits。线上停在当前干净稳定版（F 批清理后，/collection 404），不受开发影响。
> 仓库：github.com/BH2-4/yinkedao（PUBLIC，origin=新仓，upstream=SilverForgedGui 保留作 fork 溯源）
> 线上：https://yinkedao.eurekadelta.com（Vercel 自动部署，push main 即触发）
> PRD：飞书 https://cosmiclinks.feishu.cn/docx/V4JTdkArhoGl0axBoX9czp4Vnrg（v0.4 进度看板版，原地迭代）

## 0. 产品一句话

「印可道」：AI 篆刻定制——五维度访谈（石料/用途/外形/装饰/印面）→ 六宫格标本档案效果图 → 3D 效果图 → 印蜕渲染。核心承诺：篆字零容忍（印面文字永走字体引擎，不走生图）。

## 1. 当前状态快照（交接时点）

### 已上线（main）
- 五维度访谈 + 六宫格真图（DMXAPI gpt-image-2-ssvip，maxDuration 300 + 240s 超时 + 502 重试，实测 34.5s–240.3s）
- materials/ 石料实拍参考图接线（按石种文件名命中置顶参考位）
- 旅程下拉宣纸朱砂化 + 苗银残留全入口下线（6e0df7d）
- F 批清理（**已完成并上线**，ed8f319→7732fa5 共 5 提交）：删 108MB 银饰资产、heritage 切 SealCulture 数据（verify 348/348）、删银饰死代码管线、README 重写。铁证：线上 `/collection` 返回 404
- 断链修复：效果图页「返回参数单」改指 /design-brief（cbe7dd5）
- **崇曦字体已入库 main**（779bcf6）：assets/fonts/chongxi/ 三文件（otf 21.2MB + License.jpg + 说明.txt），clone 即得

### 分支池（均未合 main，**已全部推上远端**，clone 即得；worktree 路径是原机器概念，新机直接 `git checkout <分支>` 即可）
| 分支 | 内容 | 去向 |
|---|---|---|
| feature/3d-production（10 提交） | Meshy 3D 管线全套（见 §2.1） | 开发迭代（上线留待用户拍板） |
| feature/chongxi-mainline（4 提交） | 崇曦字体 Phase 1（服务端渲染+双栈+OpenCC，29 断言绿） | Phase 2 完成后合（见 §2.2） |
| feature/3d-pipeline-spike | 早期 spike 留档 | 不合，可于稳定后删 |

### 已知遗留（原机器权限所限未完成）
- `.env.example` 三处待手改（原机 `.env*` 文件被 deny 权限拦，所有 agent 改不了）：①首行 `# Silver Forged Gui — Global Demand Engine V1` → `# 印可道 — AI 篆刻定制` ②删 NEXT_PUBLIC_COLLECTION_URL 段（约 L59-66）③IMAGE_TIMEOUT_MS 注释「maxDuration 当前 60s」改为实际 240s/300s。新机若无此权限限制可顺手补
- Vercel env 配置方法：vercel CLI（`vercel env add MESHY_API_KEY production`）或 dashboard 手动；配完 env 后 push 才会带上（env 变更不触发已开始的构建）

### 架构铁律（PRD 8.1）
质感层/文字层分离：Meshy 只碰石料材质与几何，**印面文字永不进 Meshy**（无法指定面、会烘焙全身），一律字体引擎后期叠加。

## 2. 剩余工作（按优先级）

### 2.1 3D 管线第二波上线（代码就绪，**上线动作留待用户拍板**——交接模式为只开发不部署）

代码全部就绪于 feature/3d-production，端到端已验证（含印面叠字与漂移修复）。开发迭代继续在该分支；上线时步骤：

1. **配 env 先于 push**：`MESHY_API_KEY`（值问用户要，或从原机器 ~/seal-ai-hackathon/tools/meshy.key 迁移）→ Vercel project env（target=production）。`BLOB_READ_WRITE_TOKEN` 已随 blob store 连接存在勿动；`OUTBOUND_PROXY_URL` **不要配**（Vercel 直连即通，那只是本地调试用的）
2. 合并：主仓 `git checkout main && git merge --no-ff feature/3d-production`
3. 全量验证：typecheck / build / specimen-sheet 242 断言（跑法见 §4）
4. push → 轮询 v6/deployments 至 READY（命令在 ~/yinkedao/RELEASE-SOP.md）→ 冒烟：/3d-preview 路由 200 + 效果图页出现「生成 3D 效果图」入口
5. 线上真单验证花 30 Meshy credits，**先问用户**

该分支能力细节（验收基线）：
- POST /api/3d-model：从六宫格 SVG 提取照片裁 4 格（r0c0 白底正面=主视图/r1c0 侧光/r2c0 特写/r2c1 多角度）→ Meshy 建任务（降档 remesh 30k 面+2k 贴图）→ 返回 task_id；GET /api/3d-model/{id} 轮询，SUCCEEDED 时下载 glb 转 @vercel/blob（幂等）
- 实测：建模 4–5.7 分钟，glb 2.87–5.26MB（基线 52.9MB 的 1/10），昌化鸡血石语义还原正确
- /3d-preview 预览页：进度轮询、R3F 场景、印面叠字（崇曦贴图贴真端面，端面密度检测+姿态校正）、朱白文切换、「正视印面」（钤印方向反字）、「导出合成 GLB」（3.17MB）
- 已知遗留：石料复刻质感用户评价「能用但不够合格」（Phase 2 攻）；贴图固定「印可道」三字（待接崇曦引擎参数化）

### 2.2 崇曦字体 Phase 2（4-6 人日，产品核心承诺）

Phase 1 已冻结在 feature/chongxi-mainline。待办：
1. ~~字体入库~~ **已完成**（main 779bcf6，assets/fonts/chongxi/）；注意：chongxi 分支上该目录原被其 .gitignore 暂缓，合流时若 .gitignore 冲突以 main（已入库）为准
2. 视觉调参两实证改进点（第三方视觉复核结论，agent 自验曾过度自信）：**斑驳质感基本缺席**（需加做旧效果）、**留白过紧**（字贴框一线之隔，墨迹盒 88% 已是 3D 贴图侧的修正值，印蜕侧同步）
3. 「劉雨茜」第三字识读分歧（视觉模型读「蒼」，文件名是「茜」）——**请用户人眼裁定** /tmp/chongxi-visual/劉雨茜-zhuwen.svg.png（若原机器 /tmp 已失，用分支内崇曦链路重新生成同名样本）
4. 切默认栈：`SEAL_FONT_STACK=chongxi`（现默认 yishan 峄山碑；峄山碑降为应急回退）
5. **署名义务（CC-BY-ND-3.0-TW）**：「崇羲篆體·中研院小學堂」必须进关于页或页脚——注意：苗银关于页已被 F 批删除，**需新建印可道关于页作为署名落点**，这是 license 合规项不是可选项
6. CI 门禁：高频姓名 500 字映射后 cmap 查询 + 已知缺字 20 例
7. 合流冲突预案：chongxi 与 3d 分支都改过 components/design-render/RenderStudio.tsx，后合者手工解

### 2.3 3D Phase 2（质感与体验）
- 石料质感提升（用户裁决「不够合格」）：Meshy retexture 路线（10cr/次，换材质不重建模）/ 提贴图分辨率 / texture prompt 调整（石料词汇表在 lib/design/ 下，单一事实源）
- 任意印文参数化：make-face-textures.mjs 目前固定「印可道」→ 接崇曦字体引擎（与 2.2 完成后合流，挂载点已留 overlayProps 接口）
- 虚拟钤印（印面按到纸面出正字印蜕）——天然下一步
- 缓存：同 seed+order 查 blob seal-3d/ 前缀命中跳过建模（现仅 task 级幂等）
- 成本控制：跑批前查 Meshy /v1/balance；入口防抖+后端同 sheet hash 去重。**Meshy credits 已花 60+30（3 单），再跑先问用户**

### 2.4 C 线：文本 AI 解除 DEMO（半天）
线上访谈引导仍走降级模板（缺 key）。路线：智谱 bigmodel API（glm-4.7）配 env。**需用户提供智谱 API key**（Coding Plan 的 key 与 API key 是两套）。注意：F 批清理动了 lib/ai/ 目录（删了银饰旧客户端），接手后先确认访谈引擎（lib/design-interview/engine.ts）的文本调用链现状再配。

### 2.5 M8 文化匹配层（PRD 既定）
heritage 三件套（match/guardrail/evidence）已切 SealCulture-v1 篆刻数据（F 批完成，verify-sealculture.mjs 应全绿）→ 灰度版接线进访谈流程。

### 2.6 环境收尾
- 三 worktree 用完收：`git worktree remove ../yinkedao-3d ../yinkedao-ui`（确认分支已合并后）
- 主仓 stash@{0}（已弃用的旧生图改动备份）可清
- shop.randomplayx.com：整域 301 已随 F 批删除，该域名后续处置问用户

### 2.7 用户侧（不是 agent 的活，适时提醒）
- 智谱 API key（解 C 线）
- M1 石料采购续：shoushan/田黄 实拍图补 materials/（文件名含石种关键词即自动接线）
- P0 师傅背书
- Meshy key 用后轮换

## 3. 凭证与资产迁移清单（换机器必须处理）

| 项 | 位置（原机器） | 新机器怎么办 |
|---|---|---|
| Vercel 部署 token | ~/yinkedao/.vercel-token | 用户重新生成或 vercel CLI 登录；RELEASE-SOP.md 有用法（**任何输出禁回显明文**） |
| Meshy key | ~/seal-ai-hackathon/tools/meshy.key | 用户拷贝；上线 2.1 前必须就位 |
| DMXAPI key | ~/seal-ai-hackathon/tools/dmxapi.key | 线上 env 已配（本地开发才需要） |
| 崇曦字体 | ~~需迁移~~ | **已入库 main（779bcf6），clone 即得** |
| ~/seal-ai-hackathon/ 资产库 | gen-samples 样图 / 3d篆章 / 篆刻资料库 / tools | 大项，用户整体拷贝（约 300MB+） |
| blob store | i5y1y4ahjeuoicd3（公开桶） | 无需迁移，URL 直用 |

## 4. 环境事实与坑（血泪传承，勿重蹈）

1. **本地网络**：meshy.ai 直连 DNS 污染（解析到 Facebook IP）；Node 内建 fetch 不走代理 env（HTTPS_PROXY 无效）；HTTP 层用 `curl -x http://127.0.0.1:12450` 全通。**Vercel 服务端无任何此类问题**
2. **build**：`HTTPS_PROXY=http://127.0.0.1:12450 npm run build`（必须大写 H，小写不生效，Google Fonts 拉取失败）
3. **.next 陈旧缓存**：切分支后 typecheck 报「找不到某路由模块」= dev 缓存残留，`rm -rf .next` 即愈
4. **Turbopack dev**：sharp/undici 必须在 next.config.ts 的 serverExternalPackages 里，否则 dev 编译卡死（102% CPU）
5. **测试基线**：specimen-sheet 242 断言是可靠回归基线；test-design-render.mjs 本地 crash 是环境既有（fetch 出网），非回归，用基线对照法判断
6. **Vercel API**：用 v6/deployments（v13 报 Invalid API version）；vcp_ 开头 token 带 defaultTeamId，建资源注意 scope
7. **给用户浏览器嵌 3D 组件**：脚本必须本地化（ajax.googleapis.com 直连被墙，曾致 model-viewer 全挂）
8. **三模型展示页**（用户演示用）：~/seal-ai-hackathon/3d篆章/viewer-3models.html 需 `python3 -m http.server 8765` 起本地 server 后访问
9. **deploy SOP**：~/yinkedao/RELEASE-SOP.md 是部署唯一权威文档（token 用法/轮询/冒烟清单）

## 5. 工作模式约定（用户偏好，必须遵守）

- **门控铁律**：执行类步骤（写目标资产/推送/部署/外发请求/花 credits）未经用户放行不动手；纯读取/提问免门控
- 用户 Mac 操作不熟：给路径时主动 `open -R` 弹 Finder；UI 改动先截图给用户亲验
- 验收方式：UI/排版视觉验证优先；脚本/接口用测试+断言；agent 自验可能过度自信，关键视觉项用独立视觉模型复核或请用户人眼定夺
- 推送前全量验证（typecheck/build/基线测试），部署后线上冒烟（路由 200 + 关键功能点）
- 中文回复与代码注释
- 召回词：用户说「篆刻黑客松」或「印可道」调出项目记忆；「3D 生产化」「启动崇曦」是历史召回词（对应 §2.1/§2.2）

## 6. 接手第一步（只开发不部署模式）

1. `git clone` + `git log --oneline -10` 核对 §1 状态（main=bfd52c1 或更新，三分支在远端）
2. 本地开发就绪：`npm install` → `.env.local` 配 Meshy/DMXAPI key（问用户要）→ `npm run dev`（Turbopack 注意 §4.4）
3. 在 feature/3d-production 上继续开发迭代；**禁止**：push main、配 Vercel env、触发部署、花线上 credits（本地测试调 Meshy 前先问用户）
4. 上线（§2.1）只在做完用户认可的验收后、且用户明确说「上线」时执行
