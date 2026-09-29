---
title: Agent 工具注册：从 description、schema 的写法到 Tool Search
pubDate: 2026-09-29T10:00:00.000Z
description: 给 pi 写 ask_user_question 扩展时，工具的描述从一段话改成了 snippet、guidelines、description 三层分工，中间踩了不少坑。整理工具的描述、schema、系统提示词和返回值各自该放什么、怎么写，工具多了之后单靠精简为什么不够，以及 Claude Code 用 Tool Search 按需加载工具定义的做法。
tags:
  - Agent
  - Claude Code
  - Tool Search
  - MCP
  - Prompt
---

## 一、起因

最近写了两个给 Agent 用的工具。

一个是 [pi-question](https://github.com/BlueOcean223/pi-question)，给 pi 写的扩展，注册一个 `ask_user_question` 工具，功能照着 Claude Code 的 AskUserQuestion 做：模型遇到该由用户拍板的决定时，弹一个多选对话框让用户选。

另一个是工作里的项目，同样是往 Agent 里注册工具，内容不便公开。

两个工具的第一版都能跑，但模型用得不好：该调的时候不调，调的时候参数填得乱，拿到结果又会读错。回头去查，问题大多不在代码逻辑里，在模型读到的那些文字里：工具描述怎么写，参数 schema 留哪些字段，使用规则放在哪，返回值给什么。两边各自改了几轮，改的方向几乎一样。下文的例子都来自 pi-question。

## 二、模型从哪几处读到一个工具

先看一次 LLM 请求长什么样。不管哪家协议，结构都差不多：

```text
system:   系统提示词，一整块字符串
tools:    [ { name, description, input_schema }, ... ]
messages: [ 用户消息 / 助手消息 / 工具调用 / 工具结果 ... ]
```

一个工具的文字可能落在这三块里的任何一块。pi-question 注册工具时是这样写的：

```ts
pi.registerTool({
  name: "ask_user_question",
  label: "Ask User Question",
  description: TOOL_DESCRIPTION,
  promptSnippet: PROMPT_SNIPPET,
  promptGuidelines: PROMPT_GUIDELINES,
  parameters: AskParams,
  async execute(id, params, signal, onUpdate, ctx) { /* ... */ },
});
```

这几个字段在请求里各有落点：

| 字段 | 落点 | 模型什么时候读 |
|---|---|---|
| `promptSnippet` | system 里 `Available tools:` 列表的一行 | 每轮，看自己手上有什么工具时 |
| `promptGuidelines` | system 里 `Guidelines:` 列表的若干条 | 每轮，决定接下来做什么时 |
| `description` | `tools[].description` | 已经在考虑调这个工具时 |
| `parameters` | `tools[].input_schema` | 填参数时 |

MCP 也有类似的分层。server 在初始化时可以返回一段 `instructions`，Claude Code 会把它放进系统提示词里一个叫 `MCP Server Instructions` 的段落；每个工具的 description 和 inputSchema 则进 tools 数组。

工具执行完的返回值会作为 `tool_result` 进入 messages，之后每一轮都跟着历史一起发。所以返回值也是模型读的文本，只是它按调用次数累积。

system 和 tools 里的内容每次请求都全量发送，不存在“用到才加载”。几处的区别只是位置不同，位置决定了模型在推理的哪个阶段会注意到它。

读 pi 的源码时还发现三个跟位置有关的细节：

1. 没写 `promptSnippet` 的工具不进 `Available tools:` 列表。源码里是一句硬过滤 `tools.filter((name) => !!toolSnippets?.[name])`。工具照样能调（它在 tools 数组里），但系统提示词里那份工具清单上没有它。
2. `Guidelines:` 是一个扁平、不标来源的列表。扩展写的条目和 pi 自带的 `Be concise in your responses` 排在一起，模型分不出哪条属于哪个工具。去重按精确字符串做，两个扩展写了同一句话只会出现一次。
3. 用户配了自定义系统提示词时，`buildSystemPrompt` 直接走另一条分支，snippet 和 guidelines 从头到尾不会被读取。这时候模型只能看到 `description`。

## 三、第一版：什么都写进 description

pi-question 第一版只写了 `description`，一段话：

```text
Ask the user one or more questions when you are blocked on a decision that is genuinely theirs to make — choosing between approaches, clarifying ambiguous requirements, or picking preferences you cannot infer. Each question shows 2-4 options plus an automatic free-text 'Other'. Use multiSelect for non-exclusive choices. Use option previews (code snippets, mockups) when users need to visually compare concrete artifacts. Do not use this for decisions with an obvious conventional default.
```

后来又往里加了 Skip、Chat、部分作答这些新交互的说明，越写越长。用下来有三个问题。

第一个是模型不太想得起来用它。原因就是上一节的细节 1：没有 snippet，系统提示词的工具清单里根本没有这个工具。“遇到该用户决定的分歧就问，别猜”这条规则只写在工具定义里。我的理解是，模型在想“接下来怎么做”的时候，主要依据的是系统提示词；它得先想到“去工具列表里翻翻”才会读到这句话，可它这时候的想法通常是“按最常见的做法写吧”。

第二个是推荐选项。描述里（以及 `options` 字段的 schema 描述里）写的是 `If you recommend one, put it first and append ' (Recommended)' to its label`。这句话只规定了推荐的格式，从来没要求模型要有推荐。结果模型经常平铺四个选项，哪个都不推荐。它刚读完代码，手上有用户没有的信息，这时候不表态，判断就又推回给了用户。

第三个是结果读错。用户可能跳过某题、只写了备注没选、在自由输入框里打一句“先去看看 schema”，或者点“聊聊这个问题”。第一版描述没有把这些结局逐个解释，模型容易把部分作答当成全部同意，在用户跳过的那题上填进自己的偏好。

## 四、按“模型什么时候需要”拆开

三个问题一个一个改。

### 让模型想得起来

第一个问题的修法，是把“什么时候该问”搬进系统提示词。模型在想“接下来怎么做”的时候，还没想到任何工具，它读的是系统提示词。

pi 在系统提示词里给了两个位置。第一个是 snippet，写了它，工具才会出现在 `Available tools:` 里。它会被渲染成 `- ask_user_question: <snippet>` 的后半截，所以写成单行、动词开头、不带句号：

```text
Ask the user to choose between written-out options when a decision is theirs, not yours
```

第二个是 guidelines，放“什么时候用、什么时候别用”这类策略。第一条是这样写的：

```text
Call ask_user_question when the task hides a decision that is genuinely the user's: competing approaches with real trade-offs, a requirement the codebase cannot answer, a preference with no conventional default. If you can verify the answer yourself, or one option is the obvious default, decide it, say so in one line, and keep going — asking about those is the more annoying failure.
```

后半段是反向的：能自己查到答案的、有明显默认选项的，自己定，一句话交代完继续做。只说什么时候用，模型会滥用；在这类场景里，问多了比问少了更招人烦。

每条 guideline 都写 `Call ask_user_question when...`，不写 `Use this tool when...`。`Guidelines:` 是好几个扩展共享的扁平列表，`this tool` 在那里没有指代对象。

### 让模型先有判断

第二个问题出在措辞上。原来那句只规定了推荐的格式，现在改成默认就要推荐：

```text
When you ask with ask_user_question, lead with your own read: unless the choice is purely the user's taste, make the option you would pick the first one and append " (Recommended)" to its label. Laying out options as equals when you do not think they are equal just hands the work back.
```

description 里对应的那条还留了一个例外：纯属用户口味、或者确实没有依据时可以不推荐，但 `do not manufacture a recommendation to satisfy the convention`，不要为了满足格式硬凑一个。

### 让模型读懂结果

第三个问题放在 description 里解决。模型读 description 是在已经决定调用、准备填参数的时候，参数怎么填、结果怎么读，这时候告诉它正好。

description 按小节组织：`WHEN TO USE`、`WHEN NOT TO USE`、`WRITING THE QUESTIONS`、`PREVIEWS`、`ATTACHED IMAGES`、`READING THE RESULT`。最后一节把每种结局都列出来：

```text
- Fully answered: proceed on those answers.
- Typed, not chosen: an answer marked as typed by the user is their own wording, not one of your options. It is as likely to be an instruction ("check the schema first", "neither — do X") as a choice. Follow it literally ...
- Partial, skipped, or notes only: the user withheld something on purpose. Do not quietly fill the gap with your own preference ...
- Declined: continue with your best judgment or ask different questions.
- Chat: the user wants to discuss it. ... This is a request for conversation, not a refusal.
- Idle auto-continue: nobody was at the keyboard. Treat whatever was selected as a weak signal, not as consent.
```

### 放置的依据

三个问题改完回头看，每条信息放在哪，依据都是模型在什么时候需要它：

- 模型还没想到任何工具时就该知道的，放进系统提示词。比如什么情况该用、什么情况不该用，谁有权做决定，一个多步流程的顺序。
- 模型已经盯上这个工具、准备调用时才需要的，放进 description 和 schema。比如参数怎么填，每种返回结局是什么意思。
- 和某一次调用相关的事实，放进那次调用的返回值，这个第六节再说。

有一样东西两处都写：触发条件。guidelines 和 description 开头各写一次，因为第二节的细节 3，用户配了自定义系统提示词时 guidelines 整个不存在，description 得能单独成立。其余的策略不重复，重复既浪费上下文，两份还会越改越不一致。

### 写进系统提示词的规则

系统提示词里的文字每轮都在，写的时候比 description 更要克制。后来总结了几条：

- 只写 schema 表达不了的规则。参数的类型、取值范围、哪些必填，schema 已经说了，不用再写一遍。
- 每句都要能改变模型的下一步动作。背景、原因、工具内部怎么实现都不写，它们对模型做决定没有帮助。
- 例子只在规则本身说不清时才给。
- 用陈述句，少用 never/always/must 这类强调。强调词一多，每句话的分量都一样，模型反而分不出轻重。
- 不放会变的内容。系统提示词前缀每轮一字不差，提供方的 prompt cache 才能命中。当前状态、时间这类东西放进具体调用的返回值。

## 五、schema：只留模型要表达的意图

description 之外，模型填参数时读的是 schema。这里的坑有一半来自宿主和模型提供方。

### 删掉“调参”字段

返回条数上限、截断长度、超时毫秒数这类字段，调的是执行细节，没有表达用户想做什么。模型几乎不会正确使用它们，要么不填，要么随手填一个。删掉之后由工具自己定死一个合理的值。

判断一个字段该不该留，可以问一句：用户对 Agent 说的话里，会出现这个信息吗？“搜一下上周的订单”里有查询条件；没有人会说“最多返回 50 条，超时 3 秒”。

### schema 的形状要照顾提供方

部分提供方不接受顶层的 `anyOf`/`oneOf`。还有的宿主会针对某些模型改写 schema，比如把 `anyOf` 改成 `enum`，挂在每个 `const` 上的描述就跟着丢了。

一个工具下面有多种操作时，比较稳妥的形状是一个扁平对象：一个表示操作类型的字段，加上一组可选字段。哪种操作收哪些字段，schema 表达不了，交给运行时的解析器。传了不属于该操作的字段就拒绝，同时在错误里列出它接受哪些字段，模型下一次基本就能填对。

### 提供方会把可选字段填满

有的提供方会把所有可选字段都填上“中性值”：布尔填 `false`，字符串填 `""`，整数填最小值，枚举填第一个。模型本来只想传一个字段，发过来的参数却带着十几个空值。解析器如果严格拒绝，模型重试还是一样，就卡死在这里。

处理办法是把落在无关字段上的中性值当作噪声剥掉，不报错；非中性值照样拒绝。

### 字段名撞上宿主的脱敏规则

有的宿主会按字段名识别密钥，参数叫 `key`、`token`、`secret` 这类名字时，会话记录里存的是 `***`，历史重放时模型看到的也是 `***`。参数名最好避开这些词，比如按键名就叫 `key_name`。

### 校验失败的提示也是 prompt

pi-question 的每个问题要求 2 到 4 个选项，但 schema 里故意没写 `minItems: 2`。pi 在执行前先校验 schema，`minItems` 不满足时给模型的是一条通用的“数组长度不对”错误。模型看到这种错误的反应是补一个选项，于是用户会看到一个只有一个真选项、另一个是凑数的问题。

所以下限挪到运行时校验，拒绝文案专门往反方向引导：

```text
A question with a single option has no decision in it. Do not retry this call and do not invent a filler second option. Instead, state the one path you were going to offer as the approach you are taking, then continue with the task.
```

同一次调用里如果既有选项太少的问题，又有选项太多或标签重复的问题，优先报“太少”这条。换成通用错误，模型的修法正好是错的。

## 六、返回值也是 prompt

返回值也是模型读的文本，而且跟着历史越积越多。

pi-question 第一版的返回很简单，取消时是 `User declined to answer (cancelled the dialog)`，回答了就是 `User answered:` 加一行行 `标题: 选项`。它只说了用户选了什么，没说对话框是怎么结束的，也没说模型接下来该怎么做。

现在 `format.ts` 文件头的注释写的是：

```text
These are prompts, not logs: each one states what happened and what to do next.
```

每种结局对应不同的收尾句。全部正常作答：

```text
Your questions have been answered: ... You can now continue with these answers in mind.
```

有跳过、有备注、或者有手打的回答：

```text
The user answered: ... Read the answers carefully — they may request clarification, changes, or that you not proceed — and follow what they actually say.
```

没人操作、对话框超时自动提交：

```text
The dialog auto-continued after 5 minutes of idle (user away from keyboard).
```

中间踩过一个坑：用户在自由输入框里手打的回答，返回给模型时和模型自己写的选项长得一模一样，比如 `"Which auth?"="hold on, let me ask the backend team"`。手打的内容最可能是一条指令而不是一个选择，偏偏模型认不出来。现在这类回答后面会加上 `(typed by the user, not one of your options)`；只写了备注没选选项的，值写成 `(notes only)`，表示这不算一票。

用户回答时附的截图也一样。图片块传给模型时没有名字，只是一串按顺序排的图，所以文本里要写明顺序和归属：

```text
The user attached 2 images, included after this text in that order: 1. a.png (for "..."), 2. b.png (for "..."). ...
```

返回值会不会太长，也要留意。Anthropic 在 [Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents) 里提到，Claude Code 默认把工具返回限制在 25,000 token 以内。返回值的膨胀比描述更难察觉，它只在调用之后出现，写工具的时候不容易想到去量。

## 七、用测试钉住文案

文案改好之后，最怕下次加功能时又长回去，或者某条曾经补上的说明被人删掉。pi-question 的 `prompt.test.ts` 不钉原文，原文本来就要不断改写；它钉的是结构性质。节选几个测试名：

- `is a single line: Pi collapses newlines, so they only mislead the author`
- `every line names the tool: the rendered list is flat and unattributed`
- `carries the anti-trigger, not just the trigger`
- `tells the model to bring its own recommendation, not merely how to format one`
- `explains every outcome — misreading one of these is the expensive failure`
- `quotes the same limits the schema and validator enforce`

后面几条对应的都是曾经缺过、以后不能再缺的内容。返回给模型的那些句子则按原文钉住，改一个词就要改测试，相当于承认这是一次对模型的契约变更。

也可以直接给长度设预算：描述超过多少字符、schema 序列化后超过多少字符，或者描述里出现 never/always/must，测试就失败。这样谁再往描述里加一大段，CI 会先拦下来。

## 八、一个工具写好了，工具一多还是不够

单个工具写得再克制，description 加 schema 也要占几百到几千 token。而一个 Agent 不会只有一个工具，宿主自带一批，再接几个 MCP server，数字就上去了。Anthropic 在介绍 Tool Search 的文章里给过一组数：

https://www.anthropic.com/engineering/advanced-tool-use

文章举的是 5 个常见的 MCP server：

| MCP server | 工具数 | 定义占用 |
|---|---|---|
| GitHub | 35 | 约 26K token |
| Slack | 11 | 约 21K token |
| Sentry | 5 | 约 3K token |
| Grafana | 5 | 约 3K token |
| Splunk | 2 | 约 2K token |

5 个 server，58 个工具，约 55K token，对话还没开始就用掉了。再加一个 Jira（约 17K）就超过 100K。Anthropic 说他们内部见过优化前工具定义占到 134K 的情况。

工具多了之后的负担有三类：

- 占上下文。用户只是想改一段代码，请求里却带着日历、聊天、数据库工具的全部参数说明。
- 选择准确率下降。[Tool search tool 文档](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)的说法是，可用工具超过 30 到 50 个以后，Claude 选对工具的能力会下降。名字相近、功能重叠的工具越多，越容易选错。
- 缓存失效。以 Anthropic 为例，[prompt caching 文档](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)里写明缓存前缀的顺序是 tools、system、messages，改动工具定义会让整个缓存失效。MCP server 连上、断开或更新一次，tools 数组一变，后面整段缓存都用不上。

单个扩展在这件事上能做的很有限，只能控制自己出不出现。pi-question 在 `before_agent_start` 里检查运行模式，非 TUI 模式（比如 `pi -p`）下把 `ask_user_question` 从活跃工具表里摘掉。原来它总是出现，模型在没人看屏幕的会话里调一次，只换来一句 “UI not available”。判断条件用的是 `ctx.mode === "tui"`，没用 `ctx.hasUI`，因为 RPC 和 ACP 宿主的 `hasUI` 也是 true，但这个对话框依赖的 `ui.custom()` 在那里渲染不出来。摘掉之后，snippet 和 guidelines 也会跟着从系统提示词里消失，pi 只收集活跃工具的这两段。

这解决的是“谁能看到这个工具”。至于“工具定义什么时候进上下文”，得由宿主来管。

## 九、Claude Code 的 Tool Search

下面的行为以 Claude Code 2.1.263 为准，来自我读源码时做的笔记。

### 模型一开始只看到名字

写这篇文章用的 Claude Code 会话里，系统在上下文里插了这样一段：

```text
The following deferred tools are now available via ToolSearch. Their schemas are NOT loaded — calling them directly will fail with InputValidationError. Use ToolSearch with query "select:<name>[,<name>...]" to load tool schemas before calling them:
CronCreate
CronDelete
...
WebFetch
WebSearch
mcp__claude-in-chrome__navigate
...
```

后面列了一百个出头的名字，大部分是 MCP 工具。这些工具的 description 和 schema 都不在请求里，模型只知道名字。`Read`、`Edit`、`Bash` 这些核心工具和 `ToolSearch` 自己才带着完整定义。

这段话最后一句已经说了怎么用：先用 ToolSearch 把 schema 加载进来，再调用。

### 一次搜索要跨两轮请求

模型想用某个延迟工具时，流程是这样的：

```text
1. 模型调用 ToolSearch
     知道名字：{"query": "select:NotebookEdit"}
     只知道用途：{"query": "notebook jupyter"}
2. 客户端在本地搜索，返回一个引用，不执行目标工具：
     {"type": "tool_reference", "tool_name": "NotebookEdit"}
3. 下一轮请求，客户端扫描历史里的引用，
   把命中工具的完整定义加进 tools[]
4. 模型拿到参数说明，发起真正的 NotebookEdit 调用
5. 参数校验、权限检查、执行照常进行
```

笔记里做过一个实验：让 Claude Code 连一个本地模拟 API，由模拟 API 返回一次 `select:NotebookEdit` 的 ToolSearch 调用，比较前后两次请求：

| 观察项 | 搜索前 | 搜索后 |
|---|---|---|
| tools[] 条目数 | 12 | 13 |
| NotebookEdit 的完整定义 | 不在 | 在，带 `defer_loading: true` |
| 消息里的搜索结果 | 无 | `tool_reference(NotebookEdit)` |

请求构造的逻辑按职责还原出来大致如下（省略了会话恢复和占位工具）：

```js
async function buildRequestTools(availableTools, history) {
  const discovered = extractDiscoveredToolNames(history)

  const toolsToSend = availableTools.filter(tool =>
    !isDeferredTool(tool)
    || tool.name === "ToolSearch"
    || discovered.has(tool.name)
  )

  return Promise.all(toolsToSend.map(async tool => ({
    ...await buildToolDefinition(tool),
    ...(isDeferredTool(tool) ? { defer_loading: true } : {})
  })))
}
```

搜索只负责说“找到了谁”，请求构造负责提供“它的定义是什么”，两件事分开实现。有一点先记下：已经发现的工具，定义里仍然带着 `defer_loading: true`。为什么要这样，后面讲缓存时再说。

### 搜索是本地关键词打分

ToolSearch 在客户端本地执行，不用向量检索，也不额外请求模型排序。支持四种查询：

| 查询 | 处理方式 |
|---|---|
| `select:A,B,C` | 按名字直接取，不排序，不受 `max_results` 限制 |
| `NotebookEdit` | 先试忽略大小写的完整名字匹配 |
| `mcp__slack` | 按名字前缀匹配 |
| `notebook jupyter`、`+slack send` | 关键词打分，带 `+` 的词必须命中 |

打分看匹配的位置。MCP 工具的名字会拆成 server 名和工具名里的各个词（`slack`、`send`、`message`），同时保留原名（`send_message`）。拆分后的词完全匹配加 12 分（普通工具 10 分），原名完全匹配再加 12 分；`searchHint`（工具上一句专门用于搜索的简短能力说明）匹配加 4 分；完整描述匹配只加 2 分。

这套规则对写工具的人有两个直接影响。

一是工具名比描述重要得多。名字命中一个词拿 12 分，描述命中只拿 2 分。MCP server 名和工具名最好就用模型会搜的那个词，`slack_send_message` 比 `sm_post` 容易被找到。Tool search tool 文档也建议按服务或资源给工具名加统一前缀，比如 `github_`、`slack_`，一次搜索就能把一组工具都带出来。

二是没有中文分词。查询按空白切词，描述匹配用的是 JavaScript 的 `\b` 词边界。中文字符不算 `\w`，按这个实现推算，中文查询词两边凑不出词边界，用中文搜、或者描述里只有中文，基本都匹配不上。工具描述里最好带上英文的能力关键词。

回头看第四节：description 原来只是写给模型读的说明，开了 Tool Search 之后它还是搜索的索引。开头那句话既要说清工具是什么，还要包含模型会拿来搜的词。

### 什么时候启用，哪些工具延迟

开关是环境变量 `ENABLE_TOOL_SEARCH`：

| 设置 | 行为 |
|---|---|
| 未设置 | 默认启用；用自定义 API 地址时出于兼容考虑可能关闭 |
| `true` / `auto:0` | 启用，不看阈值 |
| `auto` | 候选延迟工具的定义总量达到上下文窗口的 10% 时启用 |
| `auto:N` | 阈值改成 N% |
| `false` | 关闭，所有定义全量发送 |

阈值比的是工具定义的大小，不是工具个数。200K 窗口下设 `auto:5`，阈值就是 10K token。

哪些工具延迟由 `isDeferredTool` 判断：

```js
function isDeferredTool(tool) {
  if (tool.alwaysLoad === true) return false
  if (isCoreTool(tool)) return false
  if (tool.isMcp === true) return true
  return tool.shouldDefer === true
}
```

MCP 工具默认延迟。某个 MCP 工具确实每轮都要用，可以在 server 配置里写 `alwaysLoad: true`，或者在工具元数据里设 `_meta["anthropic/alwaysLoad"]`。代价是启动时要等这个 server 连上才能发第一轮请求。

### 一个会话里的几种状态

到这里为止讲的都是单次搜索。放到一个真实会话里，工具集合会一直变：MCP server 会晚到、会断、会重连，上下文还会被压缩。用一个例子串一下。假设配置了一个 Slack 的 MCP server，打开 Claude Code 之后：

第一步，刚启动，Slack server 还在连接，用户第一句话就是“在 #dev 频道发条消息”。模型去搜 `slack send`，这时工具集合里还没有 Slack 的工具。ToolSearch 不会马上回“没找到”。它先刷新一次工具集合；如果 Slack 还在连接，就每 50ms 查一次，最多等 5 秒左右，连上了再搜一遍。

第二步，假设 5 秒后还是没结果。ToolSearch 返回给模型的会说明原因，而且不同原因对应不同的下一步：

| 原因 | 模型该怎么做 |
|---|---|
| 还在连接 | 稍后再搜 |
| 连接失败 | 告诉用户连接出了问题，需要修复或重连 |
| 需要认证 | 告诉用户先到 `/mcp` 完成授权 |
| 被组织策略禁止 | 说明是管理员的限制，不要反复尝试 |
| 确实没有匹配 | 换个名字或关键词再搜 |

如果这几种情况都只返回“没有这个工具”，模型很可能会告诉用户“Claude Code 不支持发 Slack 消息”，把一次网络问题说成了能力缺失。

第三步，Slack 连上了，模型得知道多了一批工具。客户端拿当前的工具集合和之前告诉过模型的名字对比，只发变化的部分，整份列表不会重发。之后 server 断开、重连，也一样只发变化：

```text
Slack 连上  新增      send_message, list_channels
Slack 断开  移除      send_message, list_channels
Slack 重连  重新可用  send_message, list_channels
```

（工具名省略了 `mcp__slack__` 前缀。）“重新可用”和“新增”分开，是为了让模型知道这是之前见过的工具，不用当成一项新能力重新认识。

第四步，聊了很久，上下文快满，触发了压缩。第一步那次搜索得到的 `tool_reference(mcp__slack__send_message)` 在很早的消息里，被摘要替换掉了。前面说过，客户端是靠扫描历史里的引用来决定发哪些定义的。引用没了，它就会以为这个工具从没被发现过，下一轮不再发送它的定义，模型想再发消息就得重新搜一次。

Claude Code 的做法是在压缩前把已发现的工具名单独存下来，放在压缩记录的 `preCompactDiscoveredTools` 字段里，压缩后再和剩下消息里的引用合并。摘要是写给模型看的文字，“哪些工具已经发现过”是客户端自己要用的状态，后者单独存成结构化数据，不依赖摘要里有没有提到。

### 缓存

这一节回答前面留下的问题：已经发现的工具，定义里为什么还要带着 `defer_loading: true`。要讲清楚，得先把两样东西分开：客户端发出去的请求，和模型最终读到的输入。

请求是一个 JSON，tools、system、messages 三个字段各放各的。API 服务端收到之后，会把它拼成一整段输入交给模型，顺序是工具定义在最前面，然后是系统提示词，然后是一条条消息。

prompt cache 缓存的就是这段拼好的输入。下一次请求来了，服务端从头往后比，开头连续相同的部分直接用上次算好的结果；从第一个不同的地方开始，后面全部重新算。[prompt caching 文档](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)里说缓存前缀的顺序是 tools、system、messages，指的就是这段输入里的先后。

普通工具的定义放在开头的工具区。假设没有延迟加载，模型搜到 send_message 之后，第 2 轮只能把它当普通工具发出去，两轮的输入是这样的：

```text
【第 1 轮】
工具区：Read, Bash, ToolSearch
系统提示词
用户：在 #dev 频道发条消息

【第 2 轮，send_message 当普通工具发】
工具区：Read, Bash, ToolSearch, send_message   ← 从这里开始不同
系统提示词
用户：在 #dev 频道发条消息
助手：调用 ToolSearch
ToolSearch 的结果
```

缓存只认从开头起连续相同的部分。工具区排在最前面，它多了一项，后面的系统提示词和用户消息即使一个字没改，也用不上缓存，第 1 轮缓存下来的内容全部作废。

再看 Claude Code 实际发出去的第 2 轮请求。tools 里 send_message 的定义是这样的：

```json
{
  "name": "mcp__slack__send_message",
  "description": "...",
  "input_schema": { ... },
  "defer_loading": true
}
```

`defer_loading: true` 告诉服务端：这份定义先不要放进工具区。服务端手上有这份定义，拼输入的时候跳过它。

那模型从哪里读到它？从消息里。第 2 轮的 messages 里有一条 ToolSearch 的结果，内容只是一个引用：

```json
{
  "type": "tool_reference",
  "tool_name": "mcp__slack__send_message"
}
```

服务端拼到这条消息时，按名字去 tools 里找到对应的定义，把引用换成完整的定义文本。第 2 轮的输入就变成：

```text
【第 2 轮，send_message 带 defer_loading】
工具区：Read, Bash, ToolSearch
系统提示词
用户：在 #dev 频道发条消息
（以上和第 1 轮完全相同，走缓存）
助手：调用 ToolSearch
ToolSearch 的结果：send_message 的完整定义
```

send_message 的定义没有进开头的工具区，出现在末尾那条搜索结果里。ToolSearch 自己的工具描述也是这么告诉模型的：搜到的定义放在结果里的一个 `<functions>` 块中，写法和 prompt 开头的工具列表相同，读到之后就 “callable exactly like any tool defined at the top of the prompt”。

开头没动，缓存照常命中；需要新算的只有末尾这两条消息，而新消息本来每一轮都要新算。如果发现之后把 `defer_loading` 去掉，send_message 就会回到开头的工具区，又变成上面第一种情况。

服务端具体怎么拼这段输入没有公开，上面的示意是按 [Tool search tool 文档](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)的说明画的：延迟工具不进前缀，`tool_reference` 在对话里原地展开成完整定义，前缀不变，缓存也就保住了。

Claude Code 客户端还处理了几种会让开头那段变化的情况。这些机制在源码里能看到，其中一部分由远程开关控制，不一定每个会话都开着。

一是晚到的工具。第 1 轮发请求时 Slack 还没连上，工具区里没有它的工具。Slack 连上以后，如果把它的工具当普通工具加进工具区，就是上面第一种情况。客户端会记下第 1 轮工具区里有哪些工具，后到的工具走发现流程，定义出现在对话里，工具区不动。

二是占位定义。第 1 轮还没发现任何工具时，请求里一个带 `defer_loading` 的定义都没有；等第一次发现工具，请求里才第一次出现这类定义，请求的结构跟着变了。客户端在请求里常驻一个叫 `DeferredToolPlaceholder` 的占位定义，从第 1 轮起就带着一个延迟定义，它的描述里写明了自己只是占位，不要调用。

三是断开的 server。第 2 轮用过 send_message，到第 10 轮 Slack 断开了。历史消息里还留着那次的 `tool_reference`，服务端拼输入时要按名字找到定义才能展开它；tools 里找不到，API 会直接返回 400（`Tool reference '...' not found in available tools`）。所以客户端会继续发送这个工具之前真正发出去过的定义，让历史消息能正常展开，同时通过前面第三步那种变化通知，告诉模型它现在不可用。保留旧定义是为了让历史能展开，不代表还能调用。

### 代价和边界

Tool Search 有成本。模型第一次用某个延迟工具时，要先搜一次，等下一轮拿到定义才能调用，多了一个来回。所以 Tool search tool 文档建议把最常用的 3 到 5 个工具保持非延迟，其余的延迟。

发现也不等于授权。ToolSearch 是只读工具，只返回引用，不执行目标工具，也不添加任何权限规则。搜到了发消息的工具，不代表能发消息；执行时的参数校验、权限检查、组织策略都照常进行。

效果上，第八节那篇文章给的数据是：那 5 个 server 的场景里，Tool Search 把工具定义的开销降低了 85% 以上，每次只加载需要的 3 到 5 个工具；在他们的 MCP 评测上，Opus 4 的准确率从 49% 升到 74%，Opus 4.5 从 79.5% 升到 88.1%。

---

回头看，这几件事问的都是同一个问题：模型在什么时候需要读到哪段文字。单个工具的范围里，答案是按推理阶段拆开：还没想到工具时要读的放系统提示词，准备调用时要读的放 description 和 schema，调用之后要读的放返回值。工具多起来以后，Tool Search 把“准备调用”这一步又往后推了一点，定义要等模型搜过之后才进上下文。两者做的是同一件事：模型当下用不到的文字，先不发给它。
