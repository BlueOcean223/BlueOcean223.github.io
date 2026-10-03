---
title: Agent 运行时的 steer 与 queue
pubDate: 2026-10-02T10:00:00.000Z
description: agent 还在干活时发出去的消息，什么时候进上下文？pi 和 Codex 把它分成 steer 和 follow-up 两种，各给一个按键；Claude Code 只有一种，文档里叫 queue，送达的时机却是 steer。对照三家的源码和改动历史，看消息能插在 agent 循环的哪个位置，pi 为什么把一个队列拆成两个，Codex 为什么把 Enter 从排队改成 steer，以及想比 steer 更早介入时三家各自的办法。
tags:
  - Agent
  - pi
  - Codex
  - Claude Code
---

## 一、起因

agent 还在干活时，常常会想补一句话。pi 把这种消息分成两种：运行中按 Enter 发出的叫 steering message，按 `Alt+Enter` 发出的叫 follow-up message。Codex 也有类似的区分，叫 steer 和 queue。这两种发法具体差在哪，我之前不太清楚，就去翻了源码。

运行中想补的话大致有两类。比如 agent 正在把一个模块里十几个文件的旧 API 换成新的，改到一半：

- 我发现它准备动 `legacy/` 下面的文件，这些不该改。这句话越早让模型看到越好，晚了文件已经改完了。
- 我想起来改完还要更新 CHANGELOG。这句话什么时候看到都行，最好等它把手上的活做完，别在中途分心。

前一种是 steer，修正正在做的事；后一种是 follow-up，也有人叫 queue，排在当前任务后面。

## 二、消息能插在哪

先看 agent 循环。一个任务通常这样跑：调用模型，模型返回一段文字和若干工具调用；执行这批工具，把结果追加进上下文；再调用模型。如此反复，直到模型某一次不再调用工具，任务结束。下文把一次模型调用加上它的工具执行叫“一步”，把从用户发出消息到 agent 停下叫“一轮”，Codex 和 Claude Code 说的 turn 是后者。

用户中途发的消息只能追加到上下文里，等下一次调用模型时被看到。问题是追加在哪个位置。

模型正在输出时插不进去，这次请求已经发出，只能等它结束或者中止它。工具执行到一半也插不进去：Anthropic 和 OpenAI 的接口都要求，上一条 assistant 消息里的每个工具调用，在下一次请求里都要带上对应的结果。Claude Code 源码里注入排队消息的地方有一句注释，说这件事必须等工具调用全部结束再做，tool_result 和普通用户消息交错的话，API 会报错。

所以最早的位置是这一批工具的结果都追加完、下一次调用模型之前。消息在这里进去，模型下一步就能看到，任务还在进行，这是 steer 的位置。最晚的位置是模型不再调用工具、agent 准备停下的时候，这时进去的消息相当于一个新任务，这是 follow-up 的位置。

pi 的 agent 循环把这两个位置写得很直观。下面是 `agent-loop.ts` 里 `runLoop` 的骨架，省略了压缩、钩子和错误处理：

```ts
let pending = await getSteeringMessages();
while (true) {
  let hasMoreToolCalls = true;
  while (hasMoreToolCalls || pending.length > 0) {
    context.messages.push(...pending);
    pending = [];
    const message = await streamAssistantResponse(context);
    const calls = message.content.filter(isToolCall);
    hasMoreToolCalls = calls.length > 0;
    if (hasMoreToolCalls) {
      // 整批工具执行完，结果追加进上下文
      context.messages.push(...(await executeToolCalls(calls)));
    }
    // 每走完一步，取 steering 队列
    pending = await getSteeringMessages();
  }
  // 准备停下时，取 follow-up 队列
  const followUps = await getFollowUpMessages();
  if (followUps.length === 0) break;
  pending = followUps;
}
```

内层循环每走完一步取一次 steering 队列，外层循环在内层退出、agent 准备停下时取 follow-up 队列。两种消息进来以后都是普通的 user 消息，pi 没有给它们加任何说明。

这段代码还说明了一点：如果模型这一步没有调用工具，比如它已经在写最后的总结，那么 steer 和 follow-up 进来的时机相同，都在这一步结束之后。两者的区别只在 agent 还有工具要调的时候才体现出来。回到换 API 的例子，Enter 发出的“别动 `legacy/`”会在当前这批编辑跑完后进去，模型下一步就能改主意；`Alt+Enter` 发出的“更新 CHANGELOG”要等十几个文件全部改完、模型给出总结之后才进去。

## 三、pi：一个队列拆成两个

今年 1 月初以前，pi 运行中发消息只有一种方式，对应 `queueMessage()`，界面上管这种消息叫 queued message。可它在循环里取的是 steer 的位置，而且比现在更激进：每执行完一个工具就检查一次队列，有消息的话，同一批里剩下的工具调用直接跳过，各自返回一个错误结果 `Skipped due to queued user message.`，然后把消息交给模型。

Nico Bailon 在 #403 里指出了名字和行为之间的冲突：

https://github.com/earendil-works/pi/issues/403

他的意思是，“排队”这个词会让人以为消息要等 agent 真正做完才处理。用户心里想的可能是：它在实现功能，我先把下一个任务打好，等它做完接着跑。结果消息在中途就进去了，后面的工具调用被跳过，模型可能先去处理新消息，原来的任务没做完。他希望多一种真正排到最后的方式，举的例子是有人喜欢连着排好几条 “continue”，然后走开。

Armin 的回复正好相反：现在的行为就是他一直预期的，等 agent 结束才处理的那种队列反而不符合他的预期，他自己也很少用得上。他建议用两个键来区分。

Mario 很快做了拆分，1 月 3 日随 0.32.0 发布：`queueMessage()` 换成 `steer()` 和 `followUp()`，Enter 是 steer，新加的 `Alt+Enter` 是 follow-up；设置项 `queueMode` 改名 `steeringMode`，另加一个 `followUpMode`。Enter 保留了原来的行为，也就是 Armin 习惯的那种。

跳过剩余工具的做法又留了两个多月，3 月 16 日的 0.58.4 把它去掉，steer 改成等整批工具都执行完再进去。第二天有人在 [#2289](https://github.com/earendil-works/pi/issues/2289) 里报告了旧行为的问题：发出一个任务后马上补了一句 steer，模型已经生成、还没开始执行的一个 write 调用被跳过了，他说这让 steer 基本没法用。Mario 回复最新版已经修了。

跳过的问题在于，被跳过的调用是模型已经生成好的，同一批里的调用又常常互相关联，跳过一部分以后，模型得先弄清哪些执行了、哪些没有。等整批跑完再插入，代价只是 steer 晚到一点。

现在的 pi 还有几个相关的细节：

- 运行中发出的消息会列在界面上，分别标着 `Steering:` 和 `Follow-up:`。
- `Alt+Up` 把排队的消息全部退回编辑器，当前任务不中止，改完可以重新发。
- `Esc` 中止当前任务，排队的消息同样退回编辑器。
- `steeringMode` 和 `followUpMode` 默认都是 `one-at-a-time`。连发三条 steer，每一步只送进去一条，分三步送完；改成 `all` 就一次全送。
- 用 SDK 或 RPC 时，agent 正在运行就必须指明 `streamingBehavior` 是 `"steer"` 还是 `"followUp"`，不指明的话 `prompt()` 直接报错，pi 不替调用方猜。

## 四、Codex：从默认排队改成默认 steer

Codex 走的是反方向。今年 2 月以前，Codex 运行中按 Enter 是排队，消息等当前一轮结束再发；steer 是一个实验功能。2 月 5 日的 0.98.0 把 steer 转正并默认打开：

https://github.com/openai/codex/pull/10690

从那以后，运行中按 Enter 是 steer，按 `Tab` 是排队。`steer` 这个 feature flag 现在标为 Removed，留着只是为了兼容旧配置。

两个键在实现上走两条路。

Enter 发出的消息由 TUI 直接交给 core，core 把它放进当前一轮的 pending input。轮次循环在每次构建模型请求之前把 pending input 取出来记进历史，记法和用户正常发的消息一样，没有额外包装。有两个时候不取：一轮刚开始时，先让这一轮本来的输入跑一步；自动压缩之后，还有续写在等的时候。另外，每一步采样结束后，只要 pending input 不为空，就算模型已经说完了，这一轮也会继续。

不是每种轮次都能 steer。只有普通轮次接受，`/review` 和压缩的轮次会拒绝，被拒的消息由 TUI 放回队列，轮次结束后优先发出。

`Tab` 的队列只存在于 TUI，core 不知道它。当前一轮结束后，TUI 从队列里取一条，作为新的一轮发出去，这一轮结束了再取下一条。`Alt+Up` 或 `Shift+Left` 可以把排队的消息拿回输入框修改。

Codex 的 `Esc` 分两种情况。如果有 steer 已经发给 core、还没被取进历史，`Esc` 会中止当前一轮，把这些 steer 合并成一条，作为新的一轮立刻发出，界面上提示 “Model interrupted to submit steer instructions.”。如果只有 `Tab` 排的消息，中止后它们退回输入框。前一种情况相当于“现在就发”。

Codex 还在做一个实验开关 `instant_interrupt`，状态是 UnderDevelopment，默认关闭。它是 9 月 25 日的 [#48135](https://github.com/openai/codex/pull/48135) 加进来的，起因是 code mode 里一个长时间运行的 `exec` 或 `wait` 调用会让用户的新输入一直等到调用返回；打开开关后，这类调用在有新输入时提前返回，脚本留在后台继续跑。现在的源码里，这个开关还会取消正在进行的模型输出，新输入一到，不再等这一步结束。

## 五、Claude Code：只有一个队列

Claude Code 的文档把运行中发消息叫 queue：

https://code.claude.com/docs/en/interactive-mode#queue-messages-while-claude-works

按文档的说法，消息会被排队，不会打断当前一轮。但看送达的时机，它是 steer：如果 Claude 正在执行工具，消息在这些工具调用结束后就交给模型，仍在同一轮里；如果一轮结束时队列里还有消息，会自动作为新的一轮发出。早在 0.2.108 的 changelog 里，这个功能的说法就是在 Claude 工作时发消息，实时 steer 它。

斜杠命令和 `!` 开头的 shell 命令不一样，它们要等一轮结束，再按排队顺序逐条执行。它们得在本地执行，不能当成文字塞给模型。2.1.88 的源码注释也是这么写的：轮次中途注入时排除斜杠命令，它们要在轮次结束后走 `processSlashCommand`。

所以在 Claude Code 里，普通消息没有 follow-up 这个选项。

Claude Code 和另外两家还有一处不同：排队的消息进上下文时会加一段说明。2.1.88 的源码里，用户消息前面加的是 “The user sent a new message while you were working:”，后面再跟一句：

```text
IMPORTANT: After completing your current task, you MUST address the user's message above.
```

这句话要模型做完手上的任务再处理，读起来是 follow-up，机制却是 steer。回到换 API 的例子，“别动 `legacy/`”在工具结束后就进了上下文，模型却被告知做完当前任务再处理，它完全可能先把 `legacy/` 改完。

我对照了本机装的 2.1.284，这段说明改了。开头那句没变，后面换成一段解释，大意是：用户在轮次中途发的消息就是这样呈现的，它出现在正在进行的这一轮里，常常和下一个工具结果放在一起，不算单独的一轮对话。最后一句是：

```text
Address the message above as you continue this turn.
```

要模型在继续这一轮工作的同时处理，措辞和机制对上了。

想比 steer 更早介入，Claude Code 给的是 send now。2.1.275 加了 `Ctrl+Enter`，终端不支持扩展按键时用 `Ctrl+X Ctrl+S`，按下后中断当前一轮，把排队的消息一次发出。2.1.281 改了中断的方式：如果 Claude 正在跑 shell 命令、subagent 这类能转到后台的工作，就把它们移到后台继续跑，Claude 在同一轮里读到消息；只有模型在输出文字，或者在跑不能转后台的工作时，才中断再发。最新的 2.1.286 又把这个行为扩展到了 subagent 的视图和 skill 自己的 shell 命令。

`Esc` 会中断当前一轮，输入框里的草稿不提交，已经排队的消息保留并立即发出。想撤回排队的消息，在输入框首行按 `Up`。

还有一个容易误会的键。2.1.247 加了 `Ctrl+X Enter`，对应的动作叫 `chat:queueSubmit`。文档说用它提交的消息会被标记为等着轮到它，Claude 工作时排队，并且永远不打断当前一轮。看名字和描述，很像 pi 的 `Alt+Enter`。

我在 2.1.284 的二进制里追了这个标记。按 `Ctrl+X Enter` 时，消息带着 `wait: true` 进入同一个队列；轮次中途取队列的那段代码不看这个字段，消息照样在工具调用结束后进上下文，时机和 Enter 一样。`wait` 只被传给 `prompt.submit` 这个插件钩子，而根据它改变行为的，我只找到一个内置插件 `responsive-mode`。它由 feature flag `tengu_quiet_ember` 控制，默认关闭，文档里没有提到，作用是让 Claude 对每条消息先用一两句话回应，再去思考和调工具。它打开时，运行中按 Enter 发出的消息会先中止当前一轮再发送，输入框的提示变成 “enter to interrupt and send · ctrl+x then enter to queue”；带 `wait` 的消息不会触发中止。

所以 `Ctrl+X Enter` 只保证不打断当前一轮，并不会让消息等到任务做完。在默认设置下，它和 Enter 没有区别。

## 六、对照

对照的版本是 pi 0.99.2、Codex 9 月 29 日的源码（`3226512d`）、Claude Code 2.1.284。

| | pi | Codex | Claude Code |
|---|---|---|---|
| 运行中按 Enter | steer | steer | steer，文档叫 queue |
| 等任务做完再发 | `Alt+Enter` | `Tab` | 普通消息没有，命令和 `!` 会等 |
| steer 进上下文的时机 | 当前这批工具执行完，下一次调用模型前 | 同左 | 同左 |
| 模型看到的 steer | 普通 user 消息 | 普通 user 消息 | 加了一段说明 |
| 多条 steer | 默认每步一条 | 一次全部 | 一次全部 |
| 更早介入 | `Esc` 中止 | `Esc` 中止并重发未送达的 steer；`instant_interrupt` 开发中 | `Ctrl+Enter`，能转后台的工作转后台 |
| `Esc` 后排队的消息 | 退回编辑器 | 未送达的 steer 合并发出，`Tab` 的队列退回输入框 | 立即发出 |
| 撤回排队的消息 | `Alt+Up` | `Alt+Up` 或 `Shift+Left` | 首行按 `Up` |

三家现在都把 Enter 定成了 steer。pi 从一开始就是，拆分时 Enter 没变；Codex 从排队改了过来；Claude Code 一直是，只是叫 queue。运行中最顺手的键给了 steer，看得出三家都假定运行中发的消息多半是来修正方向的，越早送到越好。要等任务做完再说的事，pi 和 Codex 另给了一个键；Claude Code 没给，交给模型自己判断，新的说明要求它在这一轮里处理。

steer 的时机三家也一样，都是当前一批工具执行完、下一次调用模型之前，这是工具调用协议决定的。想再早，就得中止或者绕开正在进行的东西。pi 只能 `Esc` 中止，排队的消息退回编辑器重新编辑；Codex 的 `Esc` 在有未送达的 steer 时中止并立刻发出，`instant_interrupt` 还在开发；Claude Code 的 send now 能把正在跑的工具移到后台，模型不用等它们结束就能读到消息。pi 早期跳过剩余工具也是一种办法，后来放弃了。

落到用法上，修正方向的话直接按 Enter。“做完以后再……”这类话也用 Enter 发的话，下一步就会进上下文，模型可能放下手上的事先去做，也可能记着留到最后，取决于它自己怎么判断。想确保它排在最后，pi 用 `Alt+Enter`，Codex 用 `Tab`；Claude Code 没有这个选项，只能等它做完再发。
