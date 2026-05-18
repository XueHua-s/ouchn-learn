/**
 * OUCHN 完形填空/补全对话下拉题兼容层。
 * 对 provider 仍暴露为 answer_blank，DOM 细节集中封装在这里。
 */

import type { AnswerValue, Question } from '@/types/exam';
import { isValidAnswer, log, warn } from '@/types/exam';
import { triggerAngularUpdate } from './answer-write';
import { CLOZE_SELECT_SELECTOR, SUBJECT_SELECTOR } from './selectors';

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

function syncClozeMultiselect(select: HTMLSelectElement, option: HTMLOptionElement): void {
  const button = select.id ? document.getElementById(`${select.id}_ms`) : select.nextElementSibling;
  const buttonLabel = button?.querySelector('span:last-child');
  if (buttonLabel) buttonLabel.textContent = option.textContent?.trim() || option.label;
  button?.classList.remove('gray');

  const radio = Array.from(document.querySelectorAll('input[type="radio"]')).find((input) => {
    const radioInput = input as HTMLInputElement;
    return radioInput.name === `multiselect_${select.id}` && radioInput.value === option.value;
  }) as HTMLInputElement | undefined;

  if (!radio) return;

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
}

export function fillClozeSelectQuestion(subjectEl: Element, question: Question, answer: AnswerValue): boolean {
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
  selects.forEach((select, idx) => {
    const targetLabel = targetLabels[idx];
    const option = Array.from(select.options).find(
      (item) => targetLabel !== null && cleanClozeAnswerLabel(item.textContent || item.label) === targetLabel,
    );
    if (!option || !targetLabel) return;

    select.value = option.value;
    option.selected = true;
    dispatchFormEvents(select);
    triggerAngularUpdate(select, option.value);
    syncClozeMultiselect(select, option);
    filled++;
    log(`题目 ${question.displayIndex} 下拉空位 ${idx + 1}: 已选择 ${targetLabel}`);
  });

  return filled === selects.length;
}
