---
title: 云手机 UI 自动化：从一次性 dump 到长驻 UiAutomation
pubDate: 2026-09-08T10:00:00.000Z
description: 抖音动态页读不出节点树，根因不是抖音屏蔽了 accessibility，而是 uiautomator dump 在读 root 前强制等 1000ms 的事件静默。记录从一次性 dump + 文件回传，迁移到长驻 instrumentation + 长连接的完整过程，以及为什么手机上要装两个 APK。
tags:
  - Android
  - UiAutomation
  - 云手机
  - 无障碍
  - 自动化
---

做云手机操作工具的时候踩过一个坑：最早拿 B 站做验证，读 UI 树、定位控件、点击翻页都跑通了，看着一切正常；换到抖音，首页什么都读不出来。当时的判断是"抖音屏蔽了 accessibility hierarchy"，后来证明这个判断是错的。真正的原因在采集工具自己身上，而不在被采集的 App 上。

这篇记录一下从**每次操作起一条一次性链路**，迁移到**一台手机一条长连接**的过程。

## 一、旧链路：每次 snapshot 都重跑一遍全流程

最早的实现是最直观的那种：服务端要看当前页面，就让云手机执行一次 `uiautomator dump`，把 XML 写到设备文件，再把文件拉回来解析。

```go
const windowXMLPath = "/sdcard/window.xml"

dumpCommand := "rm -f " + windowXMLPath +
    " && uiautomator dump " + windowXMLPath +
    " && test -s " + windowXMLPath
if err := m.runTask(ctx, sess, dumpCommand); err != nil {
    return nil, wrapUITree(err)
}

taskID, err := m.acep.PullFile(ctx, sess.PodID, windowXMLPath, key, TOSInfo{...})
// pollTask -> GetObject -> parseUIXML -> UIElement[]
```

完整链路是这样的：

```text
Agent
  -> Session Service snapshot
  -> 云厂商 RunTask("uiautomator dump /sdcard/window.xml")
  -> 云厂商 PullFile
  -> 对象存储
  -> Session Service GetObject
  -> encoding/xml decoder
  -> UIElement[]
  -> 从静态 bounds 生成 ref
```

那句 `rm -f ... && test -s ...` 是后来补的补丁。因为 `uiautomator dump` 失败时**不会清掉旧文件**，于是上一次的 window.xml 被当成这一次的结果拉回来，页面早就翻篇了，服务端还在用几分钟前的树。加 `rm -f` 和 `test -s` 只是让失败暴露出来，没有解决失败本身。

## 二、失败长什么样

在抖音播放首页，`uiautomator dump` 的输出是这两行之一：

```text
ERROR: could not get idle state.
ERROR: null root node returned by UiTestAutomationBridge.
```

同一个页面上，一个 AccessibilityService 却能稳定读到 32 个节点。所以第一版结论是"抖音动态页必须走 AccessibilityService"。这个结论里"必须且只能"的部分是错的。

正确的表述是：

```text
标准一次性 uiautomator dump 不可靠
≠
UiAutomation 读不到抖音
```

## 三、根因：读 root 之前先等 1000ms 静默

去翻 AOSP 的 `DumpCommand.java`，每次 `uiautomator dump` 实际做的事：

```java
UiAutomationShellWrapper automationWrapper = new UiAutomationShellWrapper();
automationWrapper.connect();

UiAutomation uiAutomation = automationWrapper.getUiAutomation();
uiAutomation.waitForIdle(1000, 1000 * 10);

AccessibilityNodeInfo info = uiAutomation.getRootInActiveWindow();
```

两个参数的含义是：

```text
idle timeout：  1,000ms   事件流必须连续静默这么久
全局最大等待：  10,000ms  超过就放弃
```

也就是说，**只有 accessibility event stream 连续 1 秒没有新事件，CLI 才肯去读 root**。超过 10 秒还没等到，就打印 `could not get idle state.` 然后退出，什么都不写。

这个设计对设置页、系统对话框这种静态界面完全合理。但抖音首页是一个永远在播放视频的页面。

抖音首页 6 秒事件采样：

```text
59  TYPE_WINDOW_CONTENT_CHANGED   (com.ss.android.ugc.aweme)
1   TYPE_ANNOUNCEMENT
```

平均每 100ms 一次 subtree change。要求它连续 1000ms 不发事件，等于要求它停止播放。

于是就有了那个很典型的现象：**抖音永远"安静"不下来，dump 就永远等不到那 1 秒**。

### 三个对照实验

同一台设备（Android 10 / API 29），同一个 App，只改页面状态：

| 页面状态 | 6 秒事件数 | dump 结果 | 耗时 |
| --- | --- | --- | --- |
| 动态播放首页 | 59 次 content changed | 0/6 成功 | 10–11 秒后报错 |
| 首页但视频暂停 | 2 次 content changed | 5/5 成功 | 1–2 秒 |
| 静态搜索结果页 | — | 6/6 成功 | 1–2 秒 |

暂停视频就能成功，B 站和抖音的差别也就落到了同一处：不在包名，在于页面有没有安静下来的时刻。持续发事件的页面会一直卡住，停一秒的页面立刻正常。

顺带排除一个常见误解：`--compressed` 只影响 hierarchy 压缩，**不跳过 idle wait**，加了照样 0/6。

## 四、绕开 idle 的办法：改用 instrumentation

`uiautomator dump` 是一个 shell CLI，它的 idle 策略写死在命令里，没有参数可以调。要拿到调节权，就得自己持有 `UiAutomation` 对象——也就是走 Android 的 **instrumentation（androidTest）** 路线，用 `am instrument` 启动一个进程，在里面直接调 API。

Appium 的 UiAutomator2 server 走的就是这条路，它把这个值暴露成了一个设置项：

```text
waitForIdleTimeout   默认 10000ms，设为 0 即禁用 idle wait
```

自建的话更直接——不调就行了。当时写了一个最小 instrumentation 探针验证：

```java
UiAutomation automation = getUiAutomation(
    UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES
);

// 全程不调用 waitForIdle()
AccessibilityNodeInfo root = automation.getRootInActiveWindow();
```

在抖音动态首页（3 秒内 28 个 content-change 事件），每 200ms 读一次 root：

```text
samples:        30
root ok:        30
null roots:     0
package:        com.ss.android.ugc.aweme
root children:  2
单次 root 调用:  11–21ms
```

30/30。所以卡住的一直是 `waitForIdle()`，不是 `getRootInActiveWindow()`。

`FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES` 这个 flag 也很关键：不加的话，UiAutomation 连上时会把系统里其他 accessibility service 全部挂起，我们自己的输入法辅助和别的 helper 都会一起停摆。

## 五、但不能照搬"每次读全树"

拿到 root 只是开始。第一版探针对 live root 做了完整递归遍历：

```text
nodes:      约 762
单次遍历:    约 10 秒
```

root 本身是毫秒级的，但遍历一棵动态树意味着成百上千次跨进程 binder 调用去读节点属性，每一次都可能拿到已经变了的数据。旧的"一次 dump 出全量 XML"这个心智模型不能直接搬过来。

所以生产实现给每次采集加了硬预算：

```java
public static final int DEFAULT_MAX_NODES = 1000;
public static final int DEFAULT_MAX_DEPTH = 64;
public static final int DEFAULT_MAX_WALL_TIME_MS = 600;
public static final int DIAGNOSTIC_MAX_DEPTH = 80;
public static final int DIAGNOSTIC_MAX_WALL_TIME_MS = 1800;
```

默认 `fast` profile：最多 1000 个节点、深度 64、600ms 墙钟。跑不完就明确标记 `coverage.status = "partial"` 加截断原因，而不是假装自己拿到了完整页面。只有在服务端 `find` 未命中时，才允许升级到一次 `diagnostic` profile 重采。

配套的几条：

- 遍历顺序用优先队列，可见的、有语义的、可交互的分支排在通用容器前面，判据只用"可见/可交互"这类中性事实，不用包名、文本或屏幕坐标；
- `fast` 跳过不可见的叶子节点，但仍然下钻不可见的容器（Compose 和自定义 View 的 wrapper 经常是不可见容器包着可见子节点）；
- API 33+ 用 `FLAG_PREFETCH_DESCENDANTS_HYBRID | FLAG_PREFETCH_SIBLINGS` 批量预取，API 29–32 退回逐个取子节点；
- 每次采集前清一次 framework 的 accessibility cache，避免复用上一代的树；
- 每个入队节点和每个保留的副本都有明确的 recycle 路径。

采集本身也是串行的——一个 Runtime 永远不会同时在观察和执行动作：

```java
/** Bounded single-thread dispatcher: a Runtime never observes and acts concurrently. */
public final class SerializedDispatcher implements AutoCloseable {
    // ThreadPoolExecutor(1, 1, ..., ArrayBlockingQueue<>(capacity), AbortPolicy)
}
```

队列满了直接返回 `UI_RUNTIME_BACKPRESSURE`，不排队堆积。

## 六、从一次性链路到长连接

解决了 idle，剩下的问题是链路本身。旧方案每次 snapshot 都要：起一个云厂商 task、轮询、再起一个 PullFile task、轮询、读对象存储。实测小文件 PullFile + 对象读取中位数 0.6–0.7 秒，**长尾能到 10–11 秒**。做一次 UI 交互循环要跑两遍这个流程。

50–100 台手机并发时，这条路会同时放大账号 QPS、Pod task queue 和对象存储请求，都是为了传一个几十 KB 的 XML。

新的形态是每台手机一条 outbound WSS 长连接，手机主动连到 Session Service：

```text
Agent
  -> pocket_phone plugin
  -> owner/controller 绑定的 HTTP
  -> Android Session Service
  -> per-phone Runtime registry + 串行 dispatcher
  -> WSS
  -> 云手机 instrumentation
  -> UiAutomation / AccessibilityNodeInfo
```

Runtime 返回的不再是 XML，而是 compact JSON。连接自己管好这几件事：

- **鉴权与轮换**：启动时用一个 60 秒单次有效的 bootstrap ticket，握手后立刻换成会轮换的 runtime credential，之后重连不再需要新 ticket；
- **重连**：指数退避，上限封顶；
- **心跳**：服务端在 welcome 里下发间隔；
- **重连即失效**：重连成功后 `liveRefs.invalidate("runtime_reconnect")`，上一条连接发出去的所有 ref 全部作废，不允许跨连接复用；
- **背压**：每个请求带 deadline，在 dispatcher 队列里就过期的直接返回 `UI_RUNTIME_TIMEOUT`。

新旧对比：

| 维度 | 旧 XML dump | 长驻 UiAutomation Runtime |
| --- | --- | --- |
| 生命周期 | 每次 snapshot 起一次 | instrumentation 长驻 |
| 数据模型 | XML 文件 | compact JSON Observation |
| 传输 | 设备文件 + PullFile + 对象存储 | WSS request/response |
| 动态页面 | 受 idle 和持续事件影响 | 不等全局 idle，按预算采集 |
| 节点身份 | 静态 XML 副本 | 短期 live node binding |
| 点击 | XML bounds / shell input tap | node action，失败后按刷新后 bounds 做手势 |
| Runtime 不可用 | 容易悄悄回退到旧数据 | fail closed，返回 `UI_RUNTIME_UNAVAILABLE` |

迁移时把旧生产代码做了破坏性删除，而不是留着当 fallback：`uitree.go`、XML parser、固定的 `/sdcard/window.xml`、`RawXML` 字段、基于旧 bounds 的 shell tap 全部移除。回归测试会检查生产动作路径不再发出 `uiautomator dump` 或 `input tap <stale coordinates>`。留 fallback 的坏处是它会掩盖 Runtime 故障，让人以为一切正常。

## 七、手机端要装两个 APK

这一点在部署时最容易被忽略：**instrumentation 路线在手机上必须装两个 APK，缺一个跑不起来**。

```text
host APK:            com.pocketclaw.uiruntime
instrumentation APK: com.pocketclaw.uiruntime.test
```

host APK 的内容几乎为空：

```java
/** Stable target process for the first-party instrumentation runtime. */
public final class PocketClawRuntimeHostApplication extends Application {}
```

manifest 里也只有一个 `<application>`，没有任何 exported 组件，连 Activity 都没有：

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <application
        android:name=".PocketClawRuntimeHostApplication"
        android:allowBackup="false"
        android:label="Pocket Claw UI Runtime" />
</manifest>
```

instrumentation APK 才装着真正的 Runtime，它的 manifest 里声明了指向 host 的 `targetPackage`：

```xml
<instrumentation
    android:name=".RuntimeInstrumentation"
    android:functionalTest="true"
    android:handleProfiling="false"
    android:label="Pocket Claw UI Runtime"
    android:targetPackage="com.pocketclaw.uiruntime" />
```

### 为什么必须是两个

因为 Android 的 instrumentation 机制本身就是这么设计的。`am instrument` 启动时，系统不会新建一个"测试进程"，而是**为 targetPackage 拉起进程，再把 instrumentation APK 的代码加载进去**。所以：

- 进程名和 UID 都是 host 的，跑的是 host 的 `ApplicationInfo`；
- 生效的是 **host manifest 里的权限**——所以 host APK 必须声明 `INTERNET`，否则 Runtime 连不出去；
- 代码里拿 context 用的是 `getTargetContext()`，而不是 `getContext()`；
- targetPackage 没安装的话，`am instrument` 直接失败。

理论上可以让 instrumentation APK 自己指向自己（self-instrumenting，只装一个）。这里刻意拆开，是因为 `am instrument` 会**先杀掉 targetPackage 的所有现存进程**再启动。让它指向一个除了当宿主什么都不干的空 App，重启 Runtime 就不会波及任何有状态的东西。Appium 的 UiAutomator2 也是这个部署形态。

另外两个 APK 必须用**同一张证书**签名，且包名相同的后续版本都要复用同一把 release key、递增 `versionCode`，否则升级只能卸载重装。构建脚本里把这个约束做成了硬失败：

```groovy
tasks.matching { it.name in ["assembleRelease", "bundleRelease"] }.configureEach {
    doFirst {
        if (!releaseSigningReady) {
            throw new GradleException("Pocket UI release signing environment is incomplete")
        }
    }
}
```

启动命令（生产由服务端下发，开发时可以直接 adb）：

```bash
adb shell am instrument -w -r \
  -e gateway_url wss://<gateway>/v1/device-ui/connect \
  -e bootstrap_ticket <single-use-60s-ticket> \
  -e pod_id <pod-id> \
  -e runtime_session_id <session-id> \
  -e lease_id <lease-id> \
  com.pocketclaw.uiruntime.test/.RuntimeInstrumentation
```

`-w` 让 `am instrument` 保持前台等待——这个 instrumentation 是个不会自己结束的常驻进程，只在收到 shutdown 或启动致命失败时才 `finish()`。

## 八、不等 idle 之后，怎么知道这一帧还算数

这是被低估的一半工作量。`waitForIdle()` 虽然在动态页面上不可用，但它原本承担了一个职责：**保证你读到的树和你即将操作的树是同一个**。取消它之后，这个保证必须自己重建。

旧方案的 ref 是 XML 里的一段静态数据。哪怕文本和 resource-id 完全一样，也不能证明动作发生时它还是同一个前台 App、同一个 window、同一个节点。所以旧的坐标点击很容易点空或点错。

新方案里，Runtime 会为当前 observation 里符合条件的节点保留 `AccessibilityNodeInfo` 的副本句柄，并挂一个 30 秒的 TTL。同时维护两个独立的计数器：

```java
private final AtomicLong eventSeq = new AtomicLong(0L);        // 所有相关事件
private final AtomicLong contentEventSeq = new AtomicLong(0L); // 只算内容/结构变化
private long uiEpoch = 1L;                                      // 结构边界代际
```

这个拆分是关键：**普通内容事件只推进 `event_seq`，不会作废整代 ref**。抖音每 100ms 发一个 content changed，如果每个事件都让 ref 失效，那什么都做不成。只有前台包、window、display、rotation 这类结构边界变化才推进 `ui_epoch`。

采集时记录首尾状态，用来判定这次观察的可信度：

```java
if (!publication.stable) {
    coverage.status = "unstable";
    coverage.truncatedReason = "ui_boundary_changed";
} else if (traversal.truncatedReason != null) {
    coverage.status = "partial";
} else if (contentChangedDuringCapture(captureStartState, captureEndState)) {
    coverage.status = "partial";
    coverage.truncatedReason = "ui_content_changed_during_capture";
    addWarning(warnings, "accessibility content changed during capture; observation may be incomplete");
} else {
    coverage.status = "complete";
}
```

注意这里的处理方式：遍历过程中内容变了，ref **不作废**（动作时还会再校验一次），但观察被标成 `partial`。这样上层就知道"没找到目标"可能是采集不全，而不是页面上真的没有——可以重采或升级 profile，而不是把一次瞬时 miss 当成"不存在"的证据。

每次 `tap(ref)` 执行前会重新校验一整串条件：owner/controller/pod/lease/connection 一致、ref 属于最新 snapshot、TTL 未过期、`ui_epoch` 未变、前台和 window 一致、live node 还能 `refresh()`、节点仍然 visible/enabled、刷新后的 bounds 仍与屏幕相交。全过再执行：

```text
node.performAction(ACTION_CLICK)
  -> 节点拒绝 click
  -> 在刷新后的 live bounds 中心注入手势
  -> 返回结构化 outcome
```

和旧坐标 fallback 的区别是：手势用的是**动作前刚刷新并通过校验的 bounds**，不是历史坐标。实测抖音顶部搜索按钮、联想词、搜索历史卡片的手势回退分别是 76–89ms、73–78ms、65ms。

顺带一个真实发现：抖音顶部那个视觉上明显可点的"搜索"按钮，在 accessibility 里是 `clickable=false`。只认原始 clickable flag 的话会漏掉一大批目标。所以放开了一个受约束的候选集——必须同时满足保留了 live node、来自最新 snapshot、visible/enabled、bounds 有效且与屏幕相交、有短语义标签、有 resource-id 或 content-desc、面积不超过屏幕三分之一。正文文本、无语义节点、超大容器仍然点不了。

动作返回的字段也刻意分得很细，避免"调用成功"被误当成"任务成功"：

```text
dispatched            请求是否已下发
resolved              是否已解析为可执行目标
node_action_succeeded live node 是否接受了 ACTION_CLICK
gesture_fallback_used 是否用了手势回退
event_changed         有限窗口内是否观察到事件变化
ui_epoch_changed      结构边界是否变了
```

这些都不等于业务成功。最终结论必须由下一次 snapshot 验证。

---

回头看，整件事的教训挺朴素的：一个工具在特定场景下失败，先去读它的源码搞清楚它到底在等什么，再决定是换工具还是换心智模型。`waitForIdle(1000, 10000)` 这一行代码，让人差点得出"抖音屏蔽了 accessibility"这种完全跑偏的结论。
