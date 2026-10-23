---
title: GitHub 使用指南（二）：Issues、Projects、Discussions 与 Wiki
date: 2026-10-23 09:30:00
tags: [GitHub, Issues, Projects, 协作, 新手入门]
categories: [教程]
description: 用 Issues 记录待办、用 Projects 做计划、用 Discussions 做问答、用 Wiki 写知识库——四个协作模块的网页操作流程与使用边界。
---

代码只是协作的一部分。一个项目真正费时间的是：**谁在做什么、问题记在哪、讨论沉淀到哪。**
GitHub 把这部分拆成四个模块：Issues、Projects、Discussions、Wiki。

本篇按「什么时候用哪个」来讲，每个模块都给完整的网页操作步骤。

> **GitHub 使用指南（6 篇）**
> 1. [入门：账号、仓库与第一次提交](/2026/10/23/github-guide-01-start/)
> 2. Issues、Projects、Discussions 与 Wiki（本篇）
> 3. [Pull Request：从分支到合并](/2026/10/23/github-guide-03-pull-requests/)
> 4. [Actions、Releases 与 Packages](/2026/10/23/github-guide-04-actions-releases/)
> 5. [安全、组织与 Pages](/2026/10/23/github-guide-05-security-org/)
> 6. [从 0 到 1 的完整演练与避坑清单](/2026/10/23/github-guide-06-practice-tips/)

---

## 一、Issues：把「要做的事」变成可追踪的条目

### 1.1 它是什么

Issue 是仓库里的一条「工单」：bug、需求、文档缺口、讨论都可以是 Issue。
每条 Issue 有编号（`#12`）、标题、正文、标签、指派人、里程碑、项目归属，以及一条时间线
（评论、提交引用、状态变化）。Issue 编号和 PR 共用同一个序列，所以 `#12` 既可能是 Issue 也可能是 PR。

### 1.2 网页新建 Issue（完整流程）

1. 进入仓库 → 点 **Issues** 页签。
2. 点绿色 **New issue**。
   - 如果仓库配置了模板，会先出现模板选择页（例如 `Bug report` / `Feature request`）；
   - 选一个模板，正文会自动带出需要填的字段。
3. 填 **Title**：一句话说清问题，例如 `登录页在 Safari 下白屏`。
4. 填正文（支持 Markdown）：
   - 环境 / 版本 / 复现步骤 / 期望结果 / 实际结果；
   - 可以直接 `@用户名` 通知别人、`#12` 引用别的 Issue/PR；
   - 用 `- [ ] 待办` 写任务清单，勾选状态会被 GitHub 记住。
5. 右侧栏（提交前就能设置）：
   - **Assignees**：指派给谁；
   - **Labels**：分类，例如 `bug`、`docs`、`good first issue`；
   - **Projects**：放进项目看板；
   - **Milestone**：归到某个版本/迭代。
6. 点 **Submit new issue**。

### 1.3 关闭、重开与「关联 PR」

- Issue 底部评论框旁有 **Close issue**；关闭后还能 **Reopen**。
- 关闭时有 **Close as completed** / **Close as not planned** 两种语义，团队统计时能区分。
- **在 PR 描述里写 `Fixes #12` / `Closes #12`**，PR 合并时 GitHub 会自动关闭对应 Issue。
  这是最常用的「代码与问题挂钩」的方式；也可以在提交信息里写。

### 1.4 标签、里程碑与模板（维护者视角）

| 功能 | 网页位置 | 用途 |
| --- | --- | --- |
| **Labels** | Issues → **Labels** → **New label** | 分类：`bug` / `enhancement` / `docs` / `question` |
| **Milestones** | Issues → **Milestones** → **New milestone** | 归到版本或迭代，会显示完成百分比 |
| **Issue templates** | Settings → General → Issues → **Set up templates**，或仓库里加 `.github/ISSUE_TEMPLATE/*.yml` | 让提交者按格式填写 |
| **Pinned issues** | Issues 列表 → 右上 **Pin issue** | 把重要 Issue 固定在列表顶部 |

### 1.5 搜索与筛选

Issues 列表上方的搜索框支持限定符：

```
is:open label:bug assignee:@me
is:closed milestone:v1.0 sort:updated-desc
no:assignee label:docs
```

常用的可以在搜索后点 **Save** 存成过滤器，下次一键打开。

---

## 二、Projects：跨 Issue/PR 的计划视图

Issue 是「条目」，Projects 是「把这些条目排进计划」。

### 2.1 网页新建 Project（完整流程）

1. 仓库 → **Projects** 页签 → **New project**（个人主页的 Projects 页签也可以建跨仓库项目）。
2. 选模板：
   - **Table**：表格式，适合管理字段；
   - **Board**：看板（Todo / In Progress / Done），适合日常推进；
   - **Roadmap**：时间线，适合排期。
3. 填项目名称，点 **Create**。
4. 项目里点 **+ Add item**，可以：
   - 直接输入标题新建草稿 Issue；
   - 搜索并添加已有 Issue/PR。
5. 右侧的 **Fields** 可以加自定义字段：文本、数字、日期、单选（例如 `Priority: P0/P1/P2`）。
6. **Views** 页签可以保存多个视图（按状态分组、只看我的、只看某标签）。
7. 项目右上 **⋯ → Workflows** 内置自动化：
   - Issue 创建时自动加入项目；
   - PR 合并后自动把条目标为 Done；
   - 关闭的 Issue 自动归档。

### 2.2 什么时候该用

| 场景 | 建议 |
| --- | --- |
| 一个人维护的小项目 | Issues + 标签就够，Projects 可选 |
| 多人协作、需要看进度 | Projects 的 Board 或 Table |
| 跨多个仓库排期 | 个人/组织的 Projects（不是在单个仓库里） |

---

## 三、Discussions：问答与公告

Discussions 是一个「论坛式」的空间，适合**没有明确交付物**的讨论：使用问题、方案讨论、公告、展示。

### 3.1 开启（维护者）

1. 仓库 → **Settings** → **General** → **Features**。
2. 勾选 **Discussions**。
3. 进入 **Discussions** 页签 → 分类（Categories）可以按 `Announcements` / `Q&A` / `Ideas` / `General` 调整。

### 3.2 网页发帖（完整流程）

1. 仓库 → **Discussions** → **New discussion**。
2. 选一个分类（例如 **Q&A**）。
3. 填标题与正文，点 **Start discussion**。
4. 回答者在回复里给出答案；提问者（或维护者）点 **Mark as answer**，该回复会被置顶标记。
5. 讨论可以按分类、已解决/未解决筛选；也可以固定（Pin）公告。

### 3.3 Issue 还是 Discussion？

| 判断 | 用 Issue | 用 Discussion |
| --- | --- | --- |
| 有明确的可交付结果（修 bug、加功能） | ✅ | |
| 开放式问题、经验交流、投票 | | ✅ |
| 需要指派、里程碑、被 PR 关闭 | ✅ | |

> 已经存在的 Issue 可以 **Convert to discussion**；讨论也能转回 Issue。

---

## 四、Wiki：仓库自带的轻量知识库

Wiki 适合放「和代码一起走、但不需要 review」的长文档：环境搭建、值班手册、会议记录。

### 4.1 开启与写第一页

1. 仓库 → **Settings** → **General** → **Features** → 勾选 **Wiki**。
2. 回到仓库 → **Wiki** → **Create the first page**。
3. 填标题与内容（Markdown），点 **Save Page**。
4. 侧边栏可以加自定义导航：**Add a custom sidebar**。

### 4.2 本地编辑 Wiki

每个 Wiki 本身也是一个 Git 仓库，页面上 **Clone this wiki locally** 会给出地址：

```bash
git clone git@github.com:<用户名>/<仓库名>.wiki.git
```

改完 `push` 即可。适合批量修改或离线编辑。

> Wiki 与仓库里的 `docs/` 怎么选：需要 review、需要随版本发布、需要被 CI 校验 → 放 `docs/`；
> 随手维护、不需要 review → Wiki。

---

## 五、Notifications：别被消息淹没

### 5.1 三种关注方式

| 操作 | 效果 |
| --- | --- |
| **Watch** 仓库 | 订阅该仓库的动态（可设 Participating and @mentions / All activity / Ignore / Custom） |
| **@提及** | 被 `@` 的人会收到通知 |
| **Subscribe** 单个 Issue/PR | 只关注这一条（评论框下方 **Subscribe**） |

### 5.2 收件箱

右上角铃铛 → <https://github.com/notifications>：

- 左边栏按 **Inbox / Saved / Done** 过滤；
- 顶部可以按 `reason`（mention、review requested、assigned、subscribed）筛选；
- 每条通知可以 **Done**（归档）、**Unsubscribe**（退订）；
- 邮箱通知频率在 **Settings → Notifications** 里调整（建议关掉 "Watching" 的邮件，只留 mention / review）。

---

## 六、Search：找到那条 Issue 或 PR

GitHub 顶部搜索框支持限定符，几个最常用的：

| 限定符 | 例子 | 作用 |
| --- | --- | --- |
| `repo:` | `repo:cadywang/serial-debug-bridge` | 限定仓库 |
| `is:` | `is:issue` / `is:pr` / `is:open` | 类型与状态 |
| `label:` | `label:bug` | 按标签 |
| `author:` | `author:cadywang` | 按作者 |
| `assignee:` | `assignee:@me` | 指派给我 |
| `mentions:` | `mentions:cadywang` | 提到某人 |
| `in:` | `in:title` / `in:body` / `in:comments` | 搜索范围 |
| `language:` | `language:python` | 按语言（代码搜索） |

代码搜索（仓库页搜索框或 <https://github.com/search>）还支持 `path:`、`symbol:` 等限定符。
搜索需要索引，刚推送的代码可能延迟几秒到几分钟才出现。

---

## 七、小结

- **Issue** 记「要做的事」，带编号、可指派、可被 PR 关闭。
- **Projects** 把 Issue/PR 排成看板或时间线，适合多人协作。
- **Discussions** 放开放式问答与公告；**Wiki** 放不需要 review 的长文档。
- 通知只留必要的：Watch 级别 + 邮箱设置，能省掉大量噪音。
- 搜索用限定符，比翻页快得多。

> 下一篇：[Pull Request：从分支到合并](/2026/10/23/github-guide-03-pull-requests/)