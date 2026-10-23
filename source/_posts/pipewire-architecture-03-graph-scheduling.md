---
title: PipeWire 图调度与实时数据流：driver、activation、async 与 latency
date: 2026-10-23 14:15:00
tags: [PipeWire, 实时音频, 图调度, latency, xrun]
categories: [教程]
---

PipeWire 的图不是“每个节点各自开线程读数据”的松散集合。
它把一个 driver 和一组 runnable 节点组织成调度组，用共享内存里的激活记录和 eventfd 串起依赖关系。
只有理解了这套机制，`pw-top` 里的 quantum、wait、busy、xrun 才有意义。

这篇文章按一个周期的执行顺序讲：谁决定开始，谁先跑，谁通知谁，异步节点为什么多一拍延迟。

---

## 一、图的三个基本对象

```text
+------------+                    +------------+
|            |                    |            |
|   Node  A  |  Port  ── Link ── Port  | Node B |
|            |                    |            |
+------------+                    +------------+
```

- **Node**：媒体处理单元，有 0 个或多个输入/输出端口。
- **Port**：节点的入口或出口，方向固定为 input 或 output。
- **Link**：从 output 连到 input，表示数据方向。

节点可以在 daemon 内，也可以在客户端进程内。
远程节点的调度信息通过共享内存和 fd 传递，数据本身也走共享缓冲，不经过 socket 复制。

## 二、控制线程与数据线程

PipeWire 至少有两类线程：

| 线程 | 工作 |
| --- | --- |
| main thread | IPC、对象创建/销毁、参数协商、图配置 |
| data thread | 实时处理、调用 node process、更新周期状态 |

主线程先把资源准备好：

- 分配共享内存；
- 把 buffer 指针写进 IO 区域；
- 配置节点格式和参数；
- 建立 activation 记录；
- 决定哪些节点 runnable、哪个节点是 driver。

之后数据线程只做轻量操作。
这是 PipeWire 能保持低延迟的基础：**配置不在实时路径上反复发生。**

## 三、Activation：调度的核心状态

每个节点有一个 eventfd 和一份 activation 记录。记录里有：

```text
status     NEED_DATA / HAVE_DATA / OK 等状态位
pending    还有多少依赖未满足
required   一共有多少依赖
```

依赖关系来自 link：

```text
A 的 output ──link──► B 的 input
```

这意味着 A 必须先完成，B 才能开始。于是 B 的 `required` 加一，A 处理完后递减 B 的 `pending`。
当 pending 变成 0，A 通过 eventfd 唤醒 B。

多个 link 如果连接的是同一对节点，只会形成一个节点级依赖，不会因为端口多就重复计数。

## 四、Driver：周期的发令枪

一个调度组必须有一个 driver。driver 可以是：

- ALSA PCM 节点；
- 蓝牙设备节点；
- 虚拟驱动；
- 网络设备节点；
- 其他声明 `node.driver = true` 的节点。

driver 通过硬件中断或 timer 开始周期，并更新 `spa_io_clock`。
PipeWire 会在候选 driver 中选择 `priority.driver` 最高者。

driver 维护它需要调度的 follower 列表。一个周期大致是：

1. 检查上一周期是否完成；未完成的节点可能被记为 xrun。
2. 处理 reposition、timebase 等控制请求。
3. 把每个 follower 的 pending 设置为 required。
4. 更新周期计数。
5. 递减目标节点的 required/pending，pending 为 0 的节点被 eventfd 唤醒。
6. follower 处理完后继续向下游递减。
7. driver 自己也作为依赖末端被唤醒，周期结束。
8. 统计 CPU 时间和性能数据。

图中 A、B、driver 的依赖可以画成这样：

```text
driver ──依赖──► A ──依赖──► B
   ▲                          │
   └────────依赖──────────────┘
```

driver 并不是简单调用一个“全局 process”，而是驱动一个依赖图。

## 五、Runnable：哪些节点应该跑

一个节点即使存在，也不一定参与处理。未连接的设备节点、暂时无用的 filter 不应该持续空转。

PipeWire 用 port passive mode、node group、link group、sync group 等属性决定 runnable 状态。

### 1. Port passive mode

端口可以设置：

| 值 | 行为 |
| --- | --- |
| `false` | 主动激活 peer，也会被 active peer 激活 |
| `true` | 不激活 peer，也不被 peer 激活 |
| `follow` | 不主动激活 peer，但会被 active peer 激活 |
| `follow-suspend` | 特殊情况可互相激活，通常用于设备端口 |

节点的 `node.passive` 可以把这些模式批量应用到输入/输出端口。
设备节点通常默认 `follow-suspend`，这样它们不会单独空转，但被应用链路激活时能正常启动。

### 2. Node group 与 link group

- `node.group`：同一组的节点一起 runnable，并共享调度；
- `node.link-group`：表示多个节点内部已经相连，避免 session manager 再连成环；
- `node.sync-group`：在 JACK transport 等场景下把时间线同步到一起。

当组内有多个 driver 候选时，仍然按优先级选一个，其余成为 follower。

### 3. 没有 driver 时

一个 playback 节点直接连到 capture 节点，如果双方都不声明 driver，组里就没有驱动源，图不会运行。
可以设置 `node.want-driver = true` 让它加入一个可用 driver，或者设置 `node.always-process = true` 强制参与处理。

`always-process` 隐含 `want-driver`，适合需要持续产生数据的节点，但也会带来不必要的 CPU 开销。

## 六、远程节点如何被调度

如果 node 在客户端进程里，服务端不能直接调用它的函数。
解决方法是把 eventfd 和 activation 记录通过协议传给客户端。

```text
server 共享内存             client 进程
┌───────────────┐          ┌────────────────┐
│ activation fd ├─────────►│ eventfd        │
│ buffers       ├─────────►│ 映射后的 IO    │
└───────────────┘          └───────┬────────┘
                                   │
                             spa_node_process()
```

客户端需要的时候可以直接被 peer 或 driver 唤醒，不必每次先经过服务端中转。
远程 driver 也可以直接启动周期；只有在 profiler 启用时，才额外通知服务端汇总性能信息。

这也是 PipeWire 支持“处理在客户端、调度在服务端”的关键。

## 七、Async 节点：多一拍换并发

异步节点的 `node.async = true`。它不参与同步依赖链：

- 不增加 peer 的 pending；
- peer 也不增加它的 pending；
- driver 只负责启动它；
- 它的完成不影响整个图的完成。

为了防止读写同一缓冲区，异步链路使用 `spa_io_async_buffers` 的两个槽位：

```text
cycle N    : 写 slot 1，读 slot 0
cycle N+1  : 写 slot 0，读 slot 1
```

因此异步链路至少增加一个量子的延迟。
driver 输出端口有一个例外：driver 启动时会把新数据复制到上一周期槽位，让异步节点立刻拿到当前数据。

异步适合无法保证实时优先级的处理，例如某些客户端侧计算或网络处理。
代价是延迟和缓冲管理更复杂，不能把它当成“免费的并行”。

## 八、Lazy scheduling：让数据可用性决定何时跑

普通 driver 按自己的节拍周期触发。但有些场景不适合固定频率：

- 屏幕共享只在有新帧时才有数据；
- 采集设备的数据速率与播放设备时钟不完全一致；
- 消费者处理速度比 producer 慢，producer 不应空转。

PipeWire 用 `RequestProcess` 事件实现 lazy scheduling：

- follower 设置 `node.supports-request`，在需要时请求处理；
- driver 设置 `node.supports-lazy`，监听请求并按策略启动图；
- 两边都支持时，调度可以在“driver 定时唤醒”和“follower 请求唤醒”之间切换。

典型组合：

| 场景 | driver | follower |
| --- | --- | --- |
| 屏幕共享 | producer 声明 driver，有新帧才触发 | consumer 跟随 |
| 无头服务器 | consumer 作为 lazy driver | producer 发出请求 |
| 帧编码 | producer 作为 lazy driver | consumer 请求下一帧 |

lazy 不等于“没有延迟”，它只是把唤醒时机交给数据可用性。
消费者仍要处理缓冲策略，否则可能引入丢帧或额外排队。

## 九、Latency：两股方向相反的传播流

PipeWire 的 latency 不是节点上一个静态数字，而是沿链路传播的对象。

有两个方向：

```text
output latency  ──────────────►  从上游累积到下游
input latency   ◄──────────────  从下游累积到上游
```

- 输出端口上的 output latency 表示“信号到达这里之前已经延迟了多少”；
- 输入端口上的 input latency 表示“信号从这里离开后还要延迟多少”。

当端口有多个链路时，PipeWire 对 latency 取范围合并：

- 最小值取所有分支的最小值；
- 最大值取所有分支的最大值。

节点自身的 `ProcessLatency` 会加到端口 latency 上。
adapter、重采样、异步链路、设备内部缓冲都会贡献延迟。

### 异步链路的额外一拍

普通链路只是传播 latency；异步链路会在传播时额外加一个 quantum。
如果 sink 的输入 latency 是 1 quantum，经过异步链路后在 stream 侧可能变成 2 quantum。
这不是估算，而是调度结构决定的事实。

### 延迟不匹配

如果一条信号路径经过 512 样本延迟的处理器，另一条路径没有，它们汇合时就会错位。
latency 信息可以用来插入 delay/补偿节点，或者由 session manager 调整路由。

排障时不要只看 `PIPEWIRE_LATENCY`。
它主要影响请求的图和缓冲配置，实际端到端延迟还取决于驱动、图深度和设备。

## 十、Xrun 与性能观察

xrun 通常表示上一周期没有在下一个周期开始前完成。
可能原因包括：

- 数据线程被抢占；
- 客户端 process 阻塞或做重活；
- 设备时钟与图时钟漂移；
- 缓冲区太小；
- CPU 频率/功耗策略导致调度不稳定；
- 某个节点异步或远程唤醒延迟过大。

工具上可以用 `pw-top` 看：

- driver 和节点的 quantum；
- wait 时间；
- busy 时间；
- xrun 计数；
- 采样率和格式。

但不要只盯单个数字。一次 xrun 可能是偶发，也可能是整条链路已经长期超时。

## 十一、一个播放周期串起来

假设 ALSA sink 是 driver，应用播放节点是 follower：

```text
1. ALSA 中断 / timer 到期
2. sink 更新 spa_io_clock：nsec、position、duration、next_nsec
3. 服务端把应用节点的 pending 设为 required
4. 应用节点被唤醒，写入播放缓冲区
5. 应用节点递减 sink 的 pending
6. sink 的 pending 归零，被唤醒
7. sink 从共享缓冲区读取并写入 ALSA ring buffer
8. 周期结束，profiler 记录时间
```

如果应用节点是远程 client-node，第 4 步的唤醒直接通过 eventfd 到客户端进程。
如果链路是异步的，第 3 到第 5 步之间会经过双缓冲槽位，数据对应到上一个周期。

## 十二、设计取舍

PipeWire 的调度设计有几组明确取舍：

| 选择 | 好处 | 代价 |
| --- | --- | --- |
| 共享内存传数据 | 避免大块复制 | 生命周期和同步更复杂 |
| 中心 driver 调度 | 时间线统一，延迟可计算 | 依赖 driver 质量 |
| 客户端侧 node | 应用可直接处理数据 | 远程唤醒和 RT 属性更关键 |
| async 节点 | 避免同步阻塞 | 至少多一拍延迟 |
| lazy scheduling | 空闲时不空转 | 需要双方声明能力 |
| 图级 latency 传播 | 可做端到端补偿 | 每个节点必须正确实现 |

理解这些取舍后，再看 `pw-top`、日志和链路属性，就不会只停留在“这个数大不大”，而能判断是结构问题还是实现问题。

## 十三、小结

调度层记三件事：

1. **driver 决定周期，activation 决定依赖，eventfd 决定唤醒。**
2. **runnable 是图属性，不是节点创建后就自动成立。**
3. **latency 是双向传播的链式信息，异步链路会额外增加一拍。**

下一篇看 daemon 如何加载这些模块、如何用原生协议连接客户端，以及 socket、fd 传递、权限和 portal 如何共同保证安全边界。
