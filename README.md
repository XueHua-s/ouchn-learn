# vite-crx-template

> fork from: [vite-crx-template](https://github.com/Tinsson/vite-crx-template)

note: 因为contentScript里的内容使用shadow-dom注入到body，naive-ui的样式可能不正常，可以用回element-plus，也可以不用shadow-dom，看注释进行修改，要注意不用shadow-dom可能导致和原有页面样式发生冲突。

## 简介

简单好用的chrome插件开发模板

## Features

- 🚀 支持V3版本的manifest
- 🖥 支持background,contentScript,popup的热更新
- 📦 vite + vue3 + elementplus

## 开发

拉取代码后

```bash
pnpm i
pnpm dev
```

开发环境，调试用的结果代码放在根目录 `local` 文件夹下

## 发布打包

拉取代码后

```bash
pnpm build
```

生成环境，代码放在根目录 `extension` 文件夹下

## 入群交流

![图片描述](https://raw.githubusercontent.com/MatrixCross/React-Crx-Starter/master/src/assets/20240703225505.jpg)
