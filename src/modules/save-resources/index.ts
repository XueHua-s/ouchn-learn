/**
 * 批量保存资源 - 主编排入口
 */

import { expandAllTrees, getAllResourceItems } from './tree-scanner';
import { processResourceItem } from './resource-saver';

/**
 * 启动保存所有资源的流程
 */
export async function startSaveAllResources(): Promise<void> {
  const statusElement = $('#save-all-status');
  const button = $('#save-all-resources-btn');

  // 更新状态显示
  const updateStatus = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    statusElement.show();
    statusElement.removeClass('ouchn-status-info ouchn-status-success ouchn-status-warning');
    statusElement.addClass(`ouchn-status-${type}`);
    statusElement.text(message);
  };

  try {
    button.prop('disabled', true);
    updateStatus('开始保存资源...');

    // 步骤1: 展开所有树形菜单
    console.log('[保存资源] 步骤1: 展开所有树形菜单');
    await expandAllTrees(updateStatus);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 步骤2: 获取所有资源项
    console.log('[保存资源] 步骤2: 获取所有资源项');
    updateStatus('正在扫描资源项...');
    const items = getAllResourceItems();
    console.log(`[保存资源] 找到 ${items.length} 个资源项`, items);

    if (items.length === 0) {
      updateStatus('未找到可保存的资源', 'warning');
      button.prop('disabled', false);
      return;
    }

    updateStatus(`找到 ${items.length} 个资源，开始保存...`);

    // 步骤3: 逐个处理资源项
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      updateStatus(`[${i + 1}/${items.length}] 正在保存: ${item.title}`);

      const success = await processResourceItem(item, (msg) => {
        updateStatus(`[${i + 1}/${items.length}] ${msg}`);
      });

      if (success) {
        successCount++;
      } else {
        failCount++;
      }

      // 等待一段时间再处理下一个资源
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // 完成
    const summary = `保存完成！成功: ${successCount}, 失败: ${failCount}`;
    console.log(`[保存资源] ${summary}`);
    updateStatus(summary, successCount > 0 ? 'success' : 'warning');
  } catch (error) {
    console.error('[保存资源] 执行出错:', error);
    updateStatus(`执行出错: ${error}`, 'warning');
  } finally {
    button.prop('disabled', false);
  }
}
