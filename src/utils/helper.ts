/**
 * 将时间字符串转换为秒数
 * @param timeString 格式：HH:MM:SS
 * @returns 总秒数
 */
export function timeStringToSeconds(timeString: string): number {
  const parts = timeString.split(':');

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseInt(parts[2], 10);

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * 从字符串中提取最后一个连字符后的数字
 * @param str 输入字符串
 * @returns 提取的数字字符串
 */
export function extractNumber(str: string): string {
  const lastDashIndex = str.lastIndexOf('-');
  return str.substring(lastDashIndex + 1);
}

/**
 * 从URL中提取文件名
 * @param url 资源URL
 * @returns 文件名
 */
export function extractFileName(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop();
    return decodeURIComponent(filename || '') || '未命名文件';
  } catch (e) {
    return '未命名文件';
  }
}

/**
 * 使元素可拖动
 * @param element 要拖动的元素
 */
export function makeDraggable(element: HTMLElement): void {
  const header = $(element).find('.download-header')[0];
  if (!header) return;

  let pos1 = 0,
    pos2 = 0,
    pos3 = 0,
    pos4 = 0;

  header.onmousedown = function (e: MouseEvent) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  };

  function elementDrag(e: MouseEvent) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    element.style.top = element.offsetTop - pos2 + 'px';
    element.style.right = '';
    element.style.left = element.offsetLeft - pos1 + 'px';
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}
