---
title: 终端、TTY 与 PTY：从电传打字机到 tmux
pubDate: 2026-10-16T10:00:00.000Z
description: pi-subagent 用 tmux 给每个子 agent 开一个终端。为了弄清楚为什么，从电传打字机讲起：终端模拟器模拟的是什么，pty 的 master 和 slave，按下一个键之后 line discipline 做了什么，颜色和光标怎么从转义序列里来，再到不需要窗口的 tmux，最后回到 pi-subagent 和为 agent 设计的 herdr。
tags:
  - 终端
  - tmux
  - pi
  - Agent
---

## 一、pi-subagent 要 tmux 做什么

Mario 给 pi 写了一个扩展 pi-subagent，让 pi 能派生出子 agent，各自在后台干活。它的 README 里，运行条件除了 Pi 和 Node.js，还有一项 tmux。翻源码看，每个子 agent 都跑在一个单独的 tmux 会话里。

https://github.com/badlogic/pi-subagent

一个 agent 的扩展，为什么需要终端复用器？想让子 agent 在后台跑，直接开一个新的终端窗口不行吗？Ghostty、iTerm2 这些终端，和 tmux 又是什么关系？

终端模拟器、tty、pty 这几个词我一直分不太清，这几个问题又都绕不开它们，正好借这个机会理一遍。先从一个奇怪的名字说起：Ghostty 这类软件叫终端模拟器，它模拟的是什么？

## 二、终端原本是一台机器

今天说“打开终端”，指的是打开 Ghostty、iTerm2 或者系统自带的“终端”这样一个应用。terminal 这个词刚出现的时候，指的是一台实实在在的设备。

上世纪六七十年代，计算机是机房里的一台主机，人通过一根串口线连上去。线的另一头常常是一台电传打字机（teletypewriter，缩写 TTY），就是一个键盘加一台打印机。按下一个键，字符的编码沿着线发给主机；主机发回来的字符，由打印头打在纸上。它自己不做任何计算，只管输入和输出，处在线路的末端，所以叫终端。

主机的操作系统给每条串口线准备了一段驱动程序：接收字符，把一行输入攒起来，处理退格键，在你按下中断键时停掉正在运行的程序。这段代码一直留到了今天的 Linux 和 macOS 内核里，名字也沿用下来，就叫 tty。

后来屏幕取代了纸。屏幕上的字可以擦掉，可以在任意位置重写，主机需要一种办法告诉终端“把光标移到第 5 行”“清屏”“接下来的字用红色”。DEC 在 1978 年推出的 VT100 终端，用 ESC 字符（编码 0x1B）开头的一串字节表示这些指令。这套约定后来成了 ANSI 标准，今天的终端软件仍然遵守它。

再后来，个人电脑和图形界面普及，专门的终端设备没人用了。可是 shell、文本编辑器、分页器这些程序，都是按“对面是一台 VT100”写的。为了让它们不改代码就能接着跑，人们写了软件来扮演那台设备：在窗口里画出字符，接收键盘输入，理解 VT100 的指令。这就是终端模拟器。这里的“模拟器”和游戏机模拟器是一个意思：被模拟的硬件已经不在了，软件照着它的行为去实现。

这几十年里，程序和人之间隔着的东西一直在变。下面四格里坐在键盘前的是 Clawd，Claude Code 的像素吉祥物，后面的图里也是它：

<iframe class="embed bleed" src="/terminal-tty-pty/eras.html" title="Clawd 面前的终端，从电传打字机到 Ghostty" loading="lazy" style="height: 351px"></iframe>

这段历史在今天的系统里留下了不少痕迹：

| 今天看到的 | 来历 |
|---|---|
| `tty` 命令，`/dev/tty*` 设备 | 电传打字机 teletypewriter 的缩写 |
| macOS 上 `stty -a` 第一行的 `speed 9600 baud` | 串口的传输速率，对今天的软件终端没有意义，字段一直留着 |
| 换行要写成 `\r\n` 两个字符 | 电传打字机上，回车（打印头回到行首）和换行（纸往上走一行）是两个机械动作 |
| `TERM=xterm-256color` | xterm 是 1984 年 X Window 上的终端模拟器，很多程序至今按它的能力输出 |

## 三、打开终端窗口时，有几样东西在工作

回到今天。打开 Ghostty，看到一个 `$` 提示符在等你输入命令，这个画面背后至少有三方。Ghostty 把按键变成字节发出去，再把收到的字节画成屏幕上的字；zsh 读你输入的命令，启动对应的程序；两者中间隔着内核提供的伪终端（pseudo-terminal），简称 pty。

pty 是一对相连的设备，一端叫 master，一端叫 slave。往 master 写进去的字节能从 slave 读出来，往 slave 写的字节能从 master 读出来。

slave 这一端，在程序看来和当年接着串口线的终端设备没有区别。shell 启动时，它的标准输入、标准输出和标准错误（编号 0、1、2 的三个文件描述符）都指向 slave；master 交给终端模拟器。当年“串口线加一台终端”的位置，现在换成了“pty 加一个画字的程序”。

把三方连起来是下面这样。Clawd 在 Ghostty 里输入 `ls` 再按回车，每个字节都要穿过 pty：

<iframe class="embed bleed" src="/terminal-tty-pty/parties.html" title="打开终端窗口时在工作的三方" loading="lazy" style="height: 273px"></iframe>

在任何终端里输入 `tty`，打印出来的就是当前 shell 连着的 slave，macOS 上是 `/dev/ttysNNN`，Linux 上是 `/dev/pts/N`：

```
$ tty
/dev/ttys003
```

所以终端不是 shell。终端模拟器只管收发字节和画字，并不理解你输入的命令，理解命令的是 shell。把 zsh 换成 python3，终端模拟器和 pty 的工作方式一点不变，只是对面换了一个程序在读你的输入。

pty 也不只是一根双向的管子。master 和 slave 之间还有一层内核代码，你按下的每个键会被怎么处理，由它决定。

## 四、按下一个键之后

这一层叫 line discipline（行规程），就是前面说的那段从串口时代留下来的驱动逻辑。默认设置下，它做这几件事：

- 回显：你按下的字符，它先原样送回给终端模拟器，所以你能看到自己敲的字。上一节图里的 zsh 是个例外，它自己做行编辑，会关掉这个开关，自己把字写回去。
- 行编辑：把字符攒成一行，按退格时从这一行里删掉一个字符，等你按下回车，整行才交给程序。
- 信号：你按 Ctrl-C 时，它不把这个字符交给程序，而是给前台程序发一个中断信号 SIGINT，程序默认会因此退出。
- 换行转换：程序输出的 `\n`，会被改成 `\r\n` 再交给终端模拟器。

这些行为都由开关控制，用 `stty` 命令可以查看和修改。下面的模拟里，跑在 pty 上的程序是 `cat`：它从标准输入读到什么，就原样写到标准输出。顶上五个开关对应 line discipline 的五个设置。点下面的按键，或者先点一下这块区域，再直接用键盘输入，看每个字节在各层之间怎么走：

<iframe class="embed bleed" src="/terminal-tty-pty/ldisc.html" title="一个字节在终端模拟器、line discipline 和 cat 之间的往返" loading="lazy" style="height: 883px"></iframe>

试过之后会发现，默认设置下 `cat` 根本收不到你的退格和 Ctrl-C，它们都被内核处理掉了。这种默认模式叫 cooked 模式，也叫 canonical 模式，适合一行一行读输入的程序。

vim、htop，还有 Claude Code、pi 这类全屏的终端界面程序（TUI），需要在你按下每个键时立刻知道，也要自己决定 Ctrl-C 做什么。它们启动时会把这些开关全关掉，进入 raw 模式，退出时再恢复。要是程序崩了、没来得及恢复，终端就会变得很怪：敲字不显示，回车不换行。这时盲打 `reset` 再按回车就能恢复。

Ctrl-C 还有一个细节：

```
$ sleep 100
^C
$ echo $?
130
```

`sleep` 并没有读键盘输入，它不可能“看到”Ctrl-C。按下 Ctrl-C 之后是这样：

<iframe class="embed bleed" src="/terminal-tty-pty/ctrlc.html" title="按下 Ctrl-C 之后，sleep 是怎么退出的" loading="lazy" style="height: 547px"></iframe>

前台进程组是 shell 安排的：shell 每启动一个前台命令，都会告诉内核现在哪一组进程在前台，Ctrl-C 只发给这一组。

pty 还记着窗口的行数和列数。拖动终端窗口改变大小时，终端模拟器把新尺寸告诉内核，内核再给前台程序发一个 SIGWINCH 信号，vim 收到后按新尺寸重画界面。

这一层的更多细节，比如会话、控制终端、作业控制，Linus Åkesson 的这篇讲得很完整：

https://www.linusakesson.net/programming/tty/

## 五、颜色和光标从哪来

再看另一个方向：程序输出的字节到了终端模拟器手里，怎么变成屏幕上的样子？

pty 只传字节，不传颜色和位置。程序想把一个词显示成红色，就在这个词前面输出 `ESC [ 3 1 m` 这五个字节，后面再输出 `ESC [ 0 m` 恢复默认；想清屏，就输出 `ESC [ 2 J`。这就是 VT100 留下来的那套约定，叫转义序列（escape sequence）。终端模拟器从 master 读到字节后，要逐个判断：这是一个普通字符，该画在光标处；还是一个控制序列的开头，要先收集完整再执行。

这项工作叫 VT 解析，是“模拟 VT100”最核心的部分。Ghostty 和 tmux 的解析器，都基于 Paul Williams 整理的 DEC 终端状态机：

https://vt100.net/emu/dec_ansi_parser

下面是它的简化版，可以一个字节一个字节地执行，输入框里的内容也可以自己改：

<iframe class="embed bleed" src="/terminal-tty-pty/vt.html" title="逐字节执行的 VT 解析器" loading="lazy" style="height: 611px"></iframe>

上一节在 raw 模式下按 ↑，屏幕上的光标真的往上走了一行。终端模拟器发给 cat 的是 `ESC [ A` 三个字节，意思是“用户按了 ↑”；cat 原样写回来，同样三个字节到了终端模拟器这边，意思就成了“光标上移一行”。字节本身没有方向，意思取决于它往哪边走。

到这里，终端模拟器做的事可以归成三件：持有 pty 的 master；解析收到的字节，维护一块屏幕的内容；把这块屏幕画到窗口里。三件事里，只有最后一件需要窗口。

## 六、不需要窗口的终端：tmux

既然前两件事用不着窗口，就可以有一个程序只做前两件：在后台给好几个程序各开一个 pty，自己拿着它们的 master，各自维护一块屏幕。等你想看了，再把其中一块屏幕“转画”到你当前的终端窗口里。这类程序叫终端复用器（terminal multiplexer），tmux 是最常用的一个。

tmux 分两部分。tmux server 在后台常驻，持有所有 pty 的 master，维护每块屏幕的内容。你在终端里输入 `tmux` 或者 `tmux attach`，启动的是 tmux client，它连上 server，server 把某一块屏幕重新编码成转义序列，输出到你当前的终端窗口。

所以 tmux 有两种身份。对跑在它里面的程序来说，它是终端模拟器；对外面的 Ghostty 来说，它是一个普通的全屏程序。程序的输出要先被 tmux 解析一次，再被 Ghostty 解析一次。在 tmux 里跑几条命令，能直接看到这层嵌套：

```
$ tty
/dev/ttys005
$ echo $TERM
tmux-256color
$ ps -o pid,ppid,tty,stat,comm -p $$,$PPID
  PID  PPID TTY      STAT COMM
36175     1 ??       Ss   tmux
36176 36175 ttys005  Ss   zsh
```

`TERM` 变成了 `tmux-256color`。程序靠这个环境变量判断对面的终端支持哪些转义序列，现在对面是 tmux。zsh 的父进程是 tmux server，而 tmux server 的父进程是 1，TTY 一栏是 `??`：它没有控制终端，不依附于任何一个终端窗口。

这正是 tmux 最常被拿来用的原因。关掉终端窗口时，终端模拟器会关闭 pty 的 master。内核发现 master 关了，就给连在这个 pty 上的 shell 发 SIGHUP（hang up，挂断，又是一个串口时代的名字），shell 再转发给自己启动的程序，这些程序默认就退出了。跑在 tmux 里的程序，连着的是 tmux server 手里的 pty。关掉窗口，只会关掉 tmux client 所在的那个 pty，server 和它手里的 pty 都不受影响。

同一个要跑很久的脚本，两种跑法：

<iframe class="embed bleed" src="/terminal-tty-pty/sighup.html" title="关掉终端窗口以后，程序还在不在" loading="lazy" style="height: 523px"></iframe>

把这两种跑法换成 pty 和进程来看，再加上几种常见的组合，就是下面这张图。切换场景，再点“关闭外层终端窗口”，看 SIGHUP 传到哪里为止。紫色标签表示谁在做 VT 解析，数字是解析的先后：

<iframe class="embed bleed" src="/terminal-tty-pty/topology.html" title="谁持有 pty 的 master：几种常见的组合" loading="lazy" style="height: 651px"></iframe>

## 七、回到 pi-subagent

现在可以回答开头的问题了。pi-subagent 的每个子 agent 都是一个完整的 pi 进程，而 pi 是 TUI 程序，需要一个终端：要进 raw 模式，要知道窗口多大，要画界面。父 pi 正占着自己的终端，让不出来。于是 pi-subagent 用这样一条命令给每个子 agent 开一个终端：

```sh
tmux new-session -d -s pi-subagent-<handle> -x 120 -y 40 -- … pi …
```

`-d` 表示 detached，建好以后不连接任何 client；`-x 120 -y 40` 指定屏幕尺寸。tmux server 打开一对 pty，在 slave 上启动子 pi，master 留在自己手里。这个终端没人在看，但子 pi 以为自己有一块 120 列、40 行的屏幕，照常工作。

那为什么不直接开一个新的终端窗口？因为程序很难可靠地控制一个图形窗口。判断里面的进程还在不在、往里面发输入、把它关掉，都得借助 AppleScript 这类自动化接口，在 ssh 登录的服务器这种没有图形界面的环境里根本用不了。tmux 对应的操作都是普通命令：`has-session`、`kill-session`、`attach`。子 agent 一多，每个开一个窗口，管理这些窗口的负担也落到了人身上。

还有一点，agent 执行命令的工具本身不一定有终端。拿 Claude Code 的 Bash 工具来说，它用管道运行命令，在里面执行 `tty`，输出是 `not a tty`，也就是上面那张图的最后一个场景。在这样的环境里，没法直接启动一个 TUI 程序。

tmux 正好提供了这几样东西：一个不需要窗口的 pty，一组可以在命令行里调用的控制操作，还有一个人随时能接进去看的入口。在 pi 里执行 `/subagent` 选中一个子 agent，你的终端就 attach 到它的 tmux 会话上；按 Ctrl-b 再按 d 就能 detach 回来，子 agent 照常运行。

下面照着源码把一次完整的使用过程走一遍，右边是每一步对应的代码：

<iframe class="embed bleed" src="/terminal-tty-pty/subagent.html" title="pi-subagent 一次完整的使用过程" loading="lazy" style="height: 477px"></iframe>

走完会发现，pi-subagent 只把 tmux 当终端用。给子 agent 发消息、读它的结果，都不经过终端，而是读写运行目录里的文件。它的 SKILL.md 写了两条规则：发消息时 "do not use `tmux send-keys`"，判断是否完成时 "Do not infer completion from captured terminal text"。

原因在于，`send-keys` 相当于模拟键盘输入，结果取决于子 pi 的界面当时处在什么状态。比如它正弹着一个选择框，发过去的字就会被选择框收走。`capture-pane` 只能拿到屏幕上渲染出来的文字，长回复会被截断或者折行，任务完没完成只能从画面上猜。所以结构化的数据走文件，终端只留给人看。

## 八、herdr：给 agent 用的复用器

同时跑好几个 coding agent 时，会遇到另一个问题：它们分散在各自的终端里，哪个在等你批准、哪个已经做完了，只能一个个切过去看。herdr 是为这种场景做的终端复用器。

https://github.com/herdrdev/herdr

它的结构和 tmux 一样：后台的 server 持有每个 pane 的 pty，前台的 client 负责显示，可以 detach 再 attach 回来。不同的地方有两处。

一是它解析 pane 输出用的是 libghostty-vt，也就是从 Ghostty 里拆出来的那部分终端核心。前面 VT 解析器演示的那些活，在 herdr 里由 Ghostty 的代码来做。Ghostty 的作者 Mitchell Hashimoto 写过为什么要把它拆出来：

https://mitchellh.com/writing/libghostty-is-coming

二是它会判断每个 pane 里的 agent 处在什么状态：working（正在干活）、blocked（在等你确认）、done（做完了但你还没看）、idle（空闲）。

判断的办法是，先看 pane 的前台进程是哪个 agent，再读 pane 当前屏幕最底部的几行，用这个 agent 对应的规则去匹配。比如底部出现了确认框，就判成 blocked。有些 agent 的 herdr 集成会主动上报状态，pi 就是，这时 herdr 不再读屏幕；Claude Code 和 Codex 的集成只上报会话 ID，用来在 server 重启后恢复会话，状态仍然靠读屏幕。各个 pane 的状态汇总到所属的 space，侧边栏上能直接看到哪个项目要处理。这些规则具体长什么样、为什么老要改，我在 [OSC 7501 那篇](/blog/osc-7501-program-status)里写过。

下面是照 herdr 界面做的演示。可以切换每个 agent 的屏幕内容，勾上“往上滚”看历史输出，看侧边栏的状态怎么跟着变：

<iframe class="embed bleed" src="/terminal-tty-pty/herdr.html" title="herdr 怎么判断 pane 里的 agent 在干什么" loading="lazy" style="height: 644px"></iframe>

herdr 和 pi-subagent 都把 pty 当基础设施，区别在于怎么知道 agent 的状态。herdr 要支持很多它改不了源码的 agent，只能读屏幕；pi-subagent 只服务 pi 自己，可以在 pi 里装一个扩展，直接用文件交换消息和结果。

## 九、谁拿着 master

回头看开头那几个问题，背后其实是同一件事：谁拿着 pty 的 master，拿到字节之后做什么。

Ghostty 拿着 master，把字节解析成屏幕内容，再画成像素。tmux 也拿着 master，也解析，但它不画像素，把屏幕重新编码以后写进另一个终端。所以它不需要窗口，窗口关了它还在。pi-subagent 要的正是这样一个不需要窗口的 pty，让子 pi 这种 TUI 程序能跑起来，人想看的时候再 attach 进去。

把文中出现过的程序放在一起，再加上 VS Code 的内置终端：

| 程序 | 持有 pty master | 做 VT 解析 | 输出给谁 | 窗口关闭后进程还在 |
|---|---|---|---|---|
| Ghostty / iTerm2 | 是 | 是 | 屏幕像素 | 否 |
| tmux server | 是，每个 pane 一个 | 是 | 外层终端（转义序列） | 是 |
| herdr server | 是 | 是（libghostty-vt） | 外层终端（转义序列） | 是 |
| sshd | 是（在远端） | 否 | 网络 | 否，断线后远端收到 SIGHUP |
| VS Code 内置终端 | 是（node-pty） | 是（xterm.js） | 编辑器里的面板 | 否 |
| pi-subagent | 否，交给 tmux | 否 | 无 | 是，靠 tmux |
| agent 的 Bash 工具 | 否，用管道 | 否 | 模型 | 不适用 |

想在自己的机器上看这些，几条命令就够：`tty` 看当前连着哪个 slave，`stty -a` 看 line discipline 的全部开关，`ps -o pid,ppid,tty,pgid,tpgid,stat,comm -t "$(tty)"` 看这个终端上有哪些进程、哪一组在前台。
