---
title: Electron、Tauri 与 GPUI：自带浏览器、借用 webview 和自己画
pubDate: 2026-10-13T10:00:00.000Z
description: 我这台 Mac 上有六个 Electron 应用，各带一份两百多 MB 的 Chromium。Tauri 借用系统的 webview，包小了一个数量级，引擎却交给了用户的系统，magpie 三个星期里在三个平台上各踩了一遍坑。GPUI 不用浏览器，自己在 GPU 上画，用它写一个菜单栏面板，碰到的又是另一类问题。
tags:
  - Electron
  - Tauri
  - GPUI
  - Rust
  - 桌面应用
---

## 一、六份 Chromium

Electron 应用很好认，包里的 `Contents/Frameworks` 下面有一个 `Electron Framework.framework`。一行命令就能找全：

```sh
ls -d /Applications/*.app/Contents/Frameworks/Electron*
```

我这台 Mac 上有六个。Chromium 的版本是拿 Electron 的版本号去[发布记录](https://releases.electronjs.org/)里查的：

| 应用 | 整个应用 | Electron Framework | Electron | Chromium |
|---|---|---|---|---|
| Visual Studio Code | 912 MB | 273 MB | 42.7.1 | 148 |
| Cursor | 859 MB | 257 MB | 40.10.3 | 144 |
| Claude | 648 MB | 285 MB | 44.4.3 | 152 |
| Clash Party | 588 MB | 276 MB | 43.7.3 | 150 |
| Netcatty | 387 MB | 224 MB | 42.3.3 | 148 |
| Grok Bot | 322 MB | 265 MB | 42.1.0 | 148 |

这个 framework 就是一整个 Chromium 加上 Node.js。拆开 Claude 那份，192 MB 是动态库本体，将近 50 MB 是 220 个语言目录（55 种语言，每种又分出阴性、阳性、中性三个变体），另外还有一份 ffmpeg，和一个 GPU 用不了时兜底的软件 Vulkan。

六份加起来 1580 MB，彼此不共享，版本也对不上：四个 Chromium 大版本，同是 148 的三个应用，补丁号又各不相同。

## 二、自带浏览器换来了什么

每个应用背一个浏览器，换来的是它只需要对付这一个。`package.json` 里定了 Electron 的版本，三个平台的用户跑的就是同一个 Chromium、同一个补丁号，开发时在 DevTools 里看到什么，用户那里就是什么。菜单、托盘、通知、自动更新、崩溃上报也都有现成的 API，Claude.app 里 Electron 旁边的 `Squirrel.framework` 就是管自动更新的。

代价除了体积，还有进程和补丁。我写这段的时候，Claude 有 15 个 Chromium 的进程，VS Code 连同扩展一共 31 个，两边的常驻内存简单加起来都在 2 GB 上下。更麻烦的是安全补丁。Chromium 每周都有，Electron 应用里的那份只有应用自己发版时才跟着更新，而 Electron 官方[只维护最新的三个大版本](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)。拖一下下面的日期，能看到每个时间点上还在维护的是哪几个：

<iframe class="embed bleed" src="/desktop-frameworks/support.html" title="Electron 各大版本的维护区间" loading="lazy" style="height: 487px"></iframe>

现在维护的是 42 到 44。Cursor 还在 40，这个版本 7 月 1 日发完最后一个补丁就不再维护了。Grok Bot 在 42 上，带的却是 42.1.0，42 已经出到 42.11.12。

系统里本来就有一个浏览器引擎，而且有人负责给它打补丁。能不能直接借来用？

## 三、借系统的 webview

能。桌面系统都带着一个能嵌进应用窗口的浏览器控件，叫 webview。Tauri（Rust）和 Wails（Go）走的就是这条路：前端照样是网页，渲染交给系统，应用里不带浏览器。

我机器上有两个 Tauri 应用，CC Switch 和我从它 fork 出来的 ccs-lite，包里连 Frameworks 目录都没有。只算 arm64，二进制分别是 35.8 MB 和 29.0 MB，大约是最小那个 Electron 应用的十分之一。ccs-lite 自己只有一个五十来 MB 的进程，另外三个 WebKit 进程属于系统，加起来又是几十 MB。

包小了，是因为浏览器不归应用管了。那它归谁？

| 系统 | webview | 引擎 | 版本由谁决定 |
|---|---|---|---|
| macOS | WKWebView | WebKit | 用户的系统版本和 Safari 更新 |
| Windows | WebView2 | Chromium | 微软自动更新，Windows 11 预装，Windows 10 不一定有 |
| Linux | WebKitGTK | WebKit | 发行版的软件包 |

同一份前端，到了用户手里是两种引擎、说不清多少个版本。

## 四、magpie 的三个星期

[magpie](https://github.com/yetone/magpie) 是 yetone 写的菜单栏应用，管各家 coding agent 用哪家供应商的模型，我在写的 confdeck 界面就是照着它学的。它用的是 Wails v3，9 月 23 日建的仓库，现在一万多星。不到三个星期，issue 区里三个平台的问题都有了。

先是 macOS 12.7.6 上打开一片空白（[#220](https://github.com/yetone/magpie/issues/220)）。macOS 12 上的 WebKit 可能还是 Safari 15.0 那一版，没有 `Array.prototype.at`、`structuredClone` 这些后来才有的函数。magpie 加了一个 `compat.js`，在所有脚本之前把它们补上。

WebKit 的问题不只出在老系统上。Routing 页在 macOS 和 Linux 上滚不到底（[#1249](https://github.com/yetone/magpie/issues/1249)）：页面能滚 585 像素，WebKit 只让滚到 344；用代码设 `scrollTop`，读回来是 585，过一会儿又落回 344。报告的人把节点一块块换成克隆去排查，查到是 `container-type: inline-size`，每个带这个属性的后代元素都会让 WebKit 少算一截。Windows 上的 WebView2 是 Chromium，没有这个问题。照着 issue 里的数字做了个模拟，可以自己滚滚看：

<iframe class="embed bleed" src="/desktop-frameworks/scroll.html" title="WebKit 少算的滚动范围" loading="lazy" style="height: 347px"></iframe>

Windows 的问题在于 WebView2 不是 Windows 10 自带的。在没装的机器上双击 magpie.exe，什么都不会发生（[#1806](https://github.com/yetone/magpie/issues/1806)）。进程 50 毫秒就退出了，退出前打印过原因，可 GUI 程序没有控制台，这行字没地方显示。现在 magpie 建窗口前先查注册表，没装就弹一个对话框。

Linux 上，一台 NixOS 机器的 WebKitGTK 2.54.1 在 GTK 没设字体 DPI 时，把表示“未设置”的 -1 乘以 1024 当作 DPI，页面按 -91008 像素宽的视口排版，欢迎语被挤成一竖条（[#1371](https://github.com/yetone/magpie/issues/1371)）。另一台装 NVIDIA 显卡的 Ubuntu 上，任何一次 view transition 都会让 WebKit 的渲染进程段错误，整个应用跟着崩掉（[#1740](https://github.com/yetone/magpie/issues/1740)）。

这些问题换成 Electron 一个都不会碰到，因为引擎是应用自己带的那一份。系统 webview 省下的两百多 MB，有一部分就是拿这些 issue 换的。

## 五、Chromium 又回来了

Tauri 对此并不回避。2024 年初有人在讨论区发帖，说 WebKit 太不稳定，得改用 Chromium 或者 Firefox。维护者 FabianLars 当天回复：用 CEF 嵌入 Chromium 没有排除，只是没有时间表；如果现在就需要好的 Linux 支持，他没法百分之百推荐 Tauri。

https://github.com/tauri-apps/tauri/discussions/8524

两年多以后，9 月 13 日发布的 [Tauri 3.0.0-alpha.0](https://github.com/tauri-apps/tauri/releases/tag/tauri-v3.0.0-alpha.0) 加了一个运行时 `tauri-runtime-cef`，应用可以在系统 webview 和自带的 Chromium 之间选。文档列的好处，第一条是三个平台渲染一致；代价是包会大出几百 MB，内存更多，第一次构建要下载大约 1 GB 的 CEF。这正是第二节里 Electron 的那笔账。

https://v3.tauri.app/develop/cef/

用 TypeScript 写桌面应用的 [Electrobun](https://github.com/blackboardsh/electrobun) 也一样，默认用系统 webview，另给一个 `bundleCEF` 开关。

两边绕了一圈，争的是同一件事：浏览器引擎的版本由谁来定。自己定，就得自己背着它、自己更新它；交给系统，就得适配用户机器上的每一个版本。

还有一条路，是干脆不用浏览器。

## 六、不用浏览器，自己画

Zed 编辑器的界面里没有网页，所有东西都由 Zed 团队自己写的 UI 框架 GPUI 在 GPU 上画出来。Zed 2023 年的一篇文章讲过这个思路：不写通用的 2D 图形库，只给界面里最常见的几样东西各写一个 shader，矩形、阴影、文字、图标、图片；字形交给操作系统光栅化，放进 GPU 上的一张图集里反复用。

https://zed.dev/blog/videogame

拿一个面板来看，它就是这几样东西一层层叠起来的：

<iframe class="embed bleed" src="/desktop-frameworks/primitives.html" title="一个面板拆成 GPUI 的五种图元" loading="lazy" style="height: 501px"></iframe>

现在 GPUI 在 macOS 上用 Metal，Windows 上用 Direct3D 11，Linux 上用 wgpu。渲染器编进了应用自己的二进制，所以它像 Electron 一样，版本由应用定；又像 Tauri 一样，不带浏览器。跟着平台走的只剩文字，三个平台用的是三套文字栈。

体积和 Tauri 差不多。confdeck 和 ccs-lite 做的是同一类事，confdeck 的 release 构建是 32.1 MB，ccs-lite 的 arm64 部分是 29.0 MB，大头都是 Rust 编出来的代码。

麻烦在版本上。GPUI 的 README 写明它还在跟着 Zed 积极开发，版本之间经常有破坏性改动；crates.io 上官方的 `gpui` 停在 2025 年 10 月的 0.2.2。社区的做法来自长桥开源的 [gpui-kit](https://github.com/longbridge/gpui-kit)（原名 gpui-component）：维护者 Jason Lee 从今年 9 月起，把 Zed 主干某个提交的 GPUI 打包成 [gpui-pre](https://crates.io/crates/gpui-pre) 发出来，差不多一周一版，gpui-kit 固定一组配套的版本。confdeck 现在用的是 gpui-kit 0.7.1，这个组件库六个星期发了十个版本。

所以拿到手的，是一个渲染和组件都齐了、版本却变得很快的框架。用它写东西是什么感觉，看 confdeck 的菜单栏面板就知道了。

## 七、一个菜单栏面板

confdeck 的菜单栏面板是照着 magpie 的快捷面板做的。点一下菜单栏上的图标，弹出一个毛玻璃底的小窗口，每个 agent 占一行，行尾的胶囊上写着它现在用的供应商。点一下胶囊，会展开一个选择器，顶上有个过滤框，选中哪家就切到哪家。

在 magpie 里，这个面板是一个网页。在 confdeck 里，它从弹出来到关掉，几乎每一步都出过问题。

### 一点图标就崩溃

原型第一版出来的时候，我以为菜单栏面板还没做：confdeck 不在前台时点它的图标，面板闪一下就没了。查下来，面板其实做好了，是整个进程崩了，崩溃日志里是 AppKit 抛出的 `NSRangeException`。confdeck 在前台时点图标不会崩，所以一开始没发现。

原因是两件事凑到了一起。

macOS 上同一时间只有一个窗口接收键盘输入，叫 key window。应用不在前台时弹出一个窗口，Cocoa 会给上一个 key window 发一条假消息，告诉它“你成了 key window”。GPUI 里有一段代码专门对付这种情况：收到这条消息后检查一下，发现自己其实不是 key window，就主动把焦点交出去。面板刚弹出来、刚拿到焦点，就被这段代码交了出去。

面板一失去焦点就会关掉自己，菜单栏面板本来就该这样，点别处它就消失。可这次关窗口，正好发生在 AppKit 切换 key window 的半路上。窗口在半路被关掉，AppKit 内部的数组越界，抛出了那个异常。异常一路穿过 Rust 的调用栈，进程就直接退出了。

修法有两条。一是打开面板之前，先把 confdeck 激活成前台应用，这样就不会有那条假消息。二是关窗口不在回调里当场做，挪到下一轮主线程任务里。

本以为这就好了。后来又崩了三次，异常一模一样：一次是在面板里点“存成供应商”，一次是我用 release 构建点图标，一次是点主窗口左上角的关闭按钮。

异常信息说的是，AppKit 想从一个 NSView 上移除一个观察者，可这个观察者根本没在上面注册。这个 NSView 是窗口的 content view，GPUI 画东西的那个 view 就装在它里面。GPUI 销毁窗口时会把它释放掉。可 AppKit 为 TouchBar 在它上面挂了一个观察者，要等下一次刷新屏幕时才挪走。等 AppKit 来挪的时候，view 已经没了。

既然销毁窗口会出事，那就不销毁。现在 confdeck 的两个窗口都只创建一次。关面板时，先把它变成透明的，再从屏幕上拿下来。下次打开时，把它挪回图标下面，画好新的一帧，再变回不透明。中间透明这一下，是为了不让人看到上次关掉时留下的旧画面。

### 毛玻璃的四个角

面板的背景是毛玻璃，能隐约透出桌面的颜色。GPUI 支持这个：把窗口背景设成 `Blurred`，它会在内容下面垫一层系统自带的毛玻璃，`NSVisualEffectView`。

可这层毛玻璃是方的，铺满整个窗口。面板的内容画成了 12 像素的圆角，四个角外面就露出一小块直角的毛玻璃，看上去还是一个方窗口。GPUI 元素上的 `rounded()` 只管 GPUI 自己画的东西，管不到下面那层系统的 view。

在网页里，这是一行 `border-radius`。在 confdeck 里，得绕过 GPUI 拿到窗口的 content view，打开它的 layer，自己设圆角半径和裁剪，再让系统按新的形状重新算一遍窗口的阴影。

### 选择器的半透明

点开某一行的胶囊，选择器会浮在面板上面。magpie 的选择器是半透明的，能隐约看到底下的内容，但那些内容被模糊掉了，不影响看选项。这在网页里也只是一行 CSS：`backdrop-filter: blur(24px)`。

我照着 magpie 把选择器的底色设成 94% 不透明。结果底下几行的文字清清楚楚地透了上来，和选择器里的选项叠在一起，乱成一片。

GPUI 能画的就是前面说的那五样：矩形、阴影、文字、图标、图片。“把元素底下已经画好的东西模糊一下”不在其中。它能模糊的只有整个窗口背后的桌面，而那也是借系统的 view 做的。所以选择器最后改成了完全不透明，代码里留了一句注释，等 GPUI 哪天支持了再改回来。

圆角和半透明这两处，可以在下面切换着看：

<iframe class="embed bleed" src="/desktop-frameworks/glass.html" title="面板的毛玻璃和选择器的半透明" loading="lazy" style="height: 593px"></iframe>

### 往上长的窗口

选择器比面板高。打开它的时候，面板得往下长出一截，关掉时再缩回去。

我先用的是 GPUI 自带的 `window.resize()`。一调，面板没有往下长，而是往上长，上边冲到了菜单栏上面。原因在坐标系上：macOS 的窗口坐标，原点在屏幕的左下角。`resize()` 底下调的是 AppKit 的 `setContentSize:`，它会保持窗口的左下角不动。左下角不动，窗口加高就只能往上长。

那就自己算位置。我改成直接调 AppKit 的 `setFrame:display:`，先记下面板上边的位置，减去新的高度，得出新的左下角。这回窗口确实往下长了，里面的内容却不对：选择器被挤到窗口最上面，盖住了标题，下半截一片空白，在选择器外面点也关不掉它。看起来，GPUI 不知道窗口已经变高了，还在按原来的高度排版。

它确实不知道。`setFrame` 改完窗口大小，会当场回头通知 GPUI。GPUI 处理这个通知时，要独占整个 `App`，也就是拿到它的可变借用。可我改高度的代码本身就跑在 GPUI 的点击事件里，`App` 这时正被点击事件占着。GPUI 借不到它，就把这次尺寸变化丢了，只在日志里记了一笔。

GPUI 自己的 `resize()` 早就碰到过这个问题：它把 `setContentSize:` 放到下一轮主线程任务里执行，躲开的就是这个。我也照做，把 `setFrame` 挪到下一轮任务里，这次终于对了。三种改法可以在下面依次点一遍：

<iframe class="embed bleed" src="/desktop-frameworks/resize.html" title="三种改窗口高度的方法" loading="lazy" style="height: 432px"></iframe>

### 打开时闪一下

高度对了，可我发现点开选择器时，面板会闪一下。闪得太快，肉眼只看得出闪了，看不出闪的是什么。只好录屏，再把视频按每秒 57 帧左右拆成图片，一帧一帧地看。下面是照着当时看到的样子还原的几帧，可以先按原速播一遍，再一帧一帧地点：

<iframe class="embed bleed" src="/desktop-frameworks/flash.html" title="打开选择器时的几帧" loading="lazy" style="height: 609px"></iframe>

拆开看，是两件事。

头两帧里，选择器跑到了面板上面，盖住了标题。这是上一步留下的：窗口高度要到下一轮任务才改，画第一帧的时候窗口还是矮的。选择器用的是 GPUI 的 `anchored()`，它发现下面放不下，就按默认规则换到上面去摆。等下一帧窗口变高了，它才落回原位。修法是不用 `anchored()`，把选择器固定在那一行下面，并且等窗口长够了才开始画它。

第三帧，窗口已经变高，里面却还是变高之前的画面，被系统拉伸着铺满了整个窗口。GPUI 平时要等屏幕下一次刷新才重画，改了窗口尺寸也不会让它马上画。修法是在 `setFrame` 之后立刻让 GPUI 同步画一帧，让新的画面和新的尺寸一起交给系统。

### 收不到的方向键

选择器顶上的过滤框，用的是 gpui-kit 的 `Input`。我想让它像 magpie 那样：焦点在过滤框里，按上下键移动高亮，回车选中，Esc 关掉。可选择器一个键都收不到。

GPUI 分发按键时，从焦点所在的元素开始，一层层往外找谁绑了这个键。`Input` 自己就绑了上、下、回车和 Esc：多行输入时，上下键要移动光标，回车要提交，Esc 要取消。它离焦点最近，键在它那里就被处理掉了，传不到外面的选择器。可以在下面的过滤框里按一下方向键试试：

<iframe class="embed bleed" src="/desktop-frameworks/keys.html" title="按键在 GPUI 里的路径" loading="lazy" style="height: 355px"></iframe>

GPUI 提供了一个在所有绑定之前运行的钩子，`cx.intercept_keystrokes`。选择器用它先把这几个键截下来：

```rust
let intercept = cx.intercept_keystrokes(move |event, window, cx| {
    if window.window_handle().window_id() != window_id
        || event.keystroke.modifiers.modified()
    {
        return;
    }
    let Some(picker) = picker.upgrade() else {
        return;
    };
    let key = event.keystroke.key.clone();
    if picker.update(cx, |picker, cx| picker.handle_key(&key, cx)) {
        cx.stop_propagation();
    }
});
```

它只管选择器所在的窗口，也只管没按修饰键的情况。选择器处理了这个键，就停止传播，`Input` 收不到；别的键，比如打字和退格，照常进过滤框。

### 发虚的图标

面板每一行前面有个 agent 的彩色图标，在 Retina 屏上看，边缘是虚的。

GPUI 画彩色 SVG 用的是 `img()`，它按 SVG 文件里写的尺寸，出一张两倍大的位图。这些图标来自 LobeHub，文件里写的宽度是 `1em`，GPUI 按 12 像素算，位图就是 24 像素。可图标在面板上占 22 个点，到了 Retina 屏上是 44 个像素。24 像素的图被拉大了将近一倍，自然是虚的。

浏览器画 SVG 时按最终显示的像素来，不会有这个问题。confdeck 只好自己来：按“显示尺寸 × 窗口的缩放倍数”调 GPUI 的 SVG 渲染器出图，缓存起来，再交给 `img()`。两种做法放大了看是这样：

<iframe class="embed bleed" src="/desktop-frameworks/icons.html" title="同一个 SVG 的两种光栅化" loading="lazy" style="height: 349px"></iframe>

### 面板之外

一个面板做下来，confdeck 里多了一个 454 行的 `mac.rs`，全是直接调 AppKit 的代码：裁圆角、顶边不动地改高度、只藏不毁的窗口、关面板时把前台还给原来的应用。文件开头的注释只有一句：GPUI 没提供、只能直接调 AppKit 的窗口操作。这些事在 Electron 里，多半是创建窗口时的一个选项，或者一行 CSS。

还有两样东西，用浏览器时是现成的，GPUI 没有。

一样是调试和测试的工具。网页有 DevTools，有 Playwright，GPUI 都没有。confdeck 的界面测试是自己搭的：GPUI 公开了 `Window::dispatch_event`，可以在应用里按脚本往窗口送鼠标和键盘事件，再让 GPUI 把当前这一帧渲染成图片，对着图片检查。

另一样是自动更新。Electron 有 Squirrel，GPUI 没有现成的更新器。检查新版本、下载、验证签名、替换 .app、重启，都得自己写。

## 八、用 GPUI 的得失

上面这些坑，出在 GPUI 自己，或者出在它和 AppKit 的交界处，修一次就固定了。confdeck 画成什么样，由它自己的二进制决定，用户的系统版本、Safari 版本、装没装 WebView2，都影响不到。magpie 的问题出在用户机器上的引擎，修好一个版本，还有下一个版本在等着。当然，GPUI 自己也变得快，升级 gpui-kit 时还得再验一遍。

界面和逻辑都是 Rust，也省掉了一层。Tauri 的前端和 Rust 后端之间隔着 IPC，数据要序列化成 JSON 传过去；confdeck 的界面直接调 `confdeck-core` 里的函数。进程也只有一个，debug 构建的常驻内存是 67 MB。

没换来的是跨平台。confdeck 现在只做 macOS，`mac.rs` 那 454 行到了 Windows 和 Linux 都得另写一份，GPUI 在那两个平台上表现如何，我还没验证过。

这几条路也在互相靠拢。Tauri 3 让应用可以自带 Chromium；gpui-kit 的仓库里也有一个还在实验的 webview crate，能把系统 webview 嵌进 GPUI 的窗口。哪天要在界面里显示网页，GPUI 应用还是得借一个浏览器回来。confdeck 暂时用不上它，一个管配置文件的小工具，用 GPUI 画已经够了。
