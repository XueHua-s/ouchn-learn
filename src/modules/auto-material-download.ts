import { waitForPageReady } from '@/utils/dom';

interface MaterialActivity {
  element: HTMLElement;
  title: string;
  viewFileButton: HTMLElement | null;
}

interface DownloadLink {
  element: HTMLElement;
  fileName: string;
  url: string;
}

/**
 * 查找所有参考资料活动（完成指标：观看或下载所有参考资料附件）
 */
function findMaterialActivities(): MaterialActivity[] {
  console.log('[批量下载] 开始查找参考资料活动...');

  const activities: MaterialActivity[] = [];

  // 查找所有可点击的活动区域
  const clickableAreas = document.querySelectorAll<HTMLElement>('div.clickable-area[ng-click*="openActivity"]');

  console.log(`[批量下载] 找到 ${clickableAreas.length} 个可点击活动`);

  clickableAreas.forEach((area, index) => {
    // 检查是否包含参考资料活动
    const activitySummary = area.querySelector('.activity-summary[ng-switch-when="material"]');
    if (!activitySummary) {
      return;
    }

    // 检查完成指标提示
    const completenessBar = area.querySelector('activity-completeness-bar');
    if (!completenessBar) {
      return;
    }

    // 获取tooltip内容来验证是否是参考资料
    const tooltipContent = completenessBar.querySelector('.ivu-tooltip-inner');
    const tooltipText = tooltipContent?.textContent || '';

    if (
      !tooltipText.includes('完成指标：观看或下载所有参考资料附件') &&
      !tooltipText.includes('完成指标') &&
      !activitySummary.textContent?.includes('参考资料')
    ) {
      return;
    }

    // 获取活动标题
    const titleElement = area.querySelector('.activity-title .title');
    const title = titleElement?.textContent?.trim() || `参考资料 ${index + 1}`;

    // 查找"查看文件"按钮
    const viewFileButton = area.querySelector<HTMLElement>('.expand-collapse-attachments[expandable-content-new]');

    activities.push({
      element: area,
      title,
      viewFileButton,
    });

    console.log(`[批量下载] 找到参考资料: ${title}`);
  });

  console.log(`[批量下载] 共找到 ${activities.length} 个参考资料活动`);
  return activities;
}

/**
 * 展开并获取下载链接
 */
async function expandAndGetDownloadLinks(activity: MaterialActivity): Promise<DownloadLink[]> {
  const { element, viewFileButton, title } = activity;

  console.log(`[批量下载] 正在展开: ${title}`);

  // 如果有"查看文件"按钮，点击展开
  if (viewFileButton) {
    const expandableId = viewFileButton.getAttribute('expandable-content-new');
    const attachmentsDiv = element.querySelector<HTMLElement>(`.attachments-${expandableId?.split('-')[1]}`);

    // 检查是否已经展开
    if (attachmentsDiv && attachmentsDiv.style.display === 'none') {
      console.log(`[批量下载] 点击"查看文件"按钮...`);
      viewFileButton.click();

      // 等待展开动画
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // 查找所有下载链接
  const downloadLinks: DownloadLink[] = [];
  const downloadElements = element.querySelectorAll<HTMLElement>('a[ng-href*="/api/uploads/"][tipsy-literal="下载"]');

  console.log(`[批量下载] 找到 ${downloadElements.length} 个下载链接`);

  downloadElements.forEach((link) => {
    const url = link.getAttribute('ng-href') || link.getAttribute('href');
    if (!url) {
      return;
    }

    // 获取文件名
    const uploadRow = link.closest('.attachment-row');
    const fileNameElement = uploadRow?.querySelector('.file-name');
    const fileExtElement = uploadRow?.querySelector('.file-extension');

    const fileName = fileNameElement?.textContent?.trim() || '';
    const fileExt = fileExtElement?.textContent?.trim() || '';
    const fullFileName = `${fileName}${fileExt}`;

    downloadLinks.push({
      element: link,
      fileName: fullFileName,
      url: url.startsWith('/') ? `${window.location.origin}${url}` : url,
    });

    console.log(`[批量下载] 找到文件: ${fullFileName}`);
  });

  return downloadLinks;
}

/**
 * 下载单个文件
 */
async function downloadFile(link: DownloadLink, delay: number): Promise<void> {
  console.log(`[批量下载] 正在下载: ${link.fileName}`);

  // 点击下载按钮
  link.element.click();

  // 等待指定的延迟时间
  await new Promise((resolve) => setTimeout(resolve, delay * 1000));
}

/**
 * 收集单个参考资料活动的文件信息
 */
async function collectMaterialFiles(activity: MaterialActivity): Promise<DownloadLink[]> {
  const { title } = activity;

  console.log(`[批量下载] ========== 开始收集: ${title} ==========`);

  try {
    // 展开并获取下载链接
    const downloadLinks = await expandAndGetDownloadLinks(activity);

    if (downloadLinks.length === 0) {
      console.log(`[批量下载] ${title} 没有可下载的文件`);
    } else {
      console.log(`[批量下载] ${title} 找到 ${downloadLinks.length} 个文件`);
    }

    return downloadLinks;
  } catch (error) {
    console.error(`[批量下载] 收集 ${title} 文件时出错:`, error);
    return [];
  }
}

/**
 * 启动批量下载所有参考资料
 */
export async function startAutoMaterialDownload(): Promise<void> {
  const statusElement = $('#auto-download-status');
  const btn = $('#auto-download-materials-btn');

  function updateStatus(msg: string, type: string): void {
    statusElement.text(msg);
    statusElement.removeClass(
      'download-status-info download-status-success download-status-error download-status-warning',
    );
    statusElement.addClass(`download-status-${type}`);
    statusElement.show();
    console.log(`[批量下载] ${msg}`);
  }

  try {
    btn.prop('disabled', true);
    updateStatus('正在准备...', 'info');

    // 获取文件下载间隔（默认10秒）
    const fileDelay = parseInt($('#material-download-interval').val() as string) || 10;
    console.log(`[批量下载] 文件下载间隔: ${fileDelay}秒`);

    // 等待页面完全加载
    await waitForPageReady(updateStatus);

    // 查找所有参考资料活动
    const activities = findMaterialActivities();

    if (activities.length === 0) {
      updateStatus('未找到参考资料活动', 'warning');
      btn.prop('disabled', false);
      return;
    }

    updateStatus(`找到 ${activities.length} 个参考资料活动，正在收集文件信息...`, 'info');

    // 第一阶段：收集所有文件信息
    const allFiles: DownloadLink[] = [];
    for (let i = 0; i < activities.length; i++) {
      const activity = activities[i];
      updateStatus(`收集文件信息 (${i + 1}/${activities.length}): ${activity.title}`, 'info');

      const files = await collectMaterialFiles(activity);
      allFiles.push(...files);

      // 在活动之间稍作等待
      if (i < activities.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (allFiles.length === 0) {
      updateStatus('没有找到可下载的文件', 'warning');
      btn.prop('disabled', false);
      return;
    }

    console.log(`[批量下载] 共找到 ${allFiles.length} 个文件，开始下载...`);
    updateStatus(`准备下载 ${allFiles.length} 个文件...`, 'info');

    // 第二阶段：逐个下载所有文件
    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      updateStatus(`下载中 ${i + 1}/${allFiles.length}: ${file.fileName}`, 'info');
      await downloadFile(file, fileDelay);
    }

    updateStatus(`✅ 批量下载完成！共下载 ${allFiles.length} 个文件`, 'success');
    console.log(`[批量下载] ========== 全部完成，共下载 ${allFiles.length} 个文件 ==========`);
  } catch (error) {
    console.error('[批量下载] 执行失败:', error);
    updateStatus(`❌ 执行失败: ${error}`, 'error');
  } finally {
    btn.prop('disabled', false);
  }
}
