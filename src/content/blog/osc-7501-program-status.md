---
title: OSC 7501：程序自己报告状态的终端协议
pubDate: 2026-10-10T10:00:00.000Z
description: 开几个 tab 各跑一个 agent，回来想知道哪个在等我，终端答不上来。Herdr 靠 16 条正则盯着 Claude Code 的屏幕猜，三个月改了 10 次。Ghostty 的作者 Mitchell Hashimoto 拿这个例子写了一个新的终端协议 OSC 7501，让程序通过自己的输出流告诉终端在干活、在等人还是做完了。看已有的转义序列为什么都差一块、这个协议怎么一步步设计出来，pi、Claude Code、Codex 三天内各自怎么实现，以及 tmux 和 kitty 为什么还没跟。
tags:
  - Agent
  - 终端
  - pi
  - Claude Code
  - Codex
---

## 一、哪个在等我

跑 coding agent 的人多半遇到过这种时候：开三四个 tab，每个里面一个 agent，各干各的，自己去看别的东西。过一会儿回来，想知道的只有一件事，哪个在等我。也许一个在等权限确认，一个早就做完了，还有一个还在跑。要弄清楚，只能挨个点开看。

终端帮不上忙。它知道的只有前台进程是谁、最近有没有新的输出。agent 在思考和在等你按 y，在它看来没有区别，两种情况下屏幕都不动。

于是出现了一类专门做这件事的工具：一个视图列出所有在跑的 agent，标出谁在干活、谁在等人、谁做完了。Herdr、cmux、Agent Deck 都是，GitHub 上有人[整理了一份清单](https://github.com/andyrewlee/awesome-agent-orchestrators)，已经有几百个。它们的难处也在这里：终端都不知道的事，它们从哪知道？

## 二、Herdr 是怎么猜的

Herdr 的办法是盯着屏幕看。

Claude Code 干活的时候，窗口标题的开头会有一个转着的 spinner。Herdr 就盯着标题：开头是 spinner 字符，就算 working。规则写在 TOML 里，叫 detection manifest，每个 agent 一个文件，[Claude Code 那个文件](https://github.com/herdrdev/herdr/blob/3d9d2b18dab139ba226ebc5a1c9a9f2c9c3ee4df/src/detect/manifests/claude.toml)的第一条规则就是它：

```toml
[[rules]]
id = "osc_title_working"
state = "working"
priority = 1100
region = "osc_title"
visible_working = true
# Braille covers <= 2.1.227; half-circles are the 2.1.228 busy spinner.
regex = ['^[\x{2800}-\x{28FF}\x{25D0}-\x{25D3}] ']
```

注释那一行值得多看一眼。盲文点阵那段区间对应 2.1.227 之前的版本，半圆那段是 2.1.228 换的新 spinner。Claude Code 换了个字符，规则就得多匹配一段。

这种事不止发生了一次。这个文件一共 16 条规则，6 月 10 日建立，到 9 月 11 日改了 12 次，其中 10 次是 fix。把这些 fix 的标题按时间顺序读一遍，就是 Claude Code 这三个月的界面变化史：7 月，`/btw` 弹层打开时要继续算 working；8 月，确认提示要算 blocked，2.1.228 的半圆 spinner 要认，半圆 spinner 的全部帧都要认，屏幕活动要有兜底规则，后台 MCP 任务要继续算 working，MCP 的 elicitation 对话框要算 blocked；9 月，后台 shell 不能算 working，bash 权限提示在任意光标位置都要匹配，一轮进行中的 unicode spinner 也要认。

https://github.com/herdrdev/herdr/commits/master/src/detect/manifests/claude.toml

每条规则都是在猜一个黑盒的心思，黑盒每变一次脸，规则跟着改一次。Ghostty 的作者 Mitchell Hashimoto 在 10 月 6 日的一篇文章里拿的就是这条规则做例子。他特意说这不是在批评 Herdr，它在现有条件下做得很好，而且把规则公开了出来。但这个例子把问题说透了：知道自己在干什么的是程序本身，让它自己说，比谁猜都准。

https://mitchellh.com/writing/program-status-osc7501

他给出的办法是一个新的终端协议，OSC 7501。pi 第二天就实现了，Claude Code 隔一天也跟了，Codex 的实现在第四天合进了主干。这个协议到底填了什么坑，各家为什么跟得这么快，下面顺着他的思路往下看。

## 三、让程序自己说

其实 Herdr 和 cmux 都给程序留了说话的口子。Herdr 有 socket API，cmux 有 `cmux notify` 命令，程序调一下就能把自己的状态报上去。知道状态的是程序，这条路比猜准。

但它要每个程序分别对接每个 inbox。Herdr 为了拿到 pi 的状态，会往用户的 agent 目录里写一个 pi 扩展；其他 agent 则靠 hooks 调 Herdr 的 CLI 或者 socket。换一个 inbox，这些全都重来。而且 socket 是本机的东西，agent 跑在另一台机器上，或者跑在容器里，本机的 socket 够不着，要另外搭桥。

回头看 Herdr 盯着的那个窗口标题。标题是谁设的？是 Claude Code 自己。它往自己的输出里写了一小段特殊的字节，终端认出这段字节，不显示，拿去改标题。这类字节叫转义序列，设标题的那种以 `ESC ]` 开头、`ESC \` 结尾，叫 OSC，后面跟一个编号说明要干什么，设标题是 0 号和 2 号。

也就是说，程序一直都在通过自己的输出流跟终端说话。这条流从程序到终端的路上什么都穿得过，SSH、容器、tmux，程序在哪儿跑都一样，因为它就是程序的输出本身。socket 做不到的事，这条路天生就能做。程序和终端之间的这条线叫 pty，转义序列就走在上面。

那有没有一个 OSC 序列是专门说状态的？Mitchell 在规范里把现成的都过了一遍，结论是每个都沾边，每个都差一块。

最接近的是进度条。ConEmu 定义的 OSC 9;4，程序发一个百分比，终端画一根进度条。Windows Terminal 早就支持，Ghostty 1.2 也加了，发布说明里说 systemd、Zig 的命令行和 Amp 都在发，pi 也发。Herdr 的规则里甚至有一条专门读它，进度条清零就算 idle。但它能说的只有在忙、百分之几、出错了。agent 最要紧的那个状态，停下来等你，它没法表达，也不带文字和程序名。编号 9 还和 iTerm2 的通知序列撞了，只认其中一个的终端会显示乱码。

通知也不行。OSC 9、99、777 三种，各家终端各认一种，共同点是弹一下就完。终端弹完就不记得了，不知道程序现在还在不在等。而且通知意味着打扰，不是每次状态变化都值得弹一下。

shell integration，也就是 OSC 133，标记提示符和命令的开始结束，很多终端靠它实现“命令跑完了提醒我”。但发它的是 shell，不是程序，所以它只知道命令开始了、结束了、退出码是多少。agent 一跑几十分钟，在 shell 眼里就是一条还没结束的命令。

iTerm2 自己做过一个最接近的东西，OSC 21337，程序可以设 tab 上圆点的颜色和一行副标题。Codex 和 Claude Code 都实现了它，Codex 用它在 iTerm2 的 tab 上标 Working 和 Waiting。但只有 iTerm2 认，别的终端收到就扔了。Codex 的源码注释里写得直接：加 OSC 7501 之前，它的状态只有直连 iTerm2 时才报得出去。

所以缺的是一个通用的、不绑定某个终端、也不规定怎么显示、能说出“在等用户，等的是权限”的序列。Mitchell 维护 Ghostty 多年，就自己写了一个。

## 四、OSC 7501 怎么设计

规范放在 Rex 的文档站上。Rex 是 Superlogical 的终端多路复用器，Superlogical 是 Mitchell 的新公司。他在提案和规范里都说明了，这个协议是做 Rex 的时候需要的，但规范里没有任何 Superlogical 专用的东西。

https://www.superlogical.com/rex/docs/build/program-status

从最简单的情形开始。`brew upgrade` 跑起来了，想告诉终端“我在忙”，发这么一段：

```text
ESC ] 7501 ; state=working:app=brew ESC \
```

和设标题是同一种序列，编号换成 7501，正文是 `key=value` 对，用冒号分隔。不认识这个编号的终端会把它整个扔掉，所以往任何终端发都不会出乱码。`state` 是唯一必填的键，`app` 是程序的名字，给终端和 inbox 认人用。

升到一半要输密码了。这时候要说的是“我停了，在等你”，最好还说清等的是哪种事、为什么：

```text
ESC ] 7501 ; state=blocked:kind=auth:app=brew:msg=UGFzc3dvcmQ/ ESC \
```

`blocked` 表示没有用户动手就走不下去，`kind` 说在等哪种事：`permission` 要批准，`question` 要回答，`auth` 要登录或者凭据。`msg` 是给人看的一行话，base64 编码。为什么要编码：正文里的值只允许字母、数字和几个符号，冒号和分号都不许出现，base64 的字母表正好满足，于是不用设计转义规则，任何文字都能装进去。

装完了：

```text
ESC ] 7501 ; state=done:app=brew:msg=VXBncmFkZWQgMTIgcGFja2FnZXM= ESC \
```

状态一共五个。`working` 在跑，可以带 `progress` 百分比；`blocked` 在等用户；`done` 做完了，结果用户还没看；`error` 失败并停下；`idle` 在等用户的下一条指令，这个是交互式程序才用得上的，brew 不需要。另有一个 `clear` 用来删掉记录。终端收到不认识的 state 会丢掉整条报告，这是有意的：以后新加的状态，在旧终端上不会被错认成现有的某一种。

骨架就这么多。接下来是几个自然会问到的问题，规范一个个回答了。

记录什么时候消失？没有心跳，终端不能要求程序定期重发。规范把记录的寿命挂在终端已经知道的两件事上：进程退出，以及 shell 开始新的提示符。后一件就是前面说的 OSC 133，它自己说不了程序状态，但它知道提示符什么时候回来，正好拿来收尾。这两件事发生时，`working` 和 `blocked` 必须被丢掉，它们描述的那个程序已经不在了；`done` 和 `error` 要留着，直到用户回来看过，比如切回这个 tab 按了一个键。这样 brew 临退出前报的那个 `done`，用户回来还看得见。

程序同时干几件事呢？终端为每个 `id` 保存一条记录，不带 `id` 的报告指向根记录。`id` 用 `/` 分层，`build/test` 是 `build` 的子记录。一个部署工具可以这样报：

```text
ESC ] 7501 ; state=working:app=deploy ESC \
ESC ] 7501 ; state=working:id=us-east:progress=40 ESC \
ESC ] 7501 ; state=blocked:kind=permission:id=eu-west ESC \
```

根在跑，us-east 到了 40%，eu-west 在等批准，三件事同时成立，怎么显示由终端决定。每次报告整条替换记录，报告里没有的键就从记录里消失，所以 `app` 要每次都带，子记录没带的话从父记录继承。

程序怎么知道终端听得懂？发 `OSC 7501 ; ?`，支持的终端原样回一个。不支持的终端什么都不会回，程序总不能干等，规范给了一个小技巧：紧接着发 `CSI c` 查询设备属性，这个查询所有终端都会回，如果它先回来，就说明终端不支持 7501。探测是可选的，不探测直接发也安全，这一点后面会再说到。

程序要是不怀好意呢？规范把报告里的一切都当作不可信输入。`msg` 和 `title` 解码后不能含控制字符，否则整条丢弃；终端显示它们时不能当成标记语言，还应当去掉文字方向覆盖这类不可见字符。终端往回写的只有那个固定的探测应答，永远不回显 id、标题和消息，免得程序借终端的手往自己的输入里塞东西。整条序列最多 4096 字节，每个终端最多 256 条记录，超过就淘汰最久没更新的。桌面通知、声音这类外部效果要限速，免得程序靠疯狂切换状态刷屏。

终端拿到这些怎么显示？规范不管。它刻意避开 notification、attention、focus 这些和界面元素绑定的词，只传状态。显示成 tab 图标、侧栏列表还是推送到手机，是终端的事。

落到代码上，一个 shell 脚本接入它只要几行：

```sh
status() {
  msg=$(printf '%s' "$2" | base64 | tr -d '\n')
  printf '\e]7501;state=%s:msg=%s\e\\' "$1" "$msg"
}
status working "Backing up photos"
rsync -a ~/Photos nas:/photos \
  && status done "Backup finished" \
  || status error "rsync failed"
```

没有 SDK，没有 socket，没有环境变量，没有 JSON。

规范的修订记录显示，0.1 是 9 月 28 日写的，发布那天是 0.2，第二天的 0.3 做了两处改动：`progress` 缺省表示进度不确定，以及明确程序可以不探测直接发。

Mitchell 自己先实现了两遍。一遍在 libghostty-vt，发布当天提 PR 当天合并：

https://github.com/ghostty-org/ghostty/pull/14560

他在 PR 里说这是 Ghostty 项目首次牵头的全新终端规范。libghostty 这边只做解析和回调，和 OSC 9;4 一样，终端库本身不保存记录，由嵌入它的应用保存并执行生命周期规则。Ghostty 应用本身暂时忽略这些报告，也因此没有加 terminfo 条目。另一遍在 Rex，已经在 session 列表和 tab 标题上显示状态，Lua 脚本也能订阅状态变化事件。发文章之前他还给 Terraform、Claude Code、Codex 和 Homebrew 各做了一个验证性的实现，走插件或者 fork，每个都不超过十几行。

## 五、三天之内

### pi，第二天

10 月 7 日中午，Mario 在 pi 的仓库开了 issue，把状态映射和实现要点都列好了：

https://github.com/earendil-works/pi/issues/10607

当天晚上实现提交，1.1.0 当天发布。中间有个小插曲，一位社区成员贴了一个 AI 生成的实现请求合并，Mario 回复说谢谢，但我们自己也会提示 agent。

pi 什么时候报什么，文档里有一张表：

| 状态 | 什么时候 |
|---|---|
| `working` | agent 在跑，或者在压缩上下文。msg 是 session 名 |
| `blocked` | 扩展的对话框或者登录在等用户。msg 是对话框标题 |
| `done` | 一轮跑完。msg 是 session 名 |
| `error` | 一轮以不重试的错误结束。msg 是错误的第一行 |
| `idle` | pi 刚启动，或者用户取消了 |

`blocked` 的 kind 按对话框类型分：`confirm` 对话框是 `permission`，`select`、`input`、`editor` 是 `question`，登录对话框是 `auth`。对话框关掉后恢复到之前的状态。只用根记录，每条都带 `app=pi`。

文档里专门写了一句：报告里从来不含提示词和模型输出，只有 session 名、对话框标题和错误的第一行。msg 会被终端拿去显示，将来还可能推送到手机，这条线划在哪里，是每个实现都得先想清楚的事。

探测的做法是搭顺风车。pi 启动时本来就发一批查询，最后以 DA1 收尾，用来探测 kitty 键盘协议，正好就是规范建议的那个技巧。现在把 `OSC 7501 ; ?` 塞进这批查询里，回复在 DA1 之前到就算支持。`PI_PROGRAM_STATUS=1` 跳过探测直接发，`=0` 关掉。退出或者挂起时发 `clear`，恢复后把最后一个状态重发一遍。

为了这个功能，`agent_settled` 事件加了一个 `aborted` 字段。之前取消一轮和正常跑完在这个事件上区分不开，加了之后取消的运行报 `idle`，不会被当成 `done`。

### Claude Code，第三天

2.1.295 在 10 月 8 日发布，changelog 只有一句：加了 Program Status Protocol 支持，支持它的终端能显示 Claude Code 在干活、在等你还是做完了。没有源码，下面是对照 2.1.295 的二进制看到的。

探测的思路和 pi 一样，合并在启动的那批查询里：先发 XTVERSION 问终端是谁，再发 kitty 键盘协议查询和 `OSC 7501 ; ?`，用一个所有终端都会应答的查询收尾。日志里对应两条，`probe: OSC 7501 reply` 和 `probe: no reply to OSC 7501 ; ?`。只有终端应答了才会发报告。OSC 编号常量表里 `PROGRAM_STATUS: 7501` 和 `TAB_STATUS: 21337` 并列，后者就是 iTerm2 那个。

每条报告带 `app=claude-code`。根记录这样映射：

- 正在跑，或者空闲但有排队的消息：`working`，带 progress 和一行说明。
- 在等用户并且知道在等什么：`blocked`。权限提示、沙箱请求、worker 请求、goal proposal 都映射到 `permission`，需要输入映射到 `question`，普通对话框打开不带 kind。
- 上一轮正常结束：`done`。被停止或者还没跑过：`idle`。
- 上一轮出错：`error`，msg 是错误信息。但认证失败、组织不允许、云凭据错误这三类例外，没登录的话报 `blocked` 加 `kind=auth`。

和另外两家不同的是，Claude Code 用上了子记录。后台任务和 subagent 各占一条，id 是任务 id，title 是任务描述，状态按任务状态映射，最多 32 条。根记录的 progress 是已完成任务的比例。主 agent 在等批准、三个 subagent 还在跑，这样的局面终端能完整拿到，前面规范里那个部署工具的例子在 agent 身上就是这个样子。

设了 `CLAUDE_CODE_DISABLE_TERMINAL_TITLE` 就不发，后台 worker 进程也不发。界面卸载时发 `clear`。

### Codex，第四天

Codex 的 PR 在 10 月 9 日深夜合进主干，截至 10 日还没进任何发布版本：

https://github.com/openai/codex/pull/52725

它的取舍和前两家都不一样。只报 `idle`、`working`、`blocked` 三种，没有 `done` 和 `error`，不带 msg，只有 `app=codex`。`blocked` 的判断复用了窗口标题里“需要操作”的那套逻辑。

不探测。只要 stdout 是终端就发，在 tmux 里也发。这是规范 0.3 允许的做法。

前面提到的 iTerm2 那个 OSC 21337 保留下来了，直连 iTerm2 时两个序列都发，21337 那条还带活动详情。把终端交给外部程序（比如打开编辑器）之前先发 `clear`，挂起和退出时也发，回来后重发当前状态。

### 对照

| | pi 1.1.0 | Claude Code 2.1.295 | Codex 主干 |
|---|---|---|---|
| 状态 | 五种 | 五种 | idle、working、blocked |
| blocked 的 kind | permission、question、auth | permission、question、auth | 不带 |
| msg | session 名、对话框标题、错误首行 | 带一行说明 | 不带 |
| 子记录 | 无 | 后台任务和 subagent | 无 |
| 探测 | 探测，`PI_PROGRAM_STATUS` 可覆盖 | 探测 | 不探测，是终端就发 |
| 在 tmux 里 | 探测失败，不发 | 探测失败，不发 | 发，但 tmux 不转发 |

### 不止 agent

同一周跟进的不止 agent。[Crush](https://github.com/charmbracelet/crush/pull/4041) 10 月 8 日合并，五种状态都报，blocked 包括权限提示、问题表单和 AWS 登录；oh-my-pi 也在主干上加了；opencode 有人[提了 issue](https://github.com/anomalyco/opencode/issues/54179)。非 AI 的工具也有：[Hugo](https://github.com/gohugoio/hugo/pull/15428) 9 日合并，和原有的 OSC 9;4 并行，出错时带错误第一行；[oh-my-posh](https://github.com/JanDeDobbeleer/oh-my-posh/pull/7909) 10 日合并，在升级、安装字体和登录时报状态；[Composer](https://github.com/composer/composer/pull/13117) 的 PR 还开着，起因是维护者之一转发了 Mitchell 的文章。Mitchell 文章里说这个问题不带 AI 也成立，这几个 PR 算是证明。

## 六、终端那边

发的一方跟得快，收的一方慢一些。截至 10 月 10 日能显示这些报告的，有 Mitchell 自己的 Rex，有 cmux。[cmux](https://github.com/manaflow-ai/cmux/blob/main/docs/program-status.md) 是 9 日加的，每个 pane 分别记录，工作区上显示最紧急的一条，顺序是 blocked、error、working、done，idle 记着但不显示，done 和 error 留到你切回那个 pane。[SwiftTerm](https://github.com/migueldeicaza/SwiftTerm/pull/748) 合并了解析。Zed 有[一个讨论](https://github.com/zed-industries/zed/discussions/65412)。Ghostty 应用本身还没显示。

两个关键的还没跟。

tmux 的 issue 提议答探测，并把根记录放进 `pane_ps_state` 这类格式变量：

https://github.com/tmux/tmux/issues/5713

nicm 的回复是现在言之过早，先看看别的终端和程序会不会用起来；第二条回复说，pane 标题、OSC 9 进度条加 OSC 133 目前覆盖够了。有人在下面列了一份当天的采用清单作为数据点，还提到自己维护的 webtmux 现在每两秒对每个 pane 跑一次 `capture-pane`，把文本做哈希来猜 working 还是 idle，和 Herdr 是同一种处境。

kitty 的 issue 里，Kovid 回了五条质疑：

https://github.com/kovidgoyal/kitty/issues/10638

一是 terminfo 条目没必要，终端本来就忽略未知 OSC，要保证就用查询，新协议不该再用 terminfo；二是扩展性，以后加状态怎么办，查询应答应该让终端报告支持哪些状态，或者加版本号；三是为什么要丢掉含控制字符的消息，换行和 tab 算不算，规范该给一句理由；四是 app 为什么限制在 ASCII，它是给人看的还是给程序读的，图标呢；五是整条 4096 字节的限制和各字段自由长度的关系。他 ping 了 Mitchell，截至 10 日还没有回复。其中第二条和第五条规范里有对应的条文，不认识的状态会导致整条报告被丢弃，msg、title、id 各有单独的字节上限；第一条规范自己也承认 terminfo 不权威，探测应答才算数。

tmux 不答探测的后果现在就能看到。pi 和 Claude Code 都要终端应答才发，在 tmux 里探测必然失败，于是一条报告都不发。pi 可以用 `PI_PROGRAM_STATUS=1` 强制发，但 tmux 把它当未知 OSC 丢掉，外层终端收不到。Codex 不探测直接发，同样到不了外面。所以在 tmux 里跑 agent 的人，不管用哪家，暂时都拿不到任何东西。前面说探测是可选的，规范 0.3 特意补上这一条，大概就是看到了这个局面：要是程序都等终端先支持，终端又等程序先用起来，就谁也不动。

Herdr 自己的跟进也还没落地。有人提了 issue，被机器人按“只收 bug”的政策关掉转去讨论区，现在讨论区有一个汇总帖：

https://github.com/herdrdev/herdr/discussions/5073

最新发布的 0.9.3 是 9 月 29 日的，还没有读 7501。

## 七、后面能有什么

回到开头的场景。Herdr 的 16 条规则识别的是 Claude Code 的屏幕长什么样，7501 传的是 Claude Code 自己知道的东西。前者每次界面改动都可能失效，后者只在 Claude Code 决定改映射时才变。inbox 这一侧的工作量从“为每个 agent 维护一套规则和一个插件”变成“解析一种序列”，新出的 agent 只要自己发，不用等 inbox 适配。Herdr 讨论区里有人指出一个边界：pi 在 `agent_settled` 时报 done，有后台 subagent 还在跑的话还是会显示 done。分层记录正是为这种情况设计的，Claude Code 已经在用。

好处不限于 agent。Homebrew 升级到一半要密码、Terraform 等你批准 apply、Hugo 构建失败、rsync 跑完，都是同一个问题。把这些放到一个 tab 列表里，看一眼就知道哪个在等你，不用挨个切过去。

pty 这条通道的另一个好处是 SSH 和容器。agent 跑在远端机器或者容器里，本地的 socket API 够不着，转义序列会随着终端输出一路传回来。Rex 文档里写的计划是把状态推送到手机应用，再做一个按优先级排的统一 inbox。

能走多远取决于终端和多路复用器。应用一端发报告十几行就够，终端一端要保存记录、执行生命周期规则、做安全检查，是更重的活。tmux 和 kitty 这两个还没动，一个在观望，一个列了问题单。Kovid 那几条里关于扩展性的质疑是实在的，规范目前靠“不认识就整条丢弃”和“应答里以后可以加字段”来留余地，终端报告自己支持哪些状态这一层还没有。规范还在 0.x，这些讨论会影响它最后的样子。

落到现在能用的：用 cmux 或者 Rex，pi 和 Claude Code 的状态已经能在侧栏看到；用 Ghostty，库解析了但应用还没显示；用 tmux，什么都看不到。
