---
title: PipeWire 模块全目录：50 个 src/modules 模块分别做什么
date: 2026-10-23 14:45:00
tags: [PipeWire, 模块, 源码地图, Linux音频]
categories: [教程]
---

PipeWire 的 `src/modules` 目录里，当前快照有 50 个 `module-*.c`。
这些模块不是“可选功能列表”那么简单，它们决定了 PipeWire 能不能提供协议、能不能创建虚拟设备、能不能连接其他服务器。

这篇文章按职责把 50 个模块全部过一遍。
先说明：**存在源文件不等于当前系统已经构建或加载**。很多模块依赖 ALSA、BlueZ、Avahi、FFmpeg、ROC、X11 等外部库，配置中也可能只在特定场景加载。

---

## 一、怎么理解 PipeWire 模块

模块是加载进某个 PipeWire 进程的共享库，入口是：

```c
pipewire__module_init(struct pw_impl_module *module, const char *args)
```

模块可以：

- 创建 factory 或 global 对象；
- 给 context 添加 listener；
- 注册协议扩展；
- 注册导出类型；
- 创建虚拟 sink/source；
- 监听 DBus、mDNS、网络端口等外部事件。

模块和 SPA 插件不是一回事：

| 层级 | 例子 | 运行位置 |
| --- | --- | --- |
| PipeWire module | `module-protocol-native` | 加载它的进程 |
| SPA plugin | `spa-alsa`、`spa-videoconvert` | 由模块或应用按需加载 |
| Application API | `pw_stream`、`pw_filter` | 客户端进程 |

下面的目录按“基础管道、虚拟处理、设备、网络”分组。

---

## 二、基础管道与协议模块

| 模块 | 作用 |
| --- | --- |
| `module-access` | 客户端首次连接时做访问检查，决定授予 unrestricted 还是挂起等待 session manager |
| `module-adapter` | 把 SPA node 包装成可对接统一格式的 PipeWire 节点，负责端口、格式转换和 DSP/passthrough |
| `module-client-device` | 允许客户端把本地 `spa_device` 导出到服务端，服务端以 device 资源代理它 |
| `module-client-node` | 允许客户端把处理节点导出到服务端，是 `pw_stream`、`pw_filter` 和 JACK 客户端的底层通道 |
| `module-link-factory` | 提供 `link-factory`，让客户端按 node/port 属性创建 Link |
| `module-metadata` | 创建 metadata factory，并支持客户端导出 metadata 存储 |
| `module-profiler` | 提供 Profiler 接口，为 `pw-top`、`pw-profiler` 收集图状态和性能数据 |
| `module-protocol-native` | 实现默认的 Unix socket 原生协议，包括消息、fd 传递和协议扩展 |
| `module-protocol-pulse` | 在 PipeWire 上实现 PulseAudio 服务端协议，兼容 `pactl`、`pavucontrol` 等工具 |
| `module-protocol-simple` | 提供面向 simple protocol player 和 Snapcast 等场景的简单音频 socket 协议 |
| `module-rt` | 给数据线程设置实时优先级、nice、rlimit、RTKit/portal 回退和 uclamp 等调度属性 |
| `module-scheduler-v1` | 当前 1.7 开发树的调度实现模块，负责 runnable、节点组、driver 选择与图重算；文档标注 Since 1.7.0 |
| `module-session-manager` | 提供 session、endpoint、endpoint-stream、endpoint-link 等会话管理扩展对象；文档说明目前并未被主流 session manager 主动使用 |
| `module-spa-device` | 加载并管理一个 SPA device，把它映射成 PipeWire device |
| `module-spa-device-factory` | 提供创建 SPA device 的 factory |
| `module-spa-node` | 加载并管理一个 SPA node，把它映射成 PipeWire node |
| `module-spa-node-factory` | 提供加载 SPA node 的 factory |
| `module-portal` | 通过 DBus 识别 XDG portal 进程，给 portal 管理的客户端打 access 标记 |


### protocol-pulse 为什么是 module

`pipewire-pulse` 可执行文件启动一个 PipeWire context，再加载 `module-protocol-pulse`。
模块负责 PulseAudio 协议解析、命令分派、stream/sink/source 映射、volume 和 sample cache 等。
对内核或 PipeWire 核心来说，它只是一个模块；对 PulseAudio 客户端来说，它看起来像一个完整的服务端。

### scheduler-v1 的定位

老版本调度逻辑内嵌在 core 中，1.7.0 引入 `module-scheduler-v1` 把调度行为模块化。
它维护 node runnable、组、driver 选择和 graph 重算。源码中的 passive mode 判断与调度的设计文档一致。
如果你读的是更老的 PipeWire，模块列表和调度入口可能不同。

---

## 三、虚拟设备与处理模块

| 模块 | 作用 |
| --- | --- |
| `module-combine-stream` | 创建一个虚拟 sink/source，把多个 sink、source 或 monitor 流合并；支持延迟补偿和按需创建 stream |
| `module-echo-cancel` | 创建 echo-cancel capture/playback 节点，用参考信号抵消扬声器回授 |
| `module-example-filter` | 自定义 filter 的示例模块，展示 stream 输入输出和处理回调 |
| `module-example-sink` | 自定义 sink 的示例模块，通常不安装，适合学习模块结构 |
| `module-example-source` | 自定义 source 的示例模块，通常不安装，适合学习模块结构 |
| `module-fallback-sink` | 没有其他 sink 时动态出现一个兜底 sink，主要用于 PulseAudio 兼容场景 |
| `module-filter-chain` | 用 LADSPA、LV2、builtin、SOFA、EBUR128、FFmpeg 等构建任意音频滤波图，可作为虚拟设备或插入链路 |
| `module-loopback` | 把 capture stream 的输出原样送给 playback stream，用于虚拟设备、桥接和声道重映射 |
| `module-parametric-equalizer` | 读取 AutoEQ/Squiglink 生成的参数均衡配置，转换为可用的 filter chain |
| `module-pipe-tunnel` | 把 PipeWire 音频与 Unix pipe 双向桥接 |
| `module-pulse-tunnel` | 把 PipeWire 音频隧道到远端 PulseAudio 或 pipewire-pulse 连接，通常与 zeroconf 发现模块配合 |

这些模块的共同点是：**它们用 PipeWire 自己的 stream/node 能力构造新对象**，通常不直接打开硬件。

### filter-chain 的关键结构

```text
capture stream → filter graph nodes → playback stream
                      │
                      ├── LADSPA / LV2
                      ├── builtin convolver / delay / mixer / copy
                      ├── SOFA / EBUR128
                      └── FFmpeg filtergraph
```

filter-chain 的配置本身是一个小图：节点、节点之间的 links、对外 inputs/outputs、控制参数。
它适合做耳机校正、房间校正、动态处理和实验性 DSP。

### loopback 与 combine-stream 的区别

- loopback 是一条流量通道：capture → playback。
- combine-stream 是多对一/一对多的聚合：多个 sink/source 合并，或一个虚拟 sink 分发到多个设备。

两者都可能被 session manager 当作虚拟设备管理，但图结构和用途不同。

---

## 四、硬件与外部服务模块

| 模块 | 作用 |
| --- | --- |
| `module-avb` | AVB/AVDECC/Milan 音频网络支持，包含 ADP、ACMP、AECP、MSRP、MVRP、gPTP、stream 等实现 |
| `module-ffado-driver` | 通过 libffado 提供 FireWire 音频 source/sink/duplex 驱动 |
| `module-jack-tunnel` | 把 PipeWire 音频隧道到外部 JACK server；可配置 sink/source/duplex 和 MIDI 端口 |
| `module-jackdbus-detect` | 监听 jackdbus 启动，自动加载并配置 jack-tunnel |
| `module-x11-bell` | 监听 X11 bell 事件，通过 libcanberra 播放系统提示音 |

这些模块直接和外部设备或桌面服务打交道：

- `avb` 面向专业音视频桥接网络；
- `ffado` 面向 FireWire 音频接口；
- `jack-tunnel` / `jackdbus-detect` 用于 PipeWire 与真实 JACK 并存；
- `x11-bell` 是桌面集成功能，不属于核心音频路径。

`module-avb` 的构建还要求 Linux 平台；其协议栈比普通虚拟设备复杂得多，阅读时应先看 `module-avb` 子目录的 ADP/ACMP/AECP/MVRP 等文件。

---

## 五、网络流与发现模块

| 模块 | 作用 |
| --- | --- |
| `module-netjack2-driver` | 作为 netjack2 driver，与 netjack2 manager 建立低延迟网络音频通道 |
| `module-netjack2-manager` | 监听 netjack2 driver，协商通道数量并管理会话 |
| `module-raop-discover` | 通过 zeroconf 发现 AirPlay/RAOP 接收器，并按规则加载 raop-sink |
| `module-raop-sink` | 创建 AirPlay/RAOP sink，向远端设备发送音频 |
| `module-roc-sink` | 把音频通过 ROC 发送到预配置接收端 |
| `module-roc-source` | 从 ROC sender 接收音频并作为 PipeWire source |
| `module-rtp-sap` | 通过 SAP 公告 RTP 流，并按规则创建 RTP source |
| `module-rtp-session` | 创建通过 mDNS/Avahi 公告的 RTP 媒体会话，兼容 Apple MIDI 的 MIDI 场景 |
| `module-rtp-sink` | 创建 PipeWire sink，把音频打成 RTP 包发出 |
| `module-rtp-source` | 创建 PipeWire source，接收 RTP 音频/MIDI |
| `module-sendspin-recv` | 通过 sendspin 协议接收音频/控制数据，默认监听 8928 |
| `module-sendspin-send` | 通过 sendspin 协议发送音频，默认监听 8927 |
| `module-snapcast-discover` | 通过 zeroconf 发现 Snapcast server，并加载 simple protocol sink |
| `module-vban-recv` | 接收 VBAN 音频/MIDI，默认端口 6980 |
| `module-vban-send` | 发送 VBAN 音频/MIDI |
| `module-zeroconf-discover` | 用 zeroconf 发现远端 PulseAudio/PipeWire，并自动加载 pulse-tunnel |

这张表里最容易混淆的是“发现”和“传输”：

- `*-discover` 负责找服务、匹配规则、加载 tunnel/sink；
- `*-sink` / `*-source` 负责真正的媒体传输；
- `netjack2-manager` 和 `netjack2-driver` 是两端角色，不是同一个进程里的简单客户端/服务端。

### RTP 系列为什么有 4 个模块

- `rtp-sink`、`rtp-source`：最直接的发送和接收端；
- `rtp-sap`：负责 SAP 公告和动态建立接收端；
- `rtp-session`：负责 mDNS 公告和会话级发现，偏 Apple MIDI 兼容。

RTP 模块共享 `module-rtp/stream.c` 的 ring buffer、buffer mode、时间戳和线程模型。
阅读顺序建议先看 sink/source，再看 sap/session。

### AirPlay、ROC、VBAN、Sendspin、Snapcast 的取舍

| 方案 | 适用场景 |
| --- | --- |
| RAOP | AirPlay 接收器，兼容 Apple 生态 |
| ROC | 低延迟、带纠错的实时音频网络 |
| VBAN | VB-Audio 生态和简单 UDP 音频 |
| RTP/SAP | 标准组播和局域网广播 |
| Sendspin | 基于 WebSocket 的发送/接收模型 |
| Snapcast | 多房间同步播放生态 |

它们各有自己的发现、编码和时钟处理，不能简单替换。

---

## 六、如何确认某个模块是否可用

不要只看源码文件。按顺序检查：

```bash
# 1. 查二进制模块是否存在
find /usr/lib* -name 'libpipewire-module-*.so' | sort

# 2. 查实际配置加载了哪些模块
pw-config -n pipewire.conf

# 3. 查运行时对象和 factory
pw-cli ls Module
pw-cli ls Factory

# 4. 查依赖是否满足
ldd /path/to/libpipewire-module-raop-sink.so
```

如果模块存在但没有加载，问题通常在配置或依赖；
如果加载了但没有对象，可能是 session manager 没创建、规则没匹配或设备未出现。

## 七、小结

50 个模块可以记为五类：

1. **基础管道**：access、adapter、client-node/device、factory、metadata、profiler、协议、scheduler。
2. **虚拟处理**：combine、echo-cancel、filter-chain、loopback、例程。
3. **硬件/桌面**：AVB、FFADO、JACK tunnel、X11 bell。
4. **网络传输**：RTP、RAOP、ROC、VBAN、Sendspin、NetJack2。
5. **发现与兼容**：zeroconf、snapcast、PulseAudio、simple protocol。

下一篇进入更底层的 19 个 SPA 插件目录，看这些模块和节点最终调用了哪些 factory 和硬件实现。
