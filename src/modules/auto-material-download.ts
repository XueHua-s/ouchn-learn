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
 * 处理单个参考资料活动
 */
async function processMaterialActivity(
  activity: MaterialActivity,
  fileDelay: number,
  updateStatus?: (msg: string, type: string) => void,
): Promise<number> {
  const { title } = activity;

  updateStatus?.(`正在处理: ${title}`, 'info');
  console.log(`[批量下载] ========== 开始处理: ${title} ==========`);

  try {
    // 展开并获取下载链接
    const downloadLinks = await expandAndGetDownloadLinks(activity);

    if (downloadLinks.length === 0) {
      console.log(`[批量下载] ${title} 没有可下载的文件`);
      updateStatus?.(`${title}: 没有可下载的文件`, 'warning');
      return 0;
    }

    // 下载所有文件
    for (let i = 0; i < downloadLinks.length; i++) {
      const link = downloadLinks[i];
      updateStatus?.(`${title}: 下载 ${i + 1}/${downloadLinks.length} - ${link.fileName}`, 'info');
      await downloadFile(link, fileDelay);
    }

    console.log(`[批量下载] ${title} 完成，共下载 ${downloadLinks.length} 个文件`);
    updateStatus?.(`${title}: 完成 (${downloadLinks.length} 个文件)`, 'success');

    return downloadLinks.length;
  } catch (error) {
    console.error(`[批量下载] 处理 ${title} 时出错:`, error);
    updateStatus?.(`${title}: 处理失败`, 'error');
    return 0;
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

    updateStatus(`找到 ${activities.length} 个参考资料活动，开始处理...`, 'info');

    let totalFiles = 0;
    let processedCount = 0;

    // 逐个处理每个参考资料活动
    for (const activity of activities) {
      processedCount++;
      updateStatus(`处理中 (${processedCount}/${activities.length}): ${activity.title}`, 'info');

      const fileCount = await processMaterialActivity(activity, fileDelay, updateStatus);
      totalFiles += fileCount;

      // 在活动之间稍作等待
      if (processedCount < activities.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    updateStatus(`✅ 批量下载完成！处理 ${activities.length} 个活动，共下载 ${totalFiles} 个文件`, 'success');
    console.log(`[批量下载] ========== 全部完成 ==========`);
  } catch (error) {
    console.error('[批量下载] 执行失败:', error);
    updateStatus(`❌ 执行失败: ${error}`, 'error');
  } finally {
    btn.prop('disabled', false);
  }
}
