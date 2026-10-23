---
title: GitHub 使用指南（一）：账号、仓库与第一次提交
date: 2026-10-23 09:00:00
tags: [GitHub, Git, 版本控制, 新手入门, 教程]
categories: [教程]
description: 从注册账号、配置 SSH、创建仓库，到在网页和命令行里完成第一次提交——把新手最容易卡住的每一步拆开讲。
---

很多人第一次打开 GitHub 会愣住：左边是代码，上面一排 Code / Issues / Pull requests / Actions / Security / Insights / Settings，
右边还有 Watch / Fork / Star。**它不只是一个"放代码的网盘"，而是一整套协作系统。**

这个系列按模块拆开讲，目标很明确：**没接触过 GitHub 的人，照着做能把自己的代码传上去、能和别人协作、能看懂 CI 的结果。**
本篇只做两件事：认路（模块地图），以及完成第一次提交。

> **GitHub 使用指南（6 篇）**
> 1. 入门：账号、仓库与第一次提交（本篇）
> 2. [Issues、Projects、Discussions 与 Wiki](/2026/10/23/github-guide-02-issues-projects/)
> 3. [Pull Request：从分支到合并](/2026/10/23/github-guide-03-pull-requests/)
> 4. [Actions、Releases 与 Packages](/2026/10/23/github-guide-04-actions-releases/)
> 5. [安全、组织与 Pages](/2026/10/23/github-guide-05-security-org/)
> 6. [从 0 到 1 的完整演练与避坑清单](/2026/10/23/github-guide-06-practice-tips/)

---

## 一、Git 和 GitHub 不是一回事

先把最容易混淆的概念分开：

| 概念 | 是什么 | 装在哪 | 负责什么 |
| --- | --- | --- | --- |
| **Git** | 版本控制工具（命令行程序） | 你的电脑 | 记录每次改动、管理分支、合并历史 |
| **GitHub** | 托管 Git 仓库的网站 + 协作平台 | 浏览器 / 云端 | 存代码、开 Issue、做代码审查、跑 CI、发版 |
| **仓库（Repository）** | 一个被 Git 管理的项目目录 | 本地 + 云端各一份 | 代码、文档、Issue、PR、Actions 都在里面 |

> 关键点：**Git 是工具，GitHub 是服务。** 你可以在没有 GitHub 的情况下用 Git；但 GitHub 的所有协作功能都建立在 Git 之上。
> 所以本系列会同时讲「网页上点什么」和「命令行敲什么」——两者操作的是同一份数据。

---

## 二、GitHub 的模块地图

右上角头像、仓库顶部页签、个人设置里，藏着十几块功能。先把地图记住：

| 模块 | 一句话作用 | 入口 | 本系列 |
| --- | --- | --- | --- |
| **Repositories（仓库）** | 存代码与文档 | 头像 → Your repositories | 本篇 |
| **Code（代码）** | 文件树、提交历史、分支 | 仓库 → Code | 本篇 |
| **Issues（议题）** | 记录 bug、需求、待办 | 仓库 → Issues | 第 2 篇 |
| **Projects（项目）** | 跨 Issue/PR 的看板与计划 | 仓库 → Projects | 第 2 篇 |
| **Discussions（讨论）** | 问答、公告、社区交流 | 仓库 → Discussions（需开启） | 第 2 篇 |
| **Wiki** | 轻量知识库 | 仓库 → Wiki（需开启） | 第 2 篇 |
| **Pull requests（PR）** | 提议合并、代码审查 | 仓库 → Pull requests | 第 3 篇 |
| **Actions（自动化）** | CI/CD，跑测试、构建、发布 | 仓库 → Actions | 第 4 篇 |
| **Releases / Tags** | 版本发布与变更说明 | 仓库 → Code → Releases | 第 4 篇 |
| **Packages** | 发布依赖包（npm、容器等） | 个人/组织 → Packages | 第 4 篇 |
| **Security** | 依赖漏洞、代码扫描、密钥扫描 | 仓库 → Security | 第 5 篇 |
| **Insights** | 提交/访问统计、贡献者 | 仓库 → Insights | 第 5 篇 |
| **Pages** | 把仓库发布成网站 | 仓库 → Settings → Pages | 第 5 篇 |
| **Settings** | 仓库设置、权限、分支保护 | 仓库 → Settings | 第 3、5 篇 |

> 页签会随仓库启用的功能变化：没开 Wiki 就没有 Wiki 页签，没开 Discussions 就没有 Discussions。
> 这些开关都在 **Settings → General → Features** 里。

---

## 三、账号与安全：先把「能安全地推代码」准备好

### 3.1 注册与基本设置（网页）

1. 打开 <https://github.com>，点 **Sign up**，填邮箱、密码、用户名。
2. 用户名会出现在所有仓库地址里（`github.com/<用户名>/<仓库名>`），**改起来很麻烦**，建议用稳定的英文 ID。
3. 注册后到邮箱点验证链接。
4. 头像 → **Settings** → **Public profile**：可以填姓名、公司、所在地、个人主页；也可以勾选隐藏邮箱，避免公开真实邮箱。

### 3.2 开启两步验证（强烈建议）

头像 → **Settings** → **Password and authentication** → **Two-factor authentication** → **Enable**。
可以选择验证器 App（TOTP）或安全密钥。开启后会给你一组**恢复码**，抄下来离线保存——
手机丢了、验证器没了，就靠它找回账号。

### 3.3 配置 SSH（推荐，一次配置长期使用）

HTTPS 方式推送每次都要认证；SSH 配好之后 `push` 不再问密码。

**第一步：在本机生成密钥**（没有再用旧密钥的情况下）：

```bash
ssh-keygen -t ed25519 -C "你的邮箱@example.com"
# 一路回车即可；想要口令保护就设置一个 passphrase
```

生成的公钥在 `~/.ssh/id_ed25519.pub`（Windows 是 `C:\Users\<你>\.ssh\id_ed25519.pub`）。

**第二步：把公钥贴到 GitHub**

1. 头像 → **Settings** → **SSH and GPG keys** → **New SSH key**。
2. **Title** 填一个能认出机器的名字（例如 `work-laptop`）。
3. **Key type** 保持 `Authentication Key`，把公钥**整段**粘进去（以 `ssh-ed25519` 开头）。
4. 点 **Add SSH key**。

**第三步：验证**

```bash
ssh -T git@github.com
# 看到 "Hi <用户名>! You've successfully authenticated..." 就成功了
```

### 3.4 如果只能用 HTTPS：用 PAT，不要用账号密码

GitHub 早已不支持用登录密码做 Git 认证。HTTPS 方式需要一个 **Personal Access Token（PAT）**：

1. 头像 → **Settings** → **Developer settings** → **Personal access tokens**。
2. 选 **Fine-grained tokens**（推荐）→ **Generate new token**。
3. 填名称、过期时间，**Repository access** 选具体仓库或全部仓库。
4. 在 **Permissions** 里按需勾选：只读写代码通常需要 **Contents: Read and write**；
   要发 PR 还需要 **Pull requests: Read and write**。
5. 生成后**只显示一次**，马上复制保存。

> 安全底线：token 等于密码。不要提交进仓库、不要贴进聊天记录、不要写进脚本里的明文变量。
> 更稳妥的做法是放进系统环境变量或密钥管理工具，并设置较短的有效期。

---

## 四、创建第一个仓库（网页流程）

1. 右上角 **+** → **New repository**。
2. **Repository name**：例如 `hello-github`（建议小写、用 `-` 分隔）。
3. **Description**：一句话说明它是什么（可选，但建议写）。
4. **Public / Private**：
   - Public：所有人可见，适合开源、作品集；
   - Private：只有你和被邀请的人可见，适合公司项目、练习。
5. **Initialize this repository with**（第一次建仓建议勾上）：
   - **Add a README file**：仓库首页会显示它，新手必备；
   - **Add .gitignore**：选一个模板（例如 `Node` / `Python` / `VisualStudio`），自动忽略不需要提交的文件；
   - **Choose a license**：开源项目建议选 MIT / Apache-2.0。
6. 点 **Create repository**。

创建完成后你会看到仓库主页：

```
┌──────────────────────────────────────────────────────────┐
│ cadywang / hello-github          ★ Star  ⑂ Fork  👁 Watch │
├──────────────────────────────────────────────────────────┤
│ Code  Issues  Pull requests  Actions  Projects  Wiki ...  │
│                                                          │
│  main ▾   ← 分支选择器                                    │
│  README.md            Add file ▾      <> Code ▾ (克隆)     │
└──────────────────────────────────────────────────────────┘
```

### 4.1 完善仓库的「门面」

- 点右侧 **About** 旁边的齿轮：填 **Description**、**Website**、**Topics**（用空格分隔的关键词，例如 `python cli tutorial`）。
- README 是别人对仓库的第一印象：写清楚「它是做什么的、怎么安装、怎么用、怎么贡献」。
- **Watch / Fork / Star** 的区别：
  - **Star**：收藏 + 表达喜欢，出现在你的 Stars 列表；
  - **Fork**：把别人的仓库复制一份到你账号下，之后可以自由修改、发 PR；
  - **Watch**：订阅这个仓库的通知（参与/全部/忽略），别乱点，否则邮箱会被刷屏。

---

## 五、网页上改文件（不改代码也能用）

### 5.1 新建文件

1. 进入仓库 → **Add file** → **Create new file**。
2. 文件名框里可以输 `docs/start.md` 这样的路径，GitHub 会自动建目录。
3. 在编辑区写内容（支持 Markdown 预览：**Preview** 页签）。
4. 拉到页面下方 **Commit changes**：
   - **Commit message**：写清楚这次改了什么（例如 `docs: add quick start`）；
   - **Extended description**：可选；
   - 选择 **Commit directly to the `main` branch**，或 **Create a new branch for this commit and start a pull request**。
5. 点 **Commit changes**。

> 新手最容易踩的坑：在网页上直接往 `main` 提交。多人项目里 `main` 通常有分支保护，
> 你会被要求开分支 + 发 PR——这正是第 3 篇的内容。

### 5.2 上传文件

仓库 → **Add file** → **Upload files** → 把文件拖进去 → 填提交信息 → **Commit changes**。
适合上传图片、文档、压缩包（注意大文件走 Git LFS，见第 6 篇）。

### 5.3 修改与删除

- 打开文件，右上角 **铅笔图标** = 编辑；**垃圾桶图标** = 删除。
- 历史版本：文件页右上角 **History**，可以看到每次提交的 diff；
  单行左侧的 **Blame** 能看出这一行是谁、哪次提交改的。
- 想下载单个文件：**Raw**；整个仓库：绿色 **Code** 按钮 → **Download ZIP**。

### 5.4 网页的边界

网页适合：改文档、修错别字、小改动、快速发起 PR。
不适合：跑测试、批量改文件、处理冲突、管理复杂分支——这些在本地用命令行更稳。

---

## 六、本地工作流：clone → 改 → commit → push

### 6.1 装 Git 并做一次性配置

```bash
git --version                     # 确认已安装；没有就装 Git for Windows / Xcode CLT / apt install git
git config --global user.name  "你的名字"
git config --global user.email "你的邮箱@example.com"
git config --global init.defaultBranch main
```

> `user.name` / `user.email` 会写进每个提交，是「谁改的」的依据。**不要随便填**，
> 它要和你 GitHub 账号的提交记录对得上。

### 6.2 克隆仓库

仓库页 → 绿色 **Code** 按钮 → 选 **SSH**（推荐）或 **HTTPS** → 复制地址：

```bash
git clone git@github.com:<用户名>/hello-github.git
cd hello-github
```

### 6.3 每天都会用到的五条命令

| 命令 | 作用 | 什么时候用 |
| --- | --- | --- |
| `git status` | 看工作区/暂存区状态 | 每次提交前 |
| `git add <文件>` | 把改动放进暂存区 | 准备提交 |
| `git commit -m "..."` | 生成一次提交 | 一小步做完 |
| `git pull` | 把远端更新拉下来 | 开始工作前、推送失败时 |
| `git push` | 把本地提交推到 GitHub | 提交完成后 |

一个典型循环：

```bash
git pull                          # 先同步
# ……改文件……
git status                        # 看清改了什么
git add README.md
git commit -m "docs: add install steps"
git push
```

### 6.4 分支：为什么不能一直在 main 上改

`main` 是「随时可发布」的主线。所有改动先放到分支上，做完再合并（PR 流程）：

```bash
git switch -c docs/install-steps     # 新建并切换到分支
git add .
git commit -m "docs: add install steps"
git push -u origin docs/install-steps
# 推送后终端会打印一个 "Create a pull request" 链接
```

- `git switch -c <名字>`：创建并切换分支（老教程里的 `git checkout -b` 等价）。
- `git switch main`：回到主线。
- `git branch -vv`：看本地分支及它们跟踪的远端分支。

---

## 七、提交信息：写给三个月后的自己

GitHub 上每次提交都会永久留在历史里。好的提交信息让 `git log` 和 PR 变得可读：

```
docs: add install steps

Explain the Windows and macOS setup separately; the previous paragraph
assumed a POSIX shell and confused the first-time readers.

Signed-off-by: cadywang <cadywang@users.noreply.github.com>
```

| 规则 | 说明 |
| --- | --- |
| 第一行是摘要 | `<范围>: <祈使句>`，例如 `docs: fix broken link`，不超过 72 字符 |
| 空一行再写正文 | 正文说「为什么改」，不是逐行复述 diff |
| 一次提交一件事 | 方便回滚、方便 review、方便 `git bisect` |
| 用祈使语气 | `add` / `fix` / `remove`，不要写 `added` / `fixes` |
| 署名（可选但推荐） | `git commit -s` 会加 `Signed-off-by:`，很多项目据此做 DCO 检查 |

---

## 八、仓库设置：新手也该知道的几个开关

仓库 → **Settings**：

| 位置 | 能做什么 |
| --- | --- |
| **General → Default branch** | 改默认分支（例如从 `master` 改成 `main`） |
| **General → Features** | 开关 Issues / Projects / Wiki / Discussions |
| **General → Danger Zone** | 改可见性、转移仓库、**删除仓库**（不可恢复，慎点） |
| **Branches / Rules** | 分支保护、必需检查（第 3 篇） |
| **Actions → General** | 控制 Actions 权限、允许哪些 Action |
| **Pages** | 把仓库发布成网站（第 5 篇） |
| **Secrets and variables** | 存放 CI 用的密钥（第 4 篇） |

---

## 九、速查：第一次提交的最小路径

```bash
# 1) 一次性配置
git config --global user.name  "你的名字"
git config --global user.email "你的邮箱@example.com"
ssh -T git@github.com                 # 看到 Hi <用户名> 就 OK

# 2) 克隆
git clone git@github.com:<用户名>/hello-github.git
cd hello-github

# 3) 开分支、改、提交、推送
git switch -c docs/first-change
git add .
git commit -m "docs: add a first change"
git push -u origin docs/first-change
```

推送后打开终端里打印的链接，就是第 3 篇要讲的 **Pull Request**。

---

## 十、小结

- Git 管版本，GitHub 管协作；网页和命令行操作的是同一份仓库。
- 先把账号安全配好：2FA + SSH（或 PAT），不要用密码推代码。
- 建仓时顺手加 README / .gitignore / License，能省掉以后很多麻烦。
- 日常循环就五条命令：`status` / `add` / `commit` / `pull` / `push`。
- 别在 `main` 上直接改：开分支 → 提交 → 推送 → PR。

> 下一篇：[Issues、Projects、Discussions 与 Wiki](/2026/10/23/github-guide-02-issues-projects/)