---
title: PipeWire SPA 插件全目录：19 个底层插件目录与 factory 速查
date: 2026-10-23 15:00:00
tags: [PipeWire, SPA, 插件, ALSA, BlueZ, 源码地图]
categories: [教程]
---

PipeWire module 决定“图里有哪些对象”，SPA plugin 决定“这些对象怎么处理媒体、怎么访问设备”。
`src/modules` 里有 50 个模块，`spa/plugins` 下则有 19 个插件目录，覆盖 ALSA、V4L2、Bluetooth、音频格式转换、混音、测试源、Vulkan 和宿主支持。

这篇文章按目录逐个说明它们提供的 factory 和适用场景。
和模块目录一样，**源码目录存在不代表本机已经构建**；很多插件受编译选项和系统依赖控制。

---

## 一、先看 SPA 插件的共同结构

每个插件至少导出：

```c
int spa_handle_factory_enum(const struct spa_handle_factory **factory, uint32_t *index);
```

典型目录结构：

```text
spa/plugins/<name>/
├── meson.build
├── plugin.c              # factory 枚举入口
├── <implementation>.c    # 具体 factory / interface 实现
└── test-*.c              # 单元测试或基准
```

安装位置通常是 `spa-0.2/<name>/libspa-<name>.so`。
可以用下面的命令检查：

```bash
export SPA_PLUGIN_DIR=$(pkg-config --variable plugindir libspa-0.2)
find "$SPA_PLUGIN_DIR" -name 'libspa-*.so' | sort
spa-inspect "$SPA_PLUGIN_DIR/support/libspa-support.so"
```

`spa-inspect` 会列出 factory、接口和版本，是读插件前最快的入口工具。

---

## 二、音频设备与编码插件

### 1. `alsa`

ALSA 后端插件，输出 `spa-alsa`。它包含多个 factory：

| Factory / 组件 | 作用 |
| --- | --- |
| ACP device | 基于 ALSA Card Profile / UCM 的设备抽象，管理 profile、route 和端口 |
| PCM device | 一个 ALSA PCM 设备的 device 抽象 |
| PCM sink | 播放方向 SPA node，把数据写入 PCM |
| PCM source | 采集方向 SPA node，从 PCM 读取数据 |
| ALSA sequencer bridge | 把 ALSA sequencer MIDI 端口映射为 control 端口 |
| ALSA udev | 枚举和监听 ALSA 设备变化 |
| Compress offload | 对支持压缩卸载的 ALSA 设备提供 sink/device |

ACP 是理解现代声卡 profile 的关键。它把“硬件支持哪些 PCM、route、UCM verb”抽象成 device profile 和 port。
session manager 选择 profile，PipeWire 再创建对应 node。

### 2. `bluez5`

Bluetooth 音频与 MIDI 插件，输出 `spa-bluez5` 和一组编解码插件。
主工厂包括：

- BlueZ DBus 设备；
- BlueZ device；
- media sink / media source；
- SCO sink / source；
- A2DP sink / source；
- MIDI enum / MIDI node。

编解码器单独构建为 `spa-codec-bluez5-*`，例如 SBC、FastStream、AAC、aptX、LDAC、LHDC、LC3、LC3plus、Opus、G722、CVSD、mSBC 等。
具体哪些可用取决于编译依赖和耳机支持。

BlueZ 插件负责蓝牙协议侧的 profile、codec、SCO/A2DP 传输和 MIDI，但设备发现与路由仍由 session manager 协调。

### 3. `v4l2`

V4L2 摄像头/视频设备插件，输出 `spa-v4l2`：

| 组件 | 作用 |
| --- | --- |
| device | 打开 `/dev/video*`，管理格式和缓冲区 |
| source | 视频采集 node |
| udev | 监听 V4L2 设备变化 |

PipeWire 的 V4L2 后端和 `pipewire-v4l2` 兼容库不是一回事：
前者让 PipeWire 使用摄像头；后者让传统 V4L2 应用把 PipeWire 当作 V4L2 设备。

### 4. `libcamera`

libcamera 后端插件，源码是 C++ 文件，输出 `spa-libcamera`。
它通过 libcamera 管理摄像头设备和 source，适合需要 libcamera 管线控制的平台。
目录中的文件包括 device、manager、source 等实现。

### 5. `avb`

AVB/AVDECC 的 SPA 设备插件，提供 AVB PCM source/sink 和 device 抽象。
它和 `module-avb` 的协议栈配合，面向专业音视频桥接网络。
启用条件包含 Linux 平台和 AVB 编译选项。

### 6. `jack`

JACK 后端插件，输出 `spa-jack`：

- JACK device；
- JACK source；
- JACK sink。

它的用途是让 PipeWire 作为一个 JACK 客户端连接真实 JACK server。
这和 `pipewire-jack` 的方向相反：后者是让 JACK 应用连接到 PipeWire。

---

## 三、处理与转换插件

### 7. `audioconvert`

输出 `spa-audioconvert`，核心工厂：

- `audioadapter`：设备原生格式与 DSP/passthrough 端口之间的适配器；
- `audioconvert`：采样格式转换、声道映射、重采样、音量/峰值处理等。

该目录包含大量 SIMD 变体：

```text
fmt-ops-c / sse2 / ssse3 / sse41 / avx2 / neon / rvv
channelmix-ops-c / sse / avx
resample-native-c / sse / ssse3 / avx2 / neon
volume-ops-c / sse
```

运行时会根据 CPU 能力选择实现。
这也是为什么同一个 `audioconvert` 在不同机器上的性能路径可能不同。

### 8. `audiomixer`

输出 `spa-audiomixer`：

- `audiomixer`：把多个输入混成一个输出；
- `mixer-dsp`：DSP 混音节点。

同样包含 C、SSE、SSE2、AVX2 等混音实现。
音频图中的多路应用混音通常会落到这里。

### 9. `aec`

回声消除插件：

- `spa-aec-null`：空实现路径；
- `spa-aec-webrtc`：WebRTC 回声消除实现，受 `echo-cancel-webrtc` 构建选项控制。

它服务于 `module-echo-cancel`，把麦克风信号和参考播放信号做自适应抵消。

### 10. `filter-graph`

滤波器图插件，输出 `spa-filter-graph`。
核心是通用的音频 DSP 图，支持内置节点和外部插件：

| 插件库 | 能力 |
| --- | --- |
| `spa-filter-graph-plugin-builtin` | copy、mixer、delay、convolver 等内置节点 |
| `spa-filter-graph-plugin-ladspa` | LADSPA 插件 |
| `spa-filter-graph-plugin-lv2` | LV2 插件 |
| `spa-filter-graph-plugin-sofa` | SOFA/HRTF 空间音频 |
| `spa-filter-graph-plugin-ebur128` | EBU R128 响度测量 |
| `spa-filter-graph-plugin-ffmpeg` | FFmpeg filtergraph |
| `spa-filter-graph-plugin-onnx` | ONNX 推理节点 |

`module-filter-chain` 是它最常见的上层使用者。

### 11. `control`

输出 `spa-control`，提供 control mixer。
它处理 `application/control` 媒体类型的控制流，MIDI 也是其中一种控制消息。
与音频 PCM 不同，control 端口传输的是带时间偏移的事件序列。

### 12. `ffmpeg`

输出 `spa-ffmpeg`，提供编码/解码节点，源码分为 `ffmpeg-dec.c` 和 `ffmpeg-enc.c`。
它可用于压缩视频或音频格式转换，默认构建选项通常关闭，需要显式启用。

### 13. `videoconvert`

输出 `spa-videoconvert`：

- `videoadapter`：视频设备与 DSP/passthrough 端口适配；
- `videoconvert_dummy`：测试用转换实现；
- `videoconvert_ffmpeg`：基于 FFmpeg 的像素格式转换。

视频格式、色彩空间、stride 和 DMA-BUF 布局都在这一层处理。

### 14. `volume`

输出 `spa-volume`，提供 legacy volume 插件。
现代音频链路更多通过 `audioconvert`/`audiomixer` 里的 volume 处理完成；
这个插件主要保留给兼容或特定配置。

---

## 四、测试、源与 GPU 插件

### 15. `audiotestsrc`

输出 `spa-audiotestsrc`，可以生成测试音。
在排障时，它比真实应用更容易控制，适合验证图、格式和延迟。

### 16. `videotestsrc`

输出 `spa-videotestsrc`，生成测试图样。
它和 audiotestsrc 一样，是验证视频链路和格式协商的基线工具。

### 17. `test`

输出 `spa-test`，包含 `fakesrc` 和 `fakesink`。
这些不是给普通用户的功能，而是单元测试和开发调试用的可控节点。

### 18. `vulkan`

输出 `spa-vulkan`，包含：

- Vulkan compute source；
- Vulkan compute filter；
- Vulkan blit filter；
- Vulkan DSP blit filter。

它把 GPU 计算和图像拷贝接入视频图。源码中同时包含 DMA-BUF 的 Linux 与非 Linux 回退路径。
默认通常不启用，需要 Vulkan 依赖和构建选项。

---

## 五、宿主支持插件

### 19. `support`

输出 `spa-support`，是 SPA 插件运行所需的基础能力集合：

| Factory | 用途 |
| --- | --- |
| `support.log` | 日志输出 |
| `support.system` | 系统调用、内存、文件等封装 |
| `support.cpu` | CPU 特性检测 |
| `support.loop` | poll/event loop |
| `support.node-driver` | 节点驱动辅助 |
| `support.null-audio-sink` | 空音频 sink 支持 |

此外还构建：

- `spa-dbus`：DBus 支持；
- `spa-journal`：systemd journal 日志；
- `spa-evl`：EVL 实时系统支持，受构建选项控制。

`support` 是最适合初学者读的插件：factory 结构清晰，接口不复杂，也没有大型硬件协议栈。

---

## 六、插件与模块的对应关系

把两层放在一起看，常见组合是：

```text
ALSA 声卡
  module-spa-device / adapter
      → spa-alsa（ACP/PCM）
          → spa-audioconvert（格式/DSP）
              → graph links

蓝牙耳机
  WirePlumber / module-spa-device
      → spa-bluez5 + codec
          → graph links

摄像头
  WirePlumber / module-spa-device
      → spa-v4l2 或 spa-libcamera
          → graph links

滤波链
  module-filter-chain
      → spa-filter-graph
          → LADSPA / LV2 / builtin / FFmpeg / ONNX
```

注意：模块名、SPA factory 名和实际安装库名不同。
排障时要分层确认：

1. 配置有没有加载模块；
2. 模块能不能找到 SPA 库；
3. SPA 库能不能枚举到目标 factory；
4. factory 初始化是否因设备/依赖失败；
5. 对象是否被 session manager 选中并连接。

## 七、如何自己检查一个插件

以 audioadapter 为例：

```bash
export SPA_PLUGIN_DIR=$(pkg-config --variable plugindir libspa-0.2)

spa-inspect "$SPA_PLUGIN_DIR/audioconvert/libspa-audioconvert.so"
spa-inspect "$SPA_PLUGIN_DIR/alsa/libspa-alsa.so"
```

看输出时重点关注：

- factory 名称；
- factory 版本；
- 提供的 interface 类型；
- 初始化需要的 support；
- 是否有可实例化对象。

如果 `spa-inspect` 能看到 factory，但 PipeWire 运行时创建失败，问题通常在设备权限、格式、参数或外部服务，而不在插件加载本身。

## 八、读插件源码的推荐顺序

1. `spa/plugins/support/plugin.c`：最小 factory 枚举。
2. `spa/plugins/audiotestsrc/audiotestsrc.c`：生成数据的 node。
3. `spa/plugins/audiomixer/audiomixer.c`：多输入处理。
4. `spa/plugins/audioconvert/audioadapter.c`：适配器和格式协商。
5. `spa/plugins/alsa/alsa-pcm.c`：真实设备的读写和 poll。
6. `spa/plugins/v4l2/v4l2-source.c`：视频 buffer 和 mmap。
7. `spa/plugins/bluez5/bluez5-device.c`：外部协议集成。

每读一个插件，都先找三件事：

```text
factory 定义
spa_node_methods（或对应 interface methods）
set_io / process / enum_params
```

这三处通常足够解释插件的核心行为。

## 九、小结

19 个 SPA 插件目录大致分为四类：

1. **硬件与协议后端**：alsa、bluez5、v4l2、libcamera、avb、jack。
2. **处理与转换**：audioconvert、audiomixer、aec、filter-graph、control、ffmpeg、videoconvert、volume。
3. **测试与 GPU**：audiotestsrc、videotestsrc、test、vulkan。
4. **宿主支持**：support。

下一篇把 PipeWire daemon 与桌面环境之间的“策略层”补齐：WirePlumber 如何管理设备，Pulse/JACK/ALSA/V4L2 兼容层如何接入，以及音频、视频、MIDI、网络流如何汇合。

