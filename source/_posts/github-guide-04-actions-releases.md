---
title: GitHub 使用指南（四）：Actions、Releases 与 Packages
date: 2026-10-23 10:30:00
tags: [GitHub, GitHub Actions, CI/CD, Release, 自动化]
categories: [教程]
description: 从 workflow 的五个概念、第一个 CI 配置，到运行日志、矩阵构建、密钥管理，再到 Release 发版与 Packages 发包。
---

前三篇讲的是「代码怎么协作」。这一篇讲 GitHub 的自动化与发布：**让机器替你跑测试、构建、发版。**

很多新手对 Actions 的印象是「一堆 yaml」，其实只要抓住五个概念，剩下的都是查文档。
本篇用本博客仓库里真实在跑的配置举例，每一步都能在网页上对应到具体按钮。

> **GitHub 使用指南（6 篇）**
> 1. [入门：账号、仓库与第一次提交](/2026/10/23/github-guide-01-start/)
> 2. [Issues、Projects、Discussions 与 Wiki](/2026/10/23/github-guide-02-issues-projects/)
> 3. [Pull Request：从分支到合并](/2026/10/23/github-guide-03-pull-requests/)
> 4. Actions、Releases 与 Packages（本篇）
> 5. [安全、组织与 Pages](/2026/10/23/github-guide-05-security-org/)
> 6. [从 0 到 1 的完整演练与避坑清单](/2026/10/23/github-guide-06-practice-tips/)

---

## 一、五个概念先认清

| 概念 | 是什么 | 例子 |
| --- | --- | --- |
| **Workflow（工作流）** | 一个 YAML 文件，定义「什么时候、做什么」 | `.github/workflows/ci.yml` |
| **Event（事件）** | 触发条件 | `push`、`pull_request`、`workflow_dispatch`、`schedule` |
| **Job（任务）** | 一组在同一个 runner 上顺序执行的步骤 | `hygiene`、`build-check` |
| **Step（步骤）** | job 里的一步，跑命令或调用 Action | `run: python3 tools/check-skills.py` |
| **Runner（运行器）** | 真正执行 job 的机器 | `ubuntu-latest`、`windows-latest`、自托管 runner |

Action（可复用动作）是别人写好的「步骤包」，比如 `actions/checkout@v4`（把代码拉下来）。
**Workflow 由 job 组成，job 由 step 组成，step 可以是命令，也可以是 Action。**

---

## 二、第一个 workflow

在仓库里新建 `.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Run tests
        run: python3 -m pytest -q
```

逐段解释：

| 片段 | 作用 |
| --- | --- |
| `name` | 显示在 Actions 页面上的名字 |
| `on` | 触发事件；`workflow_dispatch` 让页面出现 **Run workflow** 按钮 |
| `permissions` | 收紧 `GITHUB_TOKEN` 的权限（默认尽量只读） |
| `jobs.<id>` | job 的 ID，可以起多个，默认并行 |
| `needs:` | 让 job 有依赖（B 等 A 成功后再跑） |
| `runs-on` | 用哪种 runner |
| `steps` | 顺序执行的步骤；`uses` 调 Action，`run` 跑命令 |

> **本博客仓库的 `review-gate.yml` 就是活例子**：`hygiene` 检查编码/行尾/语法与 commit 规范，
> `validate-posts` 校验文章格式，`build-check` 跑 `hexo generate`。三个 job 并行，PR 必须全绿。

---

## 三、网页上怎么用（完整流程）

### 3.1 新建 / 修改 workflow

1. 仓库 → **Actions** 页签。
2. 第一次进入会看到 **Get started with GitHub Actions**，可以选一个模板；
   也可以直接 **New workflow → set up a workflow yourself**。
3. 进入网页编辑器，改 `.github/workflows/<名字>.yml`。
4. 右上 **Commit changes**：
   - 直接提交到 `main`，或；
   - **Create a new branch and start a pull request**（推荐：CI 的改动也应该被 review）。

### 3.2 看一次运行

1. **Actions** → 左侧选 workflow → 点某一次运行。
2. **Summary** 页显示每个 job 的结果；点 job 看每一步的日志。
3. 右上 **Re-run all jobs** / **Re-run failed jobs** 可以重跑。
4. job 里上传的 **Artifacts** 可以在 Summary 底部下载（保留期有限）。

### 3.3 手动触发

配置了 `on: workflow_dispatch` 的 workflow，Actions 页面会出现 **Run workflow** 按钮：
选分支、填 inputs，点运行。**这是发布类 workflow 的常用入口**——手动确认一次才执行。

### 3.4 在 PR 上看 CI

PR 页面底部会显示检查状态：绿色 ✅ / 红色 ❌ / 黄色 🟡。
点 **Details** 跳到对应 job 日志；分支保护里可以把这些检查设为**必需**，红了就不能合并。

---

## 四、常用能力

### 4.1 矩阵（matrix）：一份配置跑多环境

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
        python: ['3.10', '3.11']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python }}
      - run: python3 --version
```

矩阵会展开成 4 个 job，互不影响。

### 4.2 缓存与产物

```yaml
      - uses: actions/cache@v4
        with:
          path: ~/.cache/pip
          key: pip-${{ hashFiles('requirements.txt') }}

      - uses: actions/upload-artifact@v4
        with:
          name: site
          path: public/
```

- **cache**：加速依赖下载；key 一般带依赖文件的哈希。
- **artifact**：把构建产物保存下来，供下载或给后续 job 用（`actions/download-artifact`）。

### 4.3 密钥（Secrets）

CI 里需要 token、密码时，**不要写进 YAML**：

1. 仓库 → **Settings** → **Secrets and variables** → **Actions**。
2. **New repository secret**，填名字（例如 `NPM_TOKEN`）和值。
3. workflow 里用 `${{ secrets.NPM_TOKEN }}` 引用。

组织级密钥在组织 Settings 里配；需要审批的发布可以用 **Environments**：

1. **Settings → Environments → New environment**，例如 `production`。
2. 配置 **Required reviewers**（部署前必须有人批准）和 **Deployment branches**。
3. job 里写 `environment: production`，就会走这套审批。

> 安全习惯：密钥只在 job 需要它的那一步用；优先用 `GITHUB_TOKEN`（自动生成、作用域受限），
> 少用长期 PAT。

### 4.4 权限与并发

```yaml
permissions:
  contents: read
  pull-requests: write

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

- 默认 `GITHUB_TOKEN` 权限越收紧越好，需要写 PR 评论时再单独给 `pull-requests: write`。
- `concurrency` 能取消同一分支上过期的运行，省额度也更快出结果。

---

## 五、Marketplace：不要重复造轮子

<https://github.com/marketplace?type=actions> 里有大量现成 Action：
部署 Pages、发 Release、上传 Docker 镜像、跑 lint、发通知……

用法就是 `uses: owner/action@v版本`。选 Action 时看三点：

1. 是否官方（`actions/...`）或知名维护者；
2. 最近是否还在维护；
3. 需要什么权限、会接触哪些密钥。

> 固定版本（`@v4` 或 commit SHA）比 `@main` 稳；对安全敏感的仓库建议固定到 commit SHA。

---

## 六、Releases：给版本留一份说明

Tag 是 Git 的「版本指针」，Release 是 GitHub 在 tag 之上加的一层「发布说明 + 附件」。

### 6.1 网页发版（完整流程）

1. 仓库 → **Code** → 右侧 **Releases** → **Draft a new release**。
2. **Choose a tag**：
   - 已有 tag 直接选；
   - 或输入新的版本号（例如 `v1.2.0`）→ **Create new tag on publish**。
3. **Release title**：例如 `v1.2.0`。
4. **Describe this release**：写变更说明；可以点 **Generate release notes** 让 GitHub 自动汇总 PR。
5. 需要的话上传附件（编译好的二进制、压缩包）。
6. 勾选 **Set as the latest release**，点 **Publish release**。

### 6.2 命令行发版

```bash
git tag -a v1.2.0 -m "v1.2.0"
git push origin v1.2.0
```

推送 tag 也能触发以 `on: push: tags:` 配置的 workflow（常见于「打 tag 即发布」）。

### 6.3 版本号怎么定

语义化版本 `MAJOR.MINOR.PATCH`：

| 变化 | 版本 |
| --- | --- |
| 不兼容的 API 改动 | `MAJOR` +1 |
| 向下兼容的新功能 | `MINOR` +1 |
| 向下兼容的修复 | `PATCH` +1 |

---

## 七、Packages：把「库」也发布出去

GitHub Packages 可以托管 npm、Maven、NuGet、RubyGems、Docker 容器等（容器在 `ghcr.io`）。

### 7.1 用 Actions 发布（以容器为例）

```yaml
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:latest
```

发布后的包会出现在个人/组织的 **Packages** 页面，可以设置可见性与关联仓库。

### 7.2 什么时候值得用

| 场景 | 建议 |
| --- | --- |
| 公司内部共享 Python/npm 包 | 可以用，但先确认团队是否已有私有 registry |
| 开源项目发布 npm 包 | 更常见的是直接发到 npmjs，GitHub Packages 作为备选 |
| 发布 Docker 镜像 | `ghcr.io` 很方便，且与 Actions 集成好 |

---

## 八、排障速查

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| workflow 不触发 | `on` 的分支/事件不匹配；YAML 缩进错误 | Actions 页面看是否根本没有 run；本地用 YAML 解析器校验 |
| job 一直 queued | runner 不可用、并发限制、组织账单 | 看 job 详情；检查 Actions 设置与额度 |
| `permission denied` | `GITHUB_TOKEN` 权限不够 | 在 workflow 里加 `permissions:`，或改用合适的 secret |
| 拉不到私有仓库 | `actions/checkout` 需要 token | `with: token: ${{ secrets.PAT }}`（谨慎使用长期 PAT） |
| 缓存不生效 | key 每次都变 | key 里用 `hashFiles(...)`，不要带时间戳 |
| 手动运行按钮不见了 | 没有 `workflow_dispatch` | 在 `on:` 里加上它 |
| 想本地复现 | 环境差异 | 用与本机一致的版本；或考虑 `act`（第三方工具，非官方） |

---

## 九、小结

- Actions = workflow（YAML）+ event（触发）+ job + step + runner。
- 先写最小 CI（checkout → 装环境 → 跑测试），再加矩阵、缓存、产物。
- 密钥放 Secrets，发布走 Environment 审批；`GITHUB_TOKEN` 权限默认收紧。
- Release = tag + 发布说明 + 附件；版本号用语义化版本。
- Packages 适合发布容器/库，容器用 `ghcr.io` 最顺。

> 下一篇：[安全、组织与 Pages](/2026/10/23/github-guide-05-security-org/)