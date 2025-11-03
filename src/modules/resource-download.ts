import type { Resource } from '@/types';

/**
 * 下载单个资源
 */
export function downloadResource(resource: Resource): void {
  console.log('[资源下载] 开始下载:', resource);

  if (typeof GM_download !== 'undefined') {
    GM_download({
      url: resource.url,
      name: resource.name,
      onload: function () {
        console.log(`[资源下载] 下载成功: ${resource.name}`);
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
  console.log(`[资源下载] 已触发下载: ${filename}`);
}
