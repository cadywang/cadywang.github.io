---
title: GitHub 使用指南（六）：从 0 到 1 的完整演练与避坑清单
date: 2026-10-23 11:30:00
tags: [GitHub, 工作流, 新手入门, 避坑, 教程]
categories: [教程]
description: 把前五篇串成一次完整演练：建仓、克隆、开分支、发 PR、等 CI、合并、发版、发布 Pages；再给出新手最常踩的坑与速查表。
---

前五篇按模块拆开讲，这一篇把它们串起来：**假设你从零开始，要在一天内完成「建仓库 → 改代码 → 发 PR → 合并 → 发版 → 上线」的全过程。**
每一步都给出网页与命令行两种做法，最后是新手最容易踩的坑和一张速查表。

> **GitHub 使用指南（6 篇）**
> 1. [入门：账号、仓库与第一次提交](/2026/10/23/github-guide-01-start/)
> 2. [Issues、Projects、Discussions 与 Wiki](/2026/10/23/github-guide-02-issues-projects/)
> 3. [Pull Request：从分支到合并](/2026/10/23/github-guide-03-pull-requests/)
> 4. [Actions、Releases 与 Packages](/2026/10/23/github-guide-04-actions-releases/)
> 5. [安全、组织与 Pages](/2026/10/23/github-guide-05-security-org/)
> 6. 从 0 到 1 的完整演练与避坑清单（本篇）

---

## 一、完整演练：从空目录到上线

### 第 1 步：建仓库（网页）

1. 右上 **+** → **New repository**。
2. 名称 `demo-site`，选 **Public**。
3. 勾选 **Add a README file**、**Add .gitignore (Node)**、**Choose a license (MIT)**。
4. **Create repository**。

### 第 2 步：配好 SSH 并克隆

```bash
ssh -T git@github.com            # 第一次要先配公钥，见第 1 篇
git clone git@github.com:<用户名>/demo-site.git
cd demo-site
git config user.name  "你的名字"
git config user.email "你的邮箱@example.com"
```

> 只改这个仓库的身份，不加 `--global`，避免影响你其它项目的提交署名。

### 第 3 步：开分支，做一次小改动

```bash
git switch -c docs/quick-start
cat > QUICKSTART.md <<'EOF'
# Quick start

1. `npm ci`
2. `npm run build`
EOF
git status
git add QUICKSTART.md
git commit -s -m "docs: add quick start"
git push -u origin docs/quick-start
```

推送后终端会打印 `pull/new/docs/quick-start` 链接。

### 第 4 步：开 PR（网页）

1. 打开终端里的链接（或 **Pull requests → New pull request**）。
2. 确认 **base: main** ← **compare: docs/quick-start**。
3. 填标题 `docs: add quick start`，描述里写清「改了什么、为什么、怎么验证」。
4. 点 **Create pull request**。

### 第 5 步：等 CI、看结果

1. PR 页面底部出现检查列表；点 **Details** 看日志。
2. 红了就本地修、再 `git commit` + `git push`（PR 会自动更新）。
3. 全部绿了之后，按仓库规则合并：**Merge pull request** / **Squash and merge** / **Rebase and merge**。

### 第 6 步：发版

1. **Code → Releases → Draft a new release**。
2. 新 tag 填 `v0.1.0`，标题 `v0.1.0`。
3. **Generate release notes** 自动汇总 PR。
4. **Publish release**。

### 第 7 步：发布 Pages（如果这是一个站点）

1. **Settings → Pages → Source** 选 **GitHub Actions**，按提示加一个 Pages workflow。
2. 或选 **Deploy from a branch**，指向构建产物所在分支/目录。
3. 等 Actions 跑完，访问 `https://<用户名>.github.io/demo-site/`。

---

## 二、纯网页版流程（不装 Git 也能完成）

1. **建仓**：+ → New repository → 勾 README。
2. **建分支**：Code → 分支选择器 → 输入 `docs/quick-start` → **Create branch**。
3. **改文件**：Add file → Create new file → 写完 → **Commit changes**，选
   **Create a new branch for this commit and start a pull request**。
4. **开 PR**：填标题/描述 → **Create pull request**。
5. **等 CI**：看底部检查；红了就点文件 → 铅笔改 → 提交到同一分支。
6. **合并**：绿色按钮 → 确认 → **Delete branch**。
7. **发版 / Pages**：同上面的第 6、7 步。

> 网页版适合文档和小改动；一旦涉及多文件重构、跑测试、解冲突，还是回本地用命令行。

---

## 三、新手最容易踩的 10 个坑

| # | 现象 | 原因 | 正确做法 |
| --- | --- | --- | --- |
| 1 | `fatal: not a git repository` | 不在仓库目录里 | `cd` 到仓库根目录；用 `git rev-parse --show-toplevel` 确认 |
| 2 | 提交后 GitHub 上没有 | 只 `commit` 没 `push` | `git push`；确认分支名与远端一致 |
| 3 | `detached HEAD` | `git checkout <commit>` 而不是分支 | `git switch -c 新分支` 把当前状态接住；或 `git switch main` |
| 4 | 推送被拒（protected branch） | 直接推了 `main` | 开分支 + PR |
| 5 | 推送被拒（non-fast-forward） | 远端有你的本地没有的提交 | `git pull --rebase` 后重推 |
| 6 | 把密码/token 提交了 | 写进了文件或 curl 命令 | 立刻撤销 token；改用环境变量/Secrets；开 push protection |
| 7 | 大文件推不上去 | 超过 GitHub 单文件限制（100 MB 硬限制） | 用 Git LFS：`git lfs install && git lfs track "*.psd"`，或不要把构建产物提交 |
| 8 | Windows 上换行符全变了 | CRLF/LF 混用 | 加 `.gitattributes`：`* text eol=lf`；必要时 `git add --renormalize .` |
| 9 | squash 合并后作者/署名变了 | squash 用一个新提交替代整条分支 | 需要保留原始提交就用 **Rebase and merge** |
| 10 | PR 巨大、没人愿意看 | 一次改太多 | 一个 PR 一件事；重构与功能分开 |

补充两个高频问题：

- **`.gitignore` 不生效**：已经被跟踪的文件不会因为加入 `.gitignore` 自动消失，
  需要 `git rm --cached <文件>` 再提交。
- **误删分支**：如果提交还没被合并，先 `git reflog` 找到 SHA，再 `git switch -c 恢复 <sha>`。

---

## 四、工具：除了网页和 Git 命令行

### 4.1 GitHub CLI（`gh`）

```bash
# 安装后登录一次（浏览器授权）
gh auth login

# 建仓库并推送
gh repo create demo-cli --public --source=. --push

# 发 PR、看检查、合并
gh pr create --title "docs: add quick start" --body "…"
gh pr checks --watch
gh pr merge --rebase --delete-branch

# 看 Actions
gh run list
gh run watch
```

> `gh` 适合脚本化：把「开 PR → 等 CI → 合并」写成一条流水线，比点网页快。

### 4.2 GitHub Desktop

图形界面，适合不熟命令行的同学：克隆、切换分支、提交、推送、开 PR 都有按钮。
复杂冲突还是建议命令行或编辑器（VS Code 的 Git 面板也够用）。

### 4.3 REST API / GraphQL / Webhooks

- **REST API**：`https://api.github.com`，用 token 认证；
- **GraphQL**：一次请求取多个对象，适合做仪表盘；
- **Webhook**：仓库 Settings → Webhooks，事件发生时 POST 到你自己的服务，适合做通知/自动化。

```bash
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
     https://api.github.com/repos/<用户名>/<仓库>/pulls?state=open
```

> 用 API 时同样要最小权限；token 只放在环境变量里，不要写进脚本再提交。

### 4.4 Codespaces

仓库 → 绿色 **Code** → **Codespaces** → **Create codespace on main**：
在浏览器里得到一个预装好依赖的 VS Code，改完直接提交/开 PR。
适合「换机器、不想配环境」的场景；注意免费额度与自动停止时间。

---

## 五、速查表

### 5.1 命令

| 目的 | 命令 |
| --- | --- |
| 看状态 | `git status` |
| 看差异 | `git diff` / `git diff --staged` |
| 开分支 | `git switch -c <name>` |
| 切分支 | `git switch <name>` |
| 拉取并变基 | `git pull --rebase` |
| 提交（带署名） | `git commit -s -m "scope: summary"` |
| 推送新分支 | `git push -u origin <branch>` |
| 安全强推 | `git push --force-with-lease` |
| 看历史 | `git log --oneline --graph --decorate -20` |
| 撤销未提交改动 | `git restore <file>` |
| 撤销最近一次提交（保留改动） | `git reset --soft HEAD~1` |
| 找回误删分支 | `git reflog` → `git switch -c <name> <sha>` |

### 5.2 网页入口

| 想做什么 | 路径 |
| --- | --- |
| 建仓库 | 右上 **+** → New repository |
| 改文件 | 仓库 → 文件 → 铅笔 / Add file |
| 开 PR | Pull requests → New pull request |
| 看 CI | Actions / PR 底部 Checks |
| 发版 | Code → Releases → Draft a new release |
| 配 Pages | Settings → Pages |
| 配密钥 | Settings → Secrets and variables → Actions |
| 配分支保护 | Settings → Branches / Rules |
| 配安全扫描 | Settings → Code security |
| 组织管理 | 组织页 → People / Teams / Settings |

### 5.3 一套「不会出错」的日常流程

```
1. git switch main && git pull
2. git switch -c <type>/<short-desc>
3. 改代码 + 本地跑测试
4. git add -p（只暂存想提交的部分）
5. git commit -s -m "<type>: <summary>"
6. git push -u origin <branch>
7. 开 PR，写清背景/改动/验证
8. 等 CI 绿、处理 review
9. 按仓库规则合并（rebase / squash / merge）
10. 删分支；需要时打 tag 发 Release
```

---

## 六、学习路径建议

1. **第 1 周**：把第 1、3 篇练熟——能独立完成「克隆 → 分支 → 提交 → PR → 合并」。
2. **第 2 周**：用 Issue 管自己的待办，把一个 PR 的 CI 配起来（第 2、4 篇）。
3. **第 3 周**：加上分支保护、Dependabot、Secret scanning（第 5 篇），把「规范」变成「门禁」。
4. 之后再考虑 Projects 自动化、Packages、Codespaces、Copilot。

> 记住一句话：**GitHub 的价值不在「能存代码」，而在「让改动可讨论、让错误在合并前暴露、让发布可复现」。**
> 流程看起来比「直接 push」麻烦，但它省下的是回滚、扯皮和半夜救火的时间。

---

## 七、系列索引

1. [入门：账号、仓库与第一次提交](/2026/10/23/github-guide-01-start/)
2. [Issues、Projects、Discussions 与 Wiki](/2026/10/23/github-guide-02-issues-projects/)
3. [Pull Request：从分支到合并](/2026/10/23/github-guide-03-pull-requests/)
4. [Actions、Releases 与 Packages](/2026/10/23/github-guide-04-actions-releases/)
5. [安全、组织与 Pages](/2026/10/23/github-guide-05-security-org/)
6. 从 0 到 1 的完整演练与避坑清单（本篇）