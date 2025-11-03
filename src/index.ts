import { injectStyles } from './modules/styles';
import { createDownloadPanel } from './modules/panel';
import { checkAndResumeAutoView } from './modules/auto-view';
import { initLegacyHangEvents, startAutoButtonScanning } from './modules/legacy-hang';

/**
 * 主入口函数
 */
(function main() {
  'use strict';

  // 注入样式
  injectStyles();

  // 初始化原有挂机功能
  initLegacyHangEvents();
  startAutoButtonScanning();

  // 延迟初始化下载面板
  setTimeout(() => {
    createDownloadPanel();
    console.log('[资源下载] 下载面板已加载');

    // 检查是否需要恢复自动查看任务
    setTimeout(() => {
      checkAndResumeAutoView();
    }, 500);
  }, 1000);
})();
