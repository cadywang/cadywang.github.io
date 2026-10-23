---
title: PipeWire 工具与排障手册：从 pw-dump 到 pw-top 的实战路径
date: 2026-10-23 15:30:00
tags: [PipeWire, 排障, pw-cli, pw-dump, pw-top]
categories: [教程]
---

PipeWire 的问题通常不会以“PipeWire 报错”这种形式出现。
更常见的是：应用没声音、默认设备不对、麦克风被占用、延迟变大、视频没有画面、JACK 应用找不到端口。

此时最有效的做法不是改配置，而是按控制面、图结构、数据面和兼容层逐层观察。
PipeWire 自带了一套工具，正好对应这些层次。

本文列出常用工具、典型命令和排障顺序。以下命令面向 Linux；当前源码是在 Windows 上阅读的，没有在本机运行 PipeWire 做性能测试。

---

## 一、工具总览

| 工具 | 用途 |
| --- | --- |
| `pipewire` | daemon 主程序 |
| `pipewire-pulse` | PulseAudio 兼容服务 |
| `pw-cli` | 交互式或单命令对象操作 |
| `pw-dump` | 导出整个图或指定类型的 JSON |
| `pw-mon` | 实时监控对象和状态变化 |
| `pw-top` | 实时查看 driver、节点、quantum、xrun |
| `pw-link` | 列出、创建、删除链路 |
| `pw-cat` / `pw-play` / `pw-record` | 播放、录音、MIDI 收发 |
| `pw-config` | 查看配置内容和搜索路径 |
| `pw-metadata` | 读写 metadata |
| `pw-dot` | 生成 Graphviz 图 |
| `pw-profiler` | 采集 profiler 数据 |
| `pw-loopback` | 快速创建 loopback 流 |
| `pw-mididump` | 打印 MIDI 事件 |
| `pw-container` | 在受限环境运行客户端，调试权限/沙箱 |
| `pw-reserve` | 设备抢占/保留辅助 |
| `pw-audioconvert` | 音频格式转换工具 |
| `spa-inspect` | 检查 SPA 插件的 factory 和 interface |
| `spa-monitor` | 监控 SPA device |
| `spa-json-dump` | 导出 SPA 对象 JSON |
| `spa-resample` | 重采样工具 |
| `spa-acp-tool` | 调试 ALSA ACP |

不需要一次记住全部。先掌握 `pw-dump`、`pw-cli`、`pw-top`、`pw-link` 四个就能解决大部分问题。

## 二、第一步：确认进程和连接

```bash
systemctl --user status pipewire.service wireplumber.service
systemctl --user status pipewire-pulse.service
```

如果使用 socket activation，可能只看到 socket 和对应 service。
再确认客户端能够连接：

```bash
pw-cli info 0
```

`0` 是 core 对象 ID。能返回 server 信息，说明 native protocol 至少可用。
如果这里失败，问题在 daemon、socket 路径、权限或 `XDG_RUNTIME_DIR`，还轮不到音频路由。

检查 socket：

```bash
echo "$XDG_RUNTIME_DIR"
ls -l "$XDG_RUNTIME_DIR"/pipewire-*
```

默认 socket 名是 `pipewire-0`。
`PIPEWIRE_RUNTIME_DIR` 可以覆盖运行时目录。

## 三、pw-dump：先看对象图

最常用命令：

```bash
pw-dump > /tmp/pw-dump.json
pw-dump Node
pw-dump Device
pw-dump Link
```

JSON 里能看到对象的：

- `id`
- `type`
- `version`
- `permissions`
- `properties`
- `info`
- `params`

### 找默认 sink

先看 Node 的 `media.class` 和 `node.name`：

```bash
pw-dump Node | jq -r '.[] | [.id, .info.props["node.name"], .info.props["media.class"]] | @tsv'
```

如果装了 `jq`，可以快速筛选：

```bash
pw-dump Node | jq '.[] | select(.info.props["media.class"] == "Audio/Sink")'
```

再看默认设备 metadata：

```bash
pw-metadata -n default
```

默认 sink/source 通常由 session manager 写入 metadata。
如果没有默认对象，WirePlumber 的配置或设备状态可能有问题。

### 找应用 stream

应用播放时，通常会出现一个 `Stream/Output/Audio` 节点。
用下面命令找：

```bash
pw-dump Node | jq '.[] | select(.info.props["media.class"] | startswith("Stream/"))'
```

重点看：

- `application.name`
- `media.name`
- `node.target`
- `target.object`
- `state`
- 是否已有 Link

### 看设备 profile 和 route

```bash
pw-dump Device | jq '.[] | {id, name: .info.props["device.name"], params}'
```

具体 profile/route 的枚举结果通常很大。
可以结合 `pw-cli` 对指定 device 枚举参数，或者用 `wpctl status` 看 session manager 的整理结果。

## 四、pw-cli：单命令和交互式操作

`pw-cli` 适合做精确查询：

```bash
pw-cli info 0
pw-cli ls Node
pw-cli ls Port
pw-cli ls Link
pw-cli ls Device
```

进入交互模式后可以：

```text
pw-cli
> help
> ls Node
> info 42
> enum-params 42 Format
> quit
```

也可以直接执行：

```bash
pw-cli enum-params 42 Format
pw-cli enum-params 42 Props
```

`enum-params` 的对象 ID 和参数名要匹配实际对象。
如果参数 ID 不确定，可以先看对象 Info 里的 param 列表。

### 设置参数

`pw-cli s` 可以设置参数，但不同对象参数结构不同。
例如设置 device profile 通常需要 JSON 对象：

```bash
pw-cli s 42 Profile '{ index: 1, save: true }'
```

不同版本的参数格式可能有差异，操作前先用 `enum-params` 看清结构。
不要在不了解字段含义时执行写操作。

## 五、pw-mon：观察事件流

`pw-dump` 是一次快照，`pw-mon` 是连续事件流：

```bash
pw-mon
```

典型输出会显示 global 新增、删除、对象属性变化。
它适合：

- 插拔 USB 设备时看对象是否出现；
- 打开应用时看 stream 是否创建；
- 修改 profile 时看 node/port 如何变化；
- 调试 session manager 规则是否生效。

当 `pw-dump` 看起来正常但问题仍存在时，`pw-mon` 可以告诉你“对象是后来才消失/重建”还是“根本没有创建”。

## 六、pw-top：看实时调度

```bash
pw-top
```

重点列：

| 列 | 含义 |
| --- | --- |
| `S` | 状态 |
| `ID` | 对象 ID |
| `QUANT` | 当前周期大小 |
| `RATE` | 采样率 |
| `WAIT` | 等待时间 |
| `BUSY` | 处理耗时 |
| `W/Q` | wait/quantum 等比 |
| `B/Q` | busy/quantum 等比 |
| `ERR` | xrun/错误计数 |

driver 通常显示在最上方，其他节点按层次排列。
如果 `BUSY` 接近 quantum，说明处理线程接近超时；
如果 `ERR` 增长，说明已经发生 xrun。

但不要把 `BUSY` 当成唯一指标。一个偶发尖峰可能只是一次调度抖动；
持续增长才说明图或进程有系统性问题。

## 七、pw-link：检查链路的最后一公里

```bash
pw-link -l
pw-link -o
pw-link -i
```

- `-l` 列出链路；
- `-o` 列出输出端口；
- `-i` 列出输入端口。

如果端口名包含空格或特殊字符，创建链路时使用准确名称：

```bash
pw-link "output-port-name" "input-port-name"
```

删除：

```bash
pw-link -d "output-port-name" "input-port-name"
```

注意端口名不是 node 名。一个 stereo sink 至少有两个端口，必须逐个建立链路，或者由 session manager 按规则建立。

如果应用节点没有 Link，先看 session manager 是否识别了它的 `media.class` 和 `target.object`。
手工连一条链路可以验证“数据路径是否通”，但不应该替代策略配置。

## 八、pw-cat 与最小复现

`pw-cat` 支持播放、录音和 MIDI：

```bash
pw-play test.wav
pw-record /tmp/record.wav
pw-cat --playback --target 42 test.wav
pw-cat --record --target 42 /tmp/record.wav
pw-mididump
```

用 `pw-play` 指向指定 node 可以做最小复现：

```bash
pw-play --target 42 test.wav
```

如果指定 node 能出声、默认路由不出声，问题在 session manager 的默认目标或应用 target。
如果两者都不出声，问题可能在设备、adapter、格式或 daemon。

`pw-loopback` 可以快速建立源到宿的回路：

```bash
pw-loopback
```

它适合验证流创建、端口和链路，不适合直接替代生产配置。

## 九、日志：从级别到主题

PipeWire 支持 `PIPEWIRE_DEBUG`：

```bash
PIPEWIRE_DEBUG=D pipewire
PIPEWIRE_DEBUG=E,mod.*:D,mod.foo:X pipewire
```

级别：

| 值 | 含义 |
| --- | --- |
| `X` / `0` | 关闭 |
| `E` / `1` | 错误 |
| `W` / `2` | 警告 |
| `I` / `3` | 信息 |
| `D` / `4` | 调试 |
| `T` / `5` | trace |

主题使用 `category.topic` 命名：

- `pw.*`：核心；
- `mod.*`：模块；
- `ms.*`：session manager 相关；
- `conn.*`：连接级原始消息，通常非常详细。

常用环境变量：

```bash
PIPEWIRE_LOG=/tmp/pipewire.log
PIPEWIRE_LOG_SYSTEMD=false
PIPEWIRE_LOG_LINE=false
PIPEWIRE_LOG_COLOR=false
```

排查连接问题时，`conn.*` 可以帮助确认消息是否发出，但数据量很大，应该限定时间和主题。

## 十、配置与生成图

查看配置加载情况：

```bash
pw-config -n pipewire.conf
pw-config -n client.conf
```

生成 Graphviz 图：

```bash
pw-dot -o /tmp/pipewire.dot
dot -Tsvg /tmp/pipewire.dot -o /tmp/pipewire.svg
```

`pw-dot` 适合看整体拓扑，不适合看每个周期的实时状态。
如果图太大，可以先用 `pw-dump` 筛选节点，再手工画出关键路径。

Profiler：

```bash
pw-profiler -o /tmp/profile
```

它记录 driver、节点、周期、CPU 时间等数据，适合定位持续抖动或耗时节点。
和 `pw-top` 相比，profiler 更适合离线分析；和普通日志相比，它更接近调度事实。

## 十一、SPA 层排障

```bash
export SPA_PLUGIN_DIR=$(pkg-config --variable plugindir libspa-0.2)
spa-inspect "$SPA_PLUGIN_DIR/alsa/libspa-alsa.so"
spa-monitor
```

- `spa-inspect`：检查 factory/interface；
- `spa-monitor`：观察 SPA device 和 node；
- `spa-json-dump`：导出结构化状态；
- `spa-acp-tool`：调试 ALSA ACP；
- `spa-resample`：验证重采样行为。

如果 PipeWire 里没有某个设备，但 `spa-inspect` 能看到对应 factory，说明问题大概率在设备枚举、权限、参数或 session manager，而不是插件文件缺失。

## 十二、典型问题定位表

| 现象 | 先看什么 | 常见原因 |
| --- | --- | --- |
| 所有应用没声音 | `pw-cli info 0`、`pw-dump Node` | daemon 未起、没有 sink、默认路由缺失 |
| 只有一个应用没声音 | 应用 stream 节点、Link | target 错误、stream 未创建、格式协商失败 |
| 默认设备不对 | `pw-metadata -n default`、`wpctl status` | session manager 策略或优先级 |
| 麦克风无输入 | source node、Link、权限 | profile/route 错、portal 未授权、静音 |
| 延迟变大 | `pw-top`、链路 latency | quantum 大、异步节点、重采样、网络缓冲 |
| xrun 增长 | `pw-top`、profiler、日志 | RT 优先级、阻塞回调、CPU 抢占、buffer 太小 |
| Pulse 工具看不到设备 | `pactl info`、`pipewire-pulse` 状态 | Pulse 服务未起、socket 冲突 |
| JACK 应用找不到端口 | `pw-jack`、JACK 节点 | 兼容库未加载、transport/端口映射 |
| Flatpak 摄像头失败 | portal 日志、`pw-dump` 权限 | media role、permission store、portal 未授权 |
| 配置没生效 | `pw-config`、`pw-mon` | 找错配置文件、未重启、section 拼写错误 |

## 十三、推荐的排障顺序

```text
1. 进程是否活着
2. socket 是否可连
3. 对象是否存在
4. 默认目标是否正确
5. 链路是否建立
6. 格式是否协商
7. 调度是否正常
8. 兼容层是否命中
9. 权限是否足够
10. 最后才改配置
```

这套顺序的价值在于：每一层都有可验证的证据。
不要因为看到一条日志里有 `error` 就直接改全局配置，也不要因为 `pw-top` 里某个数字高就断定设备有问题。

## 十四、小结

工具和层次的对应关系：

| 层次 | 工具 |
| --- | --- |
| 进程与连接 | `systemctl`、`pw-cli info 0` |
| 对象快照 | `pw-dump` |
| 对象变化 | `pw-mon` |
| 链路 | `pw-link` |
| 调度 | `pw-top`、`pw-profiler` |
| 配置 | `pw-config` |
| 最小复现 | `pw-play`、`pw-record`、`pw-loopback` |
| SPA | `spa-inspect`、`spa-monitor` |
| 权限/沙箱 | portal 日志、`pw-container`、`pw-dump` permissions |

下一篇是系列的收尾：如何从源码入口开始读 PipeWire，怎样写第一个客户端或模块，以及哪些实时和协议约束最容易踩坑。
