/**
 * 匹配题专用：DOM 侦测 + 答案解析 + 多级 fallback 填写
 */

import type { Question } from '@/types/exam';
import { log, warn } from '@/types/exam';
import { triggerAngularUpdate } from './answer-write';

/** 序号字符 → 数字映射 */
const CIRCLED_NUM_MAP: Record<string, string> = {
  '①': '1',
  '②': '2',
  '③': '3',
  '④': '4',
  '⑤': '5',
  '⑥': '6',
  '⑦': '7',
  '⑧': '8',
  '⑨': '9',
  '⑩': '10',
};

function normalizeKey(k: string): string {
  const trimmed = k.trim();
  return CIRCLED_NUM_MAP[trimmed] || trimmed.replace(/[.、．:：\s]/g, '');
}

/** 解析 AI 返回的匹配答案，兼容 JSON/箭头/冒号/数组等多种格式 */
export function parseMatchingAnswer(answer: string | string[], question: Question): Map<string, string> {
  const map = new Map<string, string>();

  // 对象格式（AI 直接返回 JSON 对象）
  if (typeof answer === 'object' && answer !== null && !Array.isArray(answer)) {
    for (const [k, v] of Object.entries(answer)) {
      map.set(normalizeKey(k), String(v).trim());
    }
    return map;
  }

  // 数组格式：按 matchingItems 顺序映射
  if (Array.isArray(answer)) {
    const stems = question.matchingItems || [];
    answer.forEach((val, idx) => {
      const key = stems[idx]?.stem?.match(/[①②③④⑤⑥⑦⑧⑨⑩]/)?.[0];
      map.set(normalizeKey(key || String(idx + 1)), String(val).trim());
    });
    return map;
  }

  // 字符串格式
  const text = String(answer).trim();

  // 尝试 JSON 解析
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [k, v] of Object.entries(obj)) {
        map.set(normalizeKey(k), String(v).trim());
      }
      return map;
    }
  } catch {
    // 不是 JSON，继续文本解析
  }

  // 文本格式：①-A, ②→C, 1:A, ①:F 等
  for (const line of text.split(/[,，;\n]+/)) {
    const m = line.match(/([①②③④⑤⑥⑦⑧⑨⑩\d]+)\s*[-=→>:：]+\s*([A-Za-z])/);
    if (m) {
      map.set(normalizeKey(m[1]), m[2].toUpperCase());
    }
  }

  return map;
}

/** DOM 侦测：输出匹配题区域的完整 DOM 特征 */
function inspectMatchingDom(subjectEl: Element, questionIndex: number): void {
  const draggables = subjectEl.querySelectorAll(
    '[draggable="true"], [dnd-draggable], [dnd-list], [ng-drop], ' +
      '[data-rbd-draggable-id], [data-rbd-droppable-id], .drag-item, .drop-item',
  );

  const buttons = Array.from(subjectEl.querySelectorAll('button')).map((btn) => ({
    title: btn.getAttribute('title'),
    text: btn.textContent?.trim().substring(0, 40),
  }));

  const imgs = Array.from(subjectEl.querySelectorAll('img')).map((img) => ({
    src: (img.src || '').substring(0, 100),
    alt: img.alt,
    size: `${img.naturalWidth}x${img.naturalHeight}`,
  }));

  const canvasList = subjectEl.querySelectorAll('canvas');

  // 查找包含选项标签的节点
  const choiceNodes = Array.from(subjectEl.querySelectorAll('*')).filter((el) => {
    const t = el.textContent?.trim() || '';
    return /^[A-F][：:]/.test(t) && t.length < 200;
  });

  const slotNodes = Array.from(subjectEl.querySelectorAll('*')).filter((el) => {
    const t = el.textContent?.trim() || '';
    return /^[①②③④⑤⑥⑦⑧⑨⑩]$/.test(t);
  });

  console.group(`[匹配题DOM检查] 题目 ${questionIndex}`);
  log('draggable 节点:', draggables.length);
  log('button 列表:', buttons);
  log('img 列表:', imgs);
  log('canvas 数量:', canvasList.length);
  log(
    '选项节点 (A:-F:):',
    choiceNodes.length,
    choiceNodes.map((n) => n.textContent?.trim().substring(0, 60)),
  );
  log(
    '槽位节点 (①-⑥):',
    slotNodes.length,
    slotNodes.map((n) => n.textContent?.trim()),
  );
  console.groupEnd();
}

/**
 * 填写匹配题（多级 fallback）
 */
export async function fillMatchingQuestion(
  subjectEl: Element,
  question: Question,
  answer: string | string[],
): Promise<boolean> {
  // DOM 侦测
  inspectMatchingDom(subjectEl, question.index);

  // 解析答案
  const matchMap = parseMatchingAnswer(answer, question);
  if (matchMap.size === 0) {
    warn(`题目 ${question.index}: 无法解析匹配题答案`);
    return false;
  }
  log(`题目 ${question.index}: 匹配答案解析结果`, Object.fromEntries(matchMap));

  // 策略 A：AngularJS scope 直接操作
  const resultA = await tryAngularScope(subjectEl, question.index, matchMap);
  if (resultA) return true;

  // 策略 B：拖拽 DOM
  const resultB = await tryDragAndDrop(subjectEl, question.index, matchMap);
  if (resultB) return true;

  // 策略 C：点击式匹配（选项可点 + 槽位可点）
  const resultC = await tryClickToMatch(subjectEl, question.index, matchMap);
  if (resultC) return true;

  // 策略 D：隐藏 input/select
  const resultD = await tryHiddenInputs(subjectEl, question.index, matchMap);
  if (resultD) return true;

  // 所有策略失败
  const hasImages = subjectEl.querySelectorAll('img').length > 5;
  const hasCanvas = subjectEl.querySelectorAll('canvas').length > 0;
  const hasDraggable = subjectEl.querySelectorAll('[draggable="true"], [dnd-draggable]').length > 0;

  const reason = hasCanvas
    ? 'matching_ui_is_canvas_only'
    : hasImages && !hasDraggable
      ? 'matching_ui_is_image_viewer'
      : 'no_real_droppable_nodes_found';

  warn(`题目 ${question.index}: 匹配题所有填写策略失败`, { reason, matchMap: Object.fromEntries(matchMap) });
  return false;
}

/** 策略 A：AngularJS scope */
async function tryAngularScope(subjectEl: Element, qIndex: number, matchMap: Map<string, string>): Promise<boolean> {
  try {
    const ng = (window as any).angular;
    if (!ng) return false;

    const scope = ng.element(subjectEl).scope();
    if (!scope) return false;

    // 遍历 scope 上常见的 answer 属性名
    for (const key of ['answer', 'answers', 'matchAnswer', 'matching', 'matchingAnswers', 'subject']) {
      const obj = scope[key];
      if (!obj || typeof obj !== 'object') continue;

      // 如果是数组（如 subject.answers），尝试按 index 匹配
      if (Array.isArray(obj)) {
        let filled = 0;
        for (const [slotKey, choiceVal] of matchMap) {
          const idx = parseInt(slotKey) - 1;
          if (idx >= 0 && idx < obj.length) {
            obj[idx] = choiceVal;
            filled++;
          }
        }
        if (filled > 0) {
          scope.$apply?.();
          log(`题目 ${qIndex}: Angular scope[${key}] 数组模式填入 ${filled} 项`);
          return true;
        }
        continue;
      }

      // 对象模式
      let filled = 0;
      for (const [slotKey, choiceVal] of matchMap) {
        if (slotKey in obj || `slot_${slotKey}` in obj) {
          const realKey = slotKey in obj ? slotKey : `slot_${slotKey}`;
          obj[realKey] = choiceVal;
          filled++;
        }
      }
      if (filled > 0) {
        scope.$apply?.();
        log(`题目 ${qIndex}: Angular scope[${key}] 对象模式填入 ${filled} 项`);
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

/** 策略 B：拖拽 */
async function tryDragAndDrop(subjectEl: Element, qIndex: number, matchMap: Map<string, string>): Promise<boolean> {
  const draggables = Array.from(
    subjectEl.querySelectorAll('[draggable="true"], [dnd-draggable], .drag-item'),
  ) as HTMLElement[];
  const droppables = Array.from(
    subjectEl.querySelectorAll('[dnd-list], [ng-drop], .drop-zone, .match-target'),
  ) as HTMLElement[];

  if (draggables.length === 0 || droppables.length === 0) return false;

  let filled = 0;
  for (const [_slotKey, choiceVal] of matchMap) {
    const source = draggables.find((el) => el.textContent?.trim().startsWith(choiceVal));
    const target = droppables.find(
      (el) => el.textContent?.trim().includes(_slotKey) || el.closest(`[data-index="${_slotKey}"]`),
    );
    if (source && target) {
      const dt = new DataTransfer();
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
      await new Promise((r) => setTimeout(r, 200));
      filled++;
    }
  }

  if (filled > 0) log(`题目 ${qIndex}: 拖拽模式填入 ${filled} 项`);
  return filled > 0;
}

/** 策略 C：点击匹配 */
async function tryClickToMatch(subjectEl: Element, qIndex: number, matchMap: Map<string, string>): Promise<boolean> {
  // 找所有可点击的选项和槽位
  const allClickable = Array.from(subjectEl.querySelectorAll('*')).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.cursor === 'pointer' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button';
  }) as HTMLElement[];

  if (allClickable.length === 0) return false;

  let filled = 0;
  for (const [slotKey, choiceVal] of matchMap) {
    // 找槽位
    const slotEl = allClickable.find((el) => {
      const t = el.textContent?.trim() || '';
      const circled = Object.entries(CIRCLED_NUM_MAP).find(([_, v]) => v === slotKey)?.[0];
      return t === slotKey || t === circled || t.includes(`${circled}`) || t.includes(`${slotKey}.`);
    });
    // 找选项
    const choiceEl = allClickable.find((el) => {
      const t = el.textContent?.trim() || '';
      return t.startsWith(`${choiceVal}：`) || t.startsWith(`${choiceVal}:`) || t === choiceVal;
    });

    if (slotEl && choiceEl) {
      choiceEl.click();
      await new Promise((r) => setTimeout(r, 150));
      slotEl.click();
      await new Promise((r) => setTimeout(r, 150));
      filled++;
    }
  }

  if (filled > 0) log(`题目 ${qIndex}: 点击模式填入 ${filled} 项`);
  return filled > 0;
}

/** 策略 D：隐藏 input/select */
async function tryHiddenInputs(subjectEl: Element, qIndex: number, matchMap: Map<string, string>): Promise<boolean> {
  const hiddenInputs = Array.from(
    subjectEl.querySelectorAll('input[type="hidden"], select, [ng-model]'),
  ) as HTMLElement[];

  if (hiddenInputs.length === 0) return false;

  let filled = 0;
  for (const [slotKey, choiceVal] of matchMap) {
    const input = hiddenInputs.find((el) => {
      const name = el.getAttribute('name') || el.getAttribute('ng-model') || '';
      return name.includes(slotKey) || name.includes(`match_${slotKey}`);
    });
    if (input) {
      if (input instanceof HTMLSelectElement) {
        const option = Array.from(input.options).find((o) => o.value === choiceVal || o.text.startsWith(choiceVal));
        if (option) {
          input.value = option.value;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          filled++;
        }
      } else if (input instanceof HTMLInputElement) {
        input.value = choiceVal;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        triggerAngularUpdate(input, choiceVal);
        filled++;
      }
    }
  }

  if (filled > 0) log(`题目 ${qIndex}: 隐藏输入模式填入 ${filled} 项`);
  return filled > 0;
}
