/**
 * OUCHN 完形填空/补全对话下拉题兼容层。
 * 对 provider 仍暴露为 answer_blank，DOM 细节集中封装在这里。
 */

import type { AnswerValue, Question } from '@/types/exam';
import { isValidAnswer, log, warn } from '@/types/exam';
import { triggerAngularUpdate } from './answer-write';
import { CLOZE_SELECT_SELECTOR, SUBJECT_SELECTOR } from './selectors';

type PageWindow = Window &
  typeof globalThis & {
    angular?: {
      element: (el: Element) => {
        controller?: (name: string) => AngularNgModelController | undefined;
        injector?: () => { get?: (name: string) => unknown } | undefined;
        scope?: () => AngularScope | undefined;
        isolateScope?: () => AngularScope | undefined;
      };
    };
    jQuery?: JQueryStatic;
    $?: JQueryStatic;
  };

type AngularScope = {
  $apply?: () => void;
  $eval?: (expression: string, locals?: Record<string, unknown>) => unknown;
  $evalAsync?: () => void;
  [key: string]: unknown;
};

type AngularNgModelController = {
  $setViewValue?: (value: string) => void;
  $render?: () => void;
  $modelValue?: unknown;
  $viewValue?: unknown;
};

type AngularParseResult = {
  assign?: (scope: AngularScope, value: unknown) => void;
};

type AngularParse = (expression: string) => AngularParseResult;

type AngularModelRead = {
  available: boolean;
  value: string;
};

function getPageWindow(element?: Element): PageWindow {
  const unsafeWin = (globalThis as unknown as { unsafeWindow?: PageWindow }).unsafeWindow;
  return unsafeWin || (element?.ownerDocument.defaultView as PageWindow | null) || (window as unknown as PageWindow);
}

function normalizeInlineText(text: string): string {
  return text.replace(/[\s\u00a0]+/g, ' ').trim();
}

function normalizeAnswerContent(text: string): string {
  return normalizeInlineText(text).toLowerCase();
}

export function cleanClozeAnswerLabel(answer: string): string {
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

export function extractCleanClozeText(element: Element): string {
  return normalizeInlineText(cloneWithoutClozeWidgetNoise(element).textContent || element.textContent || '');
}

export function findPreviousClozeInstructionText(element: Element): string {
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

export function buildClozeDescription(element: Element): string {
  const cleanText = extractCleanClozeText(element);
  const instructionText = findPreviousClozeInstructionText(element);
  const parts = [instructionText, cleanText].filter(Boolean);
  return Array.from(new Set(parts)).join('\n\n');
}

export function extractClozeOptions(element: Element): NonNullable<Question['options']> {
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

export function isClozeSelectQuestion(question: Question): boolean {
  return (
    question.type === 'fill_in_blank' &&
    (question.rawClassName.includes('cloze') ||
      question.rawTypeText.includes('完形填空') ||
      Boolean(question.options?.length && question.modelHints.some((hint) => hint.includes('完形填空'))))
  );
}

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

export function parseClozeAnswers(question: Question, answer: AnswerValue): string[] {
  if (Array.isArray(answer)) return answer.map(String).filter(Boolean);
  if (answer && typeof answer === 'object') return Object.values(answer).map(String).filter(Boolean);
  return parseClozeAnswerString(question, String(answer));
}

export function resolveClozeAnswerLabel(question: Question, answer: string): string | null {
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

export function getClozeSelects(subjectEl: Element): HTMLSelectElement[] {
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

async function fillSingleClozeSelect(select: HTMLSelectElement, option: HTMLOptionElement): Promise<boolean> {
  setSelectValue(select, option);
  dispatchFormEvents(select);
  triggerAngularUpdate(select, option.value);
  updateAngularModel(select, option.value);
  triggerPageJqueryChange(select);
  syncClozeMultiselect(select, option);
  triggerPageMultiselectChange(select);

  // 点击 multiselect radio 后插件可能重写 select 值，这里再同步一次并等待 Angular digest。
  setSelectValue(select, option);
  dispatchFormEvents(select);
  triggerAngularUpdate(select, option.value);
  updateAngularModel(select, option.value);
  triggerPageJqueryChange(select);

  await new Promise((resolve) => setTimeout(resolve, 80));
  return isSelectFilled(select, option);
}

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
