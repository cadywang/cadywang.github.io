---
title: PipeWire 会话管理与兼容层：WirePlumber、Pulse、JACK、ALSA、V4L2 如何协同
date: 2026-10-23 15:15:00
tags: [PipeWire, WirePlumber, PulseAudio, JACK, ALSA, V4L2]
categories: [教程]
---

PipeWire 单独运行时，更像一个“媒体图内核”：它能把 node、port、link 调度起来，但不会自动把所有桌面设备安排得井井有条。

真正让系统“开机就能用”的，是外面那圈组件：

- WirePlumber 负责设备发现、默认设备、策略和恢复；
- `pipewire-pulse` 负责 PulseAudio 协议兼容；
- `pipewire-jack` 负责 JACK API 兼容；
- `pipewire-alsa` 负责 ALSA PCM 兼容；
- `pipewire-v4l2` 负责 V4L2 兼容；
- GStreamer 元素和桌面 portal 负责应用侧接入。

这篇文章把机制层和策略层拼起来。

---

## 一、机制与策略的分工

| 层 | 组件 | 负责什么 |
| --- | --- | --- |
| 机制 | PipeWire daemon | 对象图、协议、设备节点、调度、共享内存 |
| 策略 | WirePlumber | 发现设备、选 profile、创建节点、决定连谁、保存状态 |
| 兼容 | pipewire-pulse/jack/alsa/v4l2 | 让旧 API 应用接入 PipeWire |
| 应用 | 播放器、浏览器、DAW、会议软件 | 创建 stream 或使用兼容 API |

PipeWire 自己的文档把 session manager 的职责写得很清楚：客户端权限、设备管理、endpoint 分组和策略都不属于核心 daemon。
所以“PipeWire 没声音”并不等于 PipeWire 进程本身有问题，可能是 WirePlumber 没起、配置没匹配、设备被占用或 profile 选错。

## 二、WirePlumber 的工作

WirePlumber 是一个独立进程，通过 PipeWire 客户端 API 观察和操作图。
它通常负责：

1. 监听 udev、DBus、BlueZ、libcamera 等事件；
2. 为新设备创建 SPA device 和 adapter；
3. 选择 device profile；
4. 创建 sink/source node 和端口；
5. 设置默认设备；
6. 把应用 stream 链接到目标设备；
7. 保存音量、静音、profile、默认路由；
8. 执行权限和策略规则；
9. 处理设备热插拔和错误恢复。

它并不“代替 PipeWire 播放音频”。它只是创建和连接节点，真正的数据搬运仍由 PipeWire 的图调度完成。

常见的用户可见对象：

| WirePlumber 概念 | PipeWire 表现 |
| --- | --- |
| Default sink/source | metadata 中的默认目标 |
| Device | `pw_device` 及 profile/route 参数 |
| Node | `pw_node` |
| Stream | 应用导出的 client-node |
| Link | `pw_link` |
| Route | 设备端口/连接选择 |
| Profile | 设备当前工作模式 |

`wpctl` 是 WirePlumber 的命令行工具，`pavucontrol` 通过 Pulse 兼容层操作同一套对象。

## 三、ALSA 设备的完整路径

一块声卡从硬件到应用的典型路径：

```text
内核 ALSA driver
    │ /dev/snd/*
    ▼
udev / WirePlumber monitor
    │ 发现 card
    ▼
SPA ALSA ACP/PCM device
    │ 枚举 profiles / routes / nodes
    ▼
module-spa-device + module-adapter
    │ 创建 PipeWire device/node/ports
    ▼
WirePlumber policy
    │ 选 profile、设置默认设备、连接 stream
    ▼
应用 stream
```

### ACP 与 PCM 的区别

- **ACP**：基于 ALSA Card Profile / UCM，能表达声卡 profile、route、端口组合，现代桌面优先使用。
- **PCM**：更直接的 ALSA PCM 抽象，通常退化为 on/off 两种 profile 或简单设备。

UCM 能描述“耳机插入时切到哪个 route”“扬声器和耳机是否互斥”等硬件关系。
没有 UCM 时，fallback 会简单很多，profile 选择也更粗糙。

### adapter 在中间做什么

设备原生格式可能是 S32、多声道、特殊 rate。
adapter 对外提供：

- DSP 模式：每声道一个 float32 端口；
- passthrough 模式：保留设备原生格式；
- 格式转换、重采样、声道映射；
- 音量、静音、峰值等处理。

因此应用的 44.1kHz 立体声和设备的 48kHz 多声道可以被桥接，而不用应用自己处理硬件格式。

## 四、PulseAudio 兼容层

`pipewire-pulse` 运行 PulseAudio 服务端协议。
Pulse 客户端仍然链接 `libpulse`，只是连接到的服务端换成了 PipeWire。

验证方式：

```bash
pactl info
```

输出中应能看到类似：

```text
Server Name: PulseAudio (on PipeWire ...)
```

常见工具：

| 工具 | 功能 |
| --- | --- |
| `pactl` | 查询/修改 sink、source、stream、module |
| `pavucontrol` | GUI 控制音量、设备、流 |
| `paplay` / `parecord` | Pulse 播放/录音 |
| `pamon` | 监听 PCM |

`module-protocol-pulse` 会维护 Pulse 对象到 PipeWire 对象的映射：

- Pulse sink/source ↔ PipeWire node/endpoint；
- Pulse sink-input/source-output ↔ 应用 stream；
- Pulse card ↔ device；
- Pulse port ↔ route/target；
- Pulse module ↔ 内部命令或 PipeWire 模块。

`pipewire-pulse` 不是第二个音频服务器。它只是另一个 PipeWire 客户端，不能和真正的 PulseAudio 服务端同时占用同一 socket。

## 五、JACK 兼容层

JACK 有两个不同方向：

```text
方向 A：JACK 应用 → PipeWire
  应用链接 libjack
      → pipewire-jack 替代库
          → PipeWire client-node

方向 B：PipeWire → 真实 JACK server
  module-jack-tunnel / spa-jack
      → 连接 jackd
```

`pw-jack` 通过修改 `LD_LIBRARY_PATH`，让应用加载 PipeWire 提供的 JACK 库：

```bash
pw-jack ardour
```

如果发行版已经完全用 PipeWire 替代 JACK 库，可以不加 `pw-jack`。

JACK 的映射关系：

| JACK | PipeWire |
| --- | --- |
| client | client + node |
| port | port |
| connection | link |
| buffer size | quantum |
| transport | sync group / timebase |

JACK 应用通常要求固定 buffer 和低延迟。
PipeWire 会尽量按 `PIPEWIRE_LATENCY` 或 JACK 请求配置图，但实际值还受设备 driver 和 session manager 影响。

## 六、ALSA 兼容层

`pipewire-alsa` 安装一个 ALSA PCM 插件，让传统 ALSA 应用使用 `pipewire:` 设备。
这和 PipeWire 的 SPA ALSA 后端是两个方向：

| 名称 | 方向 | 作用 |
| --- | --- | --- |
| `spa-alsa` | PipeWire → ALSA | 让 PipeWire 打开真实声卡 |
| `pipewire-alsa` | ALSA 应用 → PipeWire | 让 ALSA 应用把 PipeWire 当声卡 |

安装后可以检查：

```bash
aplay -L | grep pipewire
```

如果 `pipewire-alsa` 没装，PipeWire 仍然能管理声卡，只是 ALSA 应用不会自动走 PipeWire。

## 七、V4L2 与摄像头 portal

V4L2 也有两个方向：

- `spa-v4l2`：PipeWire 采集真实摄像头；
- `pipewire-v4l2`：把 PipeWire 节点伪装成 V4L2 设备，供传统应用使用。

摄像头权限通常通过 XDG Desktop Portal 处理。
沙箱应用不直接看到 `/dev/video*`，而是向 portal 请求 Camera 会话；portal 建立一个受限 PipeWire 连接，并把 fd 交给应用。
session manager 根据 `media_roles` 和 app id 授予相应节点权限。

这条链路把“设备权限”“PipeWire 对象权限”“应用沙箱”分开了：
portal 负责跨沙箱授权，PipeWire 负责对象级访问，session manager 负责策略落地。

## 八、GStreamer 接入

PipeWire 提供 GStreamer 元素：

```bash
gst-launch-1.0 pipewiresrc ! videoconvert ! autovideosink
gst-launch-1.0 audiotestsrc ! pipewiresink
```

以及设备 provider，让 `gst-device-monitor-1.0` 能看到 PipeWire 设备。
对 GStreamer 应用来说，PipeWire 是一个 source/sink 后端；底层仍然是 client-node 和共享缓冲区。

## 九、MIDI 如何走

MIDI 在 PipeWire 中不是 PCM，而是 control 端口上的事件序列：

- 媒体类型通常是 `application/control`；
- 每个事件带样本偏移，能与音频对齐；
- 常见控制类型包括 MIDI、OSC、UMP；
- 长 SysEx 可以分片传输。

ALSA sequencer 通过 `spa-alsa` 的 seq bridge 映射。
JACK MIDI 通过 pipewire-jack 做 1:1 事件转换。
PipeWire daemon 本身对 MIDI 没有特殊“MIDI 对象”，它只看 control 端口的格式和事件。

源码文档中提到，1.7 开发树重新把 MIDI1 作为默认偏好，同时仍支持 UMP producer；消费者未显式开启 UMP 时会做转换。
这类版本行为要以你实际运行的版本为准。

## 十、网络与远端设备

PipeWire 的网络能力不是单一协议，而是一组模块：

| 场景 | 模块 |
| --- | --- |
| RTP 组播/单播 | `module-rtp-sink/source/sap/session` |
| AirPlay | `module-raop-discover/raop-sink` |
| ROC | `module-roc-sink/source` |
| VBAN | `module-vban-send/recv` |
| Sendspin | `module-sendspin-send/recv` |
| Snapcast | `module-snapcast-discover` + simple protocol |
| NetJack2 | `module-netjack2-driver/manager` |
| 远端 Pulse | `module-pulse-tunnel` + `module-zeroconf-discover` |

网络路径和本地路径的本质区别是：

- 时钟不同步，需要 latency 和重采样/漂移补偿；
- 编码可能是有损的；
- 发现依赖 mDNS/SAP；
- 丢包和抖动会直接变成缓冲或 xrun。

因此网络 sink/source 通常配置更大的 latency，并通过 `sess.*`、`rtp.*` 参数控制包时长、缓冲和会话行为。

## 十一、一条典型桌面链路

以浏览器播放音乐为例：

```text
浏览器
  → Pulse 或 native stream
  → client-node
  → session manager 选择默认 sink
  → adapter / audioconvert / mixer
  → ALSA sink node
  → 内核 ALSA
  → 声卡
```

如果浏览器使用 Pulse，多一层 `pipewire-pulse` 协议翻译；
如果使用 JACK，多一层 pipewire-jack；
如果使用 PipeWire native，直接进入 client-node。

无论入口是什么，最终都汇聚到同一个 PipeWire 图和同一组 SPA 后端。

## 十二、排障时的分层方法

建议按下面顺序排查：

1. **进程层**：`pipewire`、`wireplumber`、`pipewire-pulse` 是否运行？
2. **对象层**：`pw-dump` 里有没有 device/node/port？
3. **策略层**：默认 sink 是谁？profile/route 是否正确？
4. **链路层**：应用 stream 和目标 node 之间有没有 link？
5. **格式层**：采样率、声道、格式是否协商成功？
6. **调度层**：有没有 xrun、wait 高、节点不 runnable？
7. **兼容层**：Pulse/JACK/ALSA 应用是否真的连接到了 PipeWire？
8. **权限层**：Flatpak/portal 客户端是否被授予目标对象？

这比一上来改 `pipewire.conf` 更有效，因为大多数“没声音”问题并不是 daemon 配置错误，而是对象不存在、默认路由错误或兼容层没接上。

## 十三、小结

这张关系图值得记住：

```text
应用 API（native/Pulse/JACK/ALSA/V4L2/GStreamer）
        │
        ▼
PipeWire 对象图 ← WirePlumber 策略
        │
        ▼
adapter / converter / mixer
        │
        ▼
SPA 后端（ALSA/V4L2/BlueZ/网络）
        │
        ▼
内核与硬件
```

- PipeWire 负责机制；
- WirePlumber 负责策略；
- 兼容层负责旧 API；
- SPA 负责硬件与处理；
- session manager 负责把“设备存在”变成“用户期望的路由”。

下一篇进入实践：如何用 `pw-dump`、`pw-mon`、`pw-top`、`pw-cli`、`pw-link`、`pw-cat` 等工具，把这套结构一步步观察出来。
