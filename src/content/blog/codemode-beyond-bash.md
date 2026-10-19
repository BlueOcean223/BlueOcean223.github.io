---
title: 再读 Codemode
pubDate: 2026-10-19T10:00:00.000Z
description: 有了 bash，为什么还要 codemode？读 Armin 的 What is Codemode，从大脑和手的分界讲起：bash 只能组合执行环境里的程序，codemode 在 harness 一侧组合工具，生图、调 Jev、存中间结果、调 MCP 都落在这一侧。再看它怎么接住 MCP 的老问题，还差什么，以及从 CLI 到 codemode 的这条线。
tags:
  - Agent
  - pi
  - Codemode
  - MCP
---

## 一、起因

我第一次接触 codemode 是在 pi 1.0 前后。pi 把 MCP 做进了核心，默认不把 MCP 工具声明给模型，让模型写一段 JavaScript 去调用，这段脚本跑在一个叫 codemode 的工具里。当时我写过[一篇](/blog/pi-mcp-codemode)，对着源码把它的接法翻了一遍。

机制大致看懂了，有个问题一直没想通：agent 已经有 bash 了。想组合几次调用，可以写个脚本；想过滤一大段输出，可以接 `jq`、`grep`；想并发，脚本里也能写。codemode 能做的，bash 好像都能做，为什么还要另起一个跑 JavaScript 的工具？

Armin 10 月 6 日写了一篇 What is Codemode，读完我对这个问题清楚了不少。

https://lucumr.pocoo.org/2026/10/6/codemode/

## 二、bash 已经能组合

先说 bash 好在哪。这一点 Mario 和 Armin 一年前都写过。

Mario 去年 11 月那篇 What if you don't need MCP at all? 说得很直接，“Bash and code are composable”。他的浏览器工具就是四个 Node 脚本加一份 README，agent 读完 README，用 bash 去调。脚本的输出可以重定向到文件，可以接管道，也可以和别的命令串起来，不必每一步都先进模型的上下文。

https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/

Armin 在新文章里补了一条：模型训练时学过文件系统怎么运作。它执行 `echo foo > /tmp/test.txt`，就知道之后 `/tmp` 下多了一个 `test.txt`。bash 的每一步都留下模型看得懂的痕迹。

比如想知道一个仓库里哪些 open issue 讨论最多，一条命令就够：

```bash
gh issue list --state open --limit 100 --json number,title,comments \
  | jq -r 'sort_by(-(.comments | length)) | .[:10][]
           | "#\(.number) \(.title)"'
```

一百个 issue 的完整 JSON 留在管道里，进上下文的只有十行。过滤中间结果、组合几次调用，bash 本来就能做。

我当初的困惑就在这里。

## 三、大脑和手

Armin 的回答是：bash 只能组合能运行的程序。有些东西不是程序，是 harness 交给模型的原生能力。

最直接的例子是看图。多模态模型要看一张截图，`cat screenshot.png` 没用，bash 返回的是一串字节，harness 不会把它当成图片发给模型。图片要进上下文，得由 harness 按模型提供方的协议把它作为图片内容放进请求，所以 `read` 读图片时走的是 harness 自己的逻辑。起 subagent 也一样，起一个子 agent、等它的结果，这些事都发生在 harness 里。

这又引出一个问题：代码到底在哪里跑。

Armin 把 agent 拆成两部分，大脑和手。大脑是 harness，跑 agent 循环，持有凭据，和模型提供方通信，在一台可信的机器上。手是执行工具的地方，pi 现在叫它执行环境，bash 就跑在这里。两者经常是同一台机器，但不一定。用 Gondolin 这类沙箱时，bash 跑在一台 micro-VM 里，harness 留在宿主机上。两边的文件系统不同，受信任的程度也不同。

划出这条线，bash 脚本够不到什么就清楚了。

模型的凭据在大脑那边。在 bash 脚本里调图像模型，得先把 API key 放进执行环境。MCP 的连接和 OAuth token 也在大脑那边，脚本想调 Sentry 的 MCP，要么装一个把 MCP 包成命令行的工具，在执行环境里再登录一遍，要么也把 token 交进去。会话记录同样在大脑那边，脚本写下的文件在手这边，会话分叉或回退时，文件不会跟着走。

把凭据交给沙箱，恰好是用沙箱时想避免的事。

codemode 就是大脑这一侧的组合方式。它跑在 harness 里，pi 用的是跑在 WASM 里的 QuickJS，本身也是一个受限的沙箱：没有网络，没有文件系统，没有定时器，内存有上限。脚本想做什么，只能去调 harness 的工具和模型。bash 也是其中一个工具，脚本里 `tools.bash()` 发出的命令仍然在执行环境里跑。

## 四、bash 够不到的事

Armin 的文章里贴了几段他在 pi 会话里的 codemode 脚本，都是 agent 自己写的。

生成图片是最简单的一个。pi 的 AI SDK 一直支持图像模型，agent 却用不上，以前要么专门写个扩展，要么让 agent 自己跑 node 去调 pi 内部的接口。1.0 起，codemode 的 `models` 对象里多了 `generateImages()`，用的是会话已有的凭据。pi 文档里的例子是这样的：

```js
const painter = await models.getModelOfType(
  "image", "openrouter", "google/gemini-2.5-flash-image",
);
const result = await models.generateImages(painter, {
  input: [{ type: "text", text: "A red fox in the snow, watercolor" }],
});
if (result.stopReason !== "stop") return result.errorMessage;
for (const block of result.output) {
  if (block.type === "image") image(block);
  else text(block.text);
}
```

`image()` 做两件事。它把图片作为图片内容交给模型，模型能看到自己画了什么。从 1.0.3 起，它还把图片存成一个临时文件，结果里写上路径。源码注释解释了为什么要存：模型看得到这张图，却没有别的办法拿到它的字节，脚本不能写文件，`write` 工具又只收文本。有了这个文件，之后的回合才能用 bash 去复制、移动它。

分类模型也是这样。Jev 这类分类器不生成文本，只回答带类型的问题：选一个选项，打个分，或者判断是否。把它做成普通工具不合适，模型调一次只能分一条，一百条就是一百轮。Armin 的例子里，agent 先用 `tools.bash()` 跑 `gh issue list` 拉一百个 open issue，再对每个 issue 调 `models.classify()`，问作者对 pi 的情绪、有多不满、这是 bug 还是功能请求。我把它缩成一个问题：

```js
const jev = await models.getModelOfType("classifier", "typesafe", "jev-latest");
const r = await tools.bash({
  command: "gh issue list --state open --limit 100 --json number,title,body",
});
const issues = JSON.parse(r.output);

const scores = await Promise.all(issues.map(async (issue) => {
  const res = await models.classify(jev, {
    state: { title: issue.title, body: (issue.body || "").slice(0, 4000) },
    questions: {
      frustration: {
        type: "score",
        instructions: "How frustrated is the reporter?",
        criteria: ["calm", "a bit annoyed", "frustrated", "angry"],
      },
    },
  });
  const score = res.answers?.frustration?.score ?? null;
  return { n: issue.number, title: issue.title, score };
}));

store("frustration", scores);
return scores
  .filter((s) => s.score !== null)
  .sort((a, b) => b.score - a.score)
  .slice(0, 12)
  .map((s) => `#${s.n} ${s.score.toFixed(2)} ${s.title}`);
```

一次 bash 调用加一百次分类，模型最后只看到十二行。`Promise.all` 一下子发出一百个请求也没关系，pi 限制同时最多跑四个，其余的排队。

`store()` 是另一件 bash 给不了的事。它把结果作为一条自定义条目写进会话记录，之后的 codemode 调用用 `load()` 读回来。agent 想细看其中几个 issue，不用重新拉数据、重新分类。会话分叉或恢复时，存下的值跟着分支走。这份状态记在大脑这边，执行环境是不是沙箱都不影响它。

回头看第二节那条 `gh | jq`。过滤中间结果、组合调用，bash 和 codemode 都能做，差别在于能组合的对象。bash 组合的是执行环境里的程序，codemode 组合的是 harness 手里的工具和模型，执行环境里的 bash 只是其中一个。

在 codemode 里调 bash 还有个小好处。模型直接调 bash 时，pi 只把最后 2000 行或 50KB 放进上下文，想看更多得自己去翻溢出文件。脚本里的 `tools.bash()` 拿到的是 `{ output, exit_code, ... }` 这样的对象，`output` 最多可以有 1 MiB，大一些的输出也能整个交给脚本处理。

Armin 还提到 agent 现在常见的一种用法：先从某个工具的结果里取五到十条，看看长什么样，确认了格式，再写一段 codemode 脚本处理剩下的。先试探、再批量，和人写脚本的习惯差不多。

## 五、MCP 的老问题

codemode 用得最多的地方还是 MCP。pi 默认不把 MCP 工具声明给模型，模型只知道连了哪些 server。要用其中的工具，在 codemode 里先 `searchTools()` 搜，再 `describeTool()` 取声明，然后调用。

这几步正好对着 MCP 刚出来时被批评最多的地方。Mario 当年列过三条，我在[上一篇](/blog/pi-mcp-codemode)里拆过：工具定义占上下文，调用结果要经过上下文，现成的 server 不好改。

工具定义占上下文，交给延迟加载和工具发现处理。模型不用一开始就看到所有工具的 schema，用到时再搜。有时连搜都省了。Armin 的例子里，agent 要列出 Sentry 里每个组织下的项目，直接就调了 `mcp__sentry__find_organizations`，没有先搜索。Armin 推测是模型在强化学习时见过 Sentry 的 MCP，又从系统提示词里知道 Sentry 连着，所以这不是瞎猜。

调用结果经过上下文，交给脚本处理。那个脚本拿到组织列表后，用 `Promise.allSettled` 并发查每个组织的项目，失败的单独记一条错误，最后只返回每个组织对应的项目名。每次调用返回的完整 JSON 都留在脚本里。

server 不好改，脚本也能部分解决：返回的格式不合适，脚本自己改写就行，不用去动 server 的代码。

pi 从 “No MCP” 走到支持 MCP，当初的批评并没有收回。被批评的那几处，现在由 harness 这一侧的代码来处理。

## 六、还差什么

Armin 自己的评价是，codemode 配 MCP 现在 “not amazingly well”。问题多半出在 server 那边，很多 server 是写给直接声明工具的 harness 用的。

最别扭的是 Cloudflare。为了省上下文，Cloudflare 的 MCP server 自己在 server 里做了一层 code mode，工具就一个 `execute`，参数是一段 JavaScript。放进 pi，就成了 codemode 里套 codemode：

```js
const res = await tools.mcp__cloudflare__execute({
  code: `async () => {
    const r = await cloudflare.request({ method: "GET", path: "/accounts" });
    return r.result.map((a) => a.id);
  }`,
});
```

外层脚本里装着一段字符串形式的内层脚本，JSON 要转义两次，小一点的模型很容易写乱。内层代码跑在 Cloudflare 的沙箱里，也调不到外层 pi 的工具。在大多数 harness 还没有 codemode 的时候，这是 server 能做的权宜之计，Armin 说可以理解。

他对 MCP server 提了几点希望。第一是返回结构化数据，脚本要的是能直接取字段的 JSON，MCP 的 `outputSchema` 就是为这个准备的，很多 server 却只返回文本。第二是结果格式要稳定，有的 server 为了省 token，会按结果条数调整输出格式，agent 先取五条试探时一切正常，脚本按最大批量跑时格式变了，脚本就挂了，正好坑了上一节那种先试探、再批量的用法。第三是大的二进制数据，MCP 现在不支持，只能绕路，比如给一个预签名 URL，让文件从 MCP 之外上传。最后是工具搜索没法组合，哪个工具适合当前任务，server 自己可能更清楚，但 harness 没法把一次搜索分发给多个 server，连的 server 一多，效果就差了。

codemode 本身也有没解决的问题，Armin 点了持久化。脚本跑到一半进程挂了，已经发出去的调用撤不回，重跑又会再调一遍。他觉得也许要借鉴持久化工作流引擎的做法给调用拍快照，也可能 Starlark 这种确定性的语言比 JavaScript 更适合做组合语言。

这篇文章发出五天后，pi 仓库里实验性的 pi-durable 包加了一版可持久化的 code mode，走的就是工作流引擎那条路。沙箱按确定的方式运行：虚拟时钟，固定种子的随机数，统一用 UTC。每个调用的结果交给脚本之前先写进日志。进程重启后，脚本从头再跑一遍，日志里的结果按原来的顺序喂回去，脚本于是发出同样的调用，接上之前的进度继续。如果这次走了和上次不同的分支，就直接报错。这个包标着 Experimental，pi 的 coding agent 还没用它。

图片、二进制数据，以及小模型写不好这种脚本，也都还没有好办法。

## 七、从 CLI 到 codemode

回头看一年前的争论。Mario 和 Armin 当时说的是同一件事：别把一堆工具塞给模型，让它写代码去调。那时候模型能写代码、跑代码的地方只有 bash，于是“写代码”就落成了写 CLI、写脚本。Mario 推荐 CLI，实在要用 MCP，就用 mcporter 把它包成命令行。

Armin 去年 8 月那篇已经往前走了一步：MCP server 只暴露一个工具，参数是 Python 代码，server 里维护一个有状态的解释器。

https://lucumr.pocoo.org/2025/8/18/code-mcps/

codemode 把这个解释器从 server 挪进了 harness。Armin 说这和他一年前推荐 CLI 并不矛盾，MCP 生态学到的正是他们当时指出的那一点：代码。

我的理解是，CLI 和 codemode 是同一个想法落在了两个地方。CLI 让模型在执行环境里用代码组合程序，背后是几十年的命令行生态，模型训练时见得最多。codemode 让模型在 harness 里用代码组合工具，凭据、MCP 连接、会话状态这些只在 harness 手里的东西，它都碰得到。一个 agent 两样都用得上。

让模型通过代码调 MCP 这类工具，CLI 是一年前最受推崇的做法，codemode 很可能是接下来的那一种。它能好用到什么程度，一半看 harness，一半看 server 愿不愿意返回结构化的数据。
