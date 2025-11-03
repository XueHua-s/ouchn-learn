/**
 * 等待DOM稳定
 */
async function waitForDOMStable(timeout = 2000): Promise<void> {
  return new Promise((resolve) => {
    let timeoutId: number;
    const observer = new MutationObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        observer.disconnect();
        resolve();
      }, 500);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // 设置最大等待时间
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeout);
  });
}

/**
 * 展开所有树形菜单
 */
async function expandAllTrees(statusCallback?: (message: string) => void): Promise<void> {
  statusCallback?.('正在展开所有菜单...');

  // 需要递归展开，因为展开父菜单后可能会出现新的子菜单
  let expanded = 0;
  let round = 0;
  const maxRounds = 10; // 防止无限循环

  while (round < maxRounds) {
    round++;

    // 查找所有折叠的子菜单（箭头为rotate(180deg)的是已展开，没有rotate或rotate(0deg)的是折叠的）
    const collapsedMenus = $('.full-screen-mode-sidebar-sub-menu-title svg')
      .filter(function () {
        const style = $(this).attr('style') || '';
        // 已展开的箭头包含 rotate(180deg)，未展开的不包含
        return !style.includes('rotate(180deg)');
      })
      .parent();

    if (collapsedMenus.length === 0) {
      break;
    }

    console.log(`[保存资源] 第 ${round} 轮，找到 ${collapsedMenus.length} 个折叠的菜单`);

    for (let i = 0; i < collapsedMenus.length; i++) {
      const menu = collapsedMenus[i];
      statusCallback?.(`展开菜单... (已展开 ${expanded + i + 1} 个)`);

      $(menu).trigger('click');
      await waitForDOMStable(800);
    }

    expanded += collapsedMenus.length;
  }

  statusCallback?.(`所有菜单已展开 (共 ${expanded} 个)`);
  console.log(`[保存资源] 所有菜单已展开 (共 ${expanded} 个)`);
}

/**
 * 获取所有学习资源项
 */
function getAllResourceItems(): Array<{
  element: HTMLElement;
  type: 'video' | 'document' | 'unknown';
  title: string;
}> {
  const items: Array<{
    element: HTMLElement;
    type: 'video' | 'document' | 'unknown';
    title: string;
  }> = [];

  $('.full-screen-mode-sidebar-menu-item').each((_, item) => {
    const $item = $(item);
    const icon = $item.find('i.activity-type-icon');
    const titleElement = $item.find('.text-too-long');
    const title = titleElement.text().trim();

    let type: 'video' | 'document' | 'unknown' = 'unknown';
    if (icon.hasClass('font-syllabus-online-video')) {
      type = 'video';
    } else if (icon.hasClass('font-syllabus-page')) {
      type = 'document';
    }

    if (type !== 'unknown') {
      items.push({
        element: item,
        type,
        title,
      });
    }
  });

  return items;
}

/**
 * 获取当前页面的文件名
 */
function getCurrentFileName(): string {
  // 从 span.title.ng-binding 元素中获取文件名
  const titleElement = document.querySelector('span.title.ng-binding');
  if (titleElement) {
    const title = titleElement.textContent?.trim() || '';
    if (title) {
      // 清理文件名中的非法字符
      return title.replace(/[<>:"/\\|?*]/g, '_');
    }
  }
  return 'video';
}

/**
 * 下载文件并保存
 * @param url 下载地址
 * @param filename 文件名（可能不包含扩展名）
 * @param ensureExtension 是否需要从响应头确保扩展名
 */
async function downloadFile(url: string, filename: string, ensureExtension = false): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载失败: ${response.statusText}`);
  }

  let finalFilename = filename;

  // 如果需要确保扩展名，从 Content-Type 获取
  if (ensureExtension && !filename.includes('.')) {
    const contentType = response.headers.get('content-type');
    if (contentType) {
      const mimeToExt: Record<string, string> = {
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/ogg': 'ogg',
        'video/quicktime': 'mov',
        'video/x-msvideo': 'avi',
        'video/x-flv': 'flv',
        'video/x-matroska': 'mkv',
        'application/x-mpegURL': 'm3u8',
        'application/vnd.apple.mpegurl': 'm3u8',
      };

      const ext = mimeToExt[contentType.split(';')[0].trim()];
      if (ext) {
        finalFilename = `${filename}.${ext}`;
      } else {
        // 默认使用 mp4
        finalFilename = `${filename}.mp4`;
      }
    }
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  // 创建隐藏的下载链接
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = finalFilename;
  link.style.display = 'none';
  document.body.appendChild(link);

  // 触发下载
  link.click();

  // 清理
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

/**
 * 获取视频文件扩展名
 */
function getVideoExtension(videoSrc: string, videoElement: HTMLVideoElement): string {
  // 尝试从 URL 中提取扩展名
  const urlPath = videoSrc.split('?')[0]; // 去除查询参数
  const urlParts = urlPath.split('.');

  if (urlParts.length > 1) {
    const ext = urlParts[urlParts.length - 1].toLowerCase();
    // 验证是否是常见的视频扩展名
    const validExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'flv', 'mkv', 'm3u8'];
    if (validExtensions.includes(ext)) {
      return ext;
    }
  }

  // 尝试从 source 子元素的 type 属性获取
  const sourceElement = videoElement.querySelector('source');
  if (sourceElement && sourceElement.type) {
    const typeMatch = sourceElement.type.match(/video\/(\w+)/);
    if (typeMatch && typeMatch[1]) {
      return typeMatch[1];
    }
  }

  // 默认返回 mp4
  return 'mp4';
}

/**
 * 保存视频资源
 */
async function saveVideoResource(title: string, statusCallback?: (message: string) => void): Promise<boolean> {
  statusCallback?.(`正在查找视频资源...`);

  // 等待视频元素加载
  await waitForDOMStable(2000);

  const videoElement = document.querySelector('video') as HTMLVideoElement;
  if (!videoElement || !videoElement.src) {
    console.warn(`[保存资源] 未找到视频元素: ${title}`);
    statusCallback?.(`⚠️ 未找到视频: ${title}`);
    return false;
  }

  const videoSrc = videoElement.src;
  const fullUrl = videoSrc.startsWith('http') ? videoSrc : `${window.location.origin}${videoSrc}`;

  // 获取文件名
  const fileName = getCurrentFileName();

  // 尝试从 URL 获取扩展名
  const videoExtension = getVideoExtension(videoSrc, videoElement);
  const hasValidExtension = videoExtension !== 'mp4' || videoSrc.toLowerCase().includes('.mp4');

  // 如果 URL 有有效的扩展名，直接使用；否则让 downloadFile 从响应头获取
  const fullFileName = hasValidExtension ? `${fileName}.${videoExtension}` : fileName;

  statusCallback?.(`正在下载视频: ${fileName}`);
  console.log(`[保存资源] 下载视频: ${fileName} - ${fullUrl}`);

  try {
    // 如果文件名没有扩展名，让 downloadFile 从 Content-Type 获取
    await downloadFile(fullUrl, fullFileName, !hasValidExtension);
    statusCallback?.(`✅ 已保存视频: ${fileName}`);
    return true;
  } catch (error) {
    console.error(`[保存资源] 下载视频失败: ${fileName}`, error);
    statusCallback?.(`❌ 下载视频失败: ${fileName}`);
    return false;
  }
}

/**
 * 保存文档资源（转换为PDF）
 */
async function saveDocumentResource(title: string, statusCallback?: (message: string) => void): Promise<boolean> {
  statusCallback?.(`正在查找文档内容...`);

  // 等待内容加载
  await waitForDOMStable(2000);

  const pageDetail = document.querySelector('.page-detail');
  if (!pageDetail) {
    console.warn(`[保存资源] 未找到文档内容: ${title}`);
    statusCallback?.(`⚠️ 未找到文档内容: ${title}`);
    return false;
  }

  // 获取文件名
  const fileName = getCurrentFileName();

  statusCallback?.(`正在生成PDF: ${fileName}`);
  console.log(`[保存资源] 生成PDF: ${fileName}`);

  try {
    // 检查预加载的库是否可用
    const jsPDF = (window as any).jspdf?.jsPDF;
    const html2canvas = (window as any).html2canvas;

    if (!jsPDF || !html2canvas) {
      throw new Error('PDF生成库未加载，请刷新页面重试');
    }

    statusCallback?.(`正在生成PDF文件: ${fileName}`);

    // 使用 html2canvas 将 HTML 转为图片
    const canvas = await html2canvas(pageDetail as HTMLElement, {
      scale: 2,
      useCORS: true,
      logging: false,
    });

    // 获取图片数据
    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    const imgWidth = 210; // A4 宽度（mm）
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // 创建 PDF
    const pdf = new jsPDF('p', 'mm', 'a4');
    let heightLeft = imgHeight;
    let position = 0;

    // 添加第一页
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= 297; // A4 高度

    // 如果内容超过一页，添加更多页
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= 297;
    }

    // 保存 PDF
    pdf.save(`${fileName}.pdf`);

    statusCallback?.(`✅ 已保存文档: ${fileName}`);
    return true;
  } catch (error) {
    console.error(`[保存资源] 生成PDF失败: ${fileName}`, error);
    statusCallback?.(`❌ 生成PDF失败: ${fileName} - ${error}`);
    return false;
  }
}

/**
 * 处理单个资源项
 */
async function processResourceItem(
  item: {
    element: HTMLElement;
    type: 'video' | 'document' | 'unknown';
    title: string;
  },
  statusCallback?: (message: string) => void,
): Promise<boolean> {
  console.log(`[保存资源] 处理资源: ${item.title} (${item.type})`);
  statusCallback?.(`正在处理: ${item.title}`);

  // 点击资源项
  $(item.element).trigger('click');

  // 等待页面切换和内容加载
  await waitForDOMStable(2000);

  // 根据类型保存资源
  if (item.type === 'video') {
    return await saveVideoResource(item.title, statusCallback);
  } else if (item.type === 'document') {
    return await saveDocumentResource(item.title, statusCallback);
  }

  return false;
}

/**
 * 启动保存所有资源的流程
 */
export async function startSaveAllResources(): Promise<void> {
  const statusElement = $('#save-all-status');
  const button = $('#save-all-resources-btn');

  // 更新状态显示
  const updateStatus = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    statusElement.show();
    statusElement.removeClass('download-status-info download-status-success download-status-error');
    statusElement.addClass(`download-status-${type}`);
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
      updateStatus('未找到可保存的资源', 'error');
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
    updateStatus(summary, successCount > 0 ? 'success' : 'error');
  } catch (error) {
    console.error('[保存资源] 执行出错:', error);
    updateStatus(`执行出错: ${error}`, 'error');
  } finally {
    button.prop('disabled', false);
  }
}
