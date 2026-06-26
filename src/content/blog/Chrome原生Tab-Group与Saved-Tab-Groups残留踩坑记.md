---
title: Chrome 原生 Tab Group 与 Saved Tab Groups 残留踩坑记
pubDate: 2026-06-25T23:44:00.000Z
tags:
  - Chrome
  - 浏览器扩展
  - MV3
  - Tab Groups
  - Agent
---

最近在做一个给 AI agent 用的 browser CLI——大致就是 agent 通过命令驱动一个真实 Chrome 跑任务、点页面、读 DOM、抓内容。它面向的是"长期跑、多个并发会话、可以让人随时介入"的场景，所以希望浏览器层有一个清晰的视觉边界：**哪一组标签页是 agent 当前会话在用的**。

最自然的方式是用 Chrome 原生的 Tab Group——你随便打开 Chrome 都能看到的那种带颜色和折叠的标签组。这一篇记录的是把"原生 Tab Group"作为 agent 会话边界接进 browser CLI 时踩到的几个坑，最大的一个是 **Saved Tab Groups 残留**。

# 1. 为什么用 Chrome 原生 Tab Group

最早考虑过几种方案，最后选了原生 Tab Group：

- 自己写一个 overlay：可控但很丑，而且和反检测的方向相反（页面注入 = 多一类指纹）。
- 用窗口（Window）作为隔离：粒度太粗，多个会话来回切要开一堆窗口。
- 用书签栏 / 标签的 favicon：没有标签组那种"成片选中、整体拖拽"的语义。
- **原生 Tab Group**：用户体验是 Chrome 自带的；可以折叠收起；可以批量拖拽；用 MV3 API 操作权限面很小。

最后落在用一个内置低权限 MV3 扩展去管理标签组。每个 agent 会话开一个 group，前缀固定（这里叫它 `OC`），标题后接一个 emoji 表示状态：

```text
OC       idle
OC ⏳    running
OC ✅    ok
OC ❌    error
```

# 2. 用到的 API 和权限

只用 Chrome 内置 API，不注入页面：

- `chrome.tabs.group()`：创建 / 加入原生 group
- `chrome.tabs.ungroup()`：移出 group
- `chrome.tabGroups.update()`：更新 title / color / collapsed
- `chrome.tabs.onUpdated(changeInfo.groupId)`：监听用户拖进 / 拖出

manifest 权限保持最小：

```json
["tabs", "tabGroups", "storage"]
```

不用以下任何一个：

- `content_scripts`
- `web_accessible_resources`
- `host_permissions` / `<all_urls>`
- `debugger`
- `scripting`

原因有两个：

1. **检测面**。Agent 在跑的 Chrome 经常要面对反爬/反作弊系统，扩展里能少一项权限就少一项指纹。
2. **可审计性**。这个扩展是 agent 跑任务的一部分，要让用户和审核者一眼看清楚它能做什么、不能做什么。能用原生 API 就别注入页面脚本。

# 3. Agent 会话和原生 group 的映射

group 粒度：

```text
(agent 会话 id, windowId) -> chromeGroupId
```

一些约定：

- agent 自己创建的 tab：进入当前会话的 `OC` group。
- 同一个会话里多个 tab：合并到同一个 group。
- 用户手动把 tab 拖进 managed `OC` group：尝试 adopt 到对应 agent 会话——也就是让 agent "看到"这个 tab，可以在后续步骤里操作它。
- 用户把 tab 从 managed `OC` 拖出去：从该会话 detach / unregister，但**不要关闭 tab**——用户拖出去通常是说"我想留下这个页面自己看"，关掉就违反预期了。
- 用户从 A group 拖到 B group：迁移到 B 会话。
- 用户手动建一个名字凑巧叫 `OC` 的 group：**不自动认领**。只有扩展自己创建并记录过的 group 才算 managed。

颜色按 agent 会话 id 做稳定派生，同一个会话再出现时颜色不变；用户事后改过颜色尽量尊重。

还要区分清楚两类生命周期事件，否则很容易"误回收"：

```text
agent 任务结束 / 状态变 OC ✅
  => 会话还活着，可能继续追问
  => OC group 必须保留

会话被显式关闭 / maintenance 清理 / 容器准备退出
  => 进入回收路径
  => 应该清理 OC group，不应继续留下新的残留
```

也就是：**未回收的 group 保留是预期；已回收的 group 不应继续残留。**

这是把"原生 Tab Group"当 agent 会话边界用的核心语义。

# 4. 踩坑：Saved Tab Groups 残留

跑了几天之后，用户反馈：

> 当前其实只有一个活动 agent 会话，但浏览器下方 / 书签栏附近出现了一堆 `OC ✅` / `OC ⏳` 的 chip。点这些 chip 能恢复出对应的标签页；关掉恢复出来的最后一个 tab 时，Chrome 还会问"是否删除该 group"。

第一反应当然是"我们 cleanup 没写好"。但翻代码，扩展只调 `tabs.group()` / `tabs.ungroup()` / `tabGroups.update()` / `tabGroups.query()`，根本没"保存 group"这种动作。

最后定位：这些 chip 不是当前扩展正在管理的 active tab group，而是 Chrome 自己的 **Saved Tab Groups / 已保存标签组**。也就是 Chrome 自己加在 Tab Group 之上的"持久化层"，行为类似书签栏。

证据：

- Chrome extension API 里 `tabGroups.update()` 只能管 active group 的 title/color/collapsed，**没有正式 API 用于删除 Saved Tab Groups**。
- 扩展里没有任何显式 "保存 group" 调用。
- 在 profile 里翻 `Default/Sync Data/LevelDB/...`，能看到 `saved_tab_group-dt-...` 这种 key，里面带着 `OC ✅` / `OC ⏳` 字符串。

# 5. 这个问题算不算"预期"

分两个角度：

**从 Chrome / profile 角度：算预期。**

Chrome profile 是持久的，Chrome 自然会保存 tab group 状态。没有显式删除的话，重启浏览器或下次复用同 profile 时仍可以恢复——这是 Saved Tab Groups 的设计目标。

**从 browser CLI / agent 会话语义角度：不是理想预期。**

`OC` group 的本意是"当前 agent 会话的临时边界"。已经回收的会话的 `OC ✅` / `OC ⏳` 不该长期堆在那里，否则用户根本分不清哪些是"当前在跑的"。

# 6. 已经打的补丁：先 ungroup 再关 tab

本地补了一版：上下文回收时，不再直接 `tabs.remove()` 关 grouped tab，而是先 `tabs.ungroup()`，再 close 或 detach。

逻辑大概是：

```text
若 page 已属于某个 tab_group_origin
   且 tab 还活着
   且 tab group 桥接可用：
     先 chrome.tabs.ungroup(tabId)

然后：
  若是 user_adopted：
    detach / unregister，不关 tab

  若是 agent 自己创建的：
    close tab
    unregister page
```

意图：**避免 Chrome 在"关闭 group 里最后一个 tab"时把整个 group 转成 Saved Tab Group chip**。

# 7. 补丁处理了什么，没处理什么

**已处理**：正常回收路径上不会再继续制造新的 `OC` saved leftover。覆盖：

- 会话被显式关闭
- maintenance 清理
- 容器优雅退出前清理
- agent 主动关掉自己创建的 grouped tab
- user-adopted tab 从会话 detach

**没处理**：

- 历史上已经写入 Chrome profile 的旧 Saved Tab Groups。
- 用户手动从 chip 里恢复出来的旧 saved group。
- agent 任务结束但会话还活着时仍保留的 active `OC` group（这是设计上要保留的，不算 bug）。
- 直接 kill 进程 / 容器 / 浏览器，根本没机会走 graceful cleanup 的情况。

也就是说：**新代码只能避免以后正常回收时继续新增旧的残留还在那里。**

# 8. 如果要清理已经存在的残留怎么办

几条思路，按风险从低到高：

**A. 让用户在 UI 里手动删**

点旧 `OC ✅` / `OC ⏳` chip → 恢复 → 在 Chrome 提示里删 group。

优点：风险最低，走的是官方 UI。  
缺点：纯体力活，不适合做日常运维。

**B. 重建 profile / hard reset profile**

新 profile / 清 profile 之后没有旧 saved groups。

优点：干净彻底。  
缺点：会丢登录态、cookies、localStorage、站点数据；要明确用户授权。

**C. 程序自己去清 Chrome Saved Tab Groups 内部存储**

理论上浏览器完全关闭时可以去碰 `Default/Sync Data/LevelDB` 里的 saved tab group 数据。

不建议做默认行为：

- Chrome 没有公开 extension API 删 saved tab groups。
- 内部 LevelDB / Sync Data 格式不是稳定接口。
- 误清可能损坏 profile / 影响同步 / 影响书签和标签组数据。
- Chrome 版本升级后格式可能变化。

可以作为"维修工具"留个开关，但不该是常规启动路径里默认跑的东西。

# 9. 我倾向的产品定义

把行为定义成这几档比较清楚：

1. **agent 任务结束**：不回收会话，`OC` group 保留，下次继续追问还能看到。
2. **明确的会话回收**：browser CLI 负责先 ungroup 再 close/detach，不应留下新的 `OC` saved leftover。
3. **普通重启 / 重新部署但保留 profile**：保留浏览器历史状态，旧 Saved Tab Groups 可能仍在；告诉用户这是 Chrome 的设计行为，不偷偷清。
4. **Hard reset browser / profile**：明确告诉用户会丢登录态和站点数据；操作完保证没有旧 group。

# 10. 后续

短期：

- 把当前 cleanup 补丁部署上去。
- 对线上已有的 `OC ✅` / `OC ⏳` saved chips 做一次人工或 profile 级别的清理。
- 在排障文档里写清楚：**旧 saved chips 是 Chrome profile 历史，不代表 browser CLI 当前 managed group。**

中期：

- 增加一个显式的 "browser hard reset" / "profile hard reset" 命令。
- 操作前明确告诉用户会清登录态和站点数据。
- 保留一个"关闭 tab group 功能"的开关，作为快速回退。

长期：

- 如果 Chrome 未来给 Saved Tab Groups 提供稳定的 extension API，再考虑在 cleanup 里顺便删 saved group。
- 扩展继续维持最小权限，不为了清 saved group 引入高检测面的页面注入或重权限能力。

# 小结

把 Chrome 原生 Tab Group 当作 agent 会话边界，体验上是值得做的——它免费给了用户折叠、批量拖拽、整组操作这些原本要花很多代码自己写的能力。但 Chrome 自己加在 Tab Group 之上的那一层 Saved Tab Groups，**它的设计目标和你的"临时边界"语义并不一致**，没意识到这一点就会以为是自己 cleanup 写错了。

下次再做这种"用 Chrome 原生能力承载应用层语义"的事情，会先写一句话提醒自己：

> 关掉一个 group 里最后一个 tab，不等于这个 group 消失了。
