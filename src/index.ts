import { injectStyles } from './modules/styles';
import { initLegacyHangEvents, startAutoButtonScanning } from './modules/legacy-hang';
import { mountOuchnRenderer } from './renderer/mount';

/**
 * 主入口函数
 */
(function main() {
  'use strict';

  console.log('========================================');
  console.log('国开学习脚本已加载');
  console.log('版本: 1.0.2');
  console.log('当前URL:', window.location.href);
  console.log('========================================');

  // 注入样式
  injectStyles();

  // 初始化原有挂机功能
  initLegacyHangEvents();
  startAutoButtonScanning();

  // 初始化 React 渲染面板
  setTimeout(() => {
    mountOuchnRenderer();
    console.log('[React渲染] 面板渲染器已加载');
  }, 1000);
})();
