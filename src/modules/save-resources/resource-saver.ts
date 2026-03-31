/**
 * 视频下载与文档转 PDF 保存
 */

import type { ResourceItem } from '@/types';
import { waitForDOMStable } from './tree-scanner';

// ============================================================
// 文件名 / 下载辅助
// ============================================================

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

// ============================================================
// 视频保存
// ============================================================

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

  const fileName = getCurrentFileName();

  const videoExtension = getVideoExtension(videoSrc, videoElement);
  const hasValidExtension = videoExtension !== 'mp4' || videoSrc.toLowerCase().includes('.mp4');

  const fullFileName = hasValidExtension ? `${fileName}.${videoExtension}` : fileName;

  statusCallback?.(`正在下载视频: ${fileName}`);
  console.log(`[保存资源] 下载视频: ${fileName} - ${fullUrl}`);

  try {
    await downloadFile(fullUrl, fullFileName, !hasValidExtension);
    statusCallback?.(`✅ 已保存视频: ${fileName}`);
    return true;
  } catch (error) {
    console.error(`[保存资源] 下载视频失败: ${fileName}`, error);
    statusCallback?.(`❌ 下载视频失败: ${fileName}`);
    return false;
  }
}

// ============================================================
// 文档转 PDF 保存
// ============================================================

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

  const fileName = getCurrentFileName();

  statusCallback?.(`正在生成PDF: ${fileName}`);
  console.log(`[保存资源] 生成PDF: ${fileName}`);

  // 第二次等待：等待文档内容完全渲染（特别是图片）
  statusCallback?.(`正在等待文档内容加载完成...`);
  await waitForDOMStable(1500);

  try {
    const jsPDF = (window as any).jspdf?.jsPDF;
    const html2canvas = (window as any).html2canvas;

    if (!jsPDF || !html2canvas) {
      throw new Error('PDF生成库未加载，请刷新页面重试');
    }

    statusCallback?.(`正在处理图片资源...`);

    // 预处理页面中的图片，为跨域图片添加 crossorigin 属性
    const images = pageDetail.querySelectorAll('img');
    const imagePromises: Promise<void>[] = [];

    images.forEach((img: HTMLImageElement) => {
      if (!img.complete || !img.src) {
        return;
      }

      const isCrossOrigin = img.src.startsWith('http') && !img.src.startsWith(window.location.origin);

      if (isCrossOrigin && !img.crossOrigin) {
        const promise = new Promise<void>((resolve) => {
          const newImg = new Image();
          newImg.crossOrigin = 'anonymous';
          newImg.onload = () => {
            img.crossOrigin = 'anonymous';
            img.src = newImg.src;
            resolve();
          };
          newImg.onerror = () => {
            console.warn(`[保存资源] 跨域图片加载失败: ${img.src}`);
            resolve(); // 即使失败也继续
          };
          newImg.src = img.src;
        });
        imagePromises.push(promise);
      }
    });

    // 等待所有跨域图片处理完成
    if (imagePromises.length > 0) {
      await Promise.all(imagePromises);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    statusCallback?.(`正在生成PDF文件: ${fileName}`);

    // 使用 html2canvas 将 HTML 转为图片
    const canvas = await html2canvas(pageDetail as HTMLElement, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      imageTimeout: 15000,
      onclone: (clonedDoc: Document) => {
        const clonedImages = clonedDoc.querySelectorAll('img');
        clonedImages.forEach((img: HTMLImageElement) => {
          if (img.src.startsWith('http') && !img.src.startsWith(window.location.origin)) {
            img.crossOrigin = 'anonymous';
          }
        });
      },
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

// ============================================================
// 单项处理入口
// ============================================================

/**
 * 处理单个资源项
 */
export async function processResourceItem(
  item: ResourceItem,
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
