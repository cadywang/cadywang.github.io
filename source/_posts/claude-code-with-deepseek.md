---
title: Claude Code 接入 DeepSeek：官方 Anthropic 兼容端点的配置与实测（模型映射 · 成本 · 排障）
date: 2026-10-17 18:27:17
tags: [Claude Code, DeepSeek, 模型接入, 配置, 实测]
categories: [教程]
---

换模型这件事，最怕的不是「不会配」，而是**配了之后不知道背后到底跑的是哪个模型**。

DeepSeek 官方提供了一个 Anthropic 兼容端点，改几个环境变量就能让 Claude Code 跑在 DeepSeek 上，不需要自建代理。
但我在实测里发现了两件值得写下来的事：一是**响应体里的 `model` 字段会把请求里的名字原样回显**，它不能证明后端模型；
二是 **V4-Pro 是纯文本模型，图片会被静默忽略**，接口不会报错。

这篇文章记录完整的配置方法、模型映射的验证方法（用 token 数反推后端），以及踩到的坑。
本文就是在 `deepseek-v4-flash` 这套配置下写完的。

---

## 一、它解决什么问题

Claude Code 的模型请求走 Anthropic Messages API。只要把 `ANTHROPIC_BASE_URL` 指向一个**协议兼容**的服务，
再给一个该服务的 key，Claude Code 本身不需要改动。

| 角色 | 说明 |
| --- | --- |
| Claude Code | 终端里的编程 Agent，负责 Prompt、工具调用循环、上下文管理 |
| DeepSeek Anthropic 端点 | `https://api.deepseek.com/anthropic`，按 Anthropic Messages 协议收发 |
| DeepSeek 模型 | `deepseek-flash`（V4.1-Flash）、`deepseek-v4-pro`（V4-Pro） |

现实约束大概有这几条：

* **成本**：长会话 + 子 Agent 会放大 token 消耗，需要一个便宜的日常档和一个更强的重活档；
* **协议**：不能改 Claude Code 的源码，只能通过它已有的环境变量注入；
* **能力边界**：DeepSeek 的 V4-Pro 是纯文本模型，**不支持图片输入**；
* **可回退**：随时能切回 Anthropic，不能把自己锁死。

## 二、架构：直连官方兼容端点

整条链路很短，没有中间代理：

```
   ┌──────────────────┐          HTTPS          ┌───────────────────────────┐
   │   Claude Code    │  ───────────────────▶   │  api.deepseek.com         │
   │  (终端 / IDE)     │   Anthropic Messages    │  /anthropic/v1/messages   │
   │                  │  ◀───────────────────   │                           │
   │ 工具循环、上下文   │      SSE / JSON         │  deepseek-flash           │
   └──────────────────┘                         │  deepseek-v4-pro          │
         你在这里工作                              └───────────────────────────┘
```

Claude Code 侧只认三个东西：

1. **地址**：`ANTHROPIC_BASE_URL`
2. **凭据**：`ANTHROPIC_AUTH_TOKEN` 或 `ANTHROPIC_API_KEY`
3. **模型名**：`ANTHROPIC_MODEL` 及按档位覆盖的三个变量

### 为什么不自己搭一个转换代理

OpenAI 格式 ⇄ Anthropic 格式的转换代理很常见，但在这里是多余的：官方端点已经直接说 Anthropic 协议，
流式事件、`count_tokens`、`tool_use` 都是原生支持。多一层代理就多一个故障点，也多一份要维护的代码。

代价是：**DeepSeek 实现到哪里，你就只能用哪里**。Anthropic 后来新增的 beta 能力，这个端点不一定跟得上。

## 三、关键设计与取舍

### 1. 模型映射：claude-opus 落到 V4-Pro，其余落到 Flash

服务端对 Claude 的模型名做了映射（这是官方文档写明的规则）：

| 请求里的模型名 | 实际服务模型 |
| --- | --- |
| `claude-opus-*` | `deepseek-v4-pro` |
| `claude-sonnet-*` | `deepseek-flash` |
| `claude-haiku-*` | `deepseek-flash` |

**映射发生在服务端**，所以你在 Claude Code 里 `--model opus` 就能拿到 V4-Pro，不需要改成本地名。

这里有个容易忽略的取舍：**`claude-sonnet-*` 也被映射到 Flash**。
也就是说，如果你只设置了 `ANTHROPIC_MODEL` 而没设置分档变量，子 Agent 和「快模型」路径默认都会落到同一个档位，
失去了「一个强模型干活、一个小模型跑杂活」的成本分层。想要分层，就显式设置 `ANTHROPIC_DEFAULT_OPUS_MODEL` 和 `ANTHROPIC_DEFAULT_HAIKU_MODEL`。

### 2. `[1m]` 后缀是可选的，不是必须的

官方文档的示例写成 `deepseek-flash[1m]`，我实测 `deepseek-flash[1m]`、`deepseek-v4-pro[1m]`、
以及不带后缀的 `deepseek-flash`、`deepseek-v4-flash`、`deepseek-v4-pro` **都返回 200**。
`[1m]` 是 Claude Code 用来标记 1M 上下文的写法，DeepSeek 这两个模型本身就有 1,048,576 的上下文窗口。

### 3. 为什么保留 `deepseek-chat` 是个陷阱

`deepseek-chat` 仍然可用（返回 200），但它**不在 `/models` 的模型列表里**，而且 tokenizer 明显不同：

同样一句 `hi`，`deepseek-chat` 计 **5** 个输入 token，V4 系列计 **31** 个。
把它配进 Claude Code 不会立刻报错，但你会拿到一个既不是 Flash 也不是 Pro 的行为。
新配置里不要用它，按官方文档用 `deepseek-flash` / `deepseek-v4-pro` 就好。

### 4. 配置放环境变量还是 `settings.json`

| 方式 | 优点 | 代价 |
| --- | --- | --- |
| Shell 环境变量 | 临时、可随窗口关闭失效 | 每个新终端都要重新 export |
| `~/.claude/settings.json` 的 `env` | 持久、启动即生效 | **全局生效**，影响所有项目 |
| `claude --settings <file>` | 按项目隔离 | 每次启动要多带一个参数 |

我自己的机器用的是 `~/.claude/settings.json`，因为本来所有项目都想走 DeepSeek。
如果只是想在某个项目里试一下，用 `--settings` 指向一个只有 `env` 字段的小文件更干净，也不会污染全局配置。

⚠️ 无论用哪种方式，**key 都不要提交进仓库**。`settings.json` 如果放在项目里，记得进 `.gitignore`。

### 5. `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_API_KEY` 都行

实测两种请求头都会返回 200：

```bash
# ANTHROPIC_AUTH_TOKEN 的风格
curl -H "Authorization: Bearer $KEY" ...

# ANTHROPIC_API_KEY 的风格
curl -H "x-api-key: $KEY" ...
```

另外 `anthropic-version` 请求头**可以省略**，不带也返回 200。Claude Code 自己会带，不用你操心。

## 四、实测数据

环境：Windows 10 Pro 10.0.19045，Node `v24.22.0`，npm `11.19.1`，Claude Code `2.1.302`，Git `2.52.0.windows.1`。
测试时间 2026-10-17，所有请求都发往 `https://api.deepseek.com/anthropic/v1/messages`。

### 4.1 模型清单（`GET /models` 原样返回）

| 模型 | 名称 | 上下文 | 最大输出 | 输入模态 | effort |
| --- | --- | --- | --- | --- | --- |
| `deepseek-flash` | DeepSeek-V4.1-Flash | 1,048,576 | 393,216 | text + image | low / high / max（默认 high） |
| `deepseek-v4-pro` | DeepSeek-V4-Pro | 1,048,576 | 393,216 | **text** | low / high / max（默认 high） |

### 4.2 用 token 数反推后端模型

请求统一是 `{"max_tokens":1,"messages":[{"role":"user","content":"hi"}]}`，只换模型名。**输入 token 数相同，说明落到了同一个后端**：

| 请求的模型名 | 返回的 `input_tokens` | 推断 |
| --- | --- | --- |
| `claude-opus-5-5` | 84 | → `deepseek-v4-pro` |
| `deepseek-v4-pro` | 84 | 基准 |
| `claude-sonnet-5-5` | 31 | → `deepseek-flash` |
| `claude-haiku-5-5` | 31 | → `deepseek-flash` |
| `claude-3-5-sonnet-20241022` | 31 | → `deepseek-flash` |
| `deepseek-flash` | 31 | 基准 |
| `deepseek-v4-flash` | 31 | Flash 的别名 |
| `deepseek-chat` | 5 | 另一个 tokenizer，非 V4 |

> 这正是验证「映射是否生效」的实用方法：响应里的 `model` 字段会**原样回显你请求的名字**（请求 `claude-opus-5-5`，它就回 `claude-opus-5-5`），所以不能拿它当证据；`usage.input_tokens` 才靠得住。

### 4.3 接口行为

| 场景 | 结果 |
| --- | --- |
| 不带 key | `401` |
| key 无效 | `401`，`{"error":{"type":"authentication_error",...}}`，带 `request_id` |
| `stream: true` | 标准 Anthropic SSE：`message_start` → `content_block_start` → … |
| `POST /v1/messages/count_tokens` | `200`，返回 `{"input_tokens":6}` |
| 模型名传 `gpt-4o` | `400`：`The supported API model names are deepseek-flash, deepseek-v4-pro, but you passed gpt-4o.` |
| 给 `deepseek-v4-pro` 发图片块 | `200`，**不报错**；模型的思考内容里直接说「unsupported image」 |

最后一条是这次实测里最值得警惕的行为：**Pro 是纯文本模型，图片不会让请求失败，只会被丢掉**。
如果你用 Claude Code 贴截图让它看 UI，而当前模型被映射到了 V4-Pro，你得到的回答是基于「没有图」的上下文——
它可能照样一本正经地回答你。要看图，确保走的是 `deepseek-flash`（`input_modalities` 里有 `image`）。

## 五、部署指南

### 环境要求

| 项目 | 要求 | 说明 |
| --- | --- | --- |
| Node.js | **>= 22.0.0** | 来自 `@anthropic-ai/claude-code@2.1.302` 的 `engines` 字段 |
| Git for Windows | 建议安装 | Windows 下 Claude Code 依赖它执行命令 |
| DeepSeek API Key | platform.deepseek.com 申请 | 本文用 `sk-...` 代表你的 key，不要外泄 |

⚠️ DeepSeek 文档写的是「Node.js 18+」，但当前 npm 包声明的是 `>=22.0.0`。
如果按 18 装完跑不起来，先升级 Node 再看。

### 1. 安装 Claude Code

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

### 2. Linux / macOS：环境变量

```bash
export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
export ANTHROPIC_AUTH_TOKEN=sk-你的DeepSeekKey
export ANTHROPIC_MODEL=deepseek-flash
export ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro
export ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-flash
export ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-flash
export CLAUDE_CODE_SUBAGENT_MODEL=deepseek-flash
export CLAUDE_CODE_EFFORT_LEVEL=max
export CLAUDE_CODE_AUTO_COMPACT_WINDOW=786432
```

### 3. Windows：PowerShell

```powershell
$env:ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"
$env:ANTHROPIC_AUTH_TOKEN="sk-你的DeepSeekKey"
$env:ANTHROPIC_MODEL="deepseek-flash"
$env:ANTHROPIC_DEFAULT_OPUS_MODEL="deepseek-v4-pro"
$env:ANTHROPIC_DEFAULT_SONNET_MODEL="deepseek-flash"
$env:ANTHROPIC_DEFAULT_HAIKU_MODEL="deepseek-flash"
$env:CLAUDE_CODE_SUBAGENT_MODEL="deepseek-flash"
$env:CLAUDE_CODE_EFFORT_LEVEL="max"
$env:CLAUDE_CODE_AUTO_COMPACT_WINDOW="786432"
```

以上变量在 `2.1.302` 的可执行文件里都能查到；`CLAUDE_CODE_AUTO_COMPACT_WINDOW=786432` 是官方文档给出的推荐值。

### 4. 持久化：写进 `settings.json`

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "sk-你的DeepSeekKey",
    "ANTHROPIC_MODEL": "deepseek-flash",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "deepseek-v4-pro",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "deepseek-flash",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-flash",
    "CLAUDE_CODE_SUBAGENT_MODEL": "deepseek-flash",
    "CLAUDE_CODE_EFFORT_LEVEL": "max"
  }
}
```

放在 `~/.claude/settings.json` 是全局生效；想按项目隔离，就用下面这个文件 + `--settings`。

### 5. 验证

```bash
# 1) 先脱离 Claude Code，直接确认端点与 key
curl -sS https://api.deepseek.com/anthropic/v1/messages \
  -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
  -H "content-type: application/json" \
  -d '{"model":"deepseek-flash","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}'

# 2) 进入项目，启动
cd /path/to/my-project
claude
```

第一条返回 `200` 且带 `"type":"message"`，说明 key 和端点没问题；剩下的就是 Claude Code 侧的事了。

## 六、使用指南

| 目的 | 做法 |
| --- | --- |
| 默认用 Flash | `ANTHROPIC_MODEL=deepseek-flash` |
| 手动切强模型 | `claude --model deepseek-v4-pro`，或会话里 `/model` |
| 让子 Agent 用便宜档 | `CLAUDE_CODE_SUBAGENT_MODEL=deepseek-flash` |
| 调整推理强度 | `CLAUDE_CODE_EFFORT_LEVEL`，支持 `low` / `high` / `max` |
| 单项目隔离配置 | `claude --settings ./deepseek.settings.json` |
| 回退到 Anthropic | 删掉 `settings.json` 里的 `env` 段，或 unset 这些变量后重开终端 |

几个实际使用上的建议：

* **日常用 Flash**：1M 上下文 + 便宜，写代码、读仓库够用；遇到硬问题再 `--model deepseek-v4-pro`。
* **`--model` 的别名仍然有效**：`opus` 会被映射到 V4-Pro，`sonnet`/`haiku` 映射到 Flash，不必记全名。
* **网页搜索**：DeepSeek 文档说明支持 Claude Code 的 Web Search，并提示搜索结果的总结会产生额外的 token 费用。
  这条我没有单独实测消耗，按需使用即可。
* **看图请走 Flash**：V4-Pro 是纯文本模型，图片会被静默丢弃。

## 七、排障速查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `401 authentication_error` | key 错误或没带上 | 用 `curl` 单独验证 key；确认 `ANTHROPIC_AUTH_TOKEN` 非空 |
| `400 ... supported API model names are deepseek-flash, deepseek-v4-pro` | 模型名不在支持列表 | 改成 `deepseek-flash` 或 `deepseek-v4-pro`（或 `claude-*` 让它映射） |
| 配置成功但回答「没看到图片」 | 当前落到 V4-Pro，图片被忽略 | 切到 `deepseek-flash` 再发图 |
| 以为在跑 Opus，其实不是 | 响应 `model` 字段原样回显请求名 | 用 `usage.input_tokens` 对比（见 4.2） |
| 装完启动失败，提示 Node 版本 | npm 包要求 `>=22` | 升级 Node，不要停在 18 |
| 子 Agent 意外很贵 | 分档变量没设，全部落到同一档 | 显式设置 `ANTHROPIC_DEFAULT_*` 与 `CLAUDE_CODE_SUBAGENT_MODEL` |
| 换了 key 不生效 | 旧终端里还有旧环境变量 | 重开终端；`settings.json` 的 `env` 优先于你 export 的值时，检查两处是否冲突 |
| 某些 Anthropic beta 能力不可用 | 兼容端点未实现该能力 | 临时切回 Anthropic 官方端点 |

## 八、小结

三条主线：

1. **不需要代理**。把 `ANTHROPIC_BASE_URL` 指向 `https://api.deepseek.com/anthropic`，Claude Code 就能工作；
   `ANTHROPIC_AUTH_TOKEN` 与 `ANTHROPIC_API_KEY` 两种写法都可用。
2. **映射在服务端**。`claude-opus-*` → `deepseek-v4-pro`，`claude-sonnet-*` / `claude-haiku-*` → `deepseek-flash`；
   要分层成本，就显式设置分档变量。验证映射要看 `usage.input_tokens`，别看响应里的 `model`。
3. **知道边界**。V4-Pro 纯文本、图片被静默忽略；`deepseek-chat` 虽可用但不在模型列表里，新配置不要用。

如果你也在用 Claude Code，这个改动是**可逆**的：删掉 `settings.json` 的 `env` 段就回到官方端点。
建议先只在一个项目里用 `--settings` 试，确认工作流顺手了再全局切换。

> 本文的接口结论均来自 2026-10-17 在 Claude Code `2.1.302` 上的实测；
> 模型清单与映射规则同时参考了 DeepSeek 官方文档（`api-docs.deepseek.com`）。
> 价格与限流策略随官方调整，请以官网为准。
