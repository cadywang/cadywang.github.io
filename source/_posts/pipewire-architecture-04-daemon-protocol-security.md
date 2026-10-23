---
title: PipeWire 守护进程、配置与原生协议：控制面如何建立连接
date: 2026-10-23 14:30:00
tags: [PipeWire, daemon, 原生协议, 安全, Flatpak]
categories: [教程]
---

当你在终端输入 `pw-dump`，到 JSON 出现在屏幕上，中间发生了几件完全不同的事：

1. 客户端找到并连接 PipeWire 的 Unix socket；
2. 双方用原生协议交换版本和对象信息；
3. 客户端绑定 registry，收齐 global 事件；
4. 对每个对象 bind，再枚举属性和参数；
5. 服务端通过共享内存和 fd 传递必要的资源。

这条链路同时涉及配置、模块、协议、对象模型和权限。本文把这些部分串起来。

---

## 一、daemon 的职责边界

PipeWire daemon 是用户态中心进程，负责：

- 维护全局对象图和 global 表；
- 加载模块；
- 打开受控设备；
- 在客户端之间转发控制消息；
- 调度媒体图；
- 通过共享内存传递媒体数据；
- 执行基础访问控制。

它不负责决定“默认输出设备应该是哪个”，也不主动发现所有硬件。
这些属于 session manager 的策略层。

一个典型桌面会话中有：

```text
systemd --user
├── pipewire.service / pipewire.socket
├── wireplumber.service        ← session manager
├── pipewire-pulse.service     ← PulseAudio 兼容服务
└── 应用进程
```

`pipewire-pulse` 自己也是一个客户端，它把 PulseAudio 协议翻译成 PipeWire API。
WirePlumber 也是客户端，它监听设备、创建节点、配置 profile、建立或移动链路。

## 二、启动与配置文件

daemon 启动时会解析配置。基础配置文件查找顺序是：

1. `$XDG_CONFIG_HOME/pipewire/pipewire.conf`（通常是 `~/.config/pipewire/pipewire.conf`）
2. `$sysconfdir/pipewire/pipewire.conf`（通常是 `/etc/pipewire/pipewire.conf`）
3. `$datadir/pipewire/pipewire.conf`（通常是 `/usr/share/pipewire/pipewire.conf`）

找到第一个就作为基础配置。
然后按顺序合并 `pipewire.conf.d/` 中的片段：

1. `$datadir/pipewire/pipewire.conf.d/`
2. `$sysconfdir/pipewire/pipewire.conf.d/`
3. `$XDG_CONFIG_HOME/pipewire/pipewire.conf.d/`

属性会被覆盖，数组元素会追加。于是用户可以在不改发行版文件的情况下追加模块或覆盖属性。

可用环境变量改变查找路径：

- `PIPEWIRE_CONFIG_DIR`
- `PIPEWIRE_CONFIG_PREFIX`
- `PIPEWIRE_CONFIG_NAME`

### 配置不是严格 JSON

PipeWire 配置使用一种更宽松的 JSON 表示：

- 字符串的引号可以省略；
- 对象键值可以用 `=` 或 `:`；
- 可以有行尾逗号；
- `#` 开始注释。

常见 section：

| section | 作用 |
| --- | --- |
| `context.properties` | context 全局属性 |
| `context.spa-libs` | factory 名称到 SPA 库的映射 |
| `context.modules` | 启动时加载的模块 |
| `context.objects` | 由 factory 创建的对象 |
| `context.exec` | 启动子进程，通常用于 session manager |

在当前源码树的默认 `pipewire.conf` 中，可以看到 protocol-native、profiler、metadata、client-node、adapter、access、scheduler-v1 等模块。
不同发行版会修改这些配置，排障时应该直接检查实际文件。

## 三、模块如何进入 daemon

PipeWire 模块是一个 `.so`，入口符号是：

```c
pipewire__module_init(struct pw_impl_module *module, const char *args);
```

模块加载后可以：

- 注册 factory；
- 创建 global 对象；
- 添加 context 事件监听器；
- 扩展协议；
- 注册导出类型；
- 启动虚拟设备或网络监听。

模块不是“客户端插件”。它在加载它的进程里运行，并共享该进程的 `pw_context`。
客户端不能要求服务端加载任意模块；加载由 daemon 配置决定。

当前默认配置会加载的基础模块包括：

```text
libpipewire-module-rt
libpipewire-module-scheduler-v1
libpipewire-module-protocol-native
libpipewire-module-profiler
libpipewire-module-metadata
libpipewire-module-spa-device-factory
libpipewire-module-spa-node-factory
libpipewire-module-client-node
libpipewire-module-client-device
libpipewire-module-portal
libpipewire-module-access
libpipewire-module-adapter
libpipewire-module-link-factory
libpipewire-module-session-manager
libpipewire-module-x11-bell
libpipewire-module-jackdbus-detect
```

其中有些是条件加载，具体仍以实际配置为准。

## 四、原生协议的消息格式

默认的 native protocol 使用 Unix domain socket。
每条消息有 16 字节头：

```text
0                   1                   2                   3
0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                            Id                                 |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   opcode      |                    size                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                            seq                                |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                           n_fds                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        payload POD                            |
|                          ...                                  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    optional footer POD                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

字段含义：

| 字段 | 含义 |
| --- | --- |
| `Id` | 目标 proxy/resource ID |
| `opcode` | 接口方法或事件编号 |
| `size` | payload 加 footer 的长度 |
| `seq` | 消息序号，用于请求关联 |
| `n_fds` | 随消息发送的 fd 数量 |
| `payload` | 单个 SPA POD |
| `footer` | 额外控制信息，如 registry generation |

消息使用本机字节序。fd 通过 `SCM_RIGHTS` 随 Unix socket 传递。
payload 是 POD，因此复杂参数不需要另写序列化代码。

### 连接握手

首次连接大致是：

```text
client                                  server
  │──────── open socket ─────────────────►│
  │──────── Core::Hello(version) ────────►│
  │◄─────── Core::Info ───────────────────│
  │──────── Client::UpdateProperties ────►│
  │◄─────── Registry::Global ... ─────────│
```

客户端申请一个 Core 代理，ID 固定为 0；Client 代理通常使用 ID 1。
服务端根据消息里的 client 属性完成注册，然后触发访问检查。
如果客户端没有被授予 core 的读权限，它会被挂起，直到 session manager 更新权限。

### Sync 与 Done

Registry 是持续事件流，没有“列表结束”标记。
客户端通常发送：

```text
Core::GetRegistry
Core::Sync
```

服务端把此前的 global 事件都发送完后返回 `Core::Done`。
客户端收到 Done 后，才认为当前 registry 快照稳定。

## 五、对象创建与 fd 传递

创建 node、link、device 等对象时，客户端通常调用 `Core::CreateObject`：

```text
factory_name
type
version
properties
new_id
```

服务端找到 factory，创建对象，并把 `new_id` 对应该客户端的 resource。
之后客户端在这个 ID 上调用接口方法。

媒体数据不走同一路径。服务端通过 `Core::AddMem` 把共享内存 fd 发给客户端：

```text
AddMem(id, type, fd, flags)
```

后续 buffer 参数只引用 memid、offset 和 size。
客户端映射内存后，把指针写进 IO 区域，process 时直接读写。

视频可以通过 DMA-BUF 传递。音频通常使用 memfd 共享环形缓冲。
这让 socket 只负责控制面，避免每个周期复制整块 PCM/视频帧。

## 六、client-node：把处理节点放到客户端

`module-client-node` 提供两个导出类型：

- `PW_TYPE_INTERFACE_Node`
- `SPA_TYPE_INTERFACE_Node`

客户端可以用 `pw_stream` 或 `pw_filter` 创建节点，再导出给服务端。
服务端看到的是一个 `pw_impl_node`，但它的处理函数和共享缓冲区指向客户端。

协议扩展会传递：

- node 和 port 信息；
- 参数枚举/设置；
- buffer 和 IO 区域；
- activation 记录；
- eventfd；
- 调度命令和状态。

这就是为什么 `spa_node_process()` 可以在客户端进程执行，而调度仍由服务端统一决定。

## 七、访问控制模型

PipeWire 对每个客户端的每个 global 维护权限位：

| 位 | 含义 |
| --- | --- |
| R | 能看见对象，能接收事件 |
| W | 能修改对象状态 |
| X | 能调用对象方法 |
| M | 能设置该对象的 metadata |
| L | 能建立到不可见对象的 link |

`module-access` 在客户端注册时触发检查：

- 如果解析结果是 `unrestricted`，授予全部权限，客户端继续；
- 否则不授予 core 的 R，客户端挂起；
- session manager 根据策略，为客户端逐对象配置权限；
- 至少给 core 的 R，客户端才能恢复通信。

这套设计允许桌面环境限制应用能看到哪些设备、能否改别人的音量、能否移动别人的流。

### Flatpak 与 portal

Flatpak 应用通常不能直接访问宿主机的 PipeWire socket。
桌面 portal 在沙箱外建立连接，再把连接 fd 交给应用。

portal 进程会被标记为 `pipewire.access.portal.is_portal`，它代表的沙箱客户端会带上：

- `pipewire.access.portal.app_id`
- `pipewire.access.portal.media_roles`

`module-portal` 通过 DBus 识别 portal 进程，`module-access` 标记连接，session manager 再根据 app id 和 media role 授予有限对象权限。
例如 Camera portal 只应看到被允许的摄像头节点，而不是整个音频图。

## 八、安全边界在哪里

PipeWire 的安全不是“socket 权限一刀切”。它在多个层次上工作：

```text
Unix socket 文件权限
    └── 连接级访问检查
          └── 每客户端、每 global 的权限位
                └── session manager / portal 策略
                      └── metadata 与 link 权限
```

需要特别小心的是：

- 有 W/X 权限的客户端可以操作对象；
- 有 L 权限的客户端可以建立到不可见对象的 link；
- metadata 可以改变 target、默认设备等策略输入；
- session manager 自身通常需要更高权限，因此它的身份验证很关键。

PipeWire 默认 socket 在 `$XDG_RUNTIME_DIR` 下，并依赖 Unix 用户边界。
如果手工把 socket 暴露到网络，安全模型会完全不同。

## 九、配置修改的实践建议

1. **优先用 `*.conf.d` 片段**，不要直接改 `/usr/share` 下的发行版文件。
2. **先确认实际加载路径**：`pw-config` 可以查看配置和搜索路径。
3. **一次只改一个变量**，重启对应 user service，再看 `pw-dump` 或 `pw-mon`。
4. **区分 daemon、client、pulse、jack 配置**：它们不是同一个文件。
5. **不要把服务端模块写进客户端配置**：模块只能加载到自己的进程。
6. **权限问题先看 `pw-dump` 里客户端和对象的权限字段**，不要只猜配置。

## 十、小结

守护进程和协议层可以概括为：

```text
配置 → 加载模块 → 创建 global
socket → Hello → Registry → Bind
method/event → POD + fd
access → 权限位 → session manager/portal
```

下一篇开始做“全目录索引”：把这棵树里的 50 个 `src/modules` 模块逐一归类，说明它们在真实系统里扮演什么角色。
