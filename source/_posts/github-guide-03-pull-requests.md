---
title: GitHub 使用指南（三）：Pull Request——从分支到合并
date: 2026-10-23 10:00:00
tags: [GitHub, Pull Request, 代码审查, 分支, 新手入门]
categories: [教程]
description: 从开分支、发 PR、代码审查，到三种合并方式的取舍、冲突解决与分支保护——把团队协作的核心流程完整走一遍。
---

前两篇讲的是「自己的代码怎么上去」和「事情记在哪」。真正让 GitHub 变成协作平台的，是 **Pull Request（PR）**：
你不再直接改主线，而是把一组改动放进分支，发起一个「请求合并」的提案，让别人看、让 CI 跑、最后再决定怎么合并。

PR 也是新手最容易紧张的地方：会不会把别人的代码弄坏？冲突了怎么办？Merge / Squash / Rebase 到底选哪个？
这篇把整条链路拆开讲，每一步都给出网页和命令行两种做法。

> **GitHub 使用指南（6 篇）**
> 1. [入门：账号、仓库与第一次提交](/2026/10/23/github-guide-01-start/)
> 2. [Issues、Projects、Discussions 与 Wiki](/2026/10/23/github-guide-02-issues-projects/)
> 3. Pull Request：从分支到合并（本篇）
> 4. [Actions、Releases 与 Packages](/2026/10/23/github-guide-04-actions-releases/)
> 5. [安全、组织与 Pages](/2026/10/23/github-guide-05-security-org/)
> 6. [从 0 到 1 的完整演练与避坑清单](/2026/10/23/github-guide-06-practice-tips/)

---

## 一、PR 到底在做什么

```
main      ──●──────────────●──────────────▶
              \          /
feature         ●──●──●─┘
             开分支      合入
```

- **分支（branch）**：从 `main` 拉出来的一条独立时间线，改动不会影响主线。
- **PR**：把「我的分支要合进 main」这件事变成一个可见、可讨论、可检查的对象。
- 合并之后，分支上的提交进入 `main`；分支本身可以删除。

PR 页面通常有四个页签：

| 页签 | 看什么 |
| --- | --- |
| **Conversation** | 描述、评论、审查意见、CI 状态、合并按钮 |
| **Commits** | 这个 PR 包含哪些提交 |
| **Checks** | CI 的每个 job 结果与日志 |
| **Files changed** | 逐文件的 diff，可以在这里写行内评论 |

---

## 二、完整流程（网页 + 命令行）

### 2.1 方式 A：命令行开分支、推送、发 PR（推荐）

```bash
git switch main
git pull                              # 先追上最新 main
git switch -c feature/login-fix       # 开分支
# ……改代码……
git add .
git commit -m "fix: handle empty token on the login page"
git push -u origin feature/login-fix
```

推送后终端会打印：

```
remote: Create a pull request for 'feature/login-fix' on GitHub by visiting:
remote:      https://github.com/<用户名>/<仓库>/pull/new/feature/login-fix
```

打开这个链接，就进入「New pull request」表单。

### 2.2 方式 B：纯网页完成

1. 仓库 → **Code** → 分支选择器（`main ▾`）→ 输入新分支名 → **Create branch: xxx**。
2. 在新分支上 **Add file / 编辑文件**，在提交对话框里选
   **Create a new branch for this commit and start a pull request**。
3. 直接进入 PR 表单，或者去 **Pull requests → New pull request** 手动选
   **base: main** ← **compare: 你的分支**。

### 2.3 PR 表单怎么填

| 字段 | 建议 |
| --- | --- |
| **Title** | 一句话说清这次改动，例如 `fix: handle empty token on the login page` |
| **Description** | 背景、改了什么、怎么验证、风险点；很多仓库会自动带出 PR 模板 |
| **Reviewers** | 指定审查人（右侧栏） |
| **Assignees** | 谁负责推进 |
| **Labels / Projects / Milestone** | 分类与排期 |
| **Create pull request** | 直接创建；旁边的下拉可以选 **Create draft pull request** |

**Draft PR（草稿）** 适合「先让大家看看方向」：不会触发「请求审查」，也不会被误合并；
准备好后点 **Ready for review**。

> PR 模板的作用：仓库里 `.github/pull_request_template.md` 会自动填进描述。
> 成熟的仓库会把「跑过哪些测试、勾选哪些检查」做成清单，CI 甚至能强制校验（本博客仓库就是这样）。

---

## 三、代码审查（Code Review）

### 3.1 在网页上审查

1. 打开 PR → **Files changed**。
2. 鼠标移到某一行，点左边的 **+** 写行内评论：
   - **Single comment**：单独一条评论；
   - **Start a review**：先把多条意见攒起来，最后一起提交。
3. 在评论框里可以直接改建议：

   ````markdown
   ```suggestion
   const token = value ?? '';
   ```
   ````

   作者点 **Commit suggestion** 就能采纳。
4. 看完后点右上 **Review changes**：
   - **Comment**：只评论，不表态；
   - **Approve**：同意合并；
   - **Request changes**：要求修改后才能合并（很多仓库把它设为必须）。
5. 每条讨论解决后点 **Resolve conversation**；开了「要求讨论全部 resolve」的仓库，没解决就不能合并。

### 3.2 作者怎么响应

- 直接推新提交到同一个分支，PR 会自动更新（不需要重开）。
- 改完后在评论里说明「已按建议修改」，并点 **Re-request review**。
- 被要求修改时，不要 force-push 覆盖审查历史（除非仓库明确允许）；追加提交更利于对比。

> 小技巧：审查时用 **Viewed** 勾选已看过的文件；大 PR 建议拆小，一次看 20 个文件比看 200 个有效得多。

---

## 四、三种合并方式：Merge / Squash / Rebase

PR 页面底部的绿色按钮可能是 **Merge pull request**、**Squash and merge** 或 **Rebase and merge**，
取决于仓库开启了哪些方式。它们的区别在历史形状：

| 方式 | 历史长什么样 | 适合 | 代价 |
| --- | --- | --- | --- |
| **Create a merge commit** | 多一个 merge 提交，分支历史完整保留 | 想保留「什么时候合的、合了哪些提交」 | 历史是网状的，`git log` 较乱 |
| **Squash and merge** | 整个 PR 压成 **一个** 提交 | 分支上有很多「wip」「fix typo」的碎提交 | 原始提交与署名被合并，提交信息变成 PR 标题/描述 |
| **Rebase and merge** | 分支提交逐个重放到 main 上，**没有** merge 提交 | 要求线性历史、保留每个提交原文 | 提交 SHA 会被重写；提交信息必须一开始就写对 |

> 本博客仓库与我的另外两个仓库都把规则设成 **只允许 Rebase and merge**。
> 原因很实际：squash 会把 PR 压成一个提交，标题变成 PR 标题、`Signed-off-by:` 也不再是原文；
> 一旦标题不合规范，等发现时历史已经改不回来。

不管用哪种方式，合并后都可以点 **Delete branch** 删掉分支（很多仓库设为自动删除）。

---

## 五、冲突（conflict）：为什么会发生、怎么解

冲突发生在「同一个文件的同一区域被两边改了」。GitHub 会在 PR 页面提示
**This branch has conflicts that must be resolved**。

### 5.1 本地解决（推荐）

```bash
git switch feature/login-fix
git fetch origin
git rebase origin/main          # 或 git merge origin/main
# 冲突文件里会出现 <<<<<<< ======= >>>>>>> 标记，手工改成最终内容
git add <冲突文件>
git rebase --continue           # merge 方式则直接 git commit
git push --force-with-lease
```

- `rebase` 让历史保持线性，但会重写提交；**推送时必须用 `--force-with-lease`**（比 `--force` 安全，
  别人在你之后推过东西时会拒绝）。
- `merge` 不重写历史，会多一个合并提交；团队允许 merge commit 时更省事。

### 5.2 网页解决（只适合简单冲突）

PR 页面点 **Resolve conflicts**，网页编辑器会显示冲突标记，改完点 **Mark as resolved** → **Commit merge**。
文件多、冲突复杂时会提示只能用本地方式。

---

## 六、分支保护与 CODEOWNERS

维护者可以在 **Settings → Branches**（经典保护）或 **Settings → Rules → Rulesets**（新版规则集）里限制 `main`：

| 选项 | 作用 |
| --- | --- |
| **Require a pull request before merging** | 禁止直推，必须走 PR |
| **Require approvals** | 至少 N 人批准 |
| **Dismiss stale approvals** | 有新提交后旧批准作废 |
| **Require review from Code Owners** | 指定目录必须由 CODEOWNERS 里的人审查 |
| **Require status checks to pass** | CI 必须绿（可设「必须追上最新 main」） |
| **Require conversation resolution** | 所有讨论必须 resolve |
| **Require linear history** | 禁止 merge commit，逼你用 squash/rebase |
| **Block force pushes / deletions** | 防止改写历史、误删分支 |
| **Require signed commits** | 只接受 GPG/SSH 签名的提交 |

**CODEOWNERS** 是一个放在 `.github/CODEOWNERS`（或根目录）的文件：

```
# 默认由谁负责
*                       @cadywang

# 特定目录
/docs/                  @cadywang
/agent/                 @alice @bob
```

开启「Require review from Code Owners」后，改了对应路径就必须由 owner 批准。

> 单人维护时通常把批准数设为 0（GitHub 不允许自己批准自己的 PR），
> 靠「PR + 必需检查 + 自己看一遍 diff」把关。

---

## 七、常见坑

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 推送被拒：`protected branch` / `GH006` | 直接推了 `main` | 开分支 → 发 PR |
| 推送被拒：`non-fast-forward` | 远端有你没有的提交 | `git pull --rebase` 后再推 |
| PR 里出现了别人的提交 | 分支基于旧 main，或从错误分支拉出 | `git rebase origin/main`；确认 base 分支 |
| 合并后提交作者变了 | 用了 squash | 改用 rebase，或接受这是 squash 的语义 |
| `git push --force` 把同事的提交冲掉 | 强推覆盖 | 用 `--force-with-lease`，并先 `git fetch` |
| PR 太大没人看 | 一次改太多 | 拆成多个小 PR，一个 PR 一件事 |
| 合并后 CI 红了 | 本地没跑检查 | 合并前看 Checks；本地先跑同样的命令 |

---

## 八、小结

- PR = 分支 + 提案 + 审查 + CI，是 GitHub 协作的核心。
- 流程：`开分支 → 提交 → 推送 → 开 PR → 审查/CI → 合并 → 删分支`。
- 合并方式要跟团队规则一致：保留原始提交用 **rebase**，想要一个干净提交用 **squash**。
- 冲突优先在本地解决；推送被拒先 `pull --rebase`。
- 分支保护不是限制，是「让错误在合并前暴露」的机制。

> 下一篇：[Actions、Releases 与 Packages](/2026/10/23/github-guide-04-actions-releases/)