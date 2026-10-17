---
title: Ruflo 使用指南：初始化、记忆、智能体与配置项详解（Windows 实测）
date: 2026-10-17 20:10:00
tags: [Ruflo, Claude Code, 使用指南, 配置, 智能体]
categories: [教程]
---

上一篇比较了 Ruflo 的两条安装路线。装好之后，问题会从「装哪个」变成「怎么用」：
记忆怎么存、怎么搜，`agent` / `swarm` / `task` / `session` 各自管什么，配置文件里每个键改了到底影响哪一段。

这篇按实际使用的顺序写：先跑通最小闭环，再逐个走记忆、智能体、任务、会话和守护进程，
最后把 `claude-flow.config.json` 与 `config.yaml` 里的配置项逐条列出来。
文中命令与输出都来自 2026-10-17 在本机的真实执行：Windows 10 Pro 10.0.19045、Node `24.22.0`、
npm `11.19.1`、Ruflo `3.56.10`。

---

## 一、它解决什么问题

Ruflo 装完之后，日常真正会用到的是六件事，每件事都有自己的命令和数据文件：

| 能力 | 主要命令 | 数据落在哪 |
| --- | --- | --- |
| 跨会话记忆 | `memory init/store/search/retrieve` | `.swarm/memory.db` |
| 单个智能体 | `agent spawn/list/status` | `.claude-flow/agents/store.json` |
| 多智能体协调 | `swarm init/status/shutdown` | `.claude-flow/swarm/swarm-state.json` |
| 任务 | `task create/list/update` | `.claude-flow/tasks/store.json` |
| 会话快照 | `session save/list/restore` | `.claude-flow/sessions/*.json` |
| 后台 worker | `daemon start/status/stop` | `.claude-flow/logs/daemon.log` |

现实约束有三条：

* **不要为了试用污染仓库**：`init` 会写 `.claude/`、`.claude-flow/`、根目录 `.gitignore`；
* **工具面是固定成本**：`ruflo mcp tools` 实测 **358 个工具、26 个分组**，schema 常驻上下文；
* **Windows 走降级路径**：记忆后端是 `sql.js + HNSW`，原生桥默认关闭。

## 二、先跑通最小闭环

安装用全局命令或 `npx` 都行。下面的初始化参数会跳过全局配置、注册和可选插件：

```bash
npm install -g ruflo@latest

npx ruflo@latest init --minimal --no-global --no-signup \
  --no-skills-sh --no-mods --no-plugin-install
```

`--minimal` 完成时实测建了 **12 个目录、15 个文件**：8 个 skill、`.claude/settings.json`、
`.mcp.json`、`CLAUDE.md`、`.claude-flow/config.yaml`、`.claude-flow/CAPABILITIES.md` 和两个 `.gitignore`。
跑完本文后面所有命令后，目录变成 27 个、文件 35 个——多出来的是记忆库、agent/task/swarm 状态和会话快照。

最小闭环的推荐顺序：

```
init
 ├─ memory init → memory store → memory search
 ├─ swarm init → agent spawn → task create → session save
 └─ daemon status
```

⚠️ 两个初始化参数容易混：`--skip-claude` 不写 `.claude/settings.json` 和 `.mcp.json`，但命令仍会打印
`Hooks: 4 hook types enabled in settings.json`；而 `--minimal` 不带 `--skip-claude` 时确实写了
`settings.json`，里面却**没有 `hooks` 键**（我实测的顶层键只有 `statusLine, permissions, env, claudeFlow`）。
判断钩子有没有装上，看文件，不要看那行提示。

## 三、记忆：最常用的一块

### 1. 初始化

```bash
npx ruflo@latest memory init
```

实测输出里三个关键信息：数据库路径 `.swarm/memory.db`，6 项自检全部通过，随后同步到 `.claude/memory.db`。
之后所有 `memory` 命令默认读写当前项目下的这份库。

### 2. 写入：用 `--value`，不要用 `-v`

```bash
npx ruflo@latest memory store -k blog/hexo -n default \
  --value "静态博客用 Hexo 生成，部署在 GitHub Pages，发布前要跑 check:posts"

npx ruflo@latest memory store -k user/style -n prefs \
  --value "文章用中文，面向工程师，先给结论再给证据"
```

返回分别是 **82 字节、384 维** 和 **60 字节、384 维**。

`memory --help` 的 EXAMPLES 里仍然写着 `-v`，但 `-v` 是全局的 verbose 开关，不会被当作 value。
我第一次按示例写，命令成功退出，条目却没存进去。**统一用 `--value`**。

`-n` 是命名空间，省略时是 `default`。它不参与向量相似度，检索时用 `-n` 做过滤。

### 3. 查看与检索

```bash
npx ruflo@latest memory list
npx ruflo@latest memory search -q "博客发布前要做什么"
npx ruflo@latest memory search -q "博客发布前要做什么" --threshold 0.55
npx ruflo@latest memory retrieve -k blog/hexo
npx ruflo@latest memory retrieve -k user/style -n prefs
npx ruflo@latest memory stats
```

实测结果：

| 操作 | 输出 |
| --- | --- |
| `memory list` | 两条：`blog/hexo` 显示 48 B，`user/style` 显示 20 B |
| 默认检索（590 ms） | `user/style` 0.59，`blog/hexo` 0.52 |
| `--threshold 0.55`（581 ms） | 只剩 `user/style` 0.59，`Found 1 results` |
| `memory retrieve` | 带 `Access Count`、`Vector: Yes` 和完整 value |
| `memory stats` | `sql.js + HNSW`，2 条，188416 B，模型 `Xenova/all-MiniLM-L6-v2`，384 维，HNSW `active (2 entries)` |

两个细节：

* **`list` 的 Size 不是字节数**。同样一条 `blog/hexo`，写入时报告 82 字节，`list` 显示 48 B——
  后者是字符数。要判断存储体积看 `stats`。
* **默认阈值是 0.2**，比较宽松。0.52 这种分数也会被召回；要精度就显式传 `threshold`。

Windows 上初始化时会看到一句 `native bridge disabled ... set CLAUDE_FLOW_ENABLE_NATIVE_BRIDGE_ON_WINDOWS=1 to opt in`。
这是作者在 Windows 上主动关掉的路径，不建议一上来就打开。

## 四、智能体、任务、会话与守护进程

### 1. 起一个 swarm

```bash
npx ruflo@latest swarm init -t mesh -m 3
```

实测返回：Swarm ID `swarm-1792240920352-71cw52`、`Auto Scale Enabled`、协议 `message-bus`、
`V3 Mode Disabled`。注意这里的「自动扩缩开启、最多 3 个」来自**命令参数**，
不是配置文件里的 `autoScale: false` / `maxAgents: 8`——`swarm init` 有自己的默认值。

### 2. 派生与查看 agent

```bash
npx ruflo@latest agent spawn -t coder -n demo-coder
npx ruflo@latest agent list
npx ruflo@latest agent status agent-1792240926448-2orkx9
```

`spawn` 返回 ID `agent-1792240926448-2orkx9`，状态 `registered`；`agent list` 里显示 `idle`。
`agent status` 必须传 **ID**，传名字会报 `Agent not found`。另外它打印的表头是 `Agent: undefined`，
这是显示 bug，`Status: idle` 本身是对的。

### 3. 建任务、存会话

```bash
npx ruflo@latest task create -t implementation \
  -d "给博客补一段排障说明" -p high --tags blog,ruflo
npx ruflo@latest task list

npx ruflo@latest session save -n demo
npx ruflo@latest session list
```

任务返回 `task-1792240939222-xyha8y`，状态 `pending`、`Unassigned`。
`session save` 返回 `session-1792240945168-4f29db43`，快照里包含 **1 个 agent、1 个 task、2 条记忆、1.2 KB**。

### 4. 一个已知的状态视图不一致

完成上面几步后再跑 `swarm status`，它仍然显示 **0 agents / 0 tasks**。
但 `agent list` 和 `task list` 里都有数据。也就是说这两个命令读的不是同一份汇总状态。
判断实际有没有起东西，以 `agent list` / `task list` 为准。

### 5. 守护进程

```bash
npx ruflo@latest daemon status
npx ruflo@latest daemon start
npx ruflo@latest daemon stop
```

本机 `daemon status` 的实测值：

| 项目 | 值 |
| --- | --- |
| Status | `STOPPED` |
| TTL | 12h（self-shutdown） |
| AI Workers | off（local-only, default） |
| Workers Enabled | 7 |
| Max Concurrent | 2 |
| Max CPU Load | 9.6 |
| Min Free Memory | 10% |

启用的 7 个是 `map`、`audit`、`optimize`、`consolidate`、`testgaps`、`backup`、`harness`；
`predict` 和 `document` 是 disabled。

⚠️ 这个列表和 `.claude/settings.json` 里 `claudeFlow.daemon.workers` 写的 3 个（`map/audit/optimize`）
不是同一份清单。想改 worker，先确认你改的是 `daemon` 实际读的那一份。

Windows 上还有个副作用：守护进程会占住工作目录，随后 `rm -rf` 报 `Device or resource busy`。
先 `daemon stop`，再 `cd` 到别的目录删除。

## 五、配置文件与配置项详解

### 1. 四个入口，各管一段

| 文件 | 谁读它 | 内容 |
| --- | --- | --- |
| `claude-flow.config.json` | `ruflo config get/set` 与 CLI 启动时的 `loadConfig()` | v3.5 的 `agents/swarm/memory/mcp/cli/hooks` |
| `.claude-flow/config.yaml` | `init` 写入；YAML 形态的运行时配置 | `swarm/memory/learningBridge/memoryGraph/agentScopes/neural/hooks/mcp` |
| `.claude/settings.json` | Claude Code 本身 | 权限、环境变量、状态栏，以及 `claudeFlow` 块 |
| `.mcp.json` | Claude Code 启动 MCP 子进程 | `command/args/env` |

查找顺序也不是「只看当前目录」。CLI 的 loader 会依次查 **当前目录 → 上一级 → `~/.claude-flow`**。
我实测：在 `app/` 目录（自己没有 JSON）执行 `loadConfig()`，它找到了父目录的
`D:\OpenCode\ruflo-guide-probe\claude-flow.config.json`，返回 `source: "file"`。

同一个文件，两个入口的结果还可能不同：

```text
config get agents.maxConcurrent        → 8
loadConfig() 的 maxConcurrentAgents    → 20
```

前者读 JSON 里的 `agents.maxConcurrent`，后者来自 shared 默认值——这条路径没有把该键映射过去。
所以「`config get` 读得到」不等于「运行时用了这个值」。改完关键项，最好用对应命令的实际输出验证一遍。

### 2. `claude-flow.config.json` 逐项说明

`config init --force` 会写出完整默认值。下面是 v3.5 的六组键。

**agents**

| 键 | 默认 | 作用 | 注意 |
| --- | --- | --- | --- |
| `defaultType` | `coder` | `agent spawn` 不传 `-t` 时的类型 | 实测显式传 `coder` |
| `autoSpawn` | `false` | 是否允许自动派生 agent | 默认关闭 |
| `maxConcurrent` | `8` | 并发 agent 上限 | 映射到 `orchestrator.lifecycle.maxConcurrentAgents`；缺省时该处是 20 |
| `timeout` | `300000` | agent 超时（毫秒） | 映射到 `spawnTimeout` |
| `providers` | `[]` | 额外 provider 列表 | 空表示用内置 |

**swarm**

| 键 | 默认 | 作用 | 注意 |
| --- | --- | --- | --- |
| `topology` | `hierarchical` | 协调拓扑 | `swarm init -t` 可覆盖；`adaptive`/`pheromone-adaptive` 会归一化为 `hybrid` |
| `maxAgents` | `8` | swarm 上限 | `swarm init` 自己的默认是 15，不读这里 |
| `autoScale` | `false` | 自动扩缩 | `swarm init` 输出仍是 Enabled，同样是命令默认值 |
| `coordinationStrategy` | `leader` | 协调策略 | 设为 `consensus` 会映射成 `consensusRequired` |
| `healthCheckInterval` | `30000` | 健康检查间隔（毫秒） | 同时映射到 `health.checkInterval` 与 `coordination.timeoutMs` |

**memory**

| 键 | 默认 | 作用 | 注意 |
| --- | --- | --- | --- |
| `backend` | `hybrid` | 记忆后端 | 可选 `sqlite/agentdb/hybrid/redis/memory`；`redis` 归一化为 `memory`，未知值归一化为 `hybrid` |
| `persistPath` | `./data/memory` | 持久化目录 | `memory init` 实际写到 `.swarm/memory.db`，两者不是一回事 |
| `cacheSize` | `1000` | 缓存条目上限 | 映射到 `memory.maxSize` |
| `enableHNSW` | `true` | 是否启用向量索引 | 映射为 `agentdb.indexType: hnsw/flat` |
| `vectorDimension` | `384` | 向量维度 | 与默认模型 `all-MiniLM-L6-v2` 的 384 一致；改错会与嵌入模型不匹配 |

**mcp**

| 键 | 默认 | 作用 |
| --- | --- | --- |
| `serverHost` | `localhost` | MCP 服务器监听地址 |
| `serverPort` | `3000` | HTTP 传输时的端口 |
| `autoStart` | `false` | 是否随 CLI 自动启动 |
| `transportType` | `stdio` | 传输方式：`stdio/http/websocket` |
| `tools` | `[]` | 工具白名单，空表示全部 358 个 |

**cli**

| 键 | 默认 | 作用 |
| --- | --- | --- |
| `colorOutput` | `true` | 彩色输出 |
| `interactive` | `true` | 交互模式 |
| `verbosity` | `normal` | 输出详细程度，对应全局 `-v` / `-Q` |
| `outputFormat` | `text` | 输出格式：`text/json/table` |
| `progressStyle` | `spinner` | 进度显示样式 |

**hooks**

| 键 | 默认 | 作用 |
| --- | --- | --- |
| `enabled` | `true` | 是否启用钩子 |
| `autoExecute` | `true` | 匹配后是否自动执行 |
| `hooks` | `[]` | 钩子定义列表 |

### 3. `.claude-flow/config.yaml` 里多出来的段

`init` 写的是 v3.0.0 形态，除 `swarm/memory/hooks/mcp` 外还有四段：

| 段 | 实测默认 | 作用 |
| --- | --- | --- |
| `memory.learningBridge` | `enabled: false`，`sonaMode: balanced`，`confidenceDecayRate: 0.005`，`accessBoostAmount: 0.03`，`consolidationThreshold: 10` | 记忆学习桥：SONA 模式、置信度衰减、访问加权、合并阈值 |
| `memory.memoryGraph` | `enabled: false`，`pageRankDamping: 0.85`，`maxNodes: 5000`，`similarityThreshold: 0.8` | 记忆图谱：PageRank 阻尼、节点上限、建边相似度阈值 |
| `memory.agentScopes` | `enabled: false`，`defaultScope: project` | agent 记忆作用域，默认按项目隔离 |
| `neural` | `enabled: false`，`modelPath: .claude-flow/neural` | 神经模式训练的开关与模型目录 |

`.claude/settings.json` 里的 `claudeFlow` 块则管 Claude Code 侧的集成：
`swarm`（拓扑与上限）、`daemon`（是否自启、worker 清单与调度）、`modelPreferences`、`agentTeams`、
`memory`、`neural`、`learning`、`adr`、`ddd`、`security`。

### 4. 环境变量：名字要对上

`.mcp.json` 会写一组环境变量，但生成的名字和运行时读的名字并不完全一致。
我用真实的 `loadConfig()` 验证了这几个读写关系：

| 环境变量 | 实际落到 | 实测 |
| --- | --- | --- |
| `CLAUDE_FLOW_MAX_AGENTS` | `orchestrator.lifecycle.maxConcurrentAgents` | 设为 `12`，读出 12 |
| `CLAUDE_FLOW_SWARM_TOPOLOGY` | `swarm.topology` | 设为 `ring`，读出 `ring` |
| `CLAUDE_FLOW_MEMORY_TYPE` | `memory.type` | 设为 `memory`，读出 `memory` |
| `CLAUDE_FLOW_MCP_PORT` | `mcp.transport.port` | 读取逻辑存在于 loader |
| `CLAUDE_FLOW_MCP_TRANSPORT` | `mcp.transport.type` | 支持 `stdio/http/websocket` |
| `CLAUDE_FLOW_DATA_DIR` | `orchestrator.session.dataDir` | 读取逻辑存在于 loader |

⚠️ 而 `.mcp.json` 生成的是 `CLAUDE_FLOW_TOPOLOGY`（少了 `SWARM_`）和 `CLAUDE_FLOW_MEMORY_BACKEND`
（运行时读的是 `CLAUDE_FLOW_MEMORY_TYPE`）。这两个名字我在 loader 里没有找到读取点。
要改拓扑或记忆后端，用上表里的名字，别改 `.mcp.json` 里那两个。

## 六、命令速查

| 目的 | 命令 |
| --- | --- |
| 初始化项目 | `ruflo init --minimal --no-global` |
| 初始化记忆 | `ruflo memory init` |
| 写记忆 | `ruflo memory store -k <key> -n <ns> --value "<value>"` |
| 语义检索 | `ruflo memory search -q "<query>" --threshold 0.55` |
| 精确取回 | `ruflo memory retrieve -k <key> -n <ns>` |
| 记忆统计 | `ruflo memory stats` |
| 起 swarm | `ruflo swarm init -t mesh -m 3` |
| 派生 agent | `ruflo agent spawn -t coder -n demo-coder` |
| 看 agent | `ruflo agent list` / `ruflo agent status <id>` |
| 建任务 | `ruflo task create -t implementation -d "<desc>" -p high` |
| 存会话 | `ruflo session save -n demo` |
| 守护进程 | `ruflo daemon status` / `start` / `stop` |
| 看配置 | `ruflo config get swarm.topology` |
| 改配置 | `ruflo config set swarm.maxAgents 12` |
| 重写完整配置 | `ruflo config init --force` |
| 诊断 | `ruflo doctor` |
| 看工具 | `ruflo mcp tools` |

## 七、排障速查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `config get mcp.port` 报 key not found | 键名是 `mcp.serverPort` | 用 `config get mcp.serverPort` |
| `memory store -v "..."` 没存进去 | `-v` 是全局 verbose | 改用 `--value` |
| `config set` 之后其他键都读不到 | 部分写入的文件会遮蔽默认值 | `config init --force` 重写完整文件 |
| `agent status <名字>` 报 not found | 这个子命令只认 ID | 先 `agent list` 拿 ID |
| `agent status` 表头是 `undefined` | 显示 bug，状态本身正确 | 忽略表头，看 `Status` |
| `swarm status` 显示 0 agents / 0 tasks | 与 `agent/task list` 不是同一份状态 | 以 `agent list` / `task list` 为准 |
| `rm -rf` 报 Device or resource busy | daemon 或 shell 的 cwd 占着目录 | `daemon stop`，`cd` 到别处再删 |
| init 说钩子已启用，`settings.json` 里没有 `hooks` | 提示语与实际文件不一致 | 以文件为准；需要钩子就手工补 `hooks` 段 |
| 中文任务路由分数很低 | `hooks route` 的匹配词是英文 | 中文任务会落到默认建议（实测 `researcher` 20%） |
| `ruflo status` 说 Memory backend none，`memory stats` 又有数据 | 两个命令读不同视图 | 以 `memory stats` / `memory list` 为准 |

## 八、小结

1. **先跑最小闭环**：`init --minimal` → `memory init` → `store/search`，确认记忆能用，再往上加
   `swarm/agent/task/session`。这条链路每一步都有可验证的输出。
2. **配置分四处，键名要以命令的实际输出为准**：`config get` 能读到，不代表运行时用了它；
   `.mcp.json` 里的环境变量名也不一定等于 loader 读的名字。改完关键项，用 `swarm init`、
   `memory stats` 这类命令回验。
3. **接受当前的毛边**：`agent status` 的表头、`swarm status` 的计数、`list` 的 Size 单位都不太一致。
   它们不影响核心读写，但排障时要挑对信息源——记忆看 `memory stats`，agent/task 看各自的 `list`。

> 实测环境：Windows 10 Pro 10.0.19045 / Node `24.22.0` / npm `11.19.1` / Ruflo `3.56.10`，2026-10-17。
> 默认值与键名随版本变化，以 `ruflo config init --force` 生成的文件和对应命令的当前输出为准。
