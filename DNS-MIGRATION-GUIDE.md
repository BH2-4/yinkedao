# eurekadelta.com DNS 迁移 Cloudflare + 印可道上线 完整指南

> 目标：把 `eurekadelta.com` 的 DNS 从 Spaceship 切到 Cloudflare，让 **https://yinkedao.eurekadelta.com** 正式上线。
> 当前状态：代码已在 Vercel 构建完成（READY），**唯一剩余就是本指南的 DNS 操作**。
> 预计耗时：你操作约 5-8 分钟；生效等待几分钟至几小时（最长 24h）。
> 日期：2026-09-06

---

## 背景一览（为什么这样做）

| 组件 | 角色 | 状态 |
|---|---|---|
| Vercel | 站点托管（已构建） | ✅ 就绪，等域名解析 |
| Cloudflare | 新 DNS 管理商（更优） | 待你添加站点 |
| Spaceship | 域名注册商（现有 DNS） | 待你切换 NS |
| 现有记录 | 主域 2 条 A 记录（54.149.79.189 / 34.216.117.25） | 迁移时照搬，防丢失 |

原理：把「DNS 权威」从 Spaceship 移交 Cloudflare（改 NS），然后在 CF 上管理所有解析（含 yinkedao 子域指向 Vercel）。

---

## 第 1 步：Cloudflare 添加站点（约 2 分钟）

1. 浏览器打开 **https://dash.cloudflare.com** → 登录（没有账号就注册一个，免费）
2. 首页点 **「+ Add a domain」**（或 Add site）
3. 输入 `eurekadelta.com` → **Continue**
4. 选套餐：选 **Free（¥0）** → Continue
5. Cloudflare 会自动扫描现有 DNS 记录：
   - 如果扫出了 2 条 A 记录（54.149.79.189 / 34.216.117.25）→ 保留，直接 Continue
   - 如果没扫出来 → 手动添加（Add record）：
     | Type | Name | IPv4 address | Proxy status |
     |---|---|---|---|
     | `A` | `@` | `54.149.79.189` | **DNS only（灰云）** |
     | `A` | `@` | `34.216.117.25` | **DNS only（灰云）** |
6. **关键一步：加 yinkedao 记录**（CF 扫描不会带出这条，必须手动加）：
   - 点 **Add record**，照抄：

   | Type | Name | Target | Proxy status |
   |---|---|---|---|
   | `CNAME` | `yinkedao` | `cname.vercel-dns.com` | ⚠️ **DNS only（灰云！）** |

   > **灰云警告**：Proxy status 必须点成 **DNS only**（云朵图标是灰色）。如果开橙色云（Proxied），Vercel 的证书验证可能失败，站点会打不开。等上线稳定后想开代理再改，且必须配 SSL/TLS → Full (strict)（见附录 FAQ）。

7. Continue → 最后页面 Cloudflare 会显示 **2 条 Nameserver**，长得像：
   ```
   something.ns.cloudflare.com
   another.ns.cloudflare.com
   ```
   **⚠️ 把这两条复制保存下来**（下一步要用；具体值以你页面显示为准，不是示例这两个）

---

## 第 2 步：Spaceship 切换 Nameserver（约 2 分钟）

1. 浏览器打开 **https://www.spaceship.com** → 登录
2. 顶部菜单 **Domains**（或 Manage → Domains）→ 点击 `eurekadelta.com`
3. 找到 **「Name servers」** 区域（若显示的是 Spaceship 默认 NS，如 `launch1.spaceship.net` / `launch2.spaceship.net`，说明找对地方了）
4. 点 **Change / Edit** → 选 **Custom name servers**（自定义）
5. 填入第 1 步复制的 Cloudflare 两条 NS：
   - Nameserver 1：`（CF 给的第一条）`
   - Nameserver 2：`（CF 给的第二条）`
6. 保存（Save / Confirm）

> 提示：Spaceship 界面若提示"将放弃Spaceship DNS"之类警告，属正常——我们就是要移交权威到 Cloudflare，记录已在 CF 建好，不会丢。

---

## 第 3 步：等待生效（无需操作）

- Cloudflare 侧：zone 状态从 **Pending** 变 **Active**（刷新 dash.cloudflare.com 首页可见；通常几分钟~几小时，官方上限 24h）
- 生效标志：`yinkedao.eurekadelta.com` 开始解析到 Vercel

**期间可以随时验证**（浏览器或问 AI 助手「查 DNS」）：

```
dig yinkedao.eurekadelta.com CNAME
```
返回 `cname.vercel-dns.com` 即已生效。

---

## 第 4 步：打开正式站（最终验证）

浏览器访问：**https://yinkedao.eurekadelta.com**

应看到（与本地 localhost:3000 一致）：

- [ ] 白色主题首页（白底墨字 + 朱砂红强调 + 篆章大图）
- [ ] 顶部品牌「印可道 / YIN KEDAO」
- [ ] `/design-interview` 五维度访谈可走
- [ ] `/design-brief` 输入印文、改参数 URL 实时编码、刷新恢复
- [ ] `/design-render` 峄山碑印蜕渲染（红底白字、传统字序）+ DEMO MODE 标注
- [ ] 地址栏无证书警告（Vercel 自动签发 Let's Encrypt，DNS 生效后几分钟内完成）

首次打开若提示证书问题：等 5 分钟刷新——Vercel 在解析生效后才触发签发。

---

## 附录 A：常见问题

| 问题 | 处理 |
|---|---|
| 打不开 / DNS 不生效 | 确认第 2 步 NS 已保存；`dig NS eurekadelta.com` 应返回 cloudflare 的 NS；CF zone 页看是否 Active |
| 证书警告持续 | 确认 yinkedao 记录是**灰云**（DNS only）；Vercel 后台 Domains 里该域名状态应为 Valid Configuration |
| 想开橙色云（CF 代理/CDN） | 上线稳定后再开；开之前必须 **SSL/TLS → Overview → 设为 Full (strict)**；**严禁 Flexible**（会无限重定向） |
| 主域 eurekadelta.com 原来的 2 条 A 还要吗 | 若已无服务在用，可在 CF 里删（留着也无害）；canvas 等未来产品在 CF 直接加记录即可 |
| 回滚 | Spaceship 把 Name servers 改回 `launch1/2.spaceship.net` 即回到原状 |

## 附录 B：后续 DNS 全自动化（可选）

以后想让 AI 助手自动管理这个域名的 DNS（加子域/改记录），只需一次性给 Cloudflare API Token：

1. dash.cloudflare.com → 右上头像 → **My Profile** → **API Tokens** → **Create Token**
2. 选模板 **「Edit zone DNS」** → Zone Resources 选 Specific zone → `eurekadelta.com`
3. Create 后复制 token，存为 `~/.yinkedao-cf-token`（或直接发给 AI 助手会话）
4. 之后说「加个 xxx.eurekadelta.com 记录」即可全自动

## 附录 C：本次上线的完整链路（备查）

```
代码（7 commit：A-D 批+小篆印蜕+白主题）
  → git push origin main ✅（2026-09-06）
  → Vercel 自动构建 READY（~90s）✅
  → 域名 yinkedao.eurekadelta.com 已绑定 Vercel（verified）✅
  → DNS：Cloudflare 权威（本指南第 1-2 步）⏳ 你操作
  → 证书自动签发 + 正式上线 ⏳
```

---

*本指南由部署 agent 规划、主对话整理。操作遇到任何一步对不上界面，回来描述看到的页面，AI 助手实时指路。*
