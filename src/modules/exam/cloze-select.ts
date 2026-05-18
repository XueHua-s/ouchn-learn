/**
 * OUCHN 完形填空/补全对话下拉题兼容层。
 *
 * 对外只暴露 5 个稳定 API：
 * - `isClozeElement(el)`        — 判定一个 DOM 元素是不是完形填空题
 * - `isClozeSelectQuestion(q)`  — 判定一个已抽取的 Question 是不是完形填空题（无 DOM 访问）
 * - `buildClozeQuestionData(el)` — 抽取完形填空题给 AI 用的 description / rawText / 选项
 * - `validateClozeAnswers(q,a)` — 校验答案能否一一映射到选项标签
 * - `fillClozeSelectQuestion()` — 把答案回填到隐藏 select + multiselect + Angular 三套状态
 *
 * 其余辅助函数（含 DOM/Angular/jQuery 细节）一律对外不可见，避免再被外层模块直接拼接。
 */

import type { AnswerValue, Question } from '@/types/exam';
import { isValidAnswer, log, warn } from '@/types/exam';
import { getPageWindow, type AngularParse } from '@/utils/page-runtime';
import { triggerAngularUpdate } from './answer-write';
import { CLOZE_SELECT_SELECTOR, SUBJECT_SELECTOR } from './selectors';

type AngularModelRead = {
  available: boolean;
  value: string;
};

/** 完形填空题给 Question 用的全部派生字段 */
export type ClozeQuestionData = {
  blankCount: number;
  description: string;
  rawText: string;
  modelHint: string;
  options: NonNullable<Question['options']>;
};

/** 完形填空题答案校验结果（不依赖 tool-contract，便于上层 mapping） */
export type ClozeValidationResult =
  | { ok: true; labels: string[] }
  | { ok: false; reason: 'blank_count_mismatch'; expected: number; actual: number }
  | { ok: false; reason: 'unknown_option_label'; value: string };

// ============================================================
// Public API
// ============================================================

/**
 * 仅依据 DOM 判断元素是否是完形填空题（含 `select.___select-answer` 或带匹配 ng-model 的 multiselect）。
 * 这是 cloze 检测的唯一事实来源，外层不再裸用 `querySelector(CLOZE_SELECT_SELECTOR)`。
 */
export function isClozeElement(element: Element): boolean {
  return element.querySelector(CLOZE_SELECT_SELECTOR) != null;
}

/** 基于已抽取的 Question 元信息判断（无需 DOM）：tool 校验阶段使用 */
export function isClozeSelectQuestion(question: Question): boolean {
  return (
    question.type === 'fill_in_blank' &&
    (question.rawClassName.includes('cloze') ||
      question.rawTypeText.includes('完形填空') ||
      Boolean(question.options?.length && question.modelHints.some((hint) => hint.includes('完形填空'))))
  );
}

/**
 * 抽取完形填空题给 AI 用的展示数据 + 选项 + 空位数。
 * 仅当 `isClozeElement(element)` 为真时调用；普通填空题不走这里。
 */
export function buildClozeQuestionData(element: Element): ClozeQuestionData {
  const selects = getClozeSelects(element);
  const description = buildClozeDescription(element);
  const options = extractClozeOptions(element);
  return {
    blankCount: selects.length,
    description,
    // FIXED: 完形填空给模型看的 rawText 必须与 description 一致——若退回 element.textContent，
    //        Angular multiselect 渲染出的占位符（"-请选择-"等）会污染上下文，让 AI 把空位
    //        当成已答状态。
    rawText: description,
    modelHint: '此题是完形填空/补全对话，空位为下拉选项，请按空位顺序返回选项字母数组，如 ["A","D"]',
    options,
  };
}

/**
 * 校验填空答案是否能一一映射到下拉选项。
 * 不依赖任何 tool-contract 类型；上层负责把 `reason` 翻译成自家错误格式。
 */
export function validateClozeAnswers(question: Question, answers: string[]): ClozeValidationResult {
  const parsedAnswers = parseClozeAnswers(question, answers.length === 1 ? answers[0] : answers);
  if (question.blankCount > 0 && parsedAnswers.length !== question.blankCount) {
    return { ok: false, reason: 'blank_count_mismatch', expected: question.blankCount, actual: parsedAnswers.length };
  }

  const labels: string[] = [];
  for (const answer of parsedAnswers) {
    const label = resolveClozeAnswerLabel(question, answer);
    if (!label) {
      return { ok: false, reason: 'unknown_option_label', value: answer };
    }
    labels.push(label);
  }
  return { ok: true, labels };
}

// ============================================================
// 内部：题干/选项文本解析
// ============================================================

function normalizeInlineText(text: string): string {
  return text.replace(/[\s\u00a0]+/g, ' ').trim();
}

function normalizeAnswerContent(text: string): string {
  return normalizeInlineText(text).toLowerCase();
}

function cleanClozeAnswerLabel(answer: string): string {
  return answer
    .trim()
    .replace(/[.、．\s]/g, '')
    .toUpperCase();
}

function parseInstructionOptions(text: string): Map<string, string> {
  const options = new Map<string, string>();
  const pattern = /(?:^|\s)([A-Z])\s*[.、．]\s*(.*?)(?=\s+[A-Z]\s*[.、．]\s*|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    options.set(match[1].toUpperCase(), normalizeInlineText(match[2]));
  }
  return options;
}

function isInstructionText(text: string): boolean {
  return /[A-Z]\s*[.、．]/.test(text);
}

function cloneWithoutClozeWidgetNoise(element: Element): Element {
  const cloned = element.cloneNode(true) as Element;
  cloned.querySelectorAll(CLOZE_SELECT_SELECTOR).forEach((node, idx) => {
    const placeholder = document.createElement('span');
    placeholder.textContent = `____${idx + 1}____`;
    node.replaceWith(placeholder);
  });
  cloned.querySelectorAll('.ui-multiselect-menu, .ui-multiselect').forEach((node) => node.remove());
  return cloned;
}

function extractCleanClozeText(element: Element): string {
  return normalizeInlineText(cloneWithoutClozeWidgetNoise(element).textContent || element.textContent || '');
}

function findPreviousClozeInstructionText(element: Element): string {
  let prev = element.previousElementSibling;
  while (prev) {
    if (prev.matches(SUBJECT_SELECTOR)) {
      const scoreText = prev.querySelector('.summary-sub-title')?.textContent || '';
      const hasScore = /\d+\s*分/.test(scoreText);
      const text = extractCleanClozeText(prev);
      if (text && isInstructionText(text)) return text;
      if (hasScore) break;
    }
    prev = prev.previousElementSibling;
  }
  return '';
}

function buildClozeDescription(element: Element): string {
  const cleanText = extractCleanClozeText(element);
  const instructionText = findPreviousClozeInstructionText(element);
  const parts = [instructionText, cleanText].filter(Boolean);
  return Array.from(new Set(parts)).join('\n\n');
}

function extractClozeOptions(element: Element): NonNullable<Question['options']> {
  const firstSelect = element.querySelector(CLOZE_SELECT_SELECTOR) as HTMLSelectElement | null;
  if (!firstSelect) return [];
  const instructionOptions = parseInstructionOptions(findPreviousClozeInstructionText(element));

  return Array.from(firstSelect.options)
    .filter((option) => !option.disabled && option.value)
    .map((option) => {
      const label = normalizeInlineText(option.textContent || option.label || '');
      return { label, content: instructionOptions.get(label) || label, value: option.value };
    });
}

// ============================================================
// 内部：答案解析与匹配
// ============================================================

/**
 * 把 AI 返回的字符串答案切成单空答案数组。
 *
 * 解析策略按"信号强度"降序尝试，命中即返回，避免噪声分支被低优先级解析覆盖：
 *  1. JSON：AI 在 system prompt 中被要求返回 JSON 数组 / 对象，最稳；
 *  2. 显式分隔符（| / ; / , / 顿号 / 换行）：人类约定写法，绝大多数 batch 答案命中此路；
 *  3. 空白切分：仅当全部分片都形如 "A"/"B."/"C、" 这种"字母 + 可选标点"时才采纳，
 *     防止把整段英文当成多空答案；
 *  4. 紧凑字母串（如 "ABCD"）：仅当长度等于 blankCount 且每个字符都是合法选项标签时采纳；
 *  5. 兜底：作为单空答案原样返回。
 */
function parseClozeAnswerString(question: Question, rawAnswer: string): string[] {
  const text = rawAnswer.trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    if (parsed && typeof parsed === 'object') return Object.values(parsed).map(String).filter(Boolean);
  } catch {
    // Not JSON; continue with loose text parsing.
  }

  const delimiterParts = text.split(/\s*[|｜;；,，、\n\r]+\s*/).filter(Boolean);
  if (delimiterParts.length > 1) return delimiterParts;

  const whitespaceParts = text.split(/\s+/).filter(Boolean);
  if (whitespaceParts.length > 1 && whitespaceParts.every((part) => /^[A-Za-z][.、．]?$/.test(part))) {
    return whitespaceParts;
  }

  const compact = cleanClozeAnswerLabel(text);
  const optionLabels = new Set((question.options || []).map((option) => cleanClozeAnswerLabel(option.label)));
  if (compact.length === question.blankCount && [...compact].every((label) => optionLabels.has(label))) {
    return [...compact];
  }

  return [text];
}

function parseClozeAnswers(question: Question, answer: AnswerValue): string[] {
  if (Array.isArray(answer)) return answer.map(String).filter(Boolean);
  if (answer && typeof answer === 'object') return Object.values(answer).map(String).filter(Boolean);
  return parseClozeAnswerString(question, String(answer));
}

function resolveClozeAnswerLabel(question: Question, answer: string): string | null {
  const cleanLabel = cleanClozeAnswerLabel(answer);
  const options = question.options || [];
  if (options.some((option) => cleanClozeAnswerLabel(option.label) === cleanLabel)) return cleanLabel;

  const normalizedAnswer = normalizeAnswerContent(answer);
  if (!normalizedAnswer) return null;

  const matchedOption = options.find((option) => {
    const content = normalizeAnswerContent(option.content);
    return content === normalizedAnswer || content.includes(normalizedAnswer) || normalizedAnswer.includes(content);
  });
  if (matchedOption) return cleanClozeAnswerLabel(matchedOption.label);

  const instructionOptions = parseInstructionOptions(question.description);
  for (const [label, content] of instructionOptions) {
    const normalizedContent = normalizeAnswerContent(content);
    if (
      normalizedContent === normalizedAnswer ||
      normalizedContent.includes(normalizedAnswer) ||
      normalizedAnswer.includes(normalizedContent)
    ) {
      return label;
    }
  }

  return null;
}

// ============================================================
// 内部：DOM / Angular / jQuery 同步原语
// ============================================================

function getClozeSelects(subjectEl: Element): HTMLSelectElement[] {
  return Array.from(subjectEl.querySelectorAll(CLOZE_SELECT_SELECTOR)) as HTMLSelectElement[];
}

function dispatchFormEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function getNativeValueSetter(): ((this: HTMLSelectElement, value: string) => void) | undefined {
  return Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
}

function setSelectValue(select: HTMLSelectElement, option: HTMLOptionElement): void {
  Array.from(select.options).forEach((item) => {
    item.selected = item === option;
  });
  const nativeSetter = getNativeValueSetter();
  if (nativeSetter) {
    nativeSetter.call(select, option.value);
  } else {
    select.value = option.value;
  }
}

function triggerPageJqueryChange(select: HTMLSelectElement): void {
  try {
    const pageWin = getPageWindow(select);
    const jq = pageWin.jQuery || pageWin.$;
    jq?.(select).trigger('change');
  } catch {
    // 页面 jQuery 不可用时，原生 change 事件已经覆盖基础同步路径。
  }
}

function triggerPageMultiselectChange(select: HTMLSelectElement): void {
  try {
    const pageWin = getPageWindow(select);
    const jq = pageWin.jQuery || pageWin.$;
    const selectedValues = [select.value];
    const jqSelect = jq?.(select) as
      | (JQuery<HTMLSelectElement> & { multiselect?: (...args: unknown[]) => JQuery })
      | undefined;
    jqSelect?.multiselect?.('widget').find(`input[value="${select.value}"]`).prop('checked', true).trigger('click');
    jqSelect?.multiselect?.('refresh');
    jqSelect?.multiselect?.('value', selectedValues);
  } catch {
    // multiselect 插件版本不一致时，radio click + select change 仍是主路径。
  }
}

function updateAngularModel(select: HTMLSelectElement, value: string): boolean {
  try {
    const ng = getPageWindow(select).angular;
    const ngEl = ng?.element(select);
    const ctrl = ngEl?.controller?.('ngModel');
    ctrl?.$setViewValue?.(value);
    ctrl?.$render?.();

    const scope = ngEl?.scope?.() || ngEl?.isolateScope?.();
    const expression = select.getAttribute('ng-model');
    if (scope?.$eval && expression) {
      scope.$eval(`${expression} = value`, { value });
    }
    const injector = ngEl?.injector?.();
    const parse = injector?.get?.('$parse') as AngularParse | undefined;
    if (scope && expression && parse) {
      parse(expression).assign?.(scope, value);
    }

    try {
      scope?.$apply?.();
    } catch {
      scope?.$evalAsync?.();
    }

    return Boolean(ctrl || scope);
  } catch {
    return false;
  }
}

function readAngularModel(select: HTMLSelectElement): AngularModelRead {
  try {
    const ng = getPageWindow(select).angular;
    const ngEl = ng?.element(select);
    const ctrl = ngEl?.controller?.('ngModel');
    const ctrlValue = ctrl?.$modelValue ?? ctrl?.$viewValue;
    if (ctrlValue !== undefined && ctrlValue !== null) return { available: true, value: String(ctrlValue) };

    const scope = ngEl?.scope?.() || ngEl?.isolateScope?.();
    const expression = select.getAttribute('ng-model');
    const scopedValue = scope?.$eval && expression ? scope.$eval(expression) : undefined;
    return scopedValue === undefined || scopedValue === null
      ? { available: Boolean(scope && expression), value: '' }
      : { available: true, value: String(scopedValue) };
  } catch {
    return { available: false, value: '' };
  }
}

function findClozeMultiselectRadio(select: HTMLSelectElement, option: HTMLOptionElement): HTMLInputElement | null {
  const matchesTarget = (input: Element): boolean => {
    const radioInput = input as HTMLInputElement;
    return radioInput.name === `multiselect_${select.id}` && radioInput.value === option.value;
  };
  const root = select.closest(SUBJECT_SELECTOR);
  const scopedRadio = root ? Array.from(root.querySelectorAll('input[type="radio"]')).find(matchesTarget) : undefined;
  return (scopedRadio ||
    Array.from(document.querySelectorAll('input[type="radio"]')).find(matchesTarget) ||
    null) as HTMLInputElement | null;
}

function clickClozeRadio(radio: HTMLInputElement): void {
  const clickable = radio.closest('label') || radio;
  (clickable as HTMLElement).click();
}

function syncClozeMultiselect(select: HTMLSelectElement, option: HTMLOptionElement): boolean {
  const button = select.id ? document.getElementById(`${select.id}_ms`) : select.nextElementSibling;
  const buttonLabel = button?.querySelector('span:last-child');
  if (buttonLabel) buttonLabel.textContent = option.textContent?.trim() || option.label;
  button?.classList.remove('gray');

  const radio = findClozeMultiselectRadio(select, option);

  if (!radio) return false;

  clickClozeRadio(radio);

  radio.checked = true;
  radio.setAttribute('checked', 'checked');
  radio.setAttribute('aria-selected', 'true');
  radio.closest('label')?.classList.add('ui-state-active');

  const menu = radio.closest('.ui-multiselect-menu');
  menu?.querySelectorAll('input[type="radio"]').forEach((other) => {
    const otherRadio = other as HTMLInputElement;
    if (otherRadio === radio || otherRadio.name !== radio.name) return;
    otherRadio.checked = false;
    otherRadio.removeAttribute('checked');
    otherRadio.setAttribute('aria-selected', 'false');
    otherRadio.closest('label')?.classList.remove('ui-state-active');
  });

  return true;
}

function isSelectFilled(select: HTMLSelectElement, option: HTMLOptionElement): boolean {
  const radio = findClozeMultiselectRadio(select, option);
  const angular = readAngularModel(select);
  return (
    select.value === option.value && (!radio || radio.checked) && (!angular.available || angular.value === option.value)
  );
}

function describeClozeSelectState(select: HTMLSelectElement, option: HTMLOptionElement): string {
  const radio = findClozeMultiselectRadio(select, option);
  const angular = readAngularModel(select);
  return `select=${select.value || '(empty)'}, radio=${radio ? String(radio.checked) : 'missing'}, angular=${
    angular.available ? angular.value || '(empty)' : 'unavailable'
  }`;
}

/**
 * 把一个 select 的状态同步到三套表示（原生 select / jQuery multiselect / Angular ng-model）。
 *
 * 策略：write → click → re-write → verify。
 *  1. 第一轮：直接 set 原生 select.value + 派发 input/change + 推动 Angular ngModel + 点 multiselect radio。
 *  2. 第二轮：再次 set 原生值——multiselect 的 radio click handler 会在自己的 change 周期里覆写 select.value，
 *     不重写一次会导致 page-side state 与 ngModel 短暂错位。
 *  3. 等 80ms 让 Angular digest 跑完，再读回三处状态做 verify。
 *
 * 注意：单轮 write 通过 jQuery multiselect 的提交回调读回值时已经被 plugin 改回，必须二轮 write。
 */
async function fillSingleClozeSelect(select: HTMLSelectElement, option: HTMLOptionElement): Promise<boolean> {
  setSelectValue(select, option);
  dispatchFormEvents(select);
  triggerAngularUpdate(select, option.value);
  updateAngularModel(select, option.value);
  triggerPageJqueryChange(select);
  syncClozeMultiselect(select, option);
  triggerPageMultiselectChange(select);

  setSelectValue(select, option);
  dispatchFormEvents(select);
  triggerAngularUpdate(select, option.value);
  updateAngularModel(select, option.value);
  triggerPageJqueryChange(select);

  await new Promise((resolve) => setTimeout(resolve, 80));
  return isSelectFilled(select, option);
}

// ============================================================
// Public：填写入口
// ============================================================

export async function fillClozeSelectQuestion(
  subjectEl: Element,
  question: Question,
  answer: AnswerValue,
): Promise<boolean> {
  const selects = getClozeSelects(subjectEl);
  if (selects.length === 0) return false;

  const answers = parseClozeAnswers(question, answer).filter((value) => isValidAnswer(value));
  if (answers.length !== selects.length) {
    warn(`题目 ${question.displayIndex}: 下拉空位需要 ${selects.length} 个答案，实际 ${answers.length} 个`);
    return false;
  }

  const targetLabels = answers.map((item) => resolveClozeAnswerLabel(question, item));
  const unresolvedIndex = targetLabels.findIndex((label) => !label);
  if (unresolvedIndex >= 0) {
    warn(`题目 ${question.displayIndex} 空位 ${unresolvedIndex + 1}: 未识别下拉答案 "${answers[unresolvedIndex]}"`);
    return false;
  }

  let filled = 0;
  for (let idx = 0; idx < selects.length; idx++) {
    const select = selects[idx];
    const targetLabel = targetLabels[idx];
    const option = Array.from(select.options).find(
      (item) => targetLabel !== null && cleanClozeAnswerLabel(item.textContent || item.label) === targetLabel,
    );
    if (!option || !targetLabel) continue;

    const ok = await fillSingleClozeSelect(select, option);
    if (ok) {
      filled++;
      log(`题目 ${question.displayIndex} 下拉空位 ${idx + 1}: 已选择 ${targetLabel}`);
    } else {
      warn(
        `题目 ${question.displayIndex} 下拉空位 ${idx + 1}: 选择 ${targetLabel} 后读回失败 (${describeClozeSelectState(
          select,
          option,
        )})`,
      );
    }
  }

  return filled === selects.length;
}
