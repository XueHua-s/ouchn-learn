import { injectStyles } from './modules/styles';
import { createDownloadPanel } from './modules/panel';
import { checkAndResumeAutoView } from './modules/auto-view';
import { initLegacyHangEvents, startAutoButtonScanning } from './modules/legacy-hang';
import { initAutoExam, isExamPage } from './modules/auto-exam';
import { enableHomeworkCopyPaste } from './modules/enable-paste';

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

  // 作业富文本允许复制粘贴
  enableHomeworkCopyPaste();

  // 初始化AI自动答题功能
  console.log('[主入口] 准备初始化AI答题功能...');
  try {
    initAutoExam();
    console.log('[主入口] initAutoExam() 调用成功');
  } catch (error) {
    console.error('[主入口] initAutoExam() 调用失败:', error);
  }

  // 只在非考试页面显示资源下载面板
  if (!isExamPage()) {
    setTimeout(() => {
      createDownloadPanel();
      console.log('[资源下载] 下载面板已加载');

      // 检查是否需要恢复自动查看任务
      setTimeout(() => {
        checkAndResumeAutoView();
      }, 500);
    }, 1000);
  } else {
    console.log('[主入口] 考试页面，跳过资源下载面板初始化');
  }
})();
