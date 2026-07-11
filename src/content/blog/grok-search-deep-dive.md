---
title: Grok Search：从 Chat、Brave/Tavily 到 Responses
pubDate: 2026-07-10T19:00:00.000Z
description: 对比 Grok Chat、Tavily/Brave 搜索与 Responses API 的实际效果，记录搜索协议、模型渠道、延迟、成本和可审计性的测试结论。
tags:
  - Grok
  - Web Search
  - Responses API
  - Tavily
  - Brave Search
---

用了很长时间的 `grok-search` MCP，从最开始的纯 Grok，到后面的 Tavily 增强。期间也有用过 pi-skill 里带的 Brave Search。最开始是在 Grok 官网中与 Grok 简单地闲聊，发现其网络搜索能力蛮强，然后在站内看到有佬开发了 `grok-search` MCP，加之长期以来 Grok 都有较为稳定的免费渠道，就装上了。

在六月底的时候，想给 pi 也装上 Grok Search，于是把 MCP 改造成了 Skill。昨晚在等待世界杯的时候，想着自己还没有好好测过改造后的效果，以及 Grok 模型越来越多，应该选用什么模型来做 Grok Search，于是进行了一次小规模测试。同时也是偶然发现 Grok 的 Responses 协议支持 `web_search` 调用，因此也想对比一下 Grok 的 Responses 协议与 Chat Completions 协议在搜索场景中的差异。

Responses 协议调用 `web_search`，大致结构如下：

```http
POST https://api.x.ai/v1/responses
Authorization: Bearer $XAI_API_KEY
Content-Type: application/json
```

```json
{
  "model": "grok-4.5",
  "input": [
    {
      "role": "user",
      "content": "截至今天，pnpm 的最新稳定版是什么？请引用官方来源。"
    }
  ],
  "tools": [
    {
      "type": "web_search"
    }
  ],
  "max_turns": 3
}
```

搜索过程大致：

```text
input
→ web_search_call: search
   query: "pnpm latest stable release"
→ web_search_call: open_page
   url: "https://github.com/pnpm/pnpm/releases"
→ message / output_text
   annotations / citations
→ usage
```

围绕 `grok-search`，测试了从纯 Chat、Tavily 并行返回增强、Tavily 输送给 Chat 增强，到 Responses 显式调用 `web_search` 的多条路径。同时设立了纯 Brave Search 和纯 Tavily 的对照组。后续又补测了不同 Grok 模型、官方/中转/本地渠道、Chat 不同提示词的影响，以及试图通过 Function Call 调用 Grok `web_search` 的方案。

# 1. 测试设计

题目共 15 道，以 7 月 11 日凌晨 3 点的状态为准。

| 题目                       | 测试时的期望答案                      |
| -------------------------- | ------------------------------------- |
| Node.js 最新 LTS / Current | v24.18.0 / v26.5.0，以及各自发布日期  |
| Rust 最新稳定版            | 1.97.0、发布日期及两项变化            |
| Python 最新稳定源码版      | 3.14.6                                |
| Go 最新稳定版              | go1.26.5                              |
| GitHub CLI 最新版          | v2.96.0、日期、安全修复与功能变化     |
| uv 最新版                  | 0.11.28、日期、安全与 Python 支持变化 |
| Kubernetes 最新稳定版      | v1.36.2                               |
| CISA KEV 最新新增项        | 2026-07-10 新增的两条漏洞记录         |
| Bun 最新版                 | 1.3.14                                |
| Deno 最新版                | 2.9.2 及 Desktop 变化                 |
| GitHub Actions Runner      | v2.335.1 及两项变化                   |
| Ruff 最新版                | 0.15.21 及两项变化                    |
| pnpm 最新版                | v11.11.0 及命令、性能变化             |
| Node.js 与 Go 发布时间比较 | Node.js 晚 1 天                       |
| Rust 与 Deno 发布时间比较  | Rust 晚 1 天，并回答双方变化          |

实验组合：

| 路径                   | 实际发生的事情                               |
| ---------------------- | -------------------------------------------- |
| Grok Chat              | 只把问题发给模型，闭卷回答                   |
| Grok + Tavily 并列返回 | Chat 和 Tavily 并行，结果拼在一起返回        |
| Tavily → Grok Chat     | 先检索，把 snippets 注入 Chat 再生成         |
| Grok Responses         | Grok 服务端自己调 `web_search` / `open_page` |
| Brave raw              | 只返回 URL、标题和 snippets                  |
| Tavily raw             | Advanced Search 返回结果和内容               |
| Codex 对照组           | 访问官方页面、JSON、Release API 人工验证     |

其中 Grok 来源有三种：xAI 官方开放平台、中转站，以及我自己反代的渠道。

# 2. 测试结果

> 以下评分均由 Codex 完成。

## Grok 方案对比

| 系统 | 完整正确 | 字段准确率 | 重抓证据覆盖 | 平均延迟 | 平均单次价格 | 15 题总价 | 评分 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Codex 对照组 | **15/15** | **100.0%** | **83.6%** | Null | N/A | N/A | 87.6 |
| Grok Responses / 官方 | **15/15** | **100.0%** | 79.6% | 36.8s | $0.0364 | $0.5467 | 80.0 |
| Grok Responses / 中转 | **15/15** | **100.0%** | 77.6% | 35.0s | $0.0394 | $0.5916 | 80.6 |
| Tavily → Chat / 官方 | 3/15 | 31.7% | 76.5% | 2.9s | $0.0033 + 2 credits | $0.0495 | 48.6 |
| Tavily → Chat / 中转 | 3/15 | 31.7% | 76.5% | 2.7s | $0.0033 + 2 credits | $0.0492 | 48.3 |
| Tavily 并列返回 / 官方 | 0/15 | 3.0% | 73.0% | 3.1s | $0.0006 + 2 credits | $0.0094 | 37.3 |
| Tavily 并列返回 / 中转 | 0/15 | 3.0% | 75.6% | 2.0s | $0.0007 + 2 credits | $0.0104 | 38.1 |
| Grok Chat / 官方 | 0/15 | 1.7% | 37.5% | **1.6s** | $0.0007 | $0.0101 | 36.2 |
| Grok Chat / 中转 | 0/15 | 1.7% | 41.1% | **1.6s** | $0.0006 | $0.0090 | 36.4 |

此处中转、官方均使用 `grok-4.2-no-reasoning` 模型。（没有拿 Grok 4.3 再跑一遍了，一开始的默认模型是 4.2，想省点钱偷点懒哈哈哈。）

## Brave 与 Tavily 对比

| Provider | Official Hit@1 | Hit@3 / Hit@5 | MRR | snippets 证据覆盖 | 重抓证据覆盖 | 主来源占比 | 平均延迟 | 用量 | Dashboard |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Brave raw | **80.0%** | 86.7% / 86.7% | **0.822** | 23.7% | 69.3% | **45.3%** | **1.7s** | 1 request/题 | 61.8 / 已测 50 |
| Tavily raw | 60.0% | 86.7% / 86.7% | 0.733 | **45.3%** | **76.5%** | 40.0% | 2.8s | 2 credits/题 | **68.2 / 已测 50** |



在预设的 15 道题中，Grok Responses + `web_search` 表现最为优异，取得 15/15。

而纯 Grok Chat 表现非常一般，只有 0/15。不管提示词写成什么样——默认的、谨慎推理的、强制要求搜索的，甚至静默让它搜的——实测全是失败，连一次搜索轨迹都看不到。模型有时候会拒绝，有时候会给你描述一套搜索计划，有时候干脆编一个看起来很像真的答案，但它就是不会真的去联网。

也可能是受 Chat Completions 协议限制，它只能返回 assistant 的 message，看不到 tool call 痕迹。加之其表现属实一般，所以我有理由怀疑现在的 Chat Completions 接口只是基于 Grok 知识库在回答问题，而没有像预期一样发挥其强大的搜索能力。加之结果不可审计，所以对于我来说这不算是一条好的路子。

对于 Tavily 增强，我尝试了两种线路：一种是 Grok 与 Tavily 并行返回，Tavily 作为补充与增强；另一种是 Tavily 先搜索，然后喂给 Grok，再返回。

但正如上面所说，Grok 只是依赖自己的知识库。Tavily 并行返回的信源即使搜到了正确结果，与 Grok 结果一同返回后，反而有干扰的感觉，增加了模型理解的负担。而如果是先将 Tavily 的结果喂给 Grok，再由 Grok 返回，则感觉是套了一层无用的中间层，增加了延迟与 token 消耗，结果也只是 Grok 把 Tavily 的信息整理或重述一遍。

关于 Brave 和 Tavily 的对照测试结果：Brave 更快，Top 1 更容易命中官方来源；Tavily 返回的文本更丰富，覆盖面更全。

# 3. 模型与渠道横向对比

模型矩阵统一使用 Responses + `web_search` + `max_turns=3`

| 渠道 / 模型 | 完整正确 | API 成功 | 平均延迟 | P95 | 报告费用 | Search calls | 每题 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 本地 / Grok 4.5 low | **15/15** | 15/15 | **6.3s** | **8.1s** | 0 | 53 | 0 |
| 中转 / Grok 4.3 low | **15/15** | 15/15 | 7.8s | 11.5s | $0.4334 | 43 | $0.0289 |
| 中转 / Grok 4.20 non-reasoning | **15/15** | 15/15 | 35.0s | 112.2s | $0.5916 | 85 | $0.0394 |
| 中转 / Grok 4.20 reasoning | 14/15 | 15/15 | 49.3s | 110.1s | $0.4540 | 47 | $0.0324 |
| 中转 / Grok 4.5 low | 13/15 | 14/15 | 9.3s | 37.3s | $0.8158 | 63 | $0.0628 |

同一个 `grok-4.5` 换不同渠道跑对比，可认为不同渠道不会对 Search 行为产生显著影响。

| 渠道 | 完整正确 | 平均延迟 | 平均单题成本 | 平均 Search calls |
| --- | ---: | ---: | ---: | ---: |
| 官方 | 4/5 | 8.8s | $0.0495 | 4.0 |
| 中转 | 5/5 | 7.6s | $0.0526 | 4.2 |
| 本地 | 5/5 | 7.2s | 0 | 4.0 |

模型选择上：有反代渠道的话，无脑选 Grok 4.5，它在低延迟的同时，保持了准确的结果，并且因为是反代渠道，也不用考虑成本问题。官方/中转渠道可以选择 Grok 4.3，在同样低延迟、准确的同时，价格更低。

# 4. Grok 的 Responses 协议

Responses 是 xAI 现在承载 Agent Tools 的标准协议，其定位与 Chat Completions 不同。类似于 OpenAI 的 Chat Completions 与 Responses，Grok 也推出了 Responses，以更好地服务于 Agent 调用。

Chat Completions 与 Responses 官方文档：

https://docs.x.ai/developers/rest-api-reference/inference/chat

# 5. 提示词不能教会 Chat 搜索

反代和中转的 Grok 4.5 跑了同一组 5 道题，换了四种提示词：项目默认的、让模型谨慎推理的、强制要求搜索的、静默搜索的。

| 提示词 | 本地完整正确 | 中转完整正确 | 本地平均延迟 | 中转平均延迟 |
| --- | ---: | ---: | ---: | ---: |
| 项目默认 | 0/5 | 0/5 | 5.7s | 6.9s |
| 谨慎推理 | 0/5 | 0/5 | 6.9s | 7.9s |
| 强制搜索 | 0/5 | 0/5 | 4.4s | 4.8s |
| 静默搜索 | 0/5 | 0/5 | 5.2s | 26.3s |

全挂。没有一种提示词产生过 citations、`num_sources_used` 或者搜索工具轨迹。模型有时候拒绝，有时候给你描述一套搜索计划，有时候直接编一个像真的答案但并没有实际发生搜索。

同时也尝试过引导或强制传参，测试 Grok Chat 协议是否能触发 `web_search`

| 机制 | 完整正确 | 平均延迟 | 平均单题成本 | 搜索过程是否可见 |
| --- | ---: | ---: | ---: | --- |
| Chat 纯提示词 / 中转 | 0/20 | 11.5s | $0.0039 | 无 |
| Chat 隐藏 `web_search` / 反代 | **5/5** | 10.5s | $0 | 只有普通 message，无 trace |
| Chat function loop + Tavily / 反代 | 2/5 | 26.6s | $0 + 6.8 credits | tool call 与客户端 trace |
| Chat function loop + Tavily / 中转 | 3/5 | 37.5s | $0.0294 + 6.4 credits | tool call 与客户端 trace |
| Responses `web_search` / 反代 | **5/5** | **7.2s** | $0 | search/open_page/citations |
| Responses `web_search` / 中转 | **5/5** | 7.6s | $0.0526 | search/open_page/citations |

比较意外的是，反代渠道在 Chat 里接受了一个非标准的 `tools: [{"type":"web_search"}]`，然后顺利完成了测试。但搜索过程被压进了普通 message，平均 prompt 膨胀到 3.2 万 tokens。这更像是代理服务先帮你搜完再把大量证据灌进 Chat，而不是 Chat 自己暴露了标准搜索工具。中转渠道对同样的参数直接回了个 HTTP 422。

标准 `function: web_search` 只能让 Grok 发出 `message.tool_calls`，并没有真正触发搜索。

# 6. 结论

因此，想使用 Grok Search 作为 `web_search` 的增强，应该使用 Responses 协议，而非 Chat Completions 协议。这与两个协议本身的定位也很契合：一个是更新的、更倾向 Agent 场景的协议；一个是聊天、补全式的协议。
