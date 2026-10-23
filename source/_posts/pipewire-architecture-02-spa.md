---
title: SPA 插件架构详解：PipeWire 如何加载、实例化并驱动底层组件
date: 2026-10-23 14:00:00
tags: [PipeWire, SPA, 插件架构, SPA POD, 源码阅读]
categories: [教程]
---

PipeWire 的模块负责“把对象挂进图里”，但真正碰 ALSA PCM、V4L2、蓝牙编解码、重采样和混音的，往往是 SPA 插件。

SPA 全称 Simple Plugin API。它既是一套**只有头文件的 C API**，也是一组运行时加载的 `.so` 插件。
PipeWire 用它来描述节点、参数、缓冲区、IO 区域和日志/事件循环等宿主能力。
不理解 SPA，就很难解释 `spa_node_process()` 为什么能被客户端进程执行，也很难看懂格式协商到底在协商什么。

这篇文章按“加载一个插件需要哪几步”展开。

---

## 一、SPA 的设计目标

仓库中的 SPA 文档把目标写得很明确：

- 除了标准 C 库外不引入依赖；
- 时间和空间开销尽量小；
- 宿主可配置，不能把日志、poll loop、系统调用写死；
- API 一致且可版本化；
- 新接口可以低成本的扩展。

因此 SPA 不是“PipeWire 的私有对象系统”，而是一个可独立使用的底层插件框架。
PipeWire 只是它最重要的使用者。

SPA 分成两层：

```text
spa/include/spa/        头文件 API，调用者和插件共享 ABI 约定
spa/plugins/            具体实现，如 alsa、v4l2、audioconvert、support
```

常见安装路径是 `spa-0.2` 目录，例如 `/usr/lib64/spa-0.2/`。
目录位置可以通过 `pkg-config --variable plugindir libspa-0.2` 或环境变量 `SPA_PLUGIN_DIR` 找到。

## 二、Factory、Interface、Handle 三个核心概念

一个 SPA 插件通常包含一个或多个 factory，每个 factory 可以创建对象，对象再暴露一个或多个 interface。

| 概念 | 作用 |
| --- | --- |
| `spa_handle` | 插件实例的内存载体和生命周期根 |
| `spa_handle_factory` | 描述如何计算大小、初始化、枚举接口 |
| `spa_interface` | 带类型和版本的方法表，调用者通过它使用功能 |
| support | 宿主提供给插件的基础能力数组 |

插件导出固定符号：

```c
spa_handle_factory_enum
```

加载者通过 `dlsym()` 找到它，然后反复调用，枚举所有 factory。

每个 factory 有：

- 名称，例如 `support.cpu`、`api.alsa.pcm.sink`；
- 版本；
- 属性；
- 创建对象所需大小；
- 初始化函数；
- 接口信息枚举函数。

Factory 名称是稳定的功能标识，具体由哪个 `.so` 实现可以变化。
这让 PipeWire 可以在 `context.spa-libs` 里做名称到库的映射。

## 三、加载流程

完整的加载顺序如下：

```text
dlopen(".../libspa-xxx.so")
        │
        ▼
dlsym(SPA_HANDLE_FACTORY_ENUM_FUNC_NAME)
        │
        ▼
for each factory:
    if factory->name 匹配目标:
        if interface 列表包含需要的类型:
            size = spa_handle_factory_get_size(factory, info)
            mem = calloc(1, size)
            spa_handle_factory_init(factory, mem, info, support, n_support)
            spa_handle_get_interface(handle, interface_type, &iface)
            cast iface 到具体接口结构
```

几个容易忽略的点：

1. **对象内存通常由调用者分配**，插件不负责 `malloc`。
2. `get_size()` 可能依赖 `info` 里的参数，所以初始化和计算大小要使用同一组信息。
3. `support` 是宿主注入的能力数组，插件需要日志、loop、system 等接口时会从这里取。
4. 接口类型用字符串标识，具体方法表则按头文件里的结构布局调用。
5. 使用完后要 `spa_handle_clear()`，再 `dlclose()`。

SPA 插件没有统一的“构造函数参数对象”，初始化和接口获取是两步。
这种设计让插件可以只暴露所需接口，也方便宿主进行能力探测。

## 四、事件与结果

SPA interface 既包含方法，也可以注册事件 listener。

例如 `spa_node` 的调用者会传入一个 `spa_node_events` 结构，里面包含：

- `info`：节点信息变化；
- `port_info`：端口信息变化；
- `result`：参数枚举等操作的结果；
- `event`：节点事件；
- `process` 完成后的状态通知等。

参数枚举不是返回一个数组，而是通过 `result` 回调逐项推送。
枚举函数的返回值可能是同步完成，也可能是异步结果：

```c
res = spa_node_enum_params(node, seq, id, start, num, filter);
if (SPA_RESULT_IS_ASYNC(res))
    expected_seq = SPA_RESULT_ASYNC_SEQ(res);
```

异步结果用高位的 `ASYNC_BIT` 编码，低 bits 是序列号。
调用者用序列号把后续结果和请求对应起来。

这种“事件推送结果”的模式避免了插件分配和返回复杂对象，也减少了所有权问题。
回调里的对象通常只在回调期间有效，调用者要保存就必须自己复制。

## 五、Node 接口：处理单元的最小契约

`spa_node` 是 PipeWire 图处理的核心接口。它大致包含：

| 能力 | 说明 |
| --- | --- |
| 端口信息 | 描述输入/输出端口数量、方向、可用性 |
| 参数枚举 | 查询支持的格式、缓冲区、延迟、端口配置等 |
| 参数设置 | 设置协商后的格式和运行参数 |
| IO 绑定 | 把共享内存中的 IO 区域绑定到节点 |
| 状态切换 | 在 suspended、idle、running 等状态间切换 |
| process | 消费输入、处理并产生输出 |
| 调度信号 | 由 driver 触发节点处理 |

一个节点可能完全在 daemon 进程里，也可能通过 `client-node` 协议跑在客户端进程里。
无论在哪边，调度端最终都是对同一个 `spa_node` 接口发命令。

### process 里不能做什么

数据线程上的 `process` 必须保持实时安全：

- 不做阻塞 I/O；
- 不等待互斥锁，除非能保证不会阻塞；
- 不进行不可预测的内存分配；
- 不打印高成本日志；
- 不假设每个周期都有完整数据；
- 正确处理空缓冲、部分缓冲和 xrun。

调试日志应使用 SPA/PipeWire 的日志设施，并把高噪声的 trace 日志留到明确排障时再开。

## 六、Port 与格式协商

端口是节点的方法入口，也是一个带方向的对象。
音频设备通常把每个声道暴露成独立端口；视频设备可能按帧或 plane 组织。

格式协商不是一次性“设置格式”，而是一个约束求解过程：

```text
应用希望：44.1kHz / 立体声 / S16
设备支持：48kHz 或 44.1kHz / 2ch / S32 或 S16
转换器支持：多种输入输出格式和重采样
        │
        ├── 枚举 EnumFormat
        ├── 选择交集
        ├── 设置 Format
        ├── 协商 Buffers
        └── 绑定 IO / 开始运行
```

常见的 SPA 参数包括：

- `SPA_PARAM_EnumFormat`：枚举可用格式；
- `SPA_PARAM_Format`：设置当前格式；
- `SPA_PARAM_Buffers`：缓冲区数量、大小、stride、数据类型；
- `SPA_PARAM_Meta`：需要哪些元数据；
- `SPA_PARAM_IO`：需要哪些 IO 区域；
- `SPA_PARAM_Latency`：延迟信息；
- `SPA_PARAM_PortConfig`：DSP/passthrough 等端口布局；
- `SPA_PARAM_Props`：音量、静音等通用属性。

格式协商经常由 adapter 完成。设备节点保持原生格式，adapter 在外部暴露统一格式，必要时插入转换或重采样。
这就是为什么一个只支持 48kHz 的声卡仍然可以被 44.1kHz 的应用使用，也解释了 DSP 模式为什么通常使用 float32 单声道端口。

## 七、SPA POD：可自描述的消息格式

PipeWire 协议、参数和元数据都使用 SPA POD 编码。
POD 不是 JSON，也不是 protobuf，而是一种带类型信息的二进制对象树。

核心思想是：**长度 + 类型 + 内容**。
这样接收方无需协议文件，也能知道下一个字段是 Int、String、Struct、Array 还是 Choice。

常见 POD 类型包括：

| 类型 | 用途 |
| --- | --- |
| `SPA_TYPE_Int` / `Long` / `Float` / `Bool` | 基础值 |
| `SPA_TYPE_Id` | 带命名空间的整数 ID，如参数类型 |
| `SPA_TYPE_String` | 字符串 |
| `SPA_TYPE_Struct` | 固定字段序列 |
| `SPA_TYPE_Object` | 带对象类型和属性键的结构 |
| `SPA_TYPE_Array` | 同类型元素数组 |
| `SPA_TYPE_Choice` | 在多个值、范围或步进值中选择 |
| `SPA_TYPE_Range` | 最小/最大值 |
| `SPA_TYPE_Fraction` | 分数，常用于采样率和延迟 |

POD 可以用 builder 构造，也可以用 parser 和 iterator 解析。
最典型的对象是格式描述：

```text
Object(SPA_TYPE_OBJECT_Format, SPA_PARAM_EnumFormat)
    Prop(mediaType, Id, audio)
    Prop(mediaSubtype, Id, raw)
    Prop(format, Id, S16LE)
    Prop(rate, Int, 48000)
    Prop(channels, Int, 2)
    Prop(position, Array, [FL, FR])
```

POD 的另一个优势是**可以表达约束**。
例如采样率不是只写一个 48000，而是写一个 Choice，包含多个离散值或一个范围。协商器据此寻找双方都能接受的配置。

POD 是 PipeWire 协议的通用交换格式。理解 POD 后，很多 `pw-dump` 输出、`pw-cli` 参数和日志里的结构就不再神秘。

## 八、Buffer：数据、元数据和 chunk

一个 `spa_buffer` 不直接等同于“一块 PCM 内存”。它包含：

```text
struct spa_buffer
├── n_metas / metas[]     头部、颜色信息、光标、损坏标记等
├── n_datas / datas[]     音频通道、视频 plane 等数据块
│     ├── type            内存类型（memfd、DMA-BUF、...）
│     ├── fd              文件描述符
│     ├── mapoffset       映射偏移
│     ├── maxsize         最大长度
│     ├── data            映射后的指针
│     └── chunk           offset / size / stride / flags
└── 内联或外部存储的元数据、chunk 和实际数据
```

几个关键点：

- **buffer 结构可以单独协商**，实际数据放在共享内存里；
- 多个 data 可以表示视频 plane 或分离的音频通道；
- chunk 描述当前有效区间，不一定等于整块 `maxsize`；
- 元数据可以描述时间戳、损坏、光标、画面方向等；
- 文件描述符可以被协议层传递，接收端再映射。

音频常见的是 memfd 共享环形缓冲；视频常用 memfd 或 DMA-BUF。
因此 PipeWire 可以在不复制大块媒体数据的情况下，把同一缓冲区交给多个消费者。

## 九、IO 区域：调度状态和缓冲区指针

SPA 用 `spa_io_*` 结构把共享状态放进节点可访问的内存。
常见 IO 区域包括：

| IO 类型 | 内容 |
| --- | --- |
| `spa_io_buffers` | 每个端口的 buffer 数组和状态 |
| `spa_io_clock` | 当前周期的时间、位置、采样率、持续时间 |
| `spa_io_position` | 图位置和时钟状态 |
| `spa_io_activation` | 调度依赖、pending/required 计数、状态 |
| `spa_io_async_buffers` | 异步链路的双缓冲槽位 |
| `spa_io_control` | 控制端口数据 |
| `spa_io_profiler` | 性能采样信息 |

这些区域由主线程或服务端在运行前配置好，数据线程只做指针访问和原子操作。
调度文档反复强调：节点运行时不应该再做资源分配和复杂配置。

`spa_io_clock` 是 driver 的契约。driver 每个周期要更新：

- `nsec`：本周期开始的单调时钟时间；
- `rate`：采样率或时间换算率；
- `position`：理想的样本位置；
- `duration`：本周期样本数；
- `rate_diff`：内部时钟相对单调时钟的校正因子；
- `next_nsec`：下一周期预计开始时间。

消费者依赖这些字段做时间戳、音视频同步和延迟计算。
如果驱动实现不遵守这套契约，图表面能跑，时间信息却会漂。

## 十、Support：宿主注入的基础能力

SPA 插件不应该直接假设自己在一个完整桌面环境里。
它需要的日志、主循环、系统调用封装、CPU 特性、线程和 DBus 能力，都通过 `spa_support` 数组获取。

常见 support interface：

| 接口 | 用途 |
| --- | --- |
| Log | 日志输出，可接 stderr、journal 或自定义后端 |
| Loop | poll/event loop，支持 fd、timer、eventfd |
| System | 文件、内存、线程、时钟等系统封装 |
| CPU | 检测 SIMD 和 CPU 特性，选择优化实现 |
| Thread | 线程创建和实时属性设置 |
| DBus | 访问 DBus，用于 BlueZ、portal 等 |
| Node Driver | 提供节点驱动相关支持 |

`spa/plugins/support` 目录就实现了这些基础插件，例如 `support.cpu`、`support.loop`、`support.system`、`support.log`。
它们本身也是 SPA 插件，因此 PipeWire 不需要为宿主能力写死一套全局函数。

## 十一、用 SPA 视角看 ALSA 与 audioconvert

以 ALSA 为例，SPA 层的典型对象链路是：

```text
spa_device（ALSA card / PCM 抽象）
    └── spa_node（PCM source 或 sink）
          ├── ports（每声道一个端口）
          ├── Format / Buffers 参数
          └── process（读写 ALSA ring buffer）
```

`audioconvert` 则提供另一类节点：

```text
spa_audioadapter
    ├── 内部节点：设备原生格式
    ├── 外部端口：DSP 单声道 float32 或 passthrough
    ├── 格式转换 / 重采样 / 声道映射
    └── 可选的音量、峰值、静音处理
```

设备的原生格式和应用的期望格式不必一致，adapter 负责把它们接起来。
这也是 PipeWire 能同时支持 pro-audio 多声道、桌面立体声和蓝牙编码的原因之一。

## 十二、读 SPA 源码的顺序

建议按这个顺序看：

1. `spa/include/spa/support/plugin.h`：factory 和 handle 的加载约定。
2. `spa/include/spa/node/node.h`：node、port、process、params 的接口。
3. `spa/include/spa/buffer/buffer.h`：buffer、data、chunk 和 meta。
4. `spa/include/spa/pod/*.h`：POD builder、parser、iterator。
5. `spa/plugins/support/plugin.c`：一个最小的多 interface 插件。
6. `spa/plugins/audioconvert/plugin.c`：复杂处理插件如何暴露多个 factory。
7. `spa/plugins/alsa/alsa.c`：设备类插件如何创建 source/sink/device。

读的时候不要只看 factory 名称，要顺着 `spa_handle_factory_init()` 找到对象结构，再找 `spa_node_methods` 里的 `process`、`set_io`、`enum_params` 实现。
这三个函数通常能解释一个节点 80% 的行为。

## 十三、常见坑

**把 SPA 当普通同步库调用。**
很多接口返回异步序列号，结果在之后的事件里回来。不要假设函数返回后状态已经稳定。

**在 process 中分配内存或加锁。**
实时线程的优先级越高，这类错误造成的抖动越明显。

**忽略版本字段。**
接口和事件结构都有版本号。用旧版本编译的调用者可能收不到新字段，也可能传入更小的结构。

**把回调指针长期保存。**
参数枚举和事件回调里的对象通常只在回调期间有效。需要保留就复制到自己的内存。

**混淆 POD 的类型和值。**
`SPA_TYPE_Id` 不是普通整数，`SPA_TYPE_Object` 也不是任意字典。调试时先看 POD 类型，再看内容。

## 十四、小结

SPA 的核心可以压缩成一条加载链：

```text
dlopen
  → factory enum
  → factory init
  → get interface
  → enum/set params
  → bind IO
  → process
  → clear
```

记住三组对象：

- **Factory / Handle / Interface**：插件如何被发现和实例化；
- **POD / Param / Buffer**：配置和数据如何表达；
- **Support / IO / Activation**：宿主如何提供能力、时间和调度状态。

下一篇回到 PipeWire 图本身：node、port、link 如何变成依赖关系，driver 如何触发整个图，xrun、异步和延迟又是怎么产生的。
