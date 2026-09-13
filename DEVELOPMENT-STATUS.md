# 印可道 · keplan 本地执行记录

日期：2026-09-13。开发分支：`feature/3d-production`。原计划：[keplan.md](keplan.md)。

## 已完成的代码工作

| 计划项 | 本轮结果 |
|---|---|
| 本地接手与合流 | 主线清理、崇曦字体资产与 `feature/chongxi-mainline` 已合入 3D 开发分支；保留原始字体和许可附件 |
| 崇曦 Phase 2 | 默认启用崇曦；墨迹盒统一 88%；增强确定性做旧；修正字形/边框原点偏移，以及中间缺字导致后续字错位的问题 |
| 字体署名 | 新建 `/about`，添加全站页脚及 SVG/GLB 导出署名 |
| 印文参数化 | 印蜕、3D 正反贴图与命令行工具共用同一渲染引擎；效果图页编辑的印文可传入 3D 页；缺字不输出生产贴图或合成 GLB |
| 3D 体验 | 接通正视印面按钮、本地模型缓存回退、加载错误提示；朱白切换不重新下载章体；虚拟钤印与正字 SVG 下载 |
| 石料质感路线 | 新增 4K、保留原 UV、带 PBR 的 retexture 接口与入口；仅服务端已保存的无字章体可进入 Meshy |
| 缓存与成本 | 照片/seed/材质参数哈希缓存；Blob 固定路径创建锁；建模前查余额；不确定创建结果保留锁；明确失败的任务可安全重建；收费默认关闭 |
| 文本 AI | 修复前端请求未包装 `answers` 的错误；支持智谱通用 API 与现有 Anthropic 配置；模型不合格输出回退后如实标记 `rule` |
| M8 | 将篆刻偏好匹配、证据与护栏接入访谈文化卡片，支持 `SEAL_CULTURE_ENABLED` 回退开关 |
| 环境与 CI | 清理 `.env.example` 旧品牌和成品店段；修正超时说明；移除未使用且有 peer 冲突的 model-viewer；增加离线后端检查脚本与 GitHub Actions 门禁 |

## 验证与边界

- 后端离线验证全部通过，共 **1256** 项断言：标本档案 242、SealCulture 数据 348、三件套 35、字体 Phase 2 559、3D Phase 2 20、访谈与 M8 52。
- `npm run build`、`npm run typecheck` 以及应用、组件、库、类型和脚本目录的 ESLint 检查通过；动态字体路径的整仓 tracing 警告已消除。
- 参数化命令行工具已用「劉雨茜」运行通过，输出四张正反 PNG 贴图、两张印蜕 SVG 与署名文件，位于 `tmp/seal-face/`。
- 本轮遵照用户要求不进行浏览器、截图或前端交互验收。
- 500 字样本按事先整理的字序选取，未按字体是否收录筛字；当前收录 **483/500**，不是「500 字全部覆盖」。
- 映射后缺字原输入：**闫、昝、逄、玥、喆、珺、璟、烨、祎、彧、堃、启、峰、斌、晗、煊、琦**。完整映射和 20 个缺字用例见 `scripts/fixtures/seal-name-500.json`。不擅自增加未经文化评审的替代字形。
- 创建请求发出后的网络中断无法证明是否扣费，锁不会自动过期重试。需要核对 Meshy 账户任务，将已创建的任务编号补回对应 `seal-3d/jobs/<hash>.json`；日志会保留已知的任务编号和哈希，不记录密钥或印文。

## 待用户验收或补充

1. 人眼确认 `tmp/chongxi-visual/劉雨茜-zhuwen.svg.png` 第三字是否可识读为「茜」；同目录有白文和 SVG 原稿。样本由当前字体渲染引擎生成，未做视觉验收。
2. 本机没有迁移真实 API 凭证。智谱需要通用 API Key；真实生图/3D 联调需要 DMXAPI、Meshy 和 Blob 配置。
3. 4K 重贴图路线已实现，石料质感是否达到要求仍需付费真单和用户视觉评判，本轮未调用收费接口。
4. 本地没有计划中原机器的多 worktree 或 stash，无需清理。域名处置、石料采购、师傅背书和密钥轮换仍由用户处理。
5. 本轮按用户后续要求提交并推送开发分支 `feature/3d-production`，不合入或推送 main，不配置 Vercel 环境。GitHub Actions 将在开发分支推送时运行，远端结果以对应提交的检查状态为准；生产上线仍需另行明确授权。

## 本地操作

```powershell
npm ci --no-audit --no-fund
# 仅在 .env.local 不存在时复制，避免覆盖已有密钥。
if (-not (Test-Path -LiteralPath '.env.local')) {
  Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
}
npm run test:backend
npm run build
npm run dev
```

`.env.example` 默认使用 mock 生图和关闭收费建模；没有智谱 Key 时访谈自动走规则模板。填写 Key 后保持 `DEMO_MODE=false` 可进入真实文本 AI。收费测试前需用户同意，再显式设置 `MESHY_GENERATION_ENABLED=true`。

## 接口依据

- [崇羲篆體原始授权](https://xiaoxue.iis.sinica.edu.tw/chongxi/copyright.htm)
- [Meshy Retexture API](https://docs.meshy.ai/en/api/retexture)
- [Meshy 余额 API](https://docs.meshy.ai/en/api/balance)
- [Meshy 计费说明](https://docs.meshy.ai/en/api/pricing)：当前建模档位约 30 credits、4K retexture 约 10 credits，真实扣费以账户为准。
- [智谱通用 HTTP API](https://docs.bigmodel.cn/cn/guide/develop/http/introduction)
