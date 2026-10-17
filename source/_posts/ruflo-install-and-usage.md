---
title: Ruflo 安装与使用：插件路线与 CLI 路线怎么选（Windows 实测）
date: 2026-10-17 19:15:49
tags: [Ruflo, Claude Code, 插件, 智能体, 实测]
categories: [教程]
---

Ruflo 是给 Claude Code 加的一层智能体编排：一个 MCP 服务器、几十个预置智能体、一套记忆与钩子。
但它有**两条覆盖范围完全不同的安装路径**——装 Claude Code 插件，或者跑 `ruflo init` 铺一套完整运行时。
选错的那条，表现不是报错，而是「装完了，但能用的东西比想象中少很多」。

这篇文章按实测记录两条路径各自装了什么、留下了什么文件、占到多少上下文，
以及 Windows 上几个不那么明显的问题。文中所有数字都来自 2026-10-17 在 Claude Code `2.1.302` 上的真实执行。

---

## 一、它解决什么问题

Claude Code 自带工具循环、子 Agent 和上下文管理，缺的是「跨会话的记忆」和「多 Agent 的结构化协作」。
Ruflo 补的就是这两块，顺带塞进来一大堆周边能力（向量检索、路由、成本跟踪、安全扫描……）。

| 角色 | 说明 |
| --- | --- |
| Claude Code | 宿主，负责对话与工具调用 |
| Ruflo MCP 服务器 | 以 stdio 挂进 Claude Code，暴露 `memory_*` / `swarm_*` / `agent_*` 等工具 |
| 插件 | 斜杠命令 + 智能体定义；只有 `ruflo-core` 自带 MCP 服务器 |
| CLI 运行时 | `.claude-flow/` 目录、钩子、守护进程，`ruflo init` 创建 |

现实约束有三条：

* **不能污染工作区**：不是每个仓库都愿意多出 `.claude-flow/`、`.claude/` 和一堆钩子；
* **工具面要付上下文费**：MCP 工具的 schema 是常驻的，工具越多，每次对话的固定开销越大；
* **要能干净退出**：试用之后能卸掉，而不是在全局配置里留一堆钩子。

## 二、两条路径到底差在哪

官方 README 把差异写得很直白，我按本机实测补充了第三列：

| | 插件路线 | CLI 路线 | 本机实测 |
| --- | --- | --- | --- |
| 提供什么 | 斜杠命令 + 智能体定义 | 完整运行时 + MCP + 钩子 + 守护进程 | 两条都跑过，见下文 |
| 工作区新增文件 | 只有运行时状态 | `.claude/`、`.claude-flow/`、`.gitignore` | 插件路线留下 1 个 `current.json`（271 字节）；`init --minimal` 建了 12 个目录、4 个文件 |
| 注册 MCP 服务器 | 仅 `ruflo-core` 自带 | 是 | 插件路线下 `claude mcp list` 只有 1 个服务器 |
| 安装钩子 | 否 | 是（仅提示） | init 打印 `Hooks: 4 hook types enabled`；生成的 `settings.json` 里实测没有 `hooks` 键 |

整体链路：

```
   ┌──────────────┐   stdio (MCP)   ┌────────────────────────┐
   │ Claude Code  │ ◀─────────────▶ │ ruflo MCP 服务器        │
   │              │                 │ 358 个工具 / 26 个分组  │
   └──────┬───────┘                 └───────────┬────────────┘
          │                                     │
          │ 插件路线：marketplace + plugin      │ 读 / 写
          ▼                                     ▼
   ~/.claude/plugins/cache/...          .claude-flow/（两条路线都会写）
   （不搭骨架，只写会话状态）             记忆、会话、日志、钩子
```

两条路最终都落到同一个 MCP 服务器上。区别不在「谁写文件」——服务器一启动就会按 cwd 写会话状态——
而在**写多写少**：插件路线只留一个 `current.json`，CLI 路线才会铺出 `.claude/`、配置、钩子和日志目录。

## 三、关键设计与取舍

### 1. 为什么不直接全量装 CLI

全量 `init` 会把 `.claude/`、`.claude-flow/`、根目录 `.gitignore` 一起写进仓库，
还会默认往 `~/.claude/CLAUDE.md` 追加一段「Ruflo Integration」指针（本机确实有这一段）。
这些对「长期用 Ruflo 干活」的项目是合理的，对「只想试一下记忆工具」的仓库就是负担。

所以取舍是：**先插件路线试工具，确认离不开之后再上 CLI 路线**。
插件路线不搭骨架，卸载就是 `claude plugin uninstall`。

### 2. 只装 `ruflo-swarm` 是个常见误解

插件路线里，**只有 `ruflo-core` 注册 MCP 服务器**。只装 `ruflo-swarm`，你拿到的是斜杠命令和智能体定义，
`memory_store`、`swarm_init` 这些工具**不会出现**。

而且工具名带前缀：`mcp__plugin_ruflo-core_ruflo__memory_store`，不是文档里写的裸名 `memory_store`。
CLI 路线才是裸名。这一点在写脚本或对照文档抄命令时特别容易踩。

### 3. 工具面是笔固定开销

本机实测：`ruflo mcp tools` 列出 **358 个 Enabled 工具**，分布在 26 个分组里；
`ruflo doctor` 对这笔开销的估算是 **约 67,881 个 schema token（全量工具）**。

也就是说，装上之后每一轮对话的上下文里都躺着这六万多 token 的描述。
对 1M 上下文的模型不算致命，但**它和你真正要读的代码是竞争关系**。
只想要记忆的话，只装 `ruflo-core`、不装别的插件，是成本最低的用法。

### 4. Windows 上走的是降级路径

记忆后端的返回值里写得很清楚：

```text
backend: sql.js + HNSW (native bridge disabled: AgentDB native bridge disabled
on Windows after #3024; set CLAUDE_FLOW_ENABLE_NATIVE_BRIDGE_ON_WINDOWS=1 to opt in)
```

默认不开原生桥，用 `sql.js + HNSW` 兜底。想开原生加速得显式设环境变量——属于「作者知道有问题先关掉」的那种开关，
不建议一上来就打开。

### 5. CLI 会留下常驻进程

跑完 CLI 命令后，进程列表里多了一个：

```text
node ...\@claude-flow\cli\bin\cli.js daemon start --foreground --quiet --workspace D:\OpenCode\ruflo-init-probe
```

它占着工作目录，`rm -rf` 会报 `Device or resource busy`，先停进程才能删干净。
如果你在 CI 或临时目录里跑 `ruflo init`，记得把这一步算进清理逻辑。

### 6. 插件路线不会替你写 `.gitignore`

CLI 的 `init` 会在根目录生成 `.gitignore`，把 `.claude-flow/{data,logs,sessions}/` 排除掉。
插件路线不生成这个文件，但 ruflo 一启动就按 cwd 写 `.claude-flow/sessions/current.json`——
于是你的 `git status` 里多出一个未跟踪目录，而 `git check-ignore` 确认它没被任何规则覆盖。

这次写文章时就撞上了：一个本来干净的仓库里冒出 `.claude-flow/`，内容是 271 字节的会话记录。
要干净，自己补一行：

```gitignore
.claude-flow/
```

这也是「插件路线更轻」这个说法需要打个折的地方：**轻的是骨架，不是痕迹**。

## 四、实测数据

环境：Windows 10 Pro 10.0.19045，Node `v24.22.0`，npm `11.19.1`，Claude Code `2.1.302`，Ruflo `3.56.10`。

### 4.1 版本与插件

| 项目 | 结果 |
| --- | --- |
| `npm view ruflo` | `3.56.10`，`engines.node >= 20.0.0`，`bin.ruflo` |
| `npx ruflo@latest --version` | `ruflo v3.56.10`，耗时 `3.742s`（本机 npx 缓存已热） |
| 仓库根 `package.json` | 名字仍是 `claude-flow`，`bin` 是 `claude-flow`；`ruflo/` 子包里才是 `bin.ruflo` |
| 已装插件 | `ruflo-core@0.2.11`、`ruflo-swarm@0.3.7`、`ruflo-mods@0.6.2`、`ruflo-console@0.44.2` |
| 插件路线的工作区痕迹 | 只有 `.claude-flow/sessions/current.json`（271 字节），`cwd` 指向当前仓库，`git status` 里是未跟踪状态 |

`claude mcp list` 只有一个服务器：

```text
plugin:ruflo-core:ruflo: node .../ruflo-core/0.2.11/scripts/mcp-launch.cjs - ✔ Connected
```

### 4.2 `init --minimal` 到底建了什么

在临时目录执行（带隔离参数，不碰全局配置）：

```bash
npx ruflo@latest init --minimal --skip-claude --no-global \
  --no-signup --no-skills-sh --no-mods --no-plugin-install
```

| 指标 | 结果 |
| --- | --- |
| 耗时 | `2.776s` |
| 目录 | 12 个 |
| 文件 | 4 个：`.gitignore`、`.claude-flow/config.yaml`、`.claude-flow/CAPABILITIES.md`、`.claude-flow/.gitignore` |
| 空目录 | `.claude/` 下 `agents`、`commands`、`helpers`、`skills` 四个（0 文件） |
| 配置默认值 | `topology: mesh`、`maxAgents: 5`、`memory.backend: memory`、`enableHNSW: false` |
| 钩子 | 打印 `Hooks: 4 hook types enabled in settings.json`；但本次带 `--skip-claude`，文件并未生成（不带该参数时生成的 `settings.json` 也没有 `hooks` 键） |

根目录 `.gitignore` 自动排除 `.env*` 与 `.claude-flow/{data,logs,sessions}/`——这一点做得对，
运行数据不该进仓库。

### 4.3 MCP 工具与记忆读写

| 操作 | 结果 |
| --- | --- |
| `ruflo mcp tools` | 358 个 `Enabled` 工具，26 个分组（Agent / Swarm / Memory / Hooks / Task / …） |
| `memory_store` | `stored: true`，`34.95ms`，嵌入维度 `128` |
| `memory_search` | `6.01ms`，召回 1 条，相似度 `0.364` |
| `system_status` | `healthy`，版本 `3.56.10`，swarm `running`（health `1`），uptime `54m` |
| `mcp_status` | `running: true`，`transport: stdio` |
| `ruflo doctor` | `18 passed, 15 warnings` |

两个值得注意的点：

* 记忆的相似度只有 `0.364` 仍然被召回——默认阈值是 `0.2`，比较宽松。想提高精度就显式传 `threshold`。
* `doctor` 的 15 条 warning 大多是**可选依赖没装**（TypeScript、agentic-flow、AIDefence 等），
  不影响核心工具；真正要读的是带 `✗` 的那几条。

## 五、部署指南

### 环境要求

| 项目 | 要求 | 来源 |
| --- | --- | --- |
| Node.js | `>= 20.0.0` | `npm view ruflo engines` |
| Claude Code | 支持插件与 MCP | 本机 `2.1.302` |
| 网络 | 首次会 clone `github.com/ruvnet/ruflo` | marketplace 安装时 |

### 路线 A：Claude Code 插件（不搭骨架）

在 Claude Code 里执行：

```text
/plugin marketplace add ruvnet/ruflo
/plugin install ruflo-core@ruflo
```

需要多 Agent 协作再补：

```text
/plugin install ruflo-swarm@ruflo
/plugin install ruflo-mods@ruflo
/plugin install ruflo-console@ruflo
```

对应的 CLI 子命令也存在（`claude plugin --help` 里能查到）：

```bash
claude plugin marketplace add ruvnet/ruflo
claude plugin install ruflo-core@ruflo
claude plugin list
```

装完检查两项：

```bash
claude mcp list        # 应看到 plugin:ruflo-core:ruflo ✔ Connected
claude plugin list     # 确认版本与 enabled 状态
```

### 路线 B：CLI 运行时（完整能力）

```bash
# 交互式向导，Windows PowerShell / cmd 也能直接跑
npx ruflo@latest init wizard

# 非交互快速初始化
npx ruflo@latest init

# 或者装成全局命令
npm install -g ruflo@latest
```

`curl -fsSL https://cdn.jsdelivr.net/gh/ruvnet/ruflo@main/scripts/install.sh | bash` 只适用于 POSIX shell
（Git-Bash / WSL / MSYS）。在 PowerShell 里遇到 `'bash' is not recognized`，改用 `npx` 那一行即可。

如果你不想动全局配置，加两个开关：

```bash
npx ruflo@latest init --no-global --no-signup
```

### 把 Ruflo 单独注册成 MCP 服务器

不走插件、也不想铺运行时的话，还有最小的一条：

```bash
claude mcp add claude-flow -- npx ruflo@latest mcp start
```

这条只挂 MCP：不装钩子、不铺 `.claude/` 骨架，会话状态同样会写进 `.claude-flow/`。

## 六、使用指南

| 目的 | 命令 / 工具 |
| --- | --- |
| 系统状态 | `ruflo status`，或 MCP 的 `system_status` |
| 健康检查 | `ruflo doctor`（加 `--fix` 会给出建议命令，但不自动执行） |
| 看有哪些工具 | `ruflo mcp tools` |
| 写入记忆 | `memory_store`（`key` + `value` + `namespace`） |
| 语义检索 | `memory_search`（`query`、`limit`、`threshold`） |
| 起一个 Agent | `agent_spawn`，之后用 `agent_execute` 派任务 |
| 集群协调 | `swarm_init` → `swarm_status` → `swarm_shutdown` |
| 面板 | `ruflo-console` 提供的 `/ruflo` 命令 |

插件路线下调用工具要带前缀，例如：

```text
mcp__plugin_ruflo-core_ruflo__memory_store
mcp__plugin_ruflo-core_ruflo__memory_search
```

在 Claude Code 的对话里直接说「把这条记到 ruflo 的 probe 命名空间」，它会自己挑工具；
但在脚本或文档里抄名字时，前缀要写全。

## 七、排障速查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 装了插件但看不到 `memory_*` 工具 | 没装 `ruflo-core` | `claude plugin install ruflo-core@ruflo` |
| 工具名和文档对不上 | 插件路线带 `mcp__plugin_ruflo-core_ruflo__` 前缀 | 用 `claude mcp list` 确认服务器名 |
| `rm -rf` 删不掉初始化目录 | `ruflo daemon` 进程占着工作目录 | 先停掉该 node 进程，再删 |
| `git status` 里冒出 `.claude-flow/` | 插件路线的 MCP 服务器按 cwd 写会话状态，且不生成 `.gitignore` | 自己加一行 `.claude-flow/` |
| `doctor` 报一堆 warning | 多为可选依赖未安装 | 只处理带 `✗` 的条目 |
| 提示 Node 版本不满足 | 要求 `>= 20` | 升级 Node |
| 全局 `CLAUDE.md` 被改了 | `init` 默认追加集成说明 | 初始化时加 `--no-global` |
| 记忆检索结果太杂 | 默认 `threshold` 是 `0.2`，偏宽松 | 检索时显式传更高的 `threshold` |
| 想彻底移除 | 运行时文件 + 插件 + 钩子分三处 | `ruflo cleanup`，再 `claude plugin uninstall` |

## 八、小结

三条主线：

1. **先选路线，再谈功能**。插件路线不搭骨架、只有 `ruflo-core` 带 MCP；CLI 路线才有完整运行时和钩子。
   但插件路线也不等于零痕迹——它会留一个未被忽略的 `.claude-flow/sessions/current.json`。
2. **工具不是免费的**。358 个工具 ≈ 67,881 个 schema token，常驻上下文；只装需要的插件是更划算的默认。
3. **Windows 有已知降级**。原生桥默认关闭、走 `sql.js + HNSW`，并且 CLI 会留下守护进程，清理时别忘了它。

如果你只是想试试「跨会话记忆」这一件事，成本最低的路径是：
装 `ruflo-core` 插件 → 用 `memory_store` / `memory_search` 跑两周 → 确认真的在用，再考虑 `ruflo init` 铺全量运行时。

> 实测环境：Windows 10 Pro 10.0.19045 / Node `24.22.0` / Claude Code `2.1.302` / Ruflo `3.56.10`，2026-10-17。
> 版本号与默认值随官方发版变化，以 `npm view ruflo` 和 `ruflo doctor` 的当前输出为准。
