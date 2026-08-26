---
title: 深度解析 AI API 协议：URL 后缀背后到底约定了什么
pubDate: 2026-08-26T04:00:00.000Z
description: 从 /v1/completions 到 /v1/responses，梳理 OpenAI、Anthropic、Gemini 几套主流 LLM API 协议的设计差异。附三种协议工具调用的完整对照，以及 compat 层——同一个协议下各家厂商的细微偏差该怎么建模。
tags:
  - LLM API
  - Chat Completions
  - Responses API
  - Anthropic
  - Gemini
  - OpenAI-compatible
  - Tool Calling
---

配 AI 客户端、接第三方中转、写网关的时候，总要跟这么一串东西打交道：

```text
/v1/chat/completions
/v1/responses
/v1/messages
/v1/embeddings
/v1/models
/v1beta/models/{model}:generateContent
/openai/v1/chat/completions
/api/v1/chat/completions
```

大部分教程只会告诉你"填这个就对了"，但没说清楚为什么。填错了报 404，填对了也不知道自己填对了什么。

这些后缀本质上是模型厂商给模型能力规定的**接口协议**：用哪个后缀，就意味着按哪一套规范去组织请求、解析响应。

拆开一条完整的 URL 看：

```text
https://api.openai.com/v1/chat/completions
└──────────┬─────────┘
       API Base URL
                  └─ /v1              API 协议版本
                     └─ /chat         聊天资源
                           └─ /completions  生成聊天补全
```

这里的 `/v1` 约束的是请求字段、响应字段、错误格式、流式事件格式、工具调用格式这一整套东西。

需要先建立两个直觉：

- **同一个模型可以支持多种协议。** 一个 OpenAI 模型既能走 `/v1/chat/completions`，也能走 `/v1/responses`，两条路的请求体和响应体完全不同。
- **同一个协议可以被多家平台支持。** `/v1/chat/completions` 被 OpenAI、Mistral、xAI、DeepSeek、Groq、OpenRouter 都实现了一遍，但**兼容程度差别很大**——这也是后面要重点讲的部分。

先扫一眼全景：

```text
/completions                     文本续写（历史包袱）
/chat/completions                聊天回复（事实标准）
/messages                        Anthropic 的消息协议
/responses                       多模态、多工具、多事件的统一响应
models/{model}:generateContent   Google 风格：对模型资源执行方法
/embeddings                      向量化
/models                          可查询的资源列表
```

从工程角度讲，每一套协议无非规定了三件事：请求长什么样、响应长什么样、以及围绕它们的鉴权、错误、流式和工具调用怎么表达。核心数据结构分别是：

| 协议 | 核心结构 |
| --- | --- |
| `/v1/chat/completions` | 输入 `messages` 数组，输出 `choices` |
| `/v1/messages` | Anthropic 风格 message 对象、content block、`stop_reason` |
| `/v1/responses` | 更通用的 `input` / `output` / `items` / `tools`，可带服务端状态 |
| `models/{model}:generateContent` | Google 资源式风格，`contents` / `parts` |

# 1. 先分清四个"版本"

在展开之前，得先纠一个很常见的误解。很多人以为：

```text
/v1 = 第一代模型
/v2 = 第二代模型
```

不是。`/v1` 是 **API 版本**，跟模型版本没有任何关系。

API 版本约束的是协议层面的东西：

```text
请求字段叫什么
响应字段叫什么
错误格式是什么
流式事件怎么发
工具调用怎么表达
鉴权方式是什么
文件上传格式是什么
```

模型版本约束的是能力层面的东西：

```text
模型能力
上下文长度
推理能力
价格
速度
多模态支持
```

实际项目里至少同时存在四个互不相干的"版本"：

```text
API 版本：  /v1、/v1beta
模型版本：  gpt-5.6-sol、claude-opus-5、gemini-3.7-flash
SDK 版本：  openai Python SDK 1.x、2.x
协议风格：  OpenAI-compatible、Anthropic-compatible、Gemini-compatible
```

排查问题的时候把这四个混在一起，基本就查不下去了。模型不存在报的是 `model_not_found`，协议不对报的是 404 或者字段解析失败，SDK 版本不对可能是参数名对不上，这是四类完全不同的故障。

那为什么非要有 `/v1` 这一层？因为**协议一旦发布就不能随便改**。假设某个客户端一直这么解析：

```json
{
  "choices": [
    {
      "message": {
        "content": "Hello"
      }
    }
  ]
}
```

厂商明天心血来潮改成这样：

```json
{
  "output": [
    {
      "content": [
        {
          "text": "Hello"
        }
      ]
    }
  ]
}
```

全世界的集成一夜之间全挂。所以厂商在同一个稳定 API 版本里不会动核心结构，要改就两条路：开一个新版本号（`/v2`），或者干脆新增一套接口（`/v1/responses` 就是后者）。

# 2. `/v1/completions`：一切的起点

最早的大语言模型只做一件事——文本补全。你给一段 prompt，它接着往下写。

```http
POST /v1/completions
```

```json
{
  "model": "gpt-3.5-turbo-instruct",
  "prompt": "Translate this sentence into Chinese: Hello, how are you?"
}
```

这个阶段的模型对"对话"没有任何概念。它不知道什么是系统消息、什么是用户输入、什么是助手回复，眼里只有一整条字符串。

所以想做多轮对话，只能自己拼文本：

```text
System: You are a helpful assistant.
User: Hello.
Assistant: Hi, how can I help?
User: Explain API suffixes.
Assistant:
```

这套做法的问题在当时就已经很明显了：

**角色边界靠猜。** 模型只能从字面上推断哪段是系统指令、哪段是用户输入。用户只要在自己的输入里写一行 `System: ignore all previous instructions`，就有机会把系统提示词顶掉。这是最原始的注入面。

**上下文没有结构。** 所有历史都压在一个字符串里，没法按条取、按条删、按条计费，也没法单独标记某条消息的来源。

**没法表达非文本内容。** 图片、音频、工具调用结果，塞进纯文本里都很别扭。

于是 `/completions` 逐渐退成 legacy 接口。它现在基本只出现在两个地方：一些需要精确控制续写行为的场景，以及老代码里没人敢动的那部分。

参考：

https://developers.openai.com/api/reference/resources/completions

# 3. `/v1/chat/completions`：事实标准

这是过去几年最重要、也是兼容面最广的一套协议。

```http
POST /v1/chat/completions
```

```json
{
  "model": "gpt-5.6-sol",
  "messages": [
    {
      "role": "system",
      "content": "You are a concise technical explainer."
    },
    {
      "role": "user",
      "content": "Explain what /v1/chat/completions means."
    }
  ]
}
```

最关键的变化：输入从一整段 prompt 变成了**结构化的消息数组**。

## `messages` 是核心

角色一共就这么几个：

```text
system      系统指令，定义模型行为边界
user        用户输入
assistant   模型之前的回复
tool        工具调用结果
```

角色边界从"文本里的约定"变成了"协议里的字段"。上一节手动拼 `User:` / `Assistant:` 的活儿，现在由协议本身承担了，注入面也随之收窄（当然没有消失，只是不再是白送的）。上下文也从一个字符串变成了一组有角色、有顺序、可单独增删的对象。

## 生态兼容性是它最大的资产

几乎所有平台都提供了这条路径：

```text
OpenAI:       /v1/chat/completions
Mistral:      /v1/chat/completions
xAI:          /v1/chat/completions
DeepSeek:     /chat/completions（或 OpenAI 兼容路径）
Groq:         /openai/v1/chat/completions
OpenRouter:   /api/v1/chat/completions
Together AI:  /v1/chat/completions
```

好处很直接：SDK、AI IDE、前端聊天客户端、各种 RAG 框架都已经把这套协议实现完了。换平台的时候，理论上只需要改三个东西：

```text
base_url
api_key
model
```

原来调 OpenAI：

```python
from openai import OpenAI

client = OpenAI(
    api_key="OPENAI_API_KEY",
    base_url="https://api.openai.com/v1"
)

response = client.chat.completions.create(
    model="gpt-5.6-sol",
    messages=[
        {"role": "user", "content": "Hello"}
    ]
)
```

换成任意一家 OpenAI-compatible 服务，通常就是：

```python
client = OpenAI(
    api_key="OTHER_PROVIDER_API_KEY",
    base_url="https://api.other-provider.com/v1"
)
```

顺带一提，Chat Completions 到现在也没有被废弃。OpenAI 的定位是把它作为行业通用标准长期维护，新项目要不要上 Responses 是另一个问题（第 5 节讲），但不存在"Chat Completions 要没了赶紧迁"这回事。

## "OpenAI-compatible"是个有层级的说法

这里必须泼一盆冷水：**兼容不等于等价**。

一家平台号称兼容 OpenAI API，通常最少意味着它支持这些：

```text
POST /v1/chat/completions
model
messages
temperature
max_tokens 或 max_completion_tokens
stream
choices[0].message.content
```

但下面这些就完全不保证了：

```text
tools
tool_choice
parallel_tool_calls
response_format
JSON schema strict mode
vision input
audio input/output
logprobs
reasoning tokens
cached tokens
streaming tool-call delta
structured outputs
```

我一般按这个梯度去判断一家服务到底兼容到哪一层：

| 层级 | 能力 | 典型验证方式 |
| --- | --- | --- |
| L1 | 普通文本聊天 | 发一条 user 消息，能拿到 `choices[0].message.content` |
| L2 | 流式输出 | `stream: true`，检查 delta 是否连续、是否有 `[DONE]` |
| L3 | 函数 / 工具调用 | 传 `tools`，看是否返回结构正确的 `tool_calls` |
| L4 | 结构化输出 | 传 `response_format` + JSON Schema，看是否真的强约束 |
| L5 | 多模态输入 | 传图片 / 音频，看是否被静默丢弃 |
| L6 | 复杂 agent 事件流与服务端状态 | 并行工具调用、流式工具调用、错误恢复 |

最坑的是 **L4 和 L5 的静默降级**——参数传了，接口 200，但服务端根本没处理，直接忽略。这种问题不会在联调阶段暴露，只会在线上表现为"模型偶尔不按 schema 输出"。所以接一个新渠道，光跑通一句 Hello 是不够的，起码要把自己实际用到的那几层挨个验一遍。

参考：

https://developers.openai.com/api/reference/resources/chat

https://docs.mistral.ai/api

https://docs.x.ai/developers/rest-api-reference/inference/chat

https://api-docs.deepseek.com/api/create-chat-completion/

https://console.groq.com/docs/openai

https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request

# 4. `/v1/messages`：Anthropic 的路线

Anthropic 走了另一套。每家厂商其实都希望自己的协议成为"被别人兼容"的那一方，Anthropic 的 Messages API 是少数真的做到了有独立生态的。

```http
POST /v1/messages
```

```json
{
  "model": "claude-opus-5",
  "max_tokens": 1024,
  "system": "You are a careful technical explainer.",
  "messages": [
    {
      "role": "user",
      "content": "Explain /v1/messages."
    }
  ]
}
```

长得像 Chat Completions，但不是一个东西。差异主要有三处。

## `system` 是顶层字段

OpenAI 把系统指令当成 `messages` 里的一个普通角色：

```json
{
  "messages": [
    { "role": "system", "content": "You are helpful." },
    { "role": "user", "content": "Hello." }
  ]
}
```

Anthropic 把它提到了顶层：

```json
{
  "system": "You are helpful.",
  "messages": [
    { "role": "user", "content": "Hello." }
  ]
}
```

这个设计差异会传染到兼容层（下面会讲到）：因为 Anthropic 只接受**一条**位于开头的系统消息，而 OpenAI 允许 system / developer 消息散落在对话各处。

## content 强调 block 结构

Claude 的 content 可以是字符串，也可以是 content blocks 数组——文本、图片、工具调用、工具结果都是不同类型的 block。这个抽象比 Chat Completions 的"content 是字符串，工具调用另开一个字段"要统一。

## 响应结构不同

```text
OpenAI:     choices[0].message.content
Anthropic:  content[0].text
```

Anthropic 的响应里还有这些：

```text
type
role
content
stop_reason
usage.input_tokens
usage.output_tokens
```

注意 `usage` 的字段名都不一样（`prompt_tokens` / `completion_tokens` vs `input_tokens` / `output_tokens`）。做用量统计的时候这是个高频踩坑点。

## Anthropic 官方提供了 OpenAI 兼容层

这一点很多文章没提到，但对做集成的人来说很实用：不需要自己写协议转换，Anthropic 官方就支持直接用 OpenAI SDK 调 Claude。

```python
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("ANTHROPIC_API_KEY"),
    base_url="https://api.anthropic.com/v1/",
)

response = client.chat.completions.create(
    model="claude-opus-5",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Who are you?"},
    ],
)

print(response.choices[0].message.content)
```

但这正好是上面那张"兼容层级表"的活教材——官方文档自己把限制列得很清楚：

| 行为 | 兼容层里的实际情况 |
| --- | --- |
| 函数调用的 `strict` | 被忽略，不保证工具入参符合 schema |
| `response_format` | 被忽略，要结构化输出得用原生 Structured Outputs |
| 音频输入 | 不支持，直接从输入里剥掉 |
| Prompt caching | 兼容层不支持，只有原生 SDK 有 |
| system / developer 消息 | 全部上提并用 `\n` 拼成一条，放到对话最前面 |
| `n` | 必须为 1 |
| `temperature` | 只接受 0–1，大于 1 一律截断到 1 |
| `logprobs`、`metadata` | 被忽略 |
| thinking 过程 | 可以用 `extra_body` 开，但拿不到详细思考内容 |

关键在最后一句话：**大部分不支持的字段是静默忽略，而不是报错**。你传了 `response_format` 期待强制 JSON，接口照样返回 200，然后模型自由发挥。这就是上一节说的 L4 静默降级，官方兼容层尚且如此，第三方中转只会更多。

所以结论是：兼容层适合"我已经有一套 OpenAI 代码，想低成本试试 Claude"；真要用 prompt caching、结构化输出、完整 thinking 这些 Claude 的核心能力，还是得走原生 `/v1/messages`。

参考：

https://platform.claude.com/docs/en/api/messages

https://platform.claude.com/docs/en/build-with-claude/working-with-messages

https://platform.claude.com/docs/en/build-with-claude/streaming

https://platform.claude.com/docs/en/api/openai-sdk

# 5. `/v1/responses`：从"补全一条消息"到"执行一次任务"

`/v1/responses` 是 OpenAI 后来推出的统一接口。最简单的形式跟 Chat Completions 一样朴素：

```http
POST /v1/responses
```

```json
{
  "model": "gpt-5.6-sol",
  "input": "Explain why /v1/responses exists."
}
```

复杂形式则可以直接挂工具：

```json
{
  "model": "gpt-5.6-sol",
  "input": [
    {
      "role": "user",
      "content": [
        {
          "type": "input_text",
          "text": "Search the web and summarize the result."
        }
      ]
    }
  ],
  "tools": [
    { "type": "web_search" }
  ]
}
```

## 为什么需要它

`chat.completions` 这个名字里带着两个历史包袱：

```text
chat         假设交互形态是聊天
completions  假设输出是"补全下一条消息"
```

当年的设计前提是：用户给一段聊天记录，模型补一条回复。但现在模型要做的事情早就超出这个范围了：

```text
读取图片
处理音频
查询文件
搜索网页
调用函数
使用代码解释器
调用 MCP 工具
维护服务端上下文
输出结构化 JSON
返回推理摘要
产生多个中间事件
```

把这些全塞进一个 `chat.completion` 对象，会越来越拧巴——它的输出模型本质上只能装下"一条 assistant 消息 + 一堆挂件"。

Responses 的做法是把输出重新抽象成一个 response object，里面可以有任意多个 output item：文本、工具调用、工具结果、推理摘要，都是平级的 item。

## 两者的核心差异

```text
Chat Completions:
  输入是一组 messages
  输出通常是一条 assistant message

Responses:
  输入是 input / items
  输出是 response object，里面可以有多个 output item
```

换成大白话：

```text
Chat Completions 像是——
  用户：这是聊天记录
  模型：这是下一条回复

Responses 像是——
  用户：这是任务、上下文和可用工具
  模型：这是我执行后的完整响应，包括文本、工具调用和中间结果
```

后者显然更适合 agent 场景。

顺带一提，这套设计已经不是 OpenAI 独有了。xAI 也提供了 `/v1/responses`，并且服务端内置 `web_search`——我在[之前那篇 Grok Search 的测试](/blog/grok-search-deep-dive)里对比过，同样是搜索场景，走 Responses 让服务端自己调工具，和走 Chat Completions 自己拼检索结果，正确率差了一个数量级。协议形态直接决定了能力上限，这算是一个挺直观的例子。

## 什么时候该用

只做简单聊天，`/v1/chat/completions` 依然是最优解，生态兼容性摆在那儿。

但一旦涉及下面这些，就应该优先考虑 Responses：

```text
工具调用
网页搜索
文件搜索
代码解释器
多模态输入
复杂流式事件
服务端状态
agent workflow
```

参考：

https://developers.openai.com/api/reference/resources/responses

https://developers.openai.com/api/docs/guides/migrate-to-responses

# 6. Gemini：`models/{model}:generateContent`

Google 的路径风格明显是另一个流派：

```http
POST /v1beta/models/{model}:generateContent
POST /v1/models/{model}:generateContent
```

拆开看：

```text
/v1beta            API 版本
/models/{model}    模型资源
:generateContent   对这个资源执行 generateContent 方法
```

这是典型的 Google API 设计规范：URL 定位一个**资源**，冒号后面跟一个作用在该资源上的**自定义方法**。跟 OpenAI 那种"访问某个服务端点"的思路不一样，理解为 RPC 风格会更顺。

## `v1` 和 `v1beta` 的区别

```text
v1       稳定 API 版本
v1beta   Beta / 预览能力，可能变化
```

生产项目优先 `v1`，需要用预览能力再考虑 `v1beta`。实际情况是很多新特性只在 `v1beta` 上，所以这个选择经常没得选。

## 数据结构也是另一套

Gemini 用 `contents` / `parts`，不是 `messages`：

```text
OpenAI Chat Completions:   messages -> role + content
Anthropic Messages:        messages -> role + content blocks
Gemini:                    contents -> role + parts
```

三家的核心抽象其实是同构的（角色 + 内容片段），但字段名、嵌套层级、多模态的表达方式全都不同。

## Gemini 也有 OpenAI 兼容层

跟 Anthropic 一样，Google 也提供了一个 OpenAI 兼容入口：

```text
https://generativelanguage.googleapis.com/v1beta/openai/
```

配上 OpenAI SDK 就能直接 `chat/completions`。注意这个 `openai` 是挂在 `v1beta` 下面的一个命名空间——这也引出了下一节的话题。

参考：

https://ai.google.dev/gemini-api/docs/api-versions

https://ai.google.dev/api/generate-content

https://ai.google.dev/gemini-api/docs

# 7. 两个配角：embeddings 和 models

## `/v1/embeddings`

```http
POST /v1/embeddings
```

```json
{
  "model": "text-embedding-3-large",
  "input": "AI API suffixes explained"
}
```

返回一组浮点数向量：

```json
{
  "data": [
    {
      "embedding": [0.0123, -0.0456, 0.0789]
    }
  ]
}
```

作用是把文本变成向量，常见用途：

```text
语义搜索
RAG 检索
相似度匹配
聚类
推荐
去重
分类
```

RAG 的典型流程就是它跟聊天接口的配合：

```text
1. 用 /v1/embeddings 把文档切片转成向量
2. 存入向量数据库
3. 用户提问时，把问题也转成向量
4. 检索最相似的文档片段
5. 把片段塞进 /v1/chat/completions 或 /v1/responses 生成答案
```

一句话概括分工：**embeddings 负责找资料，聊天接口负责组织答案。**

参考：

https://developers.openai.com/api/docs/guides/embeddings

https://developers.openai.com/api/reference/resources/embeddings

## `/v1/models`

```http
GET /v1/models
GET /v1/models/{model}
```

这个最简单：告诉调用方有哪些模型可用、某个模型 ID 是否存在、以及它的一些元信息。

实际用途主要是：

```text
列出账号可用模型
检查模型名称拼写是否正确
前端动态渲染模型选择列表
排查 404 model_not_found
```

接一个新渠道时，我一般第一件事就是 `GET /v1/models`。它能同时验证两件事——鉴权通没通，以及这家平台到底给了你哪些模型。比直接发一条聊天请求去试要省事得多。

参考：

https://developers.openai.com/api/reference/resources/models

# 8. 差异落到代码上

前面讲的都是设计理念，这一节看具体会在哪儿绊倒你。

## 响应解析路径不能混用

Chat Completions：

```json
{
  "id": "chatcmpl_xxx",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 5,
    "total_tokens": 15
  }
}
```

```python
text = response.choices[0].message.content
```

Anthropic Messages：

```json
{
  "id": "msg_xxx",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Hello"
    }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 10,
    "output_tokens": 5
  }
}
```

```python
text = response.content[0].text
```

OpenAI Responses：

```json
{
  "id": "resp_xxx",
  "object": "response",
  "output": [
    {
      "type": "message",
      "content": [
        {
          "type": "output_text",
          "text": "Hello"
        }
      ]
    }
  ]
}
```

```python
text = response.output_text
```

或者手动遍历（output 里可能混着工具调用、推理摘要等各种 item）：

```python
for item in response.output:
    ...
```

如果项目里要同时接多家，唯一可维护的做法是在最外层套一个自己的抽象，把各家响应统一归一化成内部结构，别让 `choices[0].message.content` 这种路径散落在业务代码里。

## 流式格式也不统一

各家都支持：

```json
{ "stream": true }
```

但事件格式完全不同。

Chat Completions 是纯 SSE data 行，靠 `[DONE]` 收尾：

```text
data: {"choices":[{"delta":{"content":"Hel"}}]}
data: {"choices":[{"delta":{"content":"lo"}}]}
data: [DONE]
```

Anthropic 用带 `event:` 名的语义化事件：

```text
event: message_start
event: content_block_start
event: content_block_delta
event: content_block_stop
event: message_stop
```

Responses API 又是另一套事件类型。

差别不只是格式好不好看。Chat Completions 的流是"一条消息的字符流"，而 Anthropic 和 Responses 的流是"一个结构化对象的构建过程"——后者天然能表达"现在开始输出第 2 个 content block，它是个工具调用"，前者只能靠在 delta 里塞 `tool_calls` 增量打补丁，边界情况相当多。做流式工具调用的时候，这个区别会很折磨人。

## 工具调用

普通聊天只要输出文本，agent 应用则要模型能调工具。比如用户问：

```text
查一下今天武汉天气，再帮我决定要不要带伞。
```

模型需要走完这一串：

```text
1. 判断需要天气工具
2. 生成 tool call
3. 工具返回天气数据
4. 模型读取工具结果
5. 生成最终建议
```

这一串在三套协议里长得完全不一样。下面用同一个 `get_weather` 工具，把三家的**完整一轮**都走一遍。

### Chat Completions

第一步，定义工具。注意函数体被包在 `function` 这一层里面：

```json
{
  "model": "gpt-5.6-sol",
  "messages": [
    { "role": "user", "content": "查一下今天武汉天气，再帮我决定要不要带伞。" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "查询某个城市的当前天气",
        "parameters": {
          "type": "object",
          "properties": {
            "city": { "type": "string" }
          },
          "required": ["city"]
        }
      }
    }
  ]
}
```

模型返回工具调用。此时 `content` 是 `null`，`finish_reason` 变成 `tool_calls`：

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"city\":\"武汉\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ]
}
```

**`arguments` 是个 JSON 字符串，不是对象**，得自己 `json.loads` 一次。模型偶尔会吐出不合法的 JSON，这里必须做容错。

然后把 assistant 那条**原样塞回去**，再追加一条 `tool` 角色的结果消息，靠 `tool_call_id` 配对：

```json
{
  "messages": [
    { "role": "user", "content": "查一下今天武汉天气，再帮我决定要不要带伞。" },
    {
      "role": "assistant",
      "content": null,
      "tool_calls": [
        {
          "id": "call_abc123",
          "type": "function",
          "function": { "name": "get_weather", "arguments": "{\"city\":\"武汉\"}" }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_abc123",
      "content": "{\"temp_c\":28,\"condition\":\"雷阵雨\",\"precip_prob\":0.8}"
    }
  ]
}
```

### Anthropic Messages

工具定义是**平铺**的，没有 `function` 那层包装，schema 字段也不叫 `parameters` 而叫 `input_schema`：

```json
{
  "model": "claude-opus-5",
  "max_tokens": 1024,
  "messages": [
    { "role": "user", "content": "查一下今天武汉天气，再帮我决定要不要带伞。" }
  ],
  "tools": [
    {
      "name": "get_weather",
      "description": "查询某个城市的当前天气",
      "input_schema": {
        "type": "object",
        "properties": {
          "city": { "type": "string" }
        },
        "required": ["city"]
      }
    }
  ]
}
```

响应里，文本和工具调用是**并列的两个 content block**：

```json
{
  "role": "assistant",
  "content": [
    { "type": "text", "text": "我先查一下武汉的天气。" },
    {
      "type": "tool_use",
      "id": "toolu_abc123",
      "name": "get_weather",
      "input": { "city": "武汉" }
    }
  ],
  "stop_reason": "tool_use"
}
```

两个关键差异：`input` 是**已经解析好的对象**，不用自己反序列化；模型可以一边说话一边调工具，这在 Chat Completions 里表达不了（`content` 和 `tool_calls` 是互斥的常见实践）。

回传结果最反直觉——**Anthropic 没有 `tool` 角色**，工具结果是一条 `user` 消息里的 block：

```json
{
  "messages": [
    { "role": "user", "content": "查一下今天武汉天气，再帮我决定要不要带伞。" },
    {
      "role": "assistant",
      "content": [
        {
          "type": "tool_use",
          "id": "toolu_abc123",
          "name": "get_weather",
          "input": { "city": "武汉" }
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "tool_result",
          "tool_use_id": "toolu_abc123",
          "content": "{\"temp_c\":28,\"condition\":\"雷阵雨\",\"precip_prob\":0.8}"
        }
      ]
    }
  ]
}
```

从 OpenAI 迁过来的人在这儿翻车最多：习惯性地找 `tool` role，找不到，然后开始怀疑文档。

### Responses

工具定义比 Chat Completions **少一层嵌套**——`name` 和 `parameters` 直接跟 `type` 平级：

```json
{
  "model": "gpt-5.6-sol",
  "input": [
    { "role": "user", "content": "查一下今天武汉天气，再帮我决定要不要带伞。" }
  ],
  "tools": [
    {
      "type": "function",
      "name": "get_weather",
      "description": "查询某个城市的当前天气",
      "parameters": {
        "type": "object",
        "properties": {
          "city": { "type": "string" }
        },
        "required": ["city"]
      }
    }
  ]
}
```

同样是 OpenAI 自家的两套协议，工具定义的形状却不一样——从 Chat Completions 迁 Responses，这是最容易漏改的地方。

响应里，工具调用是 `output` 数组里的一个 item：

```json
{
  "output": [
    {
      "type": "function_call",
      "id": "fc_abc123",
      "call_id": "call_abc123",
      "name": "get_weather",
      "arguments": "{\"city\":\"武汉\"}"
    }
  ]
}
```

结果也作为一个 item 追加回去，用 `call_id` 配对：

```json
{
  "input": [
    { "role": "user", "content": "查一下今天武汉天气，再帮我决定要不要带伞。" },
    {
      "type": "function_call",
      "call_id": "call_abc123",
      "name": "get_weather",
      "arguments": "{\"city\":\"武汉\"}"
    },
    {
      "type": "function_call_output",
      "call_id": "call_abc123",
      "output": "{\"temp_c\":28,\"condition\":\"雷阵雨\",\"precip_prob\":0.8}"
    }
  ]
}
```

注意这里有两个 id：`id`（`fc_` 开头，item 自身的标识）和 `call_id`（`call_` 开头，用来配对结果）。回传时用的是后者。

Responses 还有一条 Chat Completions 给不了的捷径——带上 `previous_response_id`，服务端自己接着上一轮的状态往下走，你只需要传新增的那个 `function_call_output`，不用把整段历史重放一遍：

```json
{
  "model": "gpt-5.6-sol",
  "previous_response_id": "resp_xxx",
  "input": [
    {
      "type": "function_call_output",
      "call_id": "call_abc123",
      "output": "{\"temp_c\":28,\"condition\":\"雷阵雨\",\"precip_prob\":0.8}"
    }
  ]
}
```

### 横向对比

| | Chat Completions | Anthropic Messages | Responses |
| --- | --- | --- | --- |
| 工具定义嵌套 | `type` + `function: {}` | 平铺 | `type` + 平铺 |
| schema 字段名 | `parameters` | `input_schema` | `parameters` |
| 调用出现在 | `message.tool_calls` | `content` 里的 `tool_use` block | `output` 里的 `function_call` item |
| 入参格式 | JSON **字符串** | 已解析的**对象** | JSON **字符串** |
| 配对字段 | `tool_call_id` | `tool_use_id` | `call_id` |
| 结果回传载体 | `tool` 角色消息 | `user` 消息里的 `tool_result` block | `function_call_output` item |
| 文本与调用共存 | 实践上互斥 | 可以，同为 block | 可以，同为 item |
| 免重放历史 | 不支持 | 不支持 | `previous_response_id` |

四个字段名（`tool_call_id` / `tool_use_id` / `call_id`）、两种入参格式、三种回传载体——这就是为什么"写一层自己的抽象"不是过度设计，而是接第二家的时候就会需要的东西。

要构建复杂 agent，选协议时至少得把这几项挨个确认：

```text
工具调用格式
是否支持并行工具调用
是否支持流式工具调用
是否支持服务端状态
是否支持内置工具（web_search、code_interpreter 等）
是否支持 MCP
是否支持结构化输出
错误恢复怎么做
```

# 9. 兼容入口与 Base URL 怎么填

## `/openai`、`/api`、`/compatible-mode` 是什么

很多平台不是 OpenAI，但为了让开发者能直接复用 OpenAI SDK，会开一个兼容入口：

```text
https://api.groq.com/openai/v1/chat/completions
https://openrouter.ai/api/v1/chat/completions
https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
https://api.anthropic.com/v1/chat/completions
https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
```

路径里的 `/openai`、`/api`、`/compatible-mode` 是平台自己的命名空间，表达的意思是：

```text
这不是 OpenAI 官方服务
但这里提供一套接近 OpenAI 协议的兼容入口
```

注意"接近"两个字。第 3 节那张层级表，第 4 节 Anthropic 官方兼容层的限制清单，说的都是这件事。

## Base URL 填到哪一层

这是最高频的配置错误。

**如果配置项叫 Base URL / API Base**，通常填到 `/v1` 为止：

```text
https://api.openai.com/v1
https://api.groq.com/openai/v1
https://openrouter.ai/api/v1
https://api.anthropic.com/v1
```

不要填成完整 endpoint：

```text
https://api.openai.com/v1/chat/completions   ❌
```

因为 SDK 内部会自己拼 `/chat/completions`。填错了实际请求会变成：

```text
https://api.openai.com/v1/chat/completions/chat/completions
```

然后 404。**看到路径里出现重复片段，基本就是这个问题。**

**如果配置项叫 Endpoint / Full URL / Request URL**，那就填完整路径：

```text
https://api.openai.com/v1/chat/completions
```

几条经验规则：

| 配置项名称 | 填什么 |
| --- | --- |
| Base URL / API Base / OpenAI Base URL | 填到 `/v1`，一般不带 `/chat/completions` |
| Endpoint / Full URL / Request URL | 填完整路径 |
| Provider / API Type | 选协议类型：OpenAI、Anthropic、Gemini |
| Model | 填模型 ID，不要填 URL |

# 10. compat：同一个协议，各家还是不一样

第 3 节讲的"兼容有层级"，是从**能力有没有**的角度看。真正做多渠道集成时，还有一层更细的麻烦：**能力都有，但表达方式差那么一点点**。

这类偏差一般统称 **compat**（compatibility quirks）。它们的共同特点是：跑一句 Hello 完全正常，写死一套请求体去接第三家才会暴露。举几个真实的：

```text
有的服务器不认 developer 角色，得退回 system
有的只认 max_tokens，不认 max_completion_tokens
有的流式响应不带 finish_reason，得自己推断是正常结束还是要调工具
有的不支持 stream_options.include_usage，拿不到 token 用量
推理模型怎么开启思考，几乎每家都有自己的写法
```

## 一个值得抄的分层：pi-ai

pi 这个 agent harness 的 `pi-ai` 包把这件事拆成了三层，我觉得这个划分很干净：

| 层 | 管什么 | 具体内容 |
| --- | --- | --- |
| **Model** | 模型自身的身份与能力 | id、上下文长度、maxTokens、是否支持 reasoning、能不能收图片、价格、用哪套 api |
| **Provider** | 谁在提供这个模型 | baseUrl、鉴权方式（API key / OAuth / 环境变量）、自定义 header、模型目录、路由 |
| **API** | 线上协议怎么序列化 | `openai-completions`、`openai-responses`、`anthropic-messages`、`google-generative-ai` |

关键在于 **API 和 Provider 是多对多的**：

- 一个 API 适配器被大量 Provider 复用——绝大多数 OpenAI 兼容服务共用 `openai-completions`
- 一个 Provider 也可能同时挂多套 API——网关型服务的模型目录里既有 Claude 又有 GPT，按 `model.api` 分发

这么拆之后，上层的 agent 循环里就不会出现 `if (provider === "anthropic")` 这种分支。协议差异关在 API 适配器里，厂商差异关在 Provider 里，上层只面对一套统一的 message / tool / usage / 流式事件。

## 但三层还不够，得有第四样东西

同一个 `openai-completions` 适配器，接 OpenAI 官方、接 Ollama、接 DeepSeek，行为并不一致。所以 pi-ai 在三层之外又挂了一个 `compat` 对象——可以配在 Provider 级（该厂商所有模型生效），也可以配在 Model 级（覆盖单个模型）：

```json
{
  "providers": {
    "local-llm": {
      "baseUrl": "http://localhost:8080/v1",
      "api": "openai-completions",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false,
        "supportsUsageInStreaming": false,
        "maxTokensField": "max_tokens"
      },
      "models": [ "..." ]
    }
  }
}
```

挑几个有代表性的，看看它们各自在擦什么屁股：

| flag | 对应的现实偏差 |
| --- | --- |
| `supportsDeveloperRole` | 推理模型的系统提示该用 `developer` 还是 `system`。很多本地服务器和兼容实现只认 `system` |
| `maxTokensField` | `max_tokens` 还是 `max_completion_tokens`。OpenAI 改过名，兼容实现没跟 |
| `supportsUsageInStreaming` | 认不认 `stream_options: { include_usage: true }`。不认就拿不到流式的 token 统计 |
| `supportsFinishReason` | 流式响应带不带 `finish_reason`。不带就得靠流结束时的状态自己推断是 `stop` 还是 `toolUse` |
| `requiresToolResultName` | 工具结果消息要不要额外带一个 `name` 字段 |
| `requiresAssistantAfterToolResult` | 有的实现要求工具结果之后、下一条 user 之前必须插一条 assistant 消息 |
| `requiresThinkingAsText` | thinking block 不被接受，得降级成纯文本塞进 content |
| `thinkingFormat` | 怎么开启思考。取值有 `reasoning_effort`、`deepseek`、`openrouter`、`qwen`、`together`、`baseten`、`zai`、`chat-template` 等 |
| `cacheControlFormat` | 在 OpenAI 协议之上打 Anthropic 风格的 `cache_control` 缓存标记 |
| `supportsStrictMode` | 认不认 strict JSON-schema 工具定义（呼应第 3 节说的 L4 静默降级） |

Anthropic 那边同样有一套：

| flag | 对应的现实偏差 |
| --- | --- |
| `supportsEagerToolInputStreaming` | 认不认按工具粒度的 `eager_input_streaming`。不认就退回 beta header |
| `supportsLongCacheRetention` | 认不认 `cache_control.ttl: "1h"` 的长缓存 |
| `supportsCacheControlOnTools` | 工具定义上能不能打缓存标记 |
| `forceAdaptiveThinking` | 用 adaptive thinking 还是老的 budget 式思考载荷 |
| `allowEmptySignature` | 有些 Anthropic 兼容实现回传空的 thinking signature，而真 Anthropic 会直接拒掉 |

## 这份清单本身就是结论

单看某一个 flag 都很琐碎，但把它们摆在一起，`thinkingFormat` 那一行尤其能说明问题——**光是"怎么让模型开始思考"这一件事，就有八九种互不兼容的写法**，而它们全都自称 OpenAI-compatible。

所以第 3 节那句"兼容是营销词"可以说得更具体一点：

- **只接一家**，这些完全不用管，照官方文档写就行
- **接两家**，开始出现 `if`，但还能忍
- **接三家以上**，必须把 compat 显式建模成配置，否则分支会长满整个代码库

而且这类偏差**没法靠读文档提前避开**——它们大多不写在兼容说明里，只能靠实际打过去、发现字段丢了或者报错了，再回头加一条 flag。pi-ai 那份 flag 清单，本质上是别人替你踩过的坑的沉淀。自己做集成的时候，哪怕不用它，照着它的分层（Model / Provider / API + compat）设计自己的配置结构，也能省掉很多返工。

参考：

https://github.com/earendil-works/pi

https://github.com/earendil-works/pi/blob/main/packages/ai/README.md

https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md

# 11. 主流厂商接口路径对照表

| 厂商 / 平台 | 常见接口路径 | 协议风格 | 主要用途 |
| --- | --- | --- | --- |
| OpenAI | `/v1/responses` | OpenAI 统一响应协议 | 多模态、工具、agent，新项目优先 |
| OpenAI | `/v1/chat/completions` | OpenAI Chat Completions | 传统聊天，生态兼容性最好 |
| OpenAI | `/v1/embeddings` | Embeddings | 文本向量化、RAG、搜索 |
| OpenAI | `/v1/models` | Models | 查询模型列表 |
| Anthropic | `/v1/messages` | Anthropic Messages | Claude 原生对话、工具、多模态 |
| Anthropic | `/v1/chat/completions` | 官方 OpenAI 兼容层 | 复用 OpenAI 代码，有能力削减 |
| Google Gemini | `/v1/models/{model}:generateContent` | Google generateContent | Gemini 稳定接口 |
| Google Gemini | `/v1beta/models/{model}:generateContent` | Google beta generateContent | Gemini 预览能力 |
| Google Gemini | `/v1beta/openai/chat/completions` | 官方 OpenAI 兼容层 | 复用 OpenAI SDK |
| xAI | `/v1/chat/completions`、`/v1/responses` | OpenAI-like | Grok 聊天与服务端工具调用 |
| Mistral | `/v1/chat/completions` | OpenAI-like | 聊天、工具调用、结构化输出 |
| DeepSeek | `/chat/completions` 或兼容路径 | OpenAI-like | DeepSeek 对话模型 |
| Groq | `/openai/v1/chat/completions` | OpenAI-compatible | 高速推理，复用 OpenAI SDK |
| OpenRouter | `/api/v1/chat/completions` | OpenAI-compatible aggregator | 多模型聚合路由 |

# 12. 怎么选

## 只是普通聊天

选 `/v1/chat/completions`。生态最成熟，SDK、代理、网关、前端工具的兼容性都最好，出问题也最容易搜到答案。

## 新项目、需要现代能力

优先研究 `/v1/responses`，尤其是涉及工具调用、文件搜索、网页搜索、多模态、结构化输出、agent workflow、服务端状态的时候。

## 要用 Claude 的核心能力

走原生 `/v1/messages`。prompt caching、结构化输出、完整 thinking 这些，OpenAI 兼容层给不了。反过来，如果只是想在现有 OpenAI 代码里换个模型试试效果，兼容层很省事。

## 接 Gemini

生产用 `/v1/models/{model}:generateContent`，需要预览能力再上 `v1beta`。如果只是想快速接入不想学新 SDK，`/v1beta/openai/` 兼容层也是个选项。

## 做 RAG / 向量搜索

组合使用：`/v1/embeddings` 负责检索，`/v1/chat/completions`、`/v1/responses` 或 `/v1/messages` 负责生成。

## 接第三方聚合服务

先确认它兼容哪种协议（OpenAI-compatible / Anthropic-compatible / Gemini-compatible），再选对应 SDK 和路径。然后按第 3 节那张表，把自己实际要用的那几层挨个验一遍——**不要相信"完全兼容"这四个字**。

# 小结

回到最初那串后缀。它们不是随便定的命名，每一个都对应着一套关于"模型应该怎么被调用"的假设：

- `/completions` 假设模型在续写文本
- `/chat/completions` 假设模型在参与对话
- `/messages` 假设内容由结构化 block 组成
- `/responses` 假设模型在执行一次可能包含多个步骤的任务
- `:generateContent` 假设你在对一个模型资源调用方法

理解了这些假设，遇到新平台的时候就不用再靠试——看一眼路径，大概就知道它的能力边界在哪儿、请求该怎么组织、响应该怎么解析。

至于"OpenAI-compatible"，记住它是个营销词而不是技术承诺就行。真实兼容度分两层：**协议层**——它到底实现了哪几级能力（第 3 节那张表）；**compat 层**——同样的能力，它的字段名和写法跟官方差在哪儿（第 10 节那些 flag）。前者能靠读文档估个大概，后者基本只能打过去才知道。

所以真要接多家，与其指望"改个 base_url 就能跑"，不如一开始就把 Model / Provider / API 三层拆开，再留一个 compat 的口子。接第二家的时候你会庆幸留了这个口子，接第三家的时候会庆幸拆了这三层。

# 参考

三家的 API 总览：

https://developers.openai.com/api/reference

https://platform.claude.com/docs/en/api/messages

https://ai.google.dev/gemini-api/docs

选题最初来自 [linux.do 上的一篇讨论](https://linux.do/t/topic/2306861)，本文在其基础上重新梳理了结构，并补充了 Anthropic / Gemini 官方兼容层的实测细节。
