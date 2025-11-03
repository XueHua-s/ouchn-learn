import type { Resource } from '@/types';
import { extractFileName } from '@/utils/helper';

let allResources: Resource[] = [];

/**
 * 更新状态信息
 */
export function updateStatus(message: string, type: 'info' | 'success' | 'warning' = 'info'): void {
  $('#download-status')
    .text(message)
    .removeClass('download-status-info download-status-success download-status-warning')
    .addClass(`download-status-${type}`);
  console.log(`[资源下载] ${message}`);
}

/**
 * 扫描资源
 */
export function scanResources(): void {
  updateStatus('正在扫描资源...', 'info');
  allResources = [];

  // 1. 扫描视频资源
  $('video').each(function () {
    const video = $(this);
    const src = video.attr('src') || video.find('source').attr('src');

    if (src && src.startsWith('http')) {
      allResources.push({
        type: 'video',
        icon: '🎬',
        name: extractFileName(src) || '视频文件',
        url: src,
      });
    }
  });

  // 2. 扫描文档资源（PDF、PPT、Word等）
  $('a[href]').each(function () {
    const link = $(this);
    const href = link.attr('href');

    if (href && /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|rar|txt)$/i.test(href)) {
      const fullUrl = href.startsWith('http') ? href : new URL(href, window.location.href).href;
      allResources.push({
        type: 'document',
        icon: '📄',
        name: link.text().trim() || extractFileName(fullUrl),
        url: fullUrl,
      });
    }
  });

  // 3. 扫描音频资源
  $('audio').each(function () {
    const audio = $(this);
    const src = audio.attr('src') || audio.find('source').attr('src');

    if (src && src.startsWith('http')) {
      allResources.push({
        type: 'audio',
        icon: '🎵',
        name: extractFileName(src) || '音频文件',
        url: src,
      });
    }
  });

  // 4. 扫描可能的课件链接
  $('a[href*="resource"], a[href*="courseware"], a[href*="material"]').each(function () {
    const link = $(this);
    const href = link.attr('href');

    if (href && href.startsWith('http')) {
      allResources.push({
        type: 'courseware',
        icon: '📚',
        name: link.text().trim() || '课件资源',
        url: href,
      });
    }
  });

  // 去重
  allResources = allResources.filter(
    (resource, index, self) => index === self.findIndex((r) => r.url === resource.url),
  );

  displayResources();
}

/**
 * 显示资源列表
 */
export function displayResources(): void {
  const listEl = $('#resource-list');
  listEl.empty();

  if (allResources.length === 0) {
    listEl.html('<div style="text-align:center;padding:20px;color:#999;">未找到可下载的资源</div>');
    listEl.show();
    updateStatus('未找到可下载的资源', 'warning');
    $('#download-all-btn').hide();
    return;
  }

  updateStatus(`找到 ${allResources.length} 个资源`, 'success');
  $('#download-all-btn').show();

  allResources.forEach((resource, index) => {
    const item = $(`
      <div class="resource-item">
        <span class="resource-name" title="${resource.name}">
          ${resource.icon} ${resource.name}
        </span>
        <button class="resource-download-btn" data-index="${index}">下载</button>
      </div>
    `);

    item.find('.resource-download-btn').on('click', function () {
      const idx = $(this).data('index') as number;
      downloadResource(allResources[idx]);
    });

    listEl.append(item);
  });

  listEl.show();
}

/**
 * 下载单个资源
 */
export function downloadResource(resource: Resource): void {
  updateStatus(`正在下载: ${resource.name}`, 'info');
  console.log('[资源下载] 开始下载:', resource);

  if (typeof GM_download !== 'undefined') {
    GM_download({
      url: resource.url,
      name: resource.name,
      onload: function () {
        updateStatus(`下载成功: ${resource.name}`, 'success');
      },
      onerror: function (error) {
        console.error('[资源下载] 下载失败:', error);
        fallbackDownload(resource.url, resource.name);
      },
    });
  } else {
    fallbackDownload(resource.url, resource.name);
  }
}

/**
 * 降级下载方案
 */
function fallbackDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  updateStatus(`已触发下载: ${filename}`, 'success');
}

/**
 * 下载全部资源
 */
export function downloadAllResources(): void {
  if (allResources.length === 0) {
    updateStatus('没有可下载的资源', 'warning');
    return;
  }

  updateStatus(`开始批量下载 ${allResources.length} 个资源...`, 'info');

  allResources.forEach((resource, index) => {
    setTimeout(() => {
      downloadResource(resource);
    }, index * 1000);
  });
}
