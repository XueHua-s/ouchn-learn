import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['iife'],
  clean: true,
  minify: false,
  sourcemap: false,
  noExternal: [/.*/],
  banner: {
    js: `// ==UserScript==
// @name         国家开放大学视频一键挂机脚本+资源下载+AI答题
// @namespace    http://tampermonkey.net/
// @version      2024-12-19
// @description  国家开放大学视频一键挂机脚本，新增课件/视频一键下载功能，新增AI自动答题功能
// @author       OrangeMinus + Enhanced
// @match        https://lms.ouchn.cn/course/**
// @match        https://lms.ouchn.cn/exam/*/subjects*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ouchn.cn
// @require      https://cdn.bootcss.com/jquery/3.4.1/jquery.min.js
// @require      https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==`,
  },
});
