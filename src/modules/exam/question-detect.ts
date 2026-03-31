/**
 * 题型检测与图片提取
 */

import type { QuestionType, QuestionImage } from '@/types/exam';
import { TYPE_TEXT_MAP, TYPE_CLASS_MAP, warn } from '@/types/exam';

// ============================================================
// 题型检测
// ============================================================

/**
 * 基于页面可见文字 + class 兜底的题型检测
 */
export function detectQuestionType(element: Element): { type: QuestionType; rawTypeText: string } {
  // 优先：读取题型可见文字
  const summaryEl = element.querySelector('.summary-sub-title');
  const typeText = summaryEl?.textContent?.trim() || '';

  for (const { pattern, type } of TYPE_TEXT_MAP) {
    if (pattern.test(typeText)) {
      return { type, rawTypeText: typeText };
    }
  }

  // 兜底：读取 class
  const classList = element.classList;
  for (const { className, type } of TYPE_CLASS_MAP) {
    if (classList.contains(className)) {
      return { type, rawTypeText: typeText || className };
    }
  }

  // 再兜底：如果有 input[type="radio"]，可能是选择/判断题
  if (element.querySelector('input[type="radio"]')) {
    const optionCount = element.querySelectorAll('.option').length;
    if (optionCount === 2) {
      return { type: 'true_or_false', rawTypeText: typeText || 'inferred_true_or_false' };
    }
    return { type: 'single_selection', rawTypeText: typeText || 'inferred_single_selection' };
  }
  if (element.querySelector('input[type="checkbox"]')) {
    return { type: 'multiple_selection', rawTypeText: typeText || 'inferred_multiple_selection' };
  }

  // 如果有 contenteditable 或 textarea，可能是填空/简答
  const editables = element.querySelectorAll('[contenteditable="true"], textarea');
  if (editables.length > 0) {
    if (/填空/.test(typeText) || /请按题目中的空缺顺序/.test(element.textContent || '')) {
      return { type: 'fill_in_blank', rawTypeText: typeText || 'inferred_fill_in_blank' };
    }
    return { type: 'short_answer', rawTypeText: typeText || 'inferred_short_answer' };
  }

  // 未知类型 - 不丢弃
  warn('未识别题型，将保留为 unknown', { typeText, classList: Array.from(classList) });
  return { type: 'unknown', rawTypeText: typeText || 'unknown' };
}

// ============================================================
// 图片提取
// ============================================================

/**
 * 提取题目中的所有图片信息
 */
export function extractQuestionImages(element: Element): QuestionImage[] {
  const images: QuestionImage[] = [];
  const imgElements = element.querySelectorAll('img');

  imgElements.forEach((img) => {
    const src = img.src || img.getAttribute('src') || '';
    const alt = img.alt || '';

    // 收集 data-* 属性
    const dataAttrs: Record<string, string> = {};
    Array.from(img.attributes).forEach((attr) => {
      if (attr.name.startsWith('data-')) {
        dataAttrs[attr.name] = attr.value;
      }
    });

    images.push({ src, alt, dataAttrs });
  });

  // 检查背景图
  const allElements = element.querySelectorAll('*');
  allElements.forEach((el) => {
    const style = window.getComputedStyle(el);
    const bgImage = style.backgroundImage;
    if (bgImage && bgImage !== 'none' && bgImage.startsWith('url(')) {
      const urlMatch = bgImage.match(/url\(["']?(.*?)["']?\)/);
      if (urlMatch && urlMatch[1]) {
        images.push({ src: urlMatch[1], alt: 'background-image', dataAttrs: {} });
      }
    }
  });

  return images;
}

/**
 * 对题目区域进行 canvas 截图，返回 base64
 */
async function captureQuestionImage(element: Element): Promise<string | null> {
  try {
    const html2canvas = (window as any).html2canvas;
    if (!html2canvas) {
      warn('html2canvas 不可用，无法截图');
      return null;
    }

    const canvas = await html2canvas(element, {
      useCORS: true,
      allowTaint: true,
      scale: 1.5,
      logging: false,
    });

    return canvas.toDataURL('image/jpeg', 0.8);
  } catch (e) {
    warn('截图失败:', e);
    return null;
  }
}

/**
 * 尝试获取图片的 base64 数据
 * 优先：直接读取 img src (如果是 data URI 或同源)
 * 兜底：canvas 截图整个题目区域
 */
export async function resolveImageBase64(image: QuestionImage, questionElement: Element): Promise<string | null> {
  const { src } = image;

  // 已经是 base64
  if (src.startsWith('data:image/')) {
    return src;
  }

  // 尝试通过 canvas 读取 img 元素
  if (src && src !== 'in-rich-content' && !src.startsWith('data:')) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const loaded = await new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (val: boolean) => {
          if (!settled) {
            settled = true;
            resolve(val);
          }
        };
        img.onload = () => settle(true);
        img.onerror = () => settle(false);
        img.src = src;
        setTimeout(() => settle(false), 5000);
      });

      if (loaded) {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          return canvas.toDataURL('image/jpeg', 0.85);
        }
      }
    } catch {
      // 跨域或其他错误，继续兜底
    }
  }

  // 兜底：对整个题目区域截图
  return captureQuestionImage(questionElement);
}
