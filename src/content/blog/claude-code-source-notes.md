---
title: 一份 Claude Code 源码笔记
pubDate: 2026-08-26T10:00:00.000Z
description: 把读 Claude Code 源码的笔记整理成了 16 篇专题，以独立子站的形式挂在博客下。
tags:
  - Claude Code
  - 源码阅读
  - Agent
  - 博客
---

断断续续读了一段时间 Claude Code 的源码，笔记攒到 16 篇，现在整理好挂上来了：

[**Claude Code 源码笔记 →**](/cc-notes/)

行为以 **2.1.233** 为准，跨会话消息那篇因为改动较新，标到了 2.1.241。

# 里面有什么

分四组。

**架构主线**（01–04）——从"一次输入之后发生了什么"出发，按 `main.tsx → init → setup → query` 的顺序走一遍：启动与运行时、命令/工具/任务的三层边界、UI 与状态管理、服务与外部集成。想快速建立整体印象就按这个顺序读。

**机制专题**（05–12、16）——按问题直达的深挖：Hooks 的 31 个生命周期事件、上下文压缩与 checkpoint、四套 memory 面、权限决策链路、长会话的各种兜底、Skill/Subagent/ToolSearch、多代理 swarm 的通信机制、`/rewind` 的双维度回滚、跨会话 SendMessage。

**企业模式**（13）——单独一篇，39 节可借鉴的设计模式：信任分层、Hooks 控制平面、SSRF 防护、sandbox、插件供应链、事件背压、prompt cache break detection 之类。

**版本对照**（14–15）——Auto Mode 从 2.1.78 静默引入到 2.1.233 成为默认的完整演进，以及 Todo/Task 两套工具互斥的三层门控。
