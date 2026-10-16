---
title: serial-debug-bridge：把远端串口变成可编程接口（架构设计 + 部署使用指南）
date: 2026-10-15 14:05:00
tags: [串口, 嵌入式, 远程调试, Python, PowerShell, 工具链]
categories: [教程]
---

嵌入式调试里有个很常见的尴尬：**板子在你手上，但串口线插在另一台机器上。**

我在做一台 Yocto 机顶盒调试时就是这种情况——开发板接在一台 Windows 机器的 `COM3` 上，
而我真正干活的环境是另一台 Linux server。传统的做法是 VNC 过去开串口终端、或者手工 `scp` 来回搬文件，
既慢又没法做自动化。

于是写了 [serial-debug-bridge](https://github.com/cadywang/serial-debug-bridge)：
**把「远端串口」变成一个可以用命令行调用、可以写进脚本的接口**——
在 server 上敲一条命令，它去 client 的串口上执行并把结果带回来；文件也能双向传，带 md5 校验。

这篇文章分两部分：**架构与设计取舍**，以及**部署与使用指南**。

---

## 一、它解决什么问题

| 角色 | 说明 |
| --- | --- |
| **嵌入式设备（device）** | 目标板，只有一个串口控制台，如 `/dev/ttyUSB0` / `COM3`，通常是 busybox sh |
| **client** | 串口**物理连接**的那台机器（本例是一台 Windows） |
| **server** | 你实际工作的机器，希望在这里敲命令、传文件 |

目标很朴素，但约束很硬：

* 设备侧**不能装任何东西**（Yocto 精简镜像连 `base64` 都没有）；
* 支持交互式 shell（有时候就是要手动敲两下看看板子怎么了）；
* 支持文件双向传输，且**必须逐字节可信**（传的是固件）；
* 现在串口接在 USB/COM 上，将来可能变成"通过网络连到那台机器"——拓扑不能写死。

## 二、架构：两个组件 + 一个语言无关的协议

整个系统只有两个可执行组件，中间靠一个**语言无关的行头 + 定长正文**协议说话：

```
   ┌──────────────┐        ┌───────────────────────────────┐        ┌──────────────┐
   │   server     │        │            client             │        │  嵌入式设备   │
   │              │        │  (串口插在这台机器上)          │        │              │
   │   devctl  ───┼──TCP──▶│  serial_agent  ◀── 串口 ──────┼───────▶│  串口控制台   │
   │  (CLI 工具)   │  或    │  (ps1 / py 两版)              │  UART  │  (busybox sh)│
   │              │──SSH──▶│                               │        │              │
   └──────────────┘        └───────────────────────────────┘        └──────────────┘
     你在这里敲命令              把「网络」翻译成「串口」                被调试的目标板
```

* **`serial_agent`（client 侧）**：打开串口，把网络请求翻译成对串口的读写。
  * `serial_agent.ps1` —— Windows 专用，**零依赖**（PowerShell 5.1 直接跑）；
  * `serial_agent.py` —— 跨平台（真实串口需要 `pyserial`，`--mock` 自测不需要）。
* **`devctl`（server 侧）**：命令行工具，通过 TCP 或 SSH 把请求发给 agent。
  * `devctl.py` —— 跨平台，Linux 首选（只要 Python 3，无第三方依赖）；
  * `devctl.ps1` —— Windows 用。

因为协议与语言无关，**四种版本可以任意组合**：`devctl.py` 能连 `serial_agent.ps1`，反之亦然。
两条路径都有 CI 覆盖（见文末"工程实践"），这不是"理论上支持"，而是每次提交都会交叉验证。

### 为什么不做成一个进程？

因为两端的**环境约束完全不同**：client 可能是一台不给你装 Python 的 Windows 机器（所以要有零依赖的 ps1 版本），
server 可能是只给你一个 shell 的 Linux（所以要有纯标准库的 Python 版本）。
拆成两个组件、协议做最小化，才能"哪边给什么条件就用哪边的实现"。

## 三、协议设计：几个关键取舍

协议本身很短，值得讲的是几个被现实逼出来的设计：

```
请求：  <OP> [key=value ...] len=<n>\n  <n 字节正文>
响应：  OK   [key=value ...] len=<n>\n  <n 字节正文>
        ERR  code=<c> msg=<m> len=<n>\n  <n 字节正文>
```

* **头行是 ASCII，正文是定长原始字节**。正文里出现 `\0`、`\n` 都无所谓——接收方按 `len` 精确读取。
  这样传二进制文件和传命令文本走同一套逻辑。
* 操作只有十个：`PING` `INFO` `EXEC` `PUSH` `PULL` `MD5` `RESET` `SHELL` `AUTH` `BYE`。
* `ERR` 带 `code`（`auth`/`timeout`/`device`/`decode`/`badrequest`/`too-large`/`unknown-op`/`unsupported`），
  正文通常直接携带设备侧的原始报错文本。

### 1. 怎么判断命令真正执行完了？——探针 + 「配对引号」

设备控制台是 tty，会把你输入的字符**回显**出来，而且回显与输出的先后顺序依实现而定。
"等提示符"这种做法非常不可靠（提示符可能是 `#`、`$`、`>`，还可能带 ANSI 颜色）。

agent 的做法是**发一条探针命令**：

```sh
echo "__DEVCTL_<随机token>__ $?"
```

然后持续读串口，直到匹配到正则 `__DEVCTL_<token>__\s*(\d+)`。
妙处在于：**回显里那一行是 `$?` 字面量（不含数字），真实输出里才是退出码（含数字）**，
所以第一次匹配一定命中真实输出。拿到数字就是 `rc`，同时把回显和探针行清掉，剩下的才是命令的真实输出。

传输 ACK 也是同一招，只是更"脏"：标记写成 `__DEVCTL_A''CK_<i>__`（**成对空引号**）——
回显里是 `A''CK`，真实输出里是 `ACK`，两者不可能混淆。
这行代码有个血泪注释：**绝不能写成单个引号**，那会让设备 shell 卡在续行状态，然后整个传输就挂住了。

### 2. 设备上什么都没有，传输编码怎么办？

agent 会在首次传输前**探测**设备能用哪种编解码方式，按优先级挑第一个可用的：

| 编码 | 上传（解码到设备） | 下载（从设备读出） |
| --- | --- | --- |
| `base64` | `base64 -d` | `base64` |
| `busybox-base64` | `busybox base64 -d` | `busybox base64` |
| `openssl-base64` | `openssl base64 -d` | `openssl base64` |
| `hex` | `awk`（十六进制→字节） | `od -v -b` |

探测方法是往 `/tmp/.devctl_probe` 写 5 个字节再读回比对。
我手上这台 Yocto 板子**没有任何 base64**，于是自动落到最后一级：用 `awk` 把十六进制文本还原成字节——
设备侧依然零安装。需要时也可以用 `-Codec` / `--codec` 强制指定。

### 3. 为什么上传要坚持「逐块校验 + 重传」

串口在高速率下**会偶发丢字符**（实测 460800 下大约 1/40000）。
如果整块发完再校验，出一次错就得整文件重来。所以上传是分块的（512/1024 字节）：

```
awk '<hex2bytes>' > '/tmp/.devctl_blk' << '__DEVCTL_HEOF_<i>__'
<该块数据的十六进制，每行 64 字符>
__DEVCTL_HEOF_<i>__
if [ "$(md5sum '/tmp/.devctl_blk' | cut -d" " -f1)" = "<该块的 md5>" ]; then \
    cat '/tmp/.devctl_blk' >> '<远端路径>'; echo __DEVCTL_A''CK_<i>__; \
  else echo __DEVCTL_BA''D_<i>__; fi
```

* 设备**自己算**这一块的 md5；一致才追加进目标文件并回 `ACK`，否则回 `BAD`；
* agent 看到 `BAD`（或超时）就**重发该块**，最多 8 次；
* 全部块完成后，agent 再执行一次 `md5sum '<远端路径>'` 核对整个文件，写回 `verified=True/False`。

于是即使链路偶发丢字节，最终文件仍与源文件**逐字节一致**——这对传固件来说是刚需。
下载走另一条路：执行 `od -v -b`，丢掉每行首列的偏移地址，其余八进制数值拼回字节，落盘后再比一次 md5。

### 4. 交互式 shell

`SHELL` 是唯一的"破格"操作：agent 回 `OK` 之后，这条连接**切换成原始字节透传**，
等于把串口搬到了你的终端里。因为 stdio 是纯协议通道，**交互 shell 只支持 TCP 传输**。

## 四、实测数据

一次真实调试现场（client = Windows，`COM3@460800`；设备 = Yocto 机顶盒；
server 经反向 SSH 隧道操作）：

| 项目 | 结果 |
| --- | --- |
| `info` / `exec`（含提示符与 ANSI 颜色清理） | 正常 |
| 4 KB / 60 KB / 200 KB 二进制文件 `push` + `pull` 往返 | **md5 完全一致** |
| 速度 | 约 **1~1.2 KB/s**（受逐块校验与重传限制） |
| 60 KB 上传耗时 | 约 50 秒 |
| 200 KB 上传耗时 | 约 3 分钟 |

速度不快是**故意**的：串口偶发丢字符时，"快但错"对固件传输毫无意义。
大文件建议先在设备上 `tar cz` 压缩再拉回来。

## 五、部署指南

### 环境要求

| 位置 | 需要 |
| --- | --- |
| client（Windows） | Windows 10/11 + 自带 PowerShell 5.1，**零安装** |
| client（Linux） | Python 3；真实串口再 `pip install pyserial` |
| server（Linux） | Python 3（发行版自带），**无第三方库** |
| server（Windows） | 自带 PowerShell 5.1 |

设备侧什么都不用装，只用 busybox/coreutils 里通常都有的 `sh`、`base64`、`md5sum`。

### client 侧：启动 agent

Windows（零依赖，推荐）：

```powershell
# 方式 1：跑现成脚本（先编辑里面的 COM 口与波特率）
agent\start-agent.bat

# 方式 2：直接命令行
powershell -NoProfile -ExecutionPolicy Bypass -File C:\tools\serial_agent.ps1 ^
    -Port COM3 -Baud 115200 -TcpPort 7801
```

看到 `Transport: TCP, listening on 0.0.0.0:7801` 就是就绪了。

Linux：

```bash
pip3 install pyserial                       # 仅真实串口需要一次
python3 agent/serial_agent.py --port /dev/ttyUSB0 --baud 115200 --tcp-port 7801
# 或：./agent/start-agent.sh
```

### 开机自启

Linux 用仓库里的 systemd 单元：

```bash
sudo cp agent/serial-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now serial-agent
journalctl -u serial-agent -f              # 实时日志
```

Windows 两种常见做法：

* **任务计划程序**：触发器「计算机启动时」→ 操作
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\tools\serial_agent.ps1 -Port COM3 -Baud 115200 -TcpPort 7801`，
  勾选「不管用户是否登录都运行」；
* **NSSM**：`nssm install SerialAgent "powershell.exe" "-NoProfile -ExecutionPolicy Bypass -File C:\tools\serial_agent.ps1 -Port COM3 -Baud 115200"`。

### 四种接入方式（拓扑无关）

问题只有一个：**devctl 如何到达 client 上的 agent**。

| 方式 | 拓扑 | client 要开端口 | 交互 shell | 典型场景 |
| --- | --- | --- | --- | --- |
| A 本地串口 | 串口就在 server 上，走 `127.0.0.1` | — | ✔ | 开发板直接插工作机 |
| B TCP 直连 | `devctl --tcp <client>:7801` | ✅ 需要 | ✔ | 可信内网 |
| C SSH | `devctl --ssh user@<client>` | ❌ 不需要 | ✘ | 只允许 server→client SSH |
| D SSH 反向隧道 | client 主动把 `7801` 反向映射到 server | ❌ 不需要 | ✔ | client 在 NAT 后面 |

**方式 D 是本文开头那个场景**：client（Windows）在另一个网段、server 无法主动访问它，
于是让 client 主动把端口反向映射过来：

```bash
# ② client 上建反向隧道（-N -R 只做端口转发，不执行远程命令）
ssh -N -R 127.0.0.1:7801:127.0.0.1:7801 user@<server>

# ③ server 上就像本地一样用
python3 cli/devctl.py --tcp 127.0.0.1:7801 exec "uname -a"
```

隧道建议套一层 `autossh -M 0 -N -R ...` 保活。

### server 侧

```bash
git clone https://github.com/cadywang/serial-debug-bridge.git
cd serial-debug-bridge
python3 cli/devctl.py --tcp <client-ip>:7801 info     # 连通性 + 设备信息
```

## 六、使用指南

### 命令参考

| 子命令 | 作用 | 退出码 |
| --- | --- | --- |
| `exec <命令>` | 在设备上执行命令，stdout+stderr 原样返回 | **设备命令自身的退出码**；超时 = 124 |
| `push <本地> <远端>` | 上传文件（server→device），带 md5 校验 | 0 = 成功且校验通过 |
| `pull <远端> <本地>` | 下载文件（device→server），带 md5 校验 | 0 = 成功且校验通过 |
| `md5 <远端>` | 打印设备上某文件的 md5 | 0 / 1 |
| `reset` | 通过 DTR 复位开发板 | 0 / 1 |
| `info` | 打印代理 / 设备 / 版本信息 | 0 / 1 |
| `shell` | 交互式串口控制台（**仅 TCP**，`Ctrl+]` 退出） | 0 |

`exec` 会把**设备命令的退出码**当自己的退出码，所以可以直接写进脚本判断：

```bash
# 设备上文件是否存在
if python3 cli/devctl.py --tcp 172.21.5.10:7801 exec "test -f /etc/passwd"; then
    echo "exists"
fi

# 把整个目录打包回 server
python3 cli/devctl.py --tcp 172.21.5.10:7801 exec "tar czf /tmp/log.tgz /var/log"
python3 cli/devctl.py --tcp 172.21.5.10:7801 pull /tmp/log.tgz ./log.tgz
```

常用选项：`--tcp HOST[:PORT]`、`--ssh USER@HOST`、`--port`（串口）、`--baud`、`--timeout MS`（默认 30000）、
`--token`（agent 用 `--auth` 启动时的口令）、`-q`（只输出结果）。

### 让 Codex / 脚本直接调用：`sdb` 包装器

仓库里的 `skill/serial-debug-bridge/` 是一个可直接安装的 skill，`scripts/sdb` 把
「端点解析 + 超时 + 参数拼装」都封装好了：

```bash
S="$HOME/.codex/skills/serial-debug-bridge/scripts/sdb"

$S info                          # 代理/设备信息
$S exec 'uname -a; id -un'       # 在设备上执行（退出码 = 设备命令退出码）
$S push ./fw.bin /tmp/fw.bin     # 上传（设备侧 md5 校验）
$S pull /etc/hostname ./h        # 下载
$S reset                         # 通过 DTR 复位（会打断设备，先确认）
```

端点解析顺序是**环境变量 > 配置文件 > 默认值**：
`SDB_TCP`、`SDB_SSH`、`SDB_PORT`/`SDB_BAUD`、`SDB_REMOTE_AGENT`、`SDB_TOKEN`、
`SDB_DEVCTL`、`SDB_CONFIG`、`SDB_TIMEOUT`（外层硬超时，默认 180 秒）、`SDB_EXTRA`。

串口慢，所以外层超时要给够：

```bash
SDB_EXTRA="-q" SDB_TIMEOUT=600 $S push big.bin /tmp/big.bin
```

还有个 `sdb-check.sh`，开工前先跑一次确认「我连上的确实是这台设备」：

```bash
bash "$HOME/.codex/skills/serial-debug-bridge/scripts/sdb-check.sh"
bash "$HOME/.codex/skills/serial-debug-bridge/scripts/sdb-check.sh" --ports   # 顺带看端口占用
```

`--ports` 这一项非常实用，原因见下一条。

## 七、排障速查

**Q：连不上 `client:7801`？**
· client 防火墙没放行，或 agent 只绑了 `127.0.0.1`（应绑 `0.0.0.0`）。

**Q：`agent closed the connection` / 匿名超时？**
· 端口被别的进程抢了。**VS Code 会自动转发它检测到的端口并绑定 `127.0.0.1`**，
  比反向隧道（通常也是 `127.0.0.1`）更具体，从而抢走连接。
  用 `sdb-check.sh --ports` 看监听者，改连 `127.0.0.2:port` 或换端口。

**Q：`exec` 一直超时（124）？**
· 设备控制台没停在 shell 提示符（卡在登录界面、或在跑前台程序）。先 `shell` 进去看一眼。
· 串口名 / 波特率与设备实际不符。

**Q：设备 shell 停在 `>`？**
· 上一次传输被中断，留下了未闭合的引号 / here-document。agent 超时会自动发 `Ctrl-C`；
  必要时在 `shell` 里手动 `Ctrl-C`，或兜底 `reset`（先确认）。

**Q：`push` 报 `verified=False`？**
· 重试；持续失败就降波特率，或先压缩文件。

**Q：传输中途失败，控制台出现启动横幅 / `login:`？**
· **设备自己重启了**，不是桥的故障（供电、看门狗、内存）。agent 会把控制台最后约 200 字节
  写进日志（`console said: ...`），先看那条；重新登录后再传。

**Q：Windows 上 `-Port COM10` 报错？**
· 写成 `-Port '\\.\COM10'`。

## 八、几个使用原则

* **破坏性操作先确认**：`rm`、`dd`、写 flash、刷固件、`reset` 之前，
  先 `exec 'uname -a; hostname'` 确认目标就是预期设备——端口/隧道可能指向另一台板子。
* **`push` 会覆盖目标路径**，先 `exec 'ls -l <dir>'` 看一眼。
* **别把 agent 端口暴露到公网**：设备控制台通常就是 root shell，谁能连上 agent 谁就能完全控制设备。
  优先用 SSH（方式 C）；必须用 TCP 时配合 `--auth` 令牌 + 防火墙限制来源 IP。
* **一个串口同一时刻只服务一个 agent 实例**；一台 client 接多个设备时，每个串口一个实例、不同端口。

## 九、工程实践：为什么敢在生产里用它

一个调试工具最怕的是"它自己出问题却看不出来"。所以这个仓库在工程上做了几件事：

* **两套实现 + 交叉验证**：`ps1` 与 `py` 必须同步演进（协议、编码、超时语义），
  CI 里有专门的 `Cross implementation check`（ps 的 CLI 连 py 的 agent，反之亦然），
  加上两套 mock 自测（不需要真实硬件）。
* **五道门禁**：编码/BOM/行尾检查、PowerShell 自测、Python 自测（Linux + Windows）、交叉验证、
  commit 规范 + DCO 签名。
* **提交规范**：遵循 Linux 内核补丁风格（`<subsystem>: <祈使句摘要>`，正文 72 列换行，`git commit -s`）。
  这不是形式主义——它让 `git log` 直接可读、可 `git bisect`。
* **审查不可绕过**：`main` 有分支保护（`enforce_admins: true` + 空 bypass），
  任何改动都必须走 PR 且 CI 全绿；改 CI 本身也要走同一个 PR 流程。
* **遇到 bug 请提 patch**：如果你在用这套工具时踩到 bug，除了当下绕过，
  还请把修复交回上游——最小复现 + 两套实现同步修改 + 自测输出，
  没有写权限就把 `git diff` 存成 `fix.patch` 一起发过来。这条约定写在 skill 里，也就是
  "不要只绕过去，否则下一个人还会再踩一次"。

## 十、小结

`serial-debug-bridge` 想做的事情很小：**让远端串口用起来像本地命令**。
但要让它真的可用于固件传输这种"错一个字节都不行"的场景，就需要在协议层认真处理三件事——

1. **确定性**：探针 + 配对引号技巧，让"命令是否执行完、退出码是多少"没有歧义；
2. **可验证**：逐块 md5 校验 + 失败重传 + 整文件复核，慢一点但保证逐字节一致；
3. **零依赖**：设备侧只用现成工具，client 侧提供零依赖的 PowerShell 实现。

项目地址：<https://github.com/cadywang/serial-debug-bridge>（MIT 许可，欢迎 PR；
如果你碰到 bug，欢迎按上面的约定提 patch）。