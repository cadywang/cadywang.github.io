---
title: GitHub 使用指南（五）：安全、组织与 Pages
date: 2026-10-23 11:00:00
tags: [GitHub, 安全, 组织, GitHub Pages, 权限]
categories: [教程]
description: 仓库角色与组织权限、2FA/SSH/PAT/签名、依赖与代码安全、组织与团队管理、Pages 发布网站，以及 Insights、Gist、Codespaces 等模块。
---

前四篇讲的是「怎么用」。这一篇讲「怎么用得安全、怎么在团队里管」：
权限模型、账号安全、依赖漏洞、组织与团队、以及用 GitHub Pages 把仓库变成网站。

这些模块平时存在感不高，但一旦出问题（token 泄露、误删仓库、依赖被投毒）代价很大。
建议按顺序把「账号安全」和「仓库安全」两节配置一遍。

> **GitHub 使用指南（6 篇）**
> 1. [入门：账号、仓库与第一次提交](/2026/10/23/github-guide-01-start/)
> 2. [Issues、Projects、Discussions 与 Wiki](/2026/10/23/github-guide-02-issues-projects/)
> 3. [Pull Request：从分支到合并](/2026/10/23/github-guide-03-pull-requests/)
> 4. [Actions、Releases 与 Packages](/2026/10/23/github-guide-04-actions-releases/)
> 5. 安全、组织与 Pages（本篇）
> 6. [从 0 到 1 的完整演练与避坑清单](/2026/10/23/github-guide-06-practice-tips/)

---

## 一、权限模型：先搞清楚「谁能做什么」

### 1.1 账号类型

| 类型 | 适合 | 说明 |
| --- | --- | --- |
| **Personal account** | 个人 | 个人仓库、Gist、Stars、Packages 都挂在它下面 |
| **Organization** | 团队/公司 | 仓库归组织所有，成员按团队授权；可以开审计日志、SSO |
| **Enterprise** | 大型组织 | 多组织管理、企业级策略 |

个人仓库可以**转移**到组织（Settings → General → Danger Zone → Transfer），转移后权限由组织统一管理。

### 1.2 仓库角色（Collaborator 权限）

邀请某人进仓库时（Settings → Collaborators），要选权限级别：

| 角色 | 能做什么 |
| --- | --- |
| **Read** | 看代码、开 Issue、看 PR |
| **Triage** | 管理 Issue/PR（打标签、指派、关闭），但不能改代码 |
| **Write** | 推代码、合并 PR、发 Release |
| **Maintain** | 管理仓库设置（不含删除/转移等危险操作） |
| **Admin** | 全部权限，包括删除仓库、改保护规则 |

> 最小权限原则：只读的人别给 Write；CI 机器人用细粒度 token，别用个人管理员账号。

### 1.3 组织与团队

| 概念 | 说明 | 网页位置 |
| --- | --- | --- |
| **People** | 组织成员 | 组织页 → People |
| **Teams** | 成员分组，按组授权 | 组织页 → Teams → New team |
| **Base permissions** | 成员对组织仓库的默认权限 | 组织 Settings → Member privileges |
| **Repository roles** | 自定义角色（Enterprise） | 组织 Settings → Repository roles |
| **Audit log** | 谁在什么时候改了什么 | 组织 Settings → Audit log |
| **SSO** | 强制通过公司身份登录 | 组织 Settings → Authentication security |

团队授权示例：`@cadywang/backend` 这个 team 对某仓库给 Write，团队里加人即自动获得权限。

---

## 二、账号安全：四件事

### 2.1 两步验证（2FA）

头像 → **Settings** → **Password and authentication** → **Enable two-factor authentication**。
推荐 TOTP（验证器 App）+ 保存恢复码。组织可以强制成员开启 2FA。

### 2.2 SSH 密钥

见第 1 篇：`ssh-keygen -t ed25519` → **Settings → SSH and GPG keys → New SSH key** → `ssh -T git@github.com` 验证。
一个账号可以加多把密钥（每台机器一把），丢了就单独撤销，不要所有机器共用一个。

### 2.3 Personal Access Token（PAT）

| 类型 | 特点 | 什么时候用 |
| --- | --- | --- |
| **Fine-grained** | 可限定到具体仓库 + 具体权限，有有效期 | 首选 |
| **Classic** | 按 scope 授权（`repo`、`workflow` 等），范围较粗 | 老工具只支持 classic 时 |

网页位置：**Settings → Developer settings → Personal access tokens**。
生成后只显示一次；用完及时撤销，定期轮换。**不要把 token 写进仓库、日志、截图。**

### 2.4 提交签名（可选但推荐）

要求「提交必须签名」时，需要 GPG 或 SSH 签名：

```bash
# 用现有 SSH 密钥做签名（Git 2.34+）
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
```

然后把公钥以 **Signing Key** 类型加到 **Settings → SSH and GPG keys**。
开启分支保护的 **Require signed commits** 后，未签名的提交无法合并。

---

## 三、仓库安全：依赖、代码与密钥

### 3.1 开启安全功能（网页）

仓库 → **Settings** → **Code security**（不同版本可能叫 Code security and analysis）：

| 功能 | 作用 |
| --- | --- |
| **Dependency graph** | 识别依赖与版本 |
| **Dependabot alerts** | 依赖有已知漏洞时告警 |
| **Dependabot security updates** | 自动开 PR 升级有漏洞的依赖 |
| **Code scanning** | 用 CodeQL 等工具扫代码漏洞 |
| **Secret scanning** | 检测提交里的密钥/token（公开仓库默认开启） |
| **Private vulnerability reporting** | 让研究者私下报告漏洞 |

### 3.2 Dependabot 版本更新

在 `.github/dependabot.yml` 里声明要更新的生态：

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    commit-message:
      prefix: "build"
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "ci"
```

Dependabot 会按配置开 PR；**bot 生成的 PR 在 commit 规范门禁里通常需要豁免**，
否则它的 `build: bump ...` 会被判成不合规（本博客与另外两个仓库都做了这个豁免）。

### 3.3 安全公告（Security advisories）

仓库 → **Security** → **Advisories** → **New draft security advisory**：
填受影响版本、描述、修复版本，发布后会生成安全公告，也可以申请 CVE。
适合「漏洞已经修好、需要通知用户」的场景。

### 3.4 发现密钥泄露怎么办

1. **立刻撤销**那个 token/密码（GitHub 的 PAT、云厂商的 key）；
2. 从代码里删除，并用环境变量/Secrets 替代；
3. 如果已经推到公开仓库，**改写历史不能挽回**（已被抓取），撤销才是关键；
4. 开启 secret scanning 的 **Push protection**，在推送阶段就拦截。

---

## 四、GitHub Pages：把仓库变成网站

### 4.1 两种发布方式

| 方式 | 适合 | 做法 |
| --- | --- | --- |
| **Deploy from a branch** | 纯静态文件 | Settings → Pages → Source 选分支与目录（`/` 或 `/docs`） |
| **GitHub Actions** | 需要构建（Hexo、Vue、Jekyll 等） | Source 选 **GitHub Actions**，用官方 Pages workflow 构建并部署 |

### 4.2 网页配置（完整流程）

1. 仓库 → **Settings** → **Pages**。
2. **Build and deployment → Source**：
   - 选 **Deploy from a branch** → 选分支（例如 `gh-pages` 或 `main`）与目录 → **Save**；
   - 或选 **GitHub Actions**，然后到 Actions 页面选一个 Pages 模板。
3. 等一次构建完成，页面顶部会出现站点地址：`https://<用户名>.github.io/<仓库名>/`。
4. 自定义域名：**Custom domain** 填域名 → **Save**，到 DNS 配 CNAME；勾选 **Enforce HTTPS**。

### 4.3 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 404 | 发布目录选错、构建还没跑完 | 看 Actions 是否成功；确认目录里有 `index.html` |
| 样式丢失 | 站点部署在子路径，资源用了绝对路径 | 配置 `baseurl` / `publicPath` |
| 自定义域名失效 | DNS 没生效、CNAME 文件被删 | 等 DNS；在仓库里保留 `CNAME` 文件 |
| HTTPS 不可选 | 证书还在签发 / DNS 未验证 | 等几分钟；确认域名解析正确 |

---

## 五、Insights 与其他模块

### 5.1 Insights

仓库 → **Insights**：

- **Pulse**：近期活跃度；
- **Contributors**：谁贡献了多少提交；
- **Traffic**：访问量、克隆数（需要权限）；
- **Commits / Code frequency**：提交节奏；
- **Dependency graph**：依赖图（安全功能的基础）。

### 5.2 Gist

<https://gist.github.com>：分享单文件或代码片段，有 Secret（不公开列出）与 Public 两种。
适合贴一条命令、一个配置示例；不适合放整个项目。

### 5.3 Codespaces / Copilot / Sponsors / Education

| 模块 | 一句话 | 入口 |
| --- | --- | --- |
| **Codespaces** | 浏览器里的云端开发环境（VS Code 内核），按小时计费/额度 | 绿色 Code → Codespaces |
| **Copilot** | AI 编码助手（需订阅/组织开通） | 个人 Settings → Copilot |
| **Sponsors** | 赞助开源作者 / 接受赞助 | 用户主页 Sponsor 按钮 |
| **Education** | 学生/教师免费 Copilot、Pro 等权益 | <https://education.github.com> |
| **Marketplace** | Actions、Apps、主题 | <https://github.com/marketplace> |

> 这些模块不影响日常协作，先把前四篇的主流程用熟，再按需开启。

---

## 六、小结

- 权限按最小化给：Read / Triage / Write / Maintain / Admin，组织用 Team 授权。
- 账号安全四件套：2FA、SSH、PAT（细粒度）、可选签名。
- 仓库安全：Dependabot + Code scanning + Secret scanning，密钥泄露先撤销再谈清理。
- Pages 两种发布方式：分支直出 vs Actions 构建；自定义域名记得配 DNS 与 HTTPS。
- Insights / Gist / Codespaces / Copilot 按需使用，别为了「全开」而全开。

> 下一篇：[从 0 到 1 的完整演练与避坑清单](/2026/10/23/github-guide-06-practice-tips/)