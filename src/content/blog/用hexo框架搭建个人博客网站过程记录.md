---
title: 用hexo框架搭建个人博客网站过程记录
pubDate: 2024-12-26T20:33:22.000Z
tags: []
category:
  - 其它
cover: /img/BB1msG0V.jpg
---

# 用hexo框架搭建个人博客网站过程记录

## 一、环境准备
### 1. 安装Node.js

安装[node.js](https://nodejs.org/en/download/)

安装完成后，打开命令行工具，输入以下命令，检查是否安装成功：

```
node -v
```

如果输出了Node.js的版本号，说明安装成功。

### 2. 安装Git
安装[Git](https://git-scm.com/downloads)

安装完成后，打开命令行工具，输入以下命令，检查是否安装成功：

```
git --version
```

如果输出了Git的版本号，说明安装成功。

### 3. 安装Hexo

在命令行中输入以下命令：

```
npm install -g hexo-cli
```

安装完成后，输入以下命令，检查是否安装成功：

```
hexo -v
```

如果输出了Hexo的版本号，说明安装成功。

## 二、 创建Hexo博客网站

### 1.创建存放博客的目录,并初始化
```
hexo init myblog
cd myblog
npm install
```

### 2. 启动Hexo服务器
```
hexo clean
# 清除缓存
hexo g
# 生成静态文件
hexo s
# 启动本地服务器
```

在浏览器中输入`http://localhost:4000`，即可看到博客网站。

## 三、更换主题

### 1. 安装主题

可到[hexo主题官网](https://hexo.io/themes/)选择自己喜欢的主题。我选择的是[hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly)

可以选择在GitHub上clone主题到themes文件夹下，也可以使用npm安装：
```
npm install hexo-theme-butterfly --save
```

### 2. 配置主题

在博客根目录下的`_config.yml`文件中，找到`theme`字段，将其值改为`butterfly`。
然后在根目录下创建一个_config.butterfly.yml文件，将主题的配置文件复制到该文件中。以后对主题的配置都将在该文件进行，好处是可以不用修改主题目录下的yml文件。

其他诸如修改头像，网页名称等操作，可以参考[hexo-theme-butterfly官方文档](https://butterfly.js.org/posts/21cfbf15/#%E5%AE%89%E8%A3%85)

### 3. 重新启动服务器

```
hexo clean
hexo g
hexo s
```

## 四、发布自己的第一篇博客

### 1. 创建新文章

在命令行中输入以下命令：

```
hexo new "文章标题"
```
之后hexo会在`source/_posts`目录下创建一个`文章标题.md`的文件，用vscode（或其他编辑器）打开该文件，即可开始编写博客。

## 五、部署到GitHub

### 1. 在GitHub上创建一个仓库

仓库名称必须为`用户名.github.io`，例如我的用户名为`BlueOcean223`，那么仓库名称就必须为`BlueOcean223.github.io`。

### 2. 配置GitHub
在博客根目录下的`_config.yml`文件中，找到`deploy`字段，将其值改为：
```
deploy:
  type: git
  repo: https://github.com/用户名/用户名.github.io.git
  branch: main
```

### 3. 安装hexo-deployer-git插件
```
npm install hexo-deployer-git --save
```

### 4. 部署到GitHub
```
hexo clean
hexo g
hexo d
```
如果显示不知道你是谁，那么需要配置你的邮箱和用户名
在`.deploy_git`文件夹下的`.git`文件中，找到`config`文件，添加以下内容：
```
[user]
    name = "用户名"
    email = "邮箱"
```

### 5. 访问博客
在浏览器中输入`用户名.github.io`即可访问自己的博客。由于GitHub服务器在国外，访问速度可能会比较慢。后续博客网站的更新也可能会需要加载一会才能看到更改效果

## 六、hexo常用命令

```
hexo clean
# 清除缓存文件 db.json 和已生成的静态文件 public
hexo g
# 生成静态文件
hexo s
# 启动本地服务器
hexo d
# 推送到GitHub
hexo new "文章标题"
# 创建新文章
hexo new page "页面名称"
# 创建新页面
```

## 七、我在搭建博客时遇到的问题

### 1.使用npm下载主题时，没有自动放在themes文件夹下
解决方法：在`node_modules`文件夹下找到主题文件夹，将其复制到`themes`文件夹下

### 2.制作音乐播放器时，html无法解码音乐播放器
本博客网站在Music页面使用的音乐播放器是`aplayer`。后来查询butterfly主题的文档，发现是主题的配置文件中，需要将`aplayer`的值改为`true`，即可使用音乐播放器

### 3.音乐播放器无法播放音乐
最开始时，打算本地上传flac文件，由于文件太大，不能直接上传。然后打算用`git fls`上传，但是依旧因为文件太大，不能上传。此时放弃了本地上传的想法。

然后打算上传到云，使用url的形式播放。尝试过上传到`谷歌云`和微软的`onedrive`，但是两个url都无法正常使用。（未尝试国内的腾讯云和谷歌云）

最后还是采用了转换成mp3文件，降了大小，本地上传的方式。

### 4.图片无法正常显示
目前图片都是采用本地上传的方式，还没有采用云。本博客的图片资源都放在`source/img`文件夹下。图片不能正常显示的原因是，最开始时，图片的路径写的是`/source/img/`图片名，导致图片无法正常显示。后来改为`/img/`图片名，图片就可以正常显示了。

原因：上传到github后，本地图片会被加载到`img`文件夹下，所以含有`source`前缀的路径无法找到图片。

