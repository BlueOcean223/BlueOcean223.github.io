---
title: Claude Code Auto Mode 下的 bash-first 实验
pubDate: 2026-09-02T10:00:00.000Z
description: 最近 Claude Code 频繁用 bash 编辑文件，追查下来是一个 A/B 实验在 auto mode 下把模型引导向 bash 工具。记录实验机制、版本演进、和 system prompt 打架的现象，以及关闭方法。
tags:
  - Claude Code
  - 源码阅读
  - Auto Mode
  - Fable 5.1
---

## 起因

最近在使用 Claude Code 时，时常会发现它使用 bash 来编辑文件，而不是使用 Write、Edit 等工具，尤其是今天 Fable 5.1 上线之后，这个现象更加频繁了。于是想一探究竟。

## 发现

深入探究之后发现是 Anthropic 大概在 Claude Code 2.1.233 引入的一个 A/B 实验：auto mode 下 bash-first。

该实验的表现行为是会在 auto mode 下，追加一段 user message：

```
While auto mode is active:

Do your work through the Bash tool wherever it can accomplish the job: 
read files with cat, head, or sed -n, search with grep and find, and make file changes with sed, 
heredocs, or short scripts, rather than using the dedicated Read, Edit, or Write tools. Fall back 
to a dedicated tool only when Bash genuinely cannot do the job.
```

译文：

```
当自动模式处于激活状态时：

请尽可能通过Bash工具完成工作：使用cat、head或sed -n读取文件，使用grep和find进行搜索，
并通过sed、heredoc或简短脚本修改文件，而不是使用专门的读取、编辑或写入工具。
仅在Bash确实无法完成任务时，才回退到专门工具。
```

也就是引导模型使用 bash 工具，而非内置的 Read、Write、Edit 等工具。

其在 2.1.233 版本的代码逻辑如下：

```ts
const FLAG = "tengu_thrifty_sonic"

function assignment(model) {
  const canonical = getCanonicalName(model)
  if (getCachedClientData()?.[FLAG] === true
      || hasModelCapability(canonical, "thrifty_sonic") === true)
    return "forced"
  return isOpus5FamilyModel(model) ? "cohort" : "none"
}

function isThriftySonicEnabled() {
  if (env.CLAUDE_CODE_THRIFTY_SONIC !== undefined)
    return env.CLAUDE_CODE_THRIFTY_SONIC   
  switch (bashFirstSessionAssignment()) {  
    case "forced": return true
    case "none":   return false
    case "cohort": return getFeatureValue_CACHED_MAY_BE_STALE(FLAG, false)
  }
}
```

在 2.1.258 版本中逻辑有一些小更改：

```ts
function hasFable51PromptBundle(model) {
  return !isCoworkOrLocalAgentEntrypoint()
    && hasModelCapability(model, "fable_5_1_prompt_bundle") === true
}

function assignment(model) {
  const canonical = getCanonicalName(model)
  if (hasFable51PromptBundle(canonical)
      || getCachedClientData()?.["tengu_thrifty_sonic"] === true
      || hasModelCapability(canonical, "thrifty_sonic") === true)
    return "forced"
  return isOpus5FamilyModel(model) ? "cohort" : "none"
}
```

也就是在 auto mode 下，Fable 5.1 会强制走 bash-first，Opus 5 随机进入，Fable 5 不会进入。所以更新之后使用 Fable 5.1 模型的话，会更加频繁地使用 bash 工具来编辑文件。

当该实验处于开启状态，且经过 auto mode，再退出 auto mode 时，CC 会追加一条 user message：

```
## Exited Auto Mode
You have exited auto mode. Resume using the dedicated tools for file reads, searches, and edits.
```

译文：

```
## 已退出自动模式
你已退出自动模式。请恢复使用专用工具进行文件读取、搜索和编辑。
```

## 和 system prompt 打架

这个实验一个让人绷不住的地方是和 system prompt 打架。CC 的 system prompt 中有这么一段：

```
# Harness
 - Prefer the dedicated file/search tools over shell commands when one fits. Independent tool calls
can run in parallel in one response.
```

译文：

```
# Harness
- 当专用文件/搜索工具适用时，优先使用它们而非 shell 命令。独立的工具调用可以在一次回复中并行执行。
```

系统提示词引导模型用专有工具，auto mode 下的 bash-first 实验又引导模型优先使用 bash。实际跑项目的表现就是模型一下子用 Edit 更新文档，一下子用 bash 来改代码。

## 解决方法

想禁止该实验，可以通过设置环境变量解决：

```json
{
  "env": {
    "CLAUDE_CODE_THRIFTY_SONIC": "0"
  }
}
```

## 个人见解

我猜测这个实验的目的是想砍掉 Write、Edit 等工具，节省 system prompt 和 schema 的开销。

由于 bash 工具不会走 CC 的文件快照系统，所以建议平时喜欢用 rewind 命令的人还是把这个实验关掉。不然可能会出现回滚不完全的现象。

## 补充：Fable 5.1 的全文件重写倾向

关于 Fable 5.1，Anthropic 在官方文档中写到它更偏向于重写整个文件，这会导致消耗更多的 token 和时间。如果比较注重 token 消耗，可以调整给 CC 的系统提示词。官方原文如下：

````
If Claude Fable 5.1 rewrites whole files for small changes, append the following instruction to the
 system prompt or the first user message. Claude Fable 5.1 is more likely than Claude Fable 5 to 
 rewrite an entire text file rather than make a targeted edit. The resulting file is usually the 
 same, but unless the file is short or most of it is changing, a rewrite costs more output tokens 
 and time. The instruction brings Claude Fable 5.1 back in line with Claude Fable 5 for small and 
 medium changes.

```
The number of tokens used to edit files is best minimized, all else being equal. Therefore, when it
will not affect the end result, try to surgically edit a file rather than rewrite the entire thing.
```
````

译文：

```
如果 Claude Fable 5.1 在做小改动时重写整个文件，请将以下指令附加到系统提示词或第一条用户消息中。
与 Claude Fable 5 相比，Claude Fable 5.1 更倾向于重写整个文本文件，而不是进行针对性编辑。
生成的文件通常是一样的，但除非文件很短或大部分内容都在变化，否则重写会消耗更多的输出 token 和时间。
该指令能让 Claude Fable 5.1 在处理中小型改动时与 Claude Fable 5 的表现保持一致。
```

官方文档链接：

https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1
