---
title: vue+vite迁移electron-vite
pubDate: 2025-07-14T13:01:00.000Z
tags: []
---

## 前言
最近博主正在尝试将之前开发的vue项目迁移到electron-vite，提供desktop端。写下该博客记录一下过程。同时希望能帮助到有同样需要的人。

## Electron-vite
Electron-Vite 是一个基于 Vite 的构建工具，专为 Electron 应用开发设计，旨在提供高效的开发体验和优化的生产构建。它将 Vite 的快速开发能力与 Electron 的桌面应用框架结合，简化了 Electron 项目的配置和构建流程。

官方文档：https://cn.electron-vite.org/guide/introduction

### 安装必要依赖
```bash
npm install electron electron-vite -D
```

由于npm下载速度缓慢。可以考虑使用代理或设置国内镜像来加速下载
```bash
# 设置国内镜像
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
```

### 修改目录结构

Electron-vite项目开发约定俗成的开发目录如下
```diff
.
├──src
│  ├──main
│  │  ├──index.ts
│  │  └──...
│  ├──preload
│  │  ├──index.ts
│  │  └──...
│  └──renderer    # with vue, react, etc.
│     ├──src
│     ├──index.html
│     └──...
├──electron.vite.config.ts
├──package.json
└──...
```
因此需要将原来的项目目录结构进行修改，将原本的`src`目录迁移至`src/renderer`目录下。原来的`App.vue`,`main.js`,`index.html`等文件也需要移动至`src/renderer`目录下。

迁移文件时，记得确认`index.html`文件中指向`main.js`的路径是否正确
```html
<!doctype html>
<html lang="en">
  <head>
    ....
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.js"></script>
  </body>
</html>
```

此外还需要添加`electron.vite.config.js`文件，用于配置electron-vite。
```js
import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.js')
        }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          preload: resolve(__dirname, 'src/preload/index.js')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
        alias: {
            '@': resolve(__dirname,'src/renderer') // 设置别名
        }
    },
    plugins: [vue()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
})
```

主进程文件 `src/main/index.js`
```js
import { app, BrowserWindow } from 'electron'
import path from 'path'

const iconPath = path.join(__dirname, '../../resources/icon.png');

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js')
    },
    icon: iconPath // 设置图标
  })

  // 开发环境加载 Vite 开发服务器
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173') // 端口与 Vite 开发服务器一致
    win.webContents.openDevTools()
  } else {
    // 生产环境加载打包后的文件
    win.loadFile(path.join(__dirname, '../../out/renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```


通常将静态资源放在`resources`目录下，或者保持原来的`public`目录。
```diff
.
├──resources
├──src
├──electron.vite.config.ts
├──package.json
└──...
```


预加载脚本 `src/preload/index.js`
```js
import { contextBridge } from 'electron'

// 安全暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 示例方法
  platform: process.platform
})
```

更新`package.json`文件
```json
{
  "name": "your-app",
  "version": "1.0.0",
  "main": "./out/main/index.js", // 指向打包后的主进程
  "description": "",
  "author": "your-name",
  "scripts": {
    "dev": "electron-vite dev", // 开发模式
    "build": "electron-vite build", // 生产构建
    "preview": "electron-vite preview" // 预览生产包
  }
}
```

补充说明：
- `electron-vite` 运行时会默认生成一个`out`目录，通常含有`main`和`preload`目录，存放主进程与预加载脚本。运行`build`后还会产生`renderer`目录。用于存放打包后的渲染脚本（相当于原本的`dist`目录）。
- `"description"`,`"author"`等字段是后面打包成app端所必须的字段

目录结构大致如下
```diff
.
├──out
├──resources
├──src
├──electron.vite.config.ts
├──package.json
└──...
```

至此，整个迁移过程结束，可以运行`npm run dev`启动项目，查看是否迁移成功

## Electron-builder
正如前言所说，本次迁移是为了能够创建桌面端应用，因此还需要将`electron-vite`项目打包。但是`electron-vite`本身并不能提供安装包形式的打包。其本身的打包只能将项目打包为静态文件。

因此还需要借助额外的打包工具来完成打包。常见的工具有`electron-builder`,`electron-forge`等。本文采用`electron-builder`来进行打包。

安装依赖
```bash
npm install electron-builder --save-dev
```

修改`package.json`文件
```json
{
  "name": "your-app",
  "version": "1.0.0",
  "description": "Your app description",
  "main": "main.js",
  "author": "Your Name <your@email.com>",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "pack": "electron-builder --dir",
    "build:app": "electron-vite build && electron-builder"
  },
  "build": {
    "appId": "com.example.yourapp",
    "productName": "Your App",
    "copyright": "Copyright © 2023 ${author}",
    "directories": {
      "output": "dist"
    },
    "files": [
      "**/*",
      "!node_modules/{@electron-forge,electron-forge*}"
    ],
    "asar": true,
    "win": {
      "target": ["nsis", "portable"],
      "icon": "build/icon.ico"
    },
    "mac": {
      "category": "public.app-category.utilities",
      "target": ["dmg", "zip"],
      "icon": "build/icon.icns"
    },
    "linux": {
      "target": ["AppImage", "deb"],
      "icon": "build/icon.png"
    }
  }
}
```

接下来可以运行`npm run pack`来进行打包测试，该命令不会生成安装包。

或者直接运行`npm run build:app`进行打包。


### 打包过程中可能遇到的问题
在打包过程中，可能会遇到一些问题。例如无法构建链接或无法访问GitHub等。

#### 无法构建链接
错误信息：`ERROR: Cannot create symbolic link `
该问题可以通过禁用符号链接解决。在`package.json`文件的`build`字段中做如下修改
```json
"build": {
  "win": {
    "requestedExecutionLevel": "asInvoker",
    "asar": true
  }
}
```

#### 无法访问GitHub
运行`electron-builder`时，主要是需要从Github中下载`nsis`和`winCodesign`等模块。可能由于网络原因导致无法访问Github，导致下载失败。

错误信息：
```
 Get "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z": 
 read tcp 192.168.1.13:51887->20.205.243.166:443: wsarecv: 
 A connection attempt failed because the connected party did not properly respond after a period of time, 
 or established connection failed because connected host has failed to respond.
 ```

该问题可以通过设置网络代理来解决。也可以手动下载需要的模块,然后放置到指定目录`C:\user\AppData\Local\electron-builder\Cache`中即可。目录结构如下
```diff
├──nsis
    ├──nsis-3.0.4.1
    ├──nsis-resources-3.4.1
├──winCodeSign
    ├──winCodeSign-2.6.0
```
需要注意下载的版本要与打包需要的版本一致。具体可在打包报错时查看。以及下载链接也可以在打包错误信息中获取。例如上面错误信息中的
```
"https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"
```

设置代理
```bash
npm config set proxy http://your-proxy:port
npm config set https-proxy http://your-proxy:port
```
