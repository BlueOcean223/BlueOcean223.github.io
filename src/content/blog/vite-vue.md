---
title: vite+vue
pubDate: 2025-05-26T21:26:04.000Z
tags: []
---

### 前言
博主在之前的前端开发中，甚至最近的一个项目，用的都是webpack+vue。webpack的运行速度很慢，因为它启动服务前要打包所有的依赖。

博主饱受webpack的运行速度慢的痛苦，往往是后端早早启动了，前端还在缓慢打包。

直到不久前博主在逛别人的项目的前端时，看到了`vite.config.js`这个配置文件，感到非常的新奇，搜索之后得知了vite。并且尝试将项目从webpack转到vite。转到vite之后就好像打开了一个新世界，启动速度非常非常之快，常常前端开的比后端还快。而且vite还支持高效的热更新，非常的舒服。


### Vite
`Vite`是一个现代化的前端构建工具，核心目标是极速的开发启动和高效的热更新。

**核心特点**：

- **开发模式**：基于原生 ES 模块（ESM），浏览器直接加载源码，无需打包，启动时间与项目规模无关。
- **生产模式**：使用 Rollup 进行高效构建（支持代码分割、Tree-shaking 等）。
- **插件体系**：兼容 Rollup 插件生态，扩展性强。
- **支持多框架**：Vue、React、Svelte 等均可使用。



使用vite构建vue项目

```bash
# 使用npm
npm create vite@latest my-vue-app --template vue
# 使用官方脚手架
npm init vue@latest
```

`my-vue-app`是创建的根目录名，可根据需求自行更改



vite.config.js配置

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src') // 设置别名
    },
    // 自动推断
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
  },
  // 开发服务器配置
  server: {
    port: 7070,
    open: true,
    hmr: true // 启用热模块替换
  },
  // 构建配置
  build: {
    outDir: 'dist',
    assetsInlineLimit: 4096, // 小于4kb的资源内联
    rollupOptions: {
      output: {
        manualChunks: {
          // 拆分第三方库
          vue: ['vue', 'vue-router'],
          lodash: ['lodash']
        }
      }
    }
  }
})
```



需要注意一些vite与webpack不同的地方：

- `vite`的`index.html`需要放在根目录下

- Vite默认只暴露以`VITE_`开头的环境变量，并且Vite中使用`import.meta.env`代替`process.env`

```js
// 修改前
const BaseUrl = process.env.VUE_APP_API_URL;
// 修改后
const BaseUrl = import.meta.env.VITE_API_URL;
```



启动服务命令

```bash
npm run dev
```

是时候告别`npm run serve`了[doge]
