---
title: PipeWire 核心对象模型：Context、Core、Registry、Proxy 与资源生命周期
date: 2026-10-23 13:45:00
tags: [PipeWire, 对象模型, 异步IPC, 源码阅读]
categories: [教程]
---

读懂 PipeWire 的第一道门槛不是调度，也不是音频格式，而是“对象到底在哪一边”。

同一次 API 调用里，你可能会同时看到 `pw_context`、`pw_core`、`pw_registry`、`pw_proxy`、`pw_global`、`pw_resource` 和 `pw_impl_node`。
它们不是同一种东西的不同名字，而是分别属于**本地进程、远端连接、服务端全局命名空间、服务端实现层**的不同视图。
如果把这些概念压成一个“Node 对象”，后面的绑定、销毁、权限和异步消息就会完全对不上。

这篇文章从一次客户端连接开始，把 PipeWire 的对象模型拆开。

---

## 一、PipeWire 同时是库和服务器

`libpipewire` 包含两套能力：

1. **进程内图引擎**：创建 context、加载模块、实现 node/device、维护 loop 和 mempool。
2. **异步 IPC 客户端**：连接另一个 PipeWire 实例，通过代理对象操作远端图。

守护进程和普通客户端用的都是同一套库，只是使用方式不同：

```text
┌──────────────────────────── 客户端进程 ────────────────────────────┐
│ pw_main_loop                                                        │
│   └── pw_context                                                    │
│        ├── 本地模块 / SPA 库 / 导出类型                             │
│        ├── pw_core  ───────────── Unix socket ──────────────┐       │
│        └── pw_registry / pw_node / pw_port ...（代理）       │       │
└──────────────────────────────────────────────────────────────┼──────┘
                                                               │
┌──────────────────────────── 服务端进程 ──────────────────────┼──────┐
│ pw_main_loop                                                  │      │
│   └── pw_context                                              │      │
│        ├── pw_global 对象表                                   │      │
│        ├── pw_resource（对应每个客户端代理）                  │      │
│        └── pw_impl_*（node/link/device 等服务端实现）         │      │
└───────────────────────────────────────────────────────────────┴──────┘
```

客户端侧的 `pw_node` 是代理；服务端侧的 `pw_impl_node` 是实现。
代理只保存远端 ID、接口版本、属性和事件回调；真正的处理逻辑和调度状态在服务端实现对象里。

## 二、Loop：所有异步行为的底座

PipeWire 的 API 是异步的，状态变化通过事件推送，而不是同步查询。
这一切建立在 `pw_loop` 上。

源码提供三种常用包装：

| 类型 | 用途 |
| --- | --- |
| `pw_main_loop` | 在调用线程里运行一个 poll loop，适合工具和普通客户端 |
| `pw_thread_loop` | 在独立线程运行 loop，并提供锁和同步辅助 |
| `pw_data_loop` | 面向实时数据线程的 loop，按优先级和线程属性运行 |

一个 context 必须绑定一个 main loop。daemon 通常还有一到多个 data loop，数据线程在上面执行 node 的 `process`。
控制消息、对象状态变化、超时、eventfd 回调都依赖 loop。

理解这一点很重要：**PipeWire API 函数大多只是发请求，结果稍后通过 listener 回来。**
看到函数返回 0，只代表请求已经入队，不代表远端对象已经创建完成。

## 三、Context：进程内的资源总管

`struct pw_context` 是 libpipewire 的本地根对象。它管理：

- 加载模块和 SPA 库；
- 创建 `pw_impl_*` 对象；
- 维护服务端的 global 对象表；
- 连接远端 PipeWire 实例；
- 注册导出类型，把本地对象导出到另一个实例；
- 获取 data loop、work queue、timer queue、mempool；
- 保存支持接口数组（`spa_support`）。

可以把 context 看成“这个进程里的 PipeWire 运行时”。
它既可能扮演服务端，也可能扮演客户端，甚至同时做两者——例如 `pipewire-pulse` 就是一个连接主 daemon 的客户端，同时自己也能导出对象。

### 1. 模块加载与 SPA 库映射

模块是加载进 context 的共享库。配置中的：

```text
context.modules = [
    { name = libpipewire-module-protocol-native }
    { name = libpipewire-module-profiler }
]
```

最终会进入 `pw_context` 的模块加载流程。模块初始化函数拿到 `pw_impl_module` 和参数，然后可以向 context 注册对象、工厂、协议扩展和监听器。

SPA 插件则通过 `context.spa-libs` 把 factory 名称映射到具体库，例如把某个 `api.alsa.*` factory 映射到 `alsa/libspa-alsa.so`。
这样上层代码只依赖稳定的 factory 名称，不需要硬编码安装路径。

### 2. 本地对象与服务端全局对象

服务端创建 node 时，流程通常是：

```text
pw_context_create_node()
        │
        ├── 建立 pw_impl_node（本地实现）
        ├── 分配 pw_global（可被客户端发现的全局对象）
        └── global 获得一个进程内唯一 ID
```

`pw_global` 是对象在服务端 registry 中的身份。客户端通过 registry 看到它，再通过 bind 获得一个代理。

### 3. 导出类型

`pw_context_register_export_type()` 允许模块注册“如何把一个本地对象导出到远端”的函数。
`client-node`、`client-device`、`metadata` 等模块都利用这个机制，把客户端进程里的实现映射成服务端可调度的对象。

这也是 PipeWire 能让 node 跑在客户端进程里的关键：服务端并不复制一份处理逻辑，而是创建远端节点代理，再把调度信号、共享内存和 IO 区域交给客户端。

## 四、Core：连接远端实例的根代理

`pw_core` 是一个远端连接上的特殊对象，固定 ID 为 `PW_ID_CORE = 0`。
每次 `pw_context_connect()` 都会得到一个 core 代理。

它负责：

- 接收服务端信息、错误、ping/pong；
- 执行 `sync`，等待此前请求全部处理完；
- 管理对象 ID 的生命周期事件；
- 传递共享内存 ID（`add_mem` / `remove_mem`）；
- 创建和销毁对象；
- 作为其他代理的父连接。

`pw_core` 不是“整个 daemon”的万能句柄。它更像一个连接会话的根，具体对象要通过 registry 或工厂创建。

### Sync 与 Roundtrip

异步协议里，“我已经发送了请求”和“服务端已经处理完请求”是两件事。
`pw_core_sync()` 会发送一个同步请求，服务端处理到此位置后返回 `done` 事件。
客户端常把它当作 roundtrip：等待 `done`，就能确定之前的消息已经被处理。

很多工具在枚举 registry 后立刻 sync，因为 registry 没有“枚举结束”事件。
收到 `done` 后，才知道当前批次的 global 事件已经到齐。

## 五、Registry：全局对象目录

`pw_registry` 是服务端对象目录的代理。它持续推送：

- `global`：新增一个全局对象；
- `global_remove`：移除一个全局对象。

每个 global 包含：

| 字段 | 含义 |
| --- | --- |
| `id` | 服务端分配的对象 ID |
| `type` | 接口类型，如 `PipeWire:Interface:Node` |
| `version` | 服务端支持的接口版本 |
| `permissions` | 当前客户端对该对象的权限位 |
| `props` | 对象属性 |

客户端看到感兴趣的 global 后，调用 bind，把某个本地代理 ID 绑定到该 global。
绑定成功后，本地代理就可以调用接口方法并接收事件。

```text
server global(id=42, type=Node)
          │
          │ Registry::Bind(new_id=7)
          ▼
client proxy(id=7) ───────────────► server resource(id=7)
                                      └── 指向 global 42
```

注意两个 ID：

- **global ID**：对象在服务端 registry 中的身份；
- **proxy ID**：客户端连接内的本地句柄编号。

同一个 global 可以被多个客户端分别 bind，每个客户端都有不同的 proxy ID。
代理 ID 只在当前连接内有效。

## 六、Proxy 与 Resource 的一一对应

客户端调用方法时，消息头里的目标 ID 是 proxy ID。
服务端收到后，根据这个 ID 找到对应客户端的 resource，再分派到真正的对象实现。
反过来，服务端向 resource 发事件，客户端按同一 ID 找到 proxy。

```text
client                                      server
pw_node (proxy id 7)  ── method ──►  pw_resource (id 7)
       ▲                                   │
       │                                   ├── 指向 pw_global 42
       └────────── event ──────────────────┘
```

### 生命周期

删除对象时，客户端发送 destroy，服务端释放 resource 并可能移除 global。
服务端通过 `remove_id` 告诉客户端“这个代理 ID 可以安全复用”。
在收到这个事件之前，客户端不能随意把同一个 ID 分配给新对象，否则在途消息可能落到错误对象上。

这也是为什么 PipeWire 有一个 `object.serial` 概念：
global ID 可能被复用，而 serial 在对象生命周期内唯一，更适合做持久标识。

### Registry generation

协议还维护 registry generation。服务端每次分配新 global 时递增 generation，并通过消息 footer 同步给客户端。
客户端在下一条消息里带回自己已处理的 generation。
服务端据此判断：客户端引用的是当前对象，还是已经被销毁并复用 ID 的旧对象。若已过期，可以返回 `ESTALE`。

这是异步对象系统里非常典型的“ID 复用 + 在途消息”问题。读源码时看到 generation 字段，不要把它当成普通序号。

## 七、对象类型一览

PipeWire 的核心接口包括：

| 接口 | 作用 |
| --- | --- |
| Core | 连接根对象，ID 固定为 0 |
| Registry | 枚举和绑定 global |
| Client | 一个已连接客户端 |
| Module | 已加载模块 |
| Factory | 创建其他对象的工厂 |
| Device | 设备句柄，可枚举 profile、route、params |
| Node | 媒体处理节点 |
| Port | 节点的输入或输出端口 |
| Link | 两个端口的连接 |
| Metadata | 键值元数据存储 |
| Profiler | 调度与性能信息 |
| Session / Endpoint | 会话管理扩展对象 |

会话管理扩展不是所有部署都启用。WirePlumber 主要使用 core、device、node、metadata 和权限接口完成策略，不要求这些对象一定存在。

## 八、Properties、Params、Methods、Events 的区别

这四个词在 PipeWire API 里很常见，但语义不同：

| 概念 | 用途 | 例子 |
| --- | --- | --- |
| Property | 附加的键值信息，服务端通常不理解其业务含义 | `node.name`、`media.class`、`application.name` |
| Param | 有明确类型和语义的运行时配置 | 格式、缓冲区大小、延迟、端口配置 |
| Method | 客户端发给对象的方法 | 设置参数、订阅参数、销毁对象 |
| Event | 服务端推给客户端的状态变化 | Info、Param、State、Global |

Property 更像标签和策略输入；Param 才是协议层定义的结构化配置。
例如 `node.name` 是属性，而 `SPA_PARAM_Format` 是参数。

对象第一次 bind 后，一般会收到一个 Info 事件，里面有属性、参数信息、状态等。
之后只推送发生变化的部分，因此客户端必须维护缓存，不能假设每次事件都是完整快照。

## 九、权限也属于对象模型

每个客户端对每个 global 都有一组权限位：

| 位 | 含义 |
| --- | --- |
| `R` | 能看到对象并接收事件 |
| `W` | 能调用修改对象状态的方法 |
| `X` | 能调用对象方法 |
| `M` | 能以该对象作为 subject 设置 metadata |
| `L` | 允许建立到不可见对象的 link |

客户端连上后并不是立刻拥有全部权限。
`access` 模块会做第一层判断；如果不能直接授予 unrestricted，就挂起客户端，等待 session manager 配置权限。

这解释了为什么某些 Flatpak 应用能看到设备但不能改别人的音量，也解释了为什么 portal 连接需要单独标记。

## 十、一次典型客户端启动流程

伪代码如下，重点看对象之间的关系，不纠结具体参数：

```c
pw_init(NULL, NULL);

loop = pw_main_loop_new(NULL);
context = pw_context_new(pw_main_loop_get_loop(loop), NULL, 0);
core = pw_context_connect(context, NULL, 0);

pw_core_add_listener(core, &core_listener, &core_events, data);
registry = pw_core_get_registry(core, PW_VERSION_REGISTRY, 0);
pw_registry_add_listener(registry, &registry_listener, &registry_events, data);

/* 等待 Registry::Global 事件；收到感兴趣的 global 后 bind */
node = pw_registry_bind(registry, global_id,
                        PW_TYPE_INTERFACE_Node,
                        PW_VERSION_NODE, 0);
pw_node_add_listener(node, &node_listener, &node_events, data);

/* 确保此前请求都已处理 */
pw_core_sync(core, PW_ID_CORE, 0);

pw_main_loop_run(loop);
```

实际代码还要处理：

- 对象创建失败和协议错误；
- listener 的注销顺序；
- proxy 在销毁前先移除 listener；
- 连接断开；
- 多线程下把事件投递到正确的 loop；
- registry 中被移除对象对应的本地代理清理。

## 十一、高层封装简化了什么

手写 registry + proxy 很啰嗦，所以 libpipewire 提供两类高层对象：

| API | 面向的场景 | 内部大致行为 |
| --- | --- | --- |
| `pw_stream` | 播放、采集、屏幕共享等单向或双向流 | 创建 client-node、协商格式、管理缓冲区和 process 回调 |
| `pw_filter` | 多输入/多输出处理节点，类似 JACK client | 创建并导出处理节点，暴露端口和 process 回调 |

它们没有绕过对象模型，只是替你完成连接、创建节点、绑定端口、协商参数、处理缓冲区这些模板代码。
读 `stream.c` 或 `filter.c` 仍然需要理解 proxy/resource、SPA node 和调度，否则只能停留在“能跑”的层面。

## 十二、小结

对象模型可以压缩成一条链路：

```text
pw_context
   └── pw_core（远端连接根）
        └── pw_registry
             └── global
                  └── bind → pw_proxy ↔ pw_resource → pw_impl_*
```

需要牢记：

1. **Context 是本地的，Core 是远端的，Global 是服务端的命名空间条目。**
2. **Proxy 和 Resource 通过 ID 成对出现，但属于不同进程。**
3. **Registry 是持续事件流，不是一次性快照；sync 用来划线。**
4. **Property 是策略信息，Param 是结构化运行时配置。**
5. **权限是对象模型的一部分，不是外层包装。**

下一篇进入更底层：SPA 如何用 factory、interface、POD、buffer 和 IO 区域组成 PipeWire 的“零件箱”。
