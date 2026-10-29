---
title: Rust 很适合 agent，除了 target 目录
pubDate: 2026-10-27T10:00:00.000Z
description: 读 Niko Matsakis 的 What agents mean for Rust：Rust 为什么在 agent 时代变得这么热门，类型系统和性能上能调的地方各帮了 agent 什么，Niko 自己承认的几处不便。再看他没提的一处：target 目录。从 hello world 的 1.9M，到一个 axum 小服务的 847M，到一个写了 18 天的 GPUI 项目的 33G，以及几个 agent 并行时它为什么还会翻倍。
tags:
  - Rust
  - Agent
  - Cargo
---

## 一、挑语言的时候

以前挑一门语言写新项目，很大程度上看自己会什么。Rust 的名声一直是好，但难学，借用检查器要跟它磨上几个月才算熟。

现在写代码的多半是 agent，学语言这件事的成本从人身上挪到了它身上。挑语言时要问的问题也就换了一个：哪门语言能让 agent 少犯错，犯了错也能早一点发现？

Rust 语言团队的 Niko Matsakis 10 月 14 日写了一篇长文聊这件事。他做了一辈子编程语言设计，开头却先承认，看着 LLM 起来，自己也慌过一阵，是那种存在主义式的慌。

https://smallcultfollowing.com/babysteps/blog/2026/10/14/agentic-dev-and-rust/

## 二、Rust 正在成为热门

Niko 先引了 David Tolnay 8 月在 X 上发的 [Meta 内部语言采用情况](https://x.com/dtolnay/status/2087229652293337160)。增长最快的是 TypeScript，排在第二的是 Rust：Meta 的工程师今年自己写下的 Rust 代码，是之前九年加起来的两倍。

为什么会是 Rust？Niko 给了两个不难想到的原因。有了 agent，临时换一门新语言写点东西不算什么麻烦事了，既然试哪门都差不多，那就挑一门跑得快的。

他真正想说的是第三个：Rust 恰好适合 agent 来写。OpenAI 的 Greg Brockman 1 月发过一条推，说 Rust 很适合 agent，理由是[编得过基本就对了](https://x.com/gdb/status/2007228511363444905)。Niko 还笑说，他是 Rust 的人，当然会这么讲。

## 三、编译器先替 agent 检查一遍

“编得过就对了”这句话值得展开说说。

Niko 描述了一个用过 agent 的人大概都见过的场面：前几个测试跑得好好的，到下一个突然离谱，怎么想都想不出 bug 是从哪来的，一查才发现 agent 从一开始就把要写的逻辑理解错了。他在脚注里说，自己最常说的一句话是“Claude, this is not what we talked about!”

测试能覆盖的输入只有那么几个，类型系统检查的却是所有路径。Rust 管的范围比字段名和参数类型更大：所有权保证 socket 不用手动去关，`&mut` 保证同一时刻只有一个可写引用。agent 写错了，`cargo check` 当场就报出来，不用等某个测试碰巧撞上。

类型系统当然也有边界。它能排除掉某几类错误，但证明不了程序做的是对的事。Niko 顺着这点往前推了一步，提到 Verus、Creusot、Kani 这几个跑在 Rust 上的证明工具，还举了一个例子：

```java
void setFoo(Bar bar) {
    this.foo = bar;
    assert this.foo == bar;
}
```

这段 Java 里的断言证明不了，因为可能有别的线程同时在改 `this`。换成 Rust：

```rust
fn set_foo(&mut self, bar: Bar) {
    self.foo = bar;
    assert_eq!(self.foo, bar);
}
```

`&mut self` 保证没有别人能动 `self`，断言一定成立。Verus 用的正是借用检查器已经保证过的这些事，SMT 求解器要操心的就少了一大块。类型系统先把琐碎的错误挡在外面，证明工具才好专心去管那些真正要紧的性质。

## 四、性能上能调的地方不少

挑错之外，Rust 还有另一处对 agent 有利的地方：性能。

默认的写法已经够快，真需要的时候还能自己决定不少事情。值放栈上还是堆上，结构体里的字段怎么排，async 的栈帧在哪里装箱，最后还有内联汇编。以前要把这些调好，靠的是写上很多年的经验，Niko 说现在 agent 挺擅长这一块。做高性能密码学算法的人，以前是自己手调汇编，现在交给 agent。写网络服务的人，用 profiler 配合 agent，去 async 里找长轮询和阻塞调用。

这两件事在他眼里是连着的。密码学算法有严格的数学定义，可以直接对 agent 说“随便优化，只要能证明结果没变”。他想把同样的思路用到 `unsafe` 上：如果能证明一段 `unsafe` 代码不会触发未定义行为，那就可以放心拿它去优化。他为 Rust 定的长期目标叫“no more unsafe code”，意思是 `unsafe` 关键字留着，但每一处都得有证明。

## 五、他自己也承认有几处不方便

文章大部分篇幅在讲长处，不过有几处不便是 Niko 自己写出来的。

一处是 `clone()`。async 任务要捕获变量，agent 会老老实实加一堆 clone，编译是能过，读起来很烦，代码真正在做什么全被淹了。Niko 说用了 agent 之后，他更相信 Rust 需要一种更顺手的引用计数写法。

另一处是证明工具难用。现有的几个都要写一堆宏，还要钉死某个编译器版本。他希望编译器能变得可扩展，好让这些工具接进来。

还有一处是 Go。Niko 在脚注里承认，他也听说 Go 很适合 agent，只是 Go 的长处落在别的地方：迭代快。他怀疑 agent 用 Go 会漏掉一些数据竞争，但快这一点他没否认。

所谓迭代快，很大程度上就是编译快。Rust 编译慢不是新闻，我拿本机一个最小的 axum 服务试过，依赖是 tokio、axum、serde、serde_json、reqwest，冷启动编一次 debug 要 26 秒，release 要 41 秒。改一行再编，一秒左右就完事，增量编译这块 Cargo 做得不错，前提是之前已经编过。

编过的东西都堆在 `target/` 里。文章里没提这个目录，我猜是因为它不怎么体面。

## 六、hello world 其实不大

先替 Rust 说句公道话，它编出来的程序本身不胖。

```text
$ cargo new hello && cd hello && cargo build --release
$ du -sh target
1.9M    target
```

release 的二进制 430,832 字节，strip 之后 341,520 字节。同一台机器上 Go 1.26 的 hello world 是 2,492,466 字节，Rust 的不到它的五分之一。

产物的个头没问题，麻烦出在编出它的过程中留在硬盘上的东西。

## 七、加五个依赖之后

还是那个 axum 服务，`cargo add` 了五个库进去。`cargo tree` 展开一看，依赖一共 162 个 crate。第一次 `cargo build` 之后：

```text
546M    target
 469M   target/debug/deps
  45M   target/debug/build
  19M   target/debug/web
  11M   target/debug/incremental
```

再编一次 release，又多出 302M，合计 847M。程序干的活就是返回一个 `{"msg":"hi"}`。

大头都在 `deps/` 里：162 个 crate 每个都有 `.rlib` 和 `.rmeta`，dev profile 默认还带着完整的调试信息。macOS 上还多一层，Cargo 在这里默认 `split-debuginfo = "unpacked"`，调试信息不打进二进制，而是留在一个个 `.o` 文件里，等调试器来读。

调试信息可以关掉一部分。同一个项目，`debug = "line-tables-only"` 编出来是 450M，`debug = 0` 是 338M，省了三分之一左右，量级还是那个量级。

## 八、一个写了 18 天的项目

再看一个真实的项目。confdeck 是我 10 月 9 日开始写的一个 GPUI 应用，到今天 135 个提交，六万多行 Rust。它的 `target/` 长这样：

```text
 33G    target
 20G    target/debug
8.5G    target/shots
3.5G    target/verify
641M    target/adv
 24M    target/doc
```

`target/debug/deps` 里躺着九万多个 `.o` 文件。

想知道清掉能省多少，我跑了 `cargo clean --dry-run`：

```text
     Summary 158422 files, 58.0GiB total
warning: no files deleted due to --dry-run
```

58 GiB。`du` 说是 33G。

差的这 25G 是硬链接。增量编译生成的 `.o` 放在 `incremental/` 里，编译器再把它硬链接到 `deps/`，同一个文件常常有好几个名字。我随手查的一个 `.o`，链接数是 4，`cargo clean` 统计的时候按名字数，它就被算了四遍。所以 cargo 报自己占了多少地方，数字会虚高七成。

## 九、agent 一多，它就翻倍

`debug` 之外那几个目录是怎么来的？

`shots` 是给 UI 截图测试用的。截图要打开一个 feature 编一份应用，仓库的 `.agent/` 里有一条 agent 写给自己的笔记，说要用单独的目标目录，免得和平时的构建来回重编：同一个 `target/`，带 feature 编一次，不带再编一次，两边互相把对方的产物顶掉。

同一份笔记里还记了另一件事。有一次截图跑到一半，共用的目录被另一个会话拿去编了，编进去的是那个会话还没提交的改动。

这就是几个 agent 一起写 Rust 时会碰上的麻烦。共用一个 `target/`，Cargo 会加锁，后来的那个只能等着：

```text
    Blocking waiting for file lock on build directory
```

等到了还可能编进别人的改动。各用各的，每多一个 worktree、每多一个 feature 组合，就多一份几个 G 的副本，而且每一份都要从头冷编。confdeck 的性能实验脚本就给每个变体开了一个 `/tmp/confdeck-perf/vt-<名字>`。`target/` 下的 `verify` 和 `adv`，笔记里没写来历，看名字也是哪次会话单独开的。

一个人写代码的时候，同一时刻顶多有一个构建在跑。几个 agent 并行起来，`target/` 就按并行数往下翻倍。

下面四格画的是这个过程：

<iframe class="embed bleed" src="/rust-agents-and-target-dir/grow.html" title="Clawd 的 target 目录越长越大" loading="lazy" style="height: 568px"></iframe>

## 十、Cargo 那边在做什么

Cargo 团队知道这个问题。

从 1.88（2025 年 6 月）起，Cargo 会自动清理 `~/.cargo` 下的缓存，网上下载的东西三个月没用过就删，本地来的一个月。我的 `~/.cargo/registry` 现在 1.9G，归它管。`target/` 不归它管。

1.91（2025 年 10 月）稳定了 `build.build-dir`，中间产物可以和最终产物分开，放到别的目录去。放到别处，它还是那么大。

讨论 `target/` 垃圾回收的 issue 是 [cargo#5026](https://github.com/rust-lang/cargo/issues/5026)，2018 年 2 月开的，标题是 target 目录会随着工具链更新塞满过期产物，到今天还开着。8 月维护者在里面说，正在准备新的 build-dir 布局，给垃圾回收铺路。按 beta 版的 changelog，这个布局会在 11 月 12 日的 Cargo 1.100 上线，说明里的说法是它“unblocks”垃圾回收：布局先换，回收本身还没做。

在那之前能做的事不多。dev profile 里把 `debug` 调低一点，定期用 [cargo-sweep](https://github.com/holmgr/cargo-sweep) 清掉一段时间没用过的产物，或者干脆 `cargo clean`，再接受下一次冷编。

## 十一、编译通过之后

Niko 在结尾的意思是，Rust 应该顺着“能编译通过就说明东西是对的”这条路再往前走一点，让类型系统表达更多，让证明工具接得进来，agent 也就不用老想着绕开编译器。

只是编译通过这件事本身也有成本，成本最后都摊在 `target/` 里。agent 开得越多、跑得越勤，这笔账涨得越快。手头有几个写 Rust 的 agent 在跑的话，隔一阵记得回头看眼磁盘。
