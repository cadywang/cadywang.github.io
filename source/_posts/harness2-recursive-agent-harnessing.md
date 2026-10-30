---
title: Harness² 拆解：让固定模型自己改 Agent Harness（架构、实测与部署）
date: 2026-10-30 11:06:31
tags: [Harness2, AI Agent, Codex, 论文拆解, 实测]
categories: [技术]
description: 拆解 Google Research 的 Harness²：两层递归、Propose-Probe-Compose、盲选与经验库，以及本机验证到的安装门槛。
---

同一个模型，换一套 prompt、工具说明、memory 和技能，Agent 表现可能差很多。  
问题是手工调 harness 很难归因，换一个任务又全部作废。  
Google Research 的 Harness² 想做的，就是**固定模型权重，让模型自己修改 harness，并把经验带到后续任务**。这篇是我读完仓库后的工程拆解；完整 benchmark 我没有跑，论文数字会明确标成「论文声称」。

---

## 一、它解决什么问题

Harness 指模型外面的执行系统。仓库把它拆成八类可编辑组件：system prompt、guardrails、memory、tool guidance、subagents、skills、scripts、plugins。

难点在于：任务在设计 harness 时没见过，开放世界任务往往没有可靠 ground truth，经验还必须能迁移到同领域后续任务。所以它不是自动写 prompt，而是在没有评分的情况下，从多次执行的差异里判断哪次修改更可能有效。

---

## 二、架构

```text
任务
 ├─ base harness 跑 k 次
 ├─ INVARIANT / DOMAIN 编辑器提出修改
 ├─ 修改后的 harness 实际执行，得到 probe 轨迹
 ├─ 对比 base 与 probe 的行为差异
 ├─ 组合成最终 harness
 ├─ 匿名产物盲选
 ├─ 选择后才调用 judge
 └─ 反思并写入领域经验库 → 下一个任务读取
```

两层递归：

| 层级 | 做什么 | 关键点 |
| --- | --- | --- |
| Task-level | 修改当前任务的 harness | Propose–Probe–Compose，不看评分看执行对比 |
| Harnessing-level | 从修改中提炼经验 | 保存被采用的 harness 与可迁移教训 |

任务级有两种扩展：parallel 宽搜，`k` 个通用候选加 `k` 个领域候选再组合；sequential 深搜，连续 `k` 轮改进。预算账本是 `R=4k` 次 rollout、`P=3k` 次改进会话，选择与反思另算。

工程上分为 method（`core/`）、substrate（OpenCode/Codex）、benchmark（JobBench/LAB/WorkBuddy）和 CLI，三层解耦。

---

## 三、关键设计与取舍

**1. 用执行对比代替评分反馈。** 修改后真的跑一次，比较轨迹在哪一步分开、产物是否更完整。代价是贵，但比模型自评可靠。

**2. Evidence-as-files。** 任务、源码、完整轨迹、产物、候选 harness 和历史库都放在 `context/` 让模型自己读。不会因 prompt 截断丢证据，代价是更多文件导航和 I/O。

**3. 盲选与延迟评分。** 候选产物匿名化，选择器不知道来源；judge 只在选择后运行，降低对 rubric 的过拟合。但选择器仍是模型，也可能被「看起来更完整」骗到。

**4. 按领域建经验库。** 被采用的 harness 和反思经验写进当前领域，后续任务读取。风险是偶然做法被带偏，所以反思要求把无法归因的修改标成 `confounded`。

**5. `k=1` 时 parallel 和 sequential 其实一样。** 都是「一次 INV、一次 DOM、一次组合」。代码报告模块明确提示：此时两者分差是噪声地板，要比较方法差异至少从 `k>=2` 开始。

---

## 四、我实际验证了什么

浅克隆后，我按当前 `main` 做了静态检查：

| 项目 | 结果 |
| --- | --- |
| main 提交 | `1cfe254`，2026-10-13 |
| 版本 / 文件数 | `0.1.0` / 114 个受控文件 |
| Python / 平台 | `>=3.12,<3.14`，真实 benchmark 要求 Linux |
| 预算账本 | `R=4k`、`P=3k` |
| 公开测试 | 1 个测试文件，5 个工作流用例 |

README 和论文声称的增益：WorkBuddy-Bench 最高 11.5 分、JobBench 最高 4.5 分、LAB partial pass 11.8 个百分点。**这些数字我没有在本机复现。**

本机环境探测：Node `v26.13.0`、npm `11.20.0`、Python `3.12.10`、全局 Codex CLI `0.159.2`；WSL2、Docker、gcloud 均未安装。

两个容易踩的点：Harness² 不使用全局 Codex，而是在 setup 时把 `@openai/codex@0.144.6` 装进 `dependencies/codex/`；当前提交也没有 README 里提到的 `.env.example`，需要按 `docs/SETUP.md` 自己建。

---

## 五、部署指南

真实 benchmark 建议使用 Linux。Windows 走 WSL2，不要原生硬跑。需要 Python 3.12、uv、Node.js 20+、Google Cloud CLI；WorkBuddy 还要 Docker，LAB 还要 Pandoc 和 Poppler。

先跑无凭据 demo：

```bash
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -e '.[render]'
harness2-demo --output runs/demo --k 2
```

Codex executor 还要装 bridge：

```bash
uv pip install -e '.[render,bridge]'
harness2-bridge
harness2-setup lab --substrate cx
harness2-check --bench lab --substrate cx
```

`harness2-bridge` 会打印 `HARNESS2_CODEX_*` 变量，写进 `.env`。WorkBuddy 容器要访问 bridge 时用 `harness2-bridge --host 0.0.0.0`。Codex 需要的是 Responses API 端点，不是本机装个 `codex` 命令就结束。

---

## 六、使用指南

| 命令 | 作用 |
| --- | --- |
| `harness2-demo` | 无凭据本地演示 |
| `harness2-setup` | 安装 benchmark 依赖 |
| `harness2-check` | 离线检查环境 |
| `harness2` | 跑 harness 改进 |
| `harness2-judge` | 对选择结果评分 |
| `harness2-report` | 汇总分数与选择来源 |

最小 LAB 流程：

```bash
harness2-setup lab
harness2-check --bench lab
harness2 --bench lab --k 1 --mode parallel --max-tasks 1
harness2-judge --bench lab --k 1 --mode parallel
harness2-report --bench lab --k 1 --mode parallel
```

运行、评分、报告的 benchmark、executor、subset、`k`、`mode`、`seed` 必须一致。第一次先加 `--dry-run` 看任务流，再加 `--max-tasks 1` 控成本。它适合做 harness 自动优化的研究和实验，不适合直接当生产级 Agent SDK。

---

## 七、排障速查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `uv` 不存在 | 没装 uv | 安装后重开 shell |
| `wsl` 提示未安装 | 没启用 WSL2 | `wsl --install -d Ubuntu` |
| `.env.example` 不存在 | 当前提交没有 | 按 `docs/SETUP.md` 创建 `.env` |
| `Codex is not installed` | 只装了全局 Codex | setup 时加 `--substrate cx` |
| bridge 连不上 | 只监听 127.0.0.1 | WorkBuddy 用 `--host 0.0.0.0` |
| judge 失败 | 模型、配额或依赖问题 | 失败不算 0 分，修好后重跑 |
| 执行器抓到 rubric | 网络未隔离 | 在宿主机阻断 Hugging Face、GitHub 等域名 |

Codex 执行时 sandbox 是关闭的，benchmark rubric 又是公开的，正式评测必须在网络层隔离，不能只靠 prompt 约束。

---

## 八、小结

Harness² 值得借鉴的是三点：没有 ground truth 时用执行对比代替评分反馈；选择与评分分离，降低对 rubric 的过拟合；把单任务修改沉淀成跨任务经验，而不是一次性调参。

它仍是研究代码：依赖特定 benchmark，成本高，平台偏 Linux，论文增益也需要独立复现。把它当工程参考，比当生产框架更合适。

仓库：<https://github.com/google-research/harness2>  
论文：<https://arxiv.org/abs/2610.14224>