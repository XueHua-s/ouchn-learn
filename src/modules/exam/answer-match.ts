/**
 * 匹配题专用：DOM 侦测 + 答案解析 + 多级 fallback 填写
 */

import type { AnswerValue, Question } from '@/types/exam';
import { log, warn } from '@/types/exam';
import { getPageWindow, type AngularScope } from '@/utils/page-runtime';
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

type MatchingOptionLike = {
  id?: string | number;
  content?: string;
  [key: string]: unknown;
};

type MatchingSubSubjectLike = {
  note?: MatchingOptionLike;
  answer_number?: string | number;
  answeredOption?: string | number;
  answer_option_ids?: Array<string | number>;
  [key: string]: unknown;
};

type MatchingSubjectLike = {
  options?: MatchingOptionLike[];
  sub_subjects?: MatchingSubSubjectLike[];
  unsaved?: boolean;
  not_answered?: boolean;
  [key: string]: unknown;
};

function normalizeKey(k: string): string {
  const trimmed = k.trim();
  return CIRCLED_NUM_MAP[trimmed] || trimmed.replace(/[.、．:：\s]/g, '');
}

function normalizeMatchText(text: string): string {
  return text
    .replace(/[\s\u00a0]+/g, '')
    .replace(/[.、．:：;；,，()（）【】]/g, '')
    .replace(/\[|\]/g, '')
    .toLowerCase();
}

function cleanVisibleText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function getPrimaryText(element: Element): string {
  const directText = Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || '')
    .join(' ')
    .trim();
  if (directText) return cleanVisibleText(directText);

  const firstLeaf = Array.from(element.querySelectorAll('span, p, [data-v-5512d720]')).find((node) => {
    const text = cleanVisibleText(node.textContent || '');
    return text.length > 0 && text.length < 120 && !node.querySelector('span, p');
  });
  return cleanVisibleText(firstLeaf?.textContent || element.textContent || '');
}

function textsMatch(candidate: string, expected: string): boolean {
  const a = normalizeMatchText(candidate);
  const b = normalizeMatchText(expected);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function resolveSlotKey(rawKey: string, question: Question): string {
  const normalized = normalizeKey(rawKey);
  if (/^\d+$/.test(normalized)) return normalized;

  const matched = question.matchingItems?.find((item) => textsMatch(item.stem, rawKey) || textsMatch(item.key, rawKey));
  return matched?.key || normalized;
}

function resolveChoiceText(rawValue: string, question: Question): string {
  const matched = question.matchingOptions?.find(
    (option) =>
      textsMatch(option.label, rawValue) || textsMatch(option.value, rawValue) || textsMatch(option.content, rawValue),
  );
  return matched?.content || rawValue.trim();
}

function resolveChoiceId(rawValue: string, question: Question): string | undefined {
  const matched = question.matchingOptions?.find(
    (option) =>
      textsMatch(option.label, rawValue) || textsMatch(option.value, rawValue) || textsMatch(option.content, rawValue),
  );
  return matched?.value || matched?.label;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function getAngularScope(subjectEl: Element): AngularScope | null {
  try {
    const ng = getPageWindow(subjectEl).angular;
    const wrapped = ng?.element(subjectEl);
    return wrapped?.scope?.() || wrapped?.isolateScope?.() || null;
  } catch {
    return null;
  }
}

/** 解析 AI 返回的匹配答案，兼容 JSON/箭头/冒号/数组等多种格式 */
export function parseMatchingAnswer(answer: AnswerValue, question: Question): Map<string, string> {
  const map = new Map<string, string>();

  // 对象格式（AI 直接返回 JSON 对象）
  if (typeof answer === 'object' && answer !== null && !Array.isArray(answer)) {
    for (const [k, v] of Object.entries(answer)) {
      map.set(resolveSlotKey(k, question), resolveChoiceText(String(v), question));
    }
    return map;
  }

  // 数组格式：按 matchingItems 顺序映射
  if (Array.isArray(answer)) {
    const stems = question.matchingItems || [];
    answer.forEach((val, idx) => {
      const key = stems[idx]?.key || stems[idx]?.stem?.match(/[①②③④⑤⑥⑦⑧⑨⑩]/)?.[0];
      map.set(normalizeKey(key || String(idx + 1)), resolveChoiceText(String(val), question));
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
        map.set(resolveSlotKey(k, question), resolveChoiceText(String(v), question));
      }
      return map;
    }
  } catch {
    // 不是 JSON，继续文本解析
  }

  // 文本格式：①-A, ②→C, 1:A, cigarette:香烟 等
  for (const line of text.split(/[,，;\n]+/)) {
    const m = line.match(/(.+?)\s*[-=→>:：]+\s*(.+)/);
    if (m) {
      map.set(resolveSlotKey(m[1], question), resolveChoiceText(m[2], question));
    }
  }

  return map;
}

/** DOM 侦测：输出匹配题区域的完整 DOM 特征 */
function inspectMatchingDom(subjectEl: Element, questionDisplay: string): void {
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

  console.group(`[匹配题DOM检查] 题目 ${questionDisplay}`);
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
  answer: AnswerValue,
): Promise<boolean> {
  // DOM 侦测
  inspectMatchingDom(subjectEl, question.displayIndex);

  // 解析答案
  const matchMap = parseMatchingAnswer(answer, question);
  if (matchMap.size === 0) {
    warn(`题目 ${question.displayIndex}: 无法解析匹配题答案`);
    return false;
  }
  log(`题目 ${question.displayIndex}: 匹配答案解析结果`, Object.fromEntries(matchMap));

  // 策略 A：OUCHN 匹配题 Angular 模型直接操作
  const resultA = await tryOuchnAngularModel(subjectEl, question, matchMap);
  if (resultA) return true;

  // 策略 B：AngularJS scope 通用兜底
  const resultB = await tryAngularScope(subjectEl, question.displayIndex, matchMap);
  if (resultB) return true;

  // 策略 C：拖拽 DOM
  const resultC = await tryDragAndDrop(subjectEl, question.displayIndex, matchMap);
  if (resultC) return true;

  // 策略 D：按坐标模拟真人鼠标拖拽
  const resultD = await tryHumanLikeMouseDrag(subjectEl, question.displayIndex, matchMap);
  if (resultD) return true;

  // 策略 E：OUCHN 词意匹配 drag-cloneable 结构
  const resultE = await tryOuchnCloneableDrag(subjectEl, question.displayIndex, matchMap);
  if (resultE) return true;

  // 策略 F：点击式匹配（选项可点 + 槽位可点）
  const resultF = await tryClickToMatch(subjectEl, question.displayIndex, matchMap);
  if (resultF) return true;

  // 策略 G：隐藏 input/select
  const resultG = await tryHiddenInputs(subjectEl, question.displayIndex, matchMap);
  if (resultG) return true;

  // 所有策略失败
  const hasImages = subjectEl.querySelectorAll('img').length > 5;
  const hasCanvas = subjectEl.querySelectorAll('canvas').length > 0;
  const hasDraggable = subjectEl.querySelectorAll('[draggable="true"], [dnd-draggable]').length > 0;

  const reason = hasCanvas
    ? 'matching_ui_is_canvas_only'
    : hasImages && !hasDraggable
      ? 'matching_ui_is_image_viewer'
      : 'no_real_droppable_nodes_found';

  warn(`题目 ${question.displayIndex}: 匹配题所有填写策略失败`, { reason, matchMap: Object.fromEntries(matchMap) });
  return false;
}

/** 策略 A：AngularJS scope */
async function tryAngularScope(subjectEl: Element, qDisplay: string, matchMap: Map<string, string>): Promise<boolean> {
  try {
    const scope = getAngularScope(subjectEl);
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
          log(`题目 ${qDisplay}: Angular scope[${key}] 数组模式填入 ${filled} 项`);
          return true;
        }
        continue;
      }

      // 对象模式
      const record = obj as Record<string, unknown>;
      let filled = 0;
      for (const [slotKey, choiceVal] of matchMap) {
        if (slotKey in record || `slot_${slotKey}` in record) {
          const realKey = slotKey in record ? slotKey : `slot_${slotKey}`;
          record[realKey] = choiceVal;
          filled++;
        }
      }
      if (filled > 0) {
        scope.$apply?.();
        log(`题目 ${qDisplay}: Angular scope[${key}] 对象模式填入 ${filled} 项`);
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

function resolveSubjectFromScope(scope: AngularScope): MatchingSubjectLike | null {
  const directSubject = scope.subject;
  if (isObjectRecord(directSubject) && Array.isArray(directSubject.sub_subjects)) {
    return directSubject as MatchingSubjectLike;
  }

  for (const value of Object.values(scope)) {
    if (isObjectRecord(value) && Array.isArray(value.sub_subjects)) {
      return value as MatchingSubjectLike;
    }
  }

  return null;
}

function findMatchingOption(
  subject: MatchingSubjectLike,
  choiceVal: string,
  question: Question,
): MatchingOptionLike | null {
  const choiceId = resolveChoiceId(choiceVal, question);
  return (
    subject.options?.find((option) => {
      const id = String(option.id ?? '');
      const content = String(option.content ?? '');
      return textsMatch(id, choiceId || choiceVal) || textsMatch(content, choiceVal);
    }) || null
  );
}

async function tryOuchnAngularModel(
  subjectEl: Element,
  question: Question,
  matchMap: Map<string, string>,
): Promise<boolean> {
  const scope = getAngularScope(subjectEl);
  if (!scope) return false;

  const subject = resolveSubjectFromScope(scope);
  if (!subject?.sub_subjects?.length || !subject.options?.length) return false;

  let filled = 0;
  for (const [slotKey, choiceVal] of matchMap) {
    const idx = parseInt(slotKey, 10) - 1;
    const subSubject = subject.sub_subjects[idx];
    const option = findMatchingOption(subject, choiceVal, question);
    if (!subSubject || !option) continue;

    subSubject.note = option;
    subSubject.answer_number = option.id;
    subSubject.answeredOption = option.id;
    subSubject.answer_option_ids = option.id === undefined ? [] : [option.id];
    callScopeFunction(scope, 'onChangeSubmission', subSubject);
    filled++;
  }

  if (filled === 0) return false;

  subject.unsaved = true;
  subject.not_answered = false;

  try {
    scope.$apply?.();
  } catch {
    scope.$evalAsync?.();
  }

  subjectEl.dispatchEvent(new Event('change', { bubbles: true }));
  callScopeFunction(scope, 'dragAddCallback', subject);
  callScopeFunction(scope, 'onChangeSubmission', subject);
  log(`题目 ${question.displayIndex}: OUCHN Angular 匹配模型写入 ${filled} 项`);
  return true;
}

function callScopeFunction(scope: AngularScope, name: string, arg: MatchingSubjectLike): void {
  let current: AngularScope | undefined = scope;
  while (current) {
    const fn = current[name];
    if (typeof fn === 'function') {
      try {
        (fn as (value: MatchingSubjectLike) => void).call(current, arg);
      } catch {
        // ignore callback mismatch; model mutation is the primary write path.
      }
      return;
    }
    current = current.$parent;
  }
}

/** 策略 B：拖拽 */
async function tryDragAndDrop(subjectEl: Element, qDisplay: string, matchMap: Map<string, string>): Promise<boolean> {
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
      if (!dispatchStandardDrag(source, target)) continue;
      await new Promise((r) => setTimeout(r, 200));
      filled++;
    }
  }

  if (filled > 0) log(`题目 ${qDisplay}: 拖拽模式填入 ${filled} 项`);
  return filled > 0;
}

function getOuchnMatchingRows(subjectEl: Element): HTMLElement[] {
  return Array.from(subjectEl.querySelectorAll('.matching-answer-box > ul > li')).filter((row) => {
    return row.querySelector('[drag-type="to"]') && row.querySelector('.list-panel:not(.option):not(.panel-desc)');
  }) as HTMLElement[];
}

function createDragEvent(type: string, dataTransfer: DataTransfer): DragEvent | Event {
  const pageWin = getPageWindow();
  try {
    return new pageWin.DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
  } catch {
    const event = new pageWin.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
    return event;
  }
}

function dispatchDragCloneable(source: HTMLElement, target: HTMLElement): boolean {
  const pageWin = getPageWindow(source);
  const dt = new pageWin.DataTransfer();
  const events: Array<[HTMLElement, string]> = [
    [source, 'mousedown'],
    [source, 'dragstart'],
    [target, 'dragenter'],
    [target, 'dragover'],
    [target, 'drop'],
    [source, 'dragend'],
    [target, 'mouseup'],
  ];

  try {
    events.forEach(([el, type]) => {
      if (type.startsWith('drag') || type === 'drop') {
        el.dispatchEvent(createDragEvent(type, dt));
      } else {
        el.dispatchEvent(new pageWin.MouseEvent(type, { bubbles: true, cancelable: true }));
      }
    });
    return true;
  } catch (err) {
    warn('OUCHN 匹配题拖拽事件派发失败，已跳过拖拽兜底:', err);
    return false;
  }
}

function dispatchStandardDrag(source: HTMLElement, target: HTMLElement): boolean {
  try {
    const dt = new (getPageWindow(source).DataTransfer)();
    source.dispatchEvent(createDragEvent('dragstart', dt));
    target.dispatchEvent(createDragEvent('dragenter', dt));
    target.dispatchEvent(createDragEvent('dragover', dt));
    target.dispatchEvent(createDragEvent('drop', dt));
    source.dispatchEvent(createDragEvent('dragend', dt));
    return true;
  } catch (err) {
    warn('匹配题标准拖拽事件派发失败，已跳过拖拽兜底:', err);
    return false;
  }
}

function getElementCenter(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function dispatchPointerMouse(el: Element, type: string, x: number, y: number): void {
  const pageWin = getPageWindow(el);
  const init: MouseEventInit & PointerEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: 0,
    buttons: type === 'mouseup' || type === 'pointerup' ? 0 : 1,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };

  if (type.startsWith('pointer') && typeof pageWin.PointerEvent === 'function') {
    el.dispatchEvent(new pageWin.PointerEvent(type, init));
    return;
  }
  el.dispatchEvent(new pageWin.MouseEvent(type, init));
}

async function humanLikeDrag(source: HTMLElement, target: HTMLElement): Promise<boolean> {
  try {
    source.scrollIntoView({ block: 'center', inline: 'center' });
    target.scrollIntoView({ block: 'center', inline: 'center' });
    await new Promise((r) => setTimeout(r, 80));

    const start = getElementCenter(source);
    const end = getElementCenter(target);
    const doc = source.ownerDocument;

    dispatchPointerMouse(source, 'pointerdown', start.x, start.y);
    dispatchPointerMouse(source, 'mousedown', start.x, start.y);
    await new Promise((r) => setTimeout(r, 80));

    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const ratio = i / steps;
      const x = start.x + (end.x - start.x) * ratio;
      const y = start.y + (end.y - start.y) * ratio;
      const hover = doc.elementFromPoint(x, y) || target;
      dispatchPointerMouse(hover, 'pointermove', x, y);
      dispatchPointerMouse(hover, 'mousemove', x, y);
      await new Promise((r) => setTimeout(r, 18));
    }

    dispatchPointerMouse(target, 'pointerup', end.x, end.y);
    dispatchPointerMouse(target, 'mouseup', end.x, end.y);
    dispatchPointerMouse(target, 'click', end.x, end.y);
    return true;
  } catch (err) {
    warn('匹配题坐标拖拽失败，已跳过真人式拖拽兜底:', err);
    return false;
  }
}

async function tryHumanLikeMouseDrag(
  subjectEl: Element,
  qDisplay: string,
  matchMap: Map<string, string>,
): Promise<boolean> {
  const rows = getOuchnMatchingRows(subjectEl);
  const sources = Array.from(
    subjectEl.querySelectorAll(
      '.answer-pool .clone-area.drag-area[data-option-id], .answer-pool .clone-area.drag-area, [drag-type="from"] .clone-area',
    ),
  ) as HTMLElement[];

  if (rows.length === 0 || sources.length === 0) return false;

  let filled = 0;
  for (const [slotKey, choiceVal] of matchMap) {
    const row = rows[parseInt(slotKey, 10) - 1];
    const target = row?.querySelector('[drag-type="to"]') as HTMLElement | null;
    const source = sources.find(
      (el) => textsMatch(getPrimaryText(el), choiceVal) || textsMatch(el.dataset.optionId || '', choiceVal),
    );
    if (!source || !target) continue;

    const ok = await humanLikeDrag(source, target);
    await new Promise((r) => setTimeout(r, 250));
    if (ok) filled++;
  }

  if (filled > 0) log(`题目 ${qDisplay}: 坐标鼠标拖拽填入 ${filled} 项`);
  return filled > 0;
}

async function tryOuchnCloneableDrag(
  subjectEl: Element,
  qDisplay: string,
  matchMap: Map<string, string>,
): Promise<boolean> {
  const rows = getOuchnMatchingRows(subjectEl);
  const sources = Array.from(
    subjectEl.querySelectorAll(
      '.answer-pool .clone-area.drag-area[data-option-id], .answer-pool .clone-area.drag-area',
    ),
  ) as HTMLElement[];

  if (rows.length === 0 || sources.length === 0) return false;

  let filled = 0;
  for (const [slotKey, choiceVal] of matchMap) {
    const rowIndex = parseInt(slotKey, 10) - 1;
    const row = rows[rowIndex];
    if (!row) continue;

    const source = sources.find(
      (el) => textsMatch(getPrimaryText(el), choiceVal) || textsMatch(el.dataset.optionId || '', choiceVal),
    );
    const target = row.querySelector('[drag-type="to"]') as HTMLElement | null;
    if (!source || !target) continue;

    if (!dispatchDragCloneable(source, target)) continue;
    target.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));

    if (target.textContent?.trim() || target.querySelector('.clone-area')) {
      filled++;
    } else {
      // 有些 Angular 拖拽指令不会同步 DOM 文本，但 drop 已进入回调；仍计入并依赖后续提交验证。
      filled++;
    }
  }

  if (filled > 0) log(`题目 ${qDisplay}: OUCHN 词意匹配拖拽填入 ${filled} 项`);
  return filled > 0;
}

/** 策略 C：点击匹配 */
async function tryClickToMatch(subjectEl: Element, qDisplay: string, matchMap: Map<string, string>): Promise<boolean> {
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

  if (filled > 0) log(`题目 ${qDisplay}: 点击模式填入 ${filled} 项`);
  return filled > 0;
}

/** 策略 D：隐藏 input/select */
async function tryHiddenInputs(subjectEl: Element, qDisplay: string, matchMap: Map<string, string>): Promise<boolean> {
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

  if (filled > 0) log(`题目 ${qDisplay}: 隐藏输入模式填入 ${filled} 项`);
  return filled > 0;
}
