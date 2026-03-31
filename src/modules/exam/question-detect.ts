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

  // 匹配题检测：答案池 + 拖拽区域 + 序号标记
  const fullText = element.textContent || '';
  if (
    /匹配题/.test(typeText) ||
    element.querySelector('.match-area, .matching-area, .answer-pool, .drag-drop-area') ||
    (/答案池/.test(fullText) && /[①②③④⑤⑥⑦⑧⑨⑩]/.test(fullText)) ||
    /请从右侧拖入/.test(fullText) ||
    element.querySelector('[dnd-draggable], [dnd-list], [ng-drop]')
  ) {
    return { type: 'matching', rawTypeText: typeText || 'inferred_matching' };
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
 * 将 canvas 导出为安全的 base64（避免 webp 格式被 API 拒绝）
 * FIXED: Chrome 对 webp 源图 canvas.toDataURL('image/jpeg') 可能仍返回 webp，
 *        导致 OpenAI API 报 "fail to decode image config(webp)" 500 错误。
 *        策略：优先 jpeg，若返回非 jpeg 则回退 png（浏览器必须支持 png）。
 */
function canvasToSafeBase64(canvas: HTMLCanvasElement, quality = 0.85): string {
  const jpeg = canvas.toDataURL('image/jpeg', quality);
  if (jpeg.startsWith('data:image/jpeg')) {
    return jpeg;
  }
  // 浏览器未能按要求导出 jpeg，回退 png
  return canvas.toDataURL('image/png');
}

/**
 * 从 base64 数据中提取前几个字节的十六进制，用于魔数校验
 */
function getBase64MagicHex(b64Data: string, byteCount = 4): string {
  try {
    const raw = atob(b64Data.substring(0, Math.ceil((byteCount * 4) / 3) + 4));
    return Array.from(raw)
      .slice(0, byteCount)
      .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  } catch {
    return '';
  }
}

/**
 * 校验 base64 图片数据的实际格式，只放行 jpeg/png，拒绝其他一切。
 * FIXED: Chrome canvas 对 webp 源图 toDataURL('image/jpeg') 返回的头声称是 jpeg,
 *        但二进制实际仍是 webp (RIFF header)，导致 OpenAI API 500 错误。
 *        通过魔数校验确保数据与声明的 MIME 一致，不一致则丢弃。
 */
export function sanitizeImageDataUri(input: string): string | null {
  // 解析 data URI
  const match = input.match(/^data:(image\/[^;]+);base64,(.+)$/s);
  if (!match) {
    // 不是标准 data:image/...;base64,... 格式，当作裸 base64 处理
    if (!input.startsWith('data:') && input.length > 100) {
      return sanitizeRawBase64(input);
    }
    return null;
  }

  const b64Data = match[2];

  // base64 数据过短，不可能是合法图片
  if (b64Data.length < 100) {
    warn('图片 base64 数据过短，跳过');
    return null;
  }

  return sanitizeRawBase64(b64Data);
}

/**
 * 对裸 base64 数据做魔数校验，只放行 jpeg (FFD8FF) 和 png (89504E47)
 */
function sanitizeRawBase64(b64Data: string): string | null {
  const magic = getBase64MagicHex(b64Data);

  if (magic.startsWith('FFD8FF')) {
    return `data:image/jpeg;base64,${b64Data}`;
  }
  if (magic.startsWith('89504E47')) {
    return `data:image/png;base64,${b64Data}`;
  }

  // 其他格式一律拒绝（包括 RIFF/webp、gif、bmp 等）
  warn('图片魔数不是 jpeg/png:', magic.substring(0, 8), '拒绝发送');
  return null;
}

/**
 * 将 webp 等不安全格式的 data URI 通过 canvas 重编码为 jpeg/png。
 * FIXED: 失败时返回 null 而不是原始坏数据，绝不放行无法转换的图片。
 */
async function convertDataUriViaCanvas(dataUri: string): Promise<string | null> {
  try {
    const img = new Image();
    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = dataUri;
      setTimeout(() => resolve(false), 3000);
    });
    if (!loaded) {
      warn('convertDataUriViaCanvas: 图片加载失败，丢弃');
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const result = canvasToSafeBase64(canvas);
    // 二次校验：确保 canvas 输出的确是 jpeg/png
    return sanitizeImageDataUri(result);
  } catch {
    warn('convertDataUriViaCanvas: 异常，丢弃');
    return null;
  }
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

    return canvasToSafeBase64(canvas, 0.8);
  } catch (e) {
    warn('截图失败:', e);
    return null;
  }
}

/**
 * 尝试获取图片的 base64 数据，保证输出只有 jpeg/png 或 null。
 * 所有路径的产出都必须经过 sanitizeImageDataUri 校验。
 * 任何失败都降级为对整道题的 canvas 截图。
 */
export async function resolveImageBase64(image: QuestionImage, questionElement: Element): Promise<string | null> {
  const { src } = image;

  // 路径 1：已经是 data URI
  if (src.startsWith('data:image/')) {
    // 非 jpeg/png（如 webp）尝试 canvas 转码
    if (!src.startsWith('data:image/jpeg') && !src.startsWith('data:image/png')) {
      const converted = await convertDataUriViaCanvas(src);
      if (converted) return converted;
      // 转码失败，降级截图
      return captureQuestionImage(questionElement);
    }
    // jpeg/png data URI 也要过 sanitize（防止头与实际不符）
    const safe = sanitizeImageDataUri(src);
    if (safe) return safe;
    return captureQuestionImage(questionElement);
  }

  // 路径 2：远程/同源 URL，通过 canvas 重编码
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
          const result = canvasToSafeBase64(canvas, 0.85);
          // 二次校验
          const safe = sanitizeImageDataUri(result);
          if (safe) return safe;
        }
      }
    } catch {
      // 跨域或其他错误，继续兜底
    }
  }

  // 路径 3：兜底截图（captureQuestionImage 内部已用 canvasToSafeBase64）
  const screenshot = await captureQuestionImage(questionElement);
  if (!screenshot) return null;
  return sanitizeImageDataUri(screenshot);
}
