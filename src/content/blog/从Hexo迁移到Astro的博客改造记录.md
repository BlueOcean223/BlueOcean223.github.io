---
title: 从 Hexo 迁移到 Astro 的博客改造记录
pubDate: 2026-06-19T18:00:00.000Z
tags:
  - Astro
  - 博客
  - GitHub Pages
---

# 从 Hexo 迁移到 Astro 的博客改造记录

之前用 Hexo + Butterfly 搭了一个个人博客。它确实解决了“能不能快速拥有一个博客”的问题，但用了一段时间后，我逐渐觉得它对我来说有点重：主题配置很多、页面组件很多、视觉风格也越来越不是我喜欢的方向。

这次把博客从 Hexo 迁移到了 Astro，顺手也重做了一下整体设计和发布流程。

## 为什么想从 Hexo 换掉

Hexo 本身没有什么问题，Butterfly 主题也很成熟。但我的需求慢慢变了：

- 想要更轻的静态站点
- 想减少主题带来的配置负担
- 想自己控制页面结构和样式
- 想把博客做得更像一个个人站，而不只是文章列表
- 个人审美上更偏向 Anthropic 的风格

参考过的风格主要是 Anthropic 的工程博客和研究文章页：

https://www.anthropic.com/engineering/harness-design-long-running-apps

https://www.anthropic.com/institute/recursive-self-improvement


## 为什么选择 Astro

Astro 给我的感觉是：它保留了静态博客的简单性，同时又给了足够强的页面表达能力。

几个关键点：

1. **默认静态输出**  
   博客最终还是生成 HTML，非常适合 GitHub Pages。

2. **默认少 JavaScript**  
   不需要为了一个静态博客引入一堆前端运行时代码。

3. **Markdown 迁移成本低**  
   原来的 Hexo 文章本来就是 Markdown，迁移到 Astro 的 Content Collections 比较自然。

4. **可以写 `.astro` 页面**  
   像首页、友链页、关于页这种，不必硬塞在 Markdown 里，可以直接写组件化页面。

5. **支持 MDX**  
   如果以后想在文章里写更自由的交互模块，也可以用 `.mdx`。


## 迁移的大致过程

这次没有直接在 `main` 上改，而是先从原来的 `hexo` 分支切了一个 `astro` 分支。

原来的分支结构大概是：

- `main`：Hexo 生成后的静态产物
- `hexo`：Hexo 博客源码
- `astro`：新的 Astro 博客源码

迁移步骤大概是：

1. 新建 Astro 项目结构
2. 把 `source/_posts` 里的文章迁移到 `src/content/blog`
3. 把 `source/img` 里的图片迁移到 `public/img`
4. 清理 Hexo 配置、主题和脚手架文件
5. 重写首页、文章页、归档页、关于页、友链页
6. 加上 RSS 和 sitemap
7. 配置 GitHub Actions 自动构建部署

迁移后，文章目录变成：

```txt
src/content/blog/
```

静态资源目录变成：

```txt
public/img/
```

## 新博客的页面结构

现在主要有几个页面：

- `/`：个人主页
- `/blog/`：文章列表
- `/archive/`：归档
- `/links/`：友链
- `/about/`：关于
- `/rss.xml`：RSS

并对各模块进行了一定程度上的改造

## 文章页的改造

文章页保留了比较窄的阅读宽度，正文居中，右侧增加了目录。

目录做成了类似 Typora 大纲的效果：

- 默认展示顶级标题
- 可以折叠 / 展开
- 滚动时自动高亮当前章节
- 屏幕较窄时自动隐藏，避免挤压正文

这个功能对长文比较有用，尤其是一些技术笔记，标题层级比较多，没有目录会很难快速跳转。

## 链接卡片

这次还顺手做了一个链接卡片解析功能。

如果在文章里单独放一行 URL，比如：

```md
https://github.com/
```

构建时会尝试抓取页面的 Open Graph 信息，然后渲染成卡片：

- favicon
- 站点名
- 标题
- 描述
- 封面图

如果目标网站无法访问或者禁止抓取，就降级成普通信息卡片，不影响构建。

这个功能比较适合记录一些文章、论文、项目链接，比直接裸链好看一些。

## 音乐播放器的处理

以前在 Hexo / Butterfly 里用过 `aplayer` 标签。迁移到 Astro 后，Hexo 的标签语法不会再被解析，所以原来的写法会直接显示成普通文本。

这次改成了更通用的 HTML 写法：

```html
<figure class="audio-card">
  <img class="audio-cover" src="/img/yourname.jpg" alt="君の名は。" />
  <div class="audio-meta">
    <strong class="audio-title">三葉のテーマ</strong>
    <span class="audio-artist">RADWIMPS · 君の名は。</span>
    <audio controls preload="none" src="...mp3"></audio>
  </div>
</figure>
```

这样不依赖主题插件，也更容易控制样式。

## 部署方式的变化

以前 Hexo 的流程是：

```bash
hexo clean
hexo g
hexo d
```

也就是本地生成，然后通过 `hexo-deployer-git` 推送生成物。

现在换成 GitHub Actions：

```bash
git add .
git commit -m "new post"
git push
```

推送到 `main` 后，GitHub Actions 会自动：

1. 安装依赖
2. 构建 Astro
3. 发布到 GitHub Pages

这样本地不需要再关心 `dist` 目录，也不需要手动部署生成物。

## 小结

这次迁移最大的感受是：博客框架不只是“能不能写文章”，还会影响自己是否愿意长期维护它。

Hexo + Butterfly 很适合快速搭一个功能完整的博客，但当我想要更轻、更克制、更可控的个人站时，Astro 会更合适。

现在这个版本还有很多可以继续打磨的地方，比如暗色模式、搜索、更多自定义组件等。但至少目前它已经更接近我想要的状态：

> 少一点主题负担，多一点自己的表达。
