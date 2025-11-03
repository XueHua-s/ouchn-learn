import type { Resource } from '@/types';
import { getCourseConfig, saveCourseConfig } from '@/utils/storage';

/**
 * 下载单个资源
 */
export function downloadResource(resource: Resource): void {
  const config = getCourseConfig();
  const prefix = config.coursePrefix ? `${config.coursePrefix}_` : '';
  const finalFileName = `${prefix}${resource.name}`;

  console.log('[资源下载] 开始下载:', resource);

  if (typeof GM_download !== 'undefined') {
    GM_download({
      url: resource.url,
      name: finalFileName,
      onload: function () {
        console.log(`[资源下载] 下载成功: ${finalFileName}`);
      },
      onerror: function (error) {
        console.error('[资源下载] 下载失败:', error);
        fallbackDownload(resource.url, finalFileName);
      },
    });
  } else {
    fallbackDownload(resource.url, finalFileName);
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

/**
 * 更新课程名称前缀
 */
export function updateCoursePrefix(prefix: string): void {
  const config = getCourseConfig();
  config.coursePrefix = prefix;
  saveCourseConfig(config);
  console.log(`[资源下载] 课程前缀已更新: ${prefix || '(无)'}`);
}
