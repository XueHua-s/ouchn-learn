/**
 * 答案填写：将 AI 返回的答案写入页面 DOM
 */

import type { QuestionType, Question, AnswerValue } from '@/types/exam';
import { log, warn, isValidAnswer } from '@/types/exam';
import { findQuestionElement } from './question-extract';
import { fillEditable, fillTextarea, writeWithVerify, waitForEditor } from './answer-write';
import { fillMatchingQuestion } from './answer-match';
import { fillClozeSelectQuestion, getClozeSelects } from './cloze-select';
import {
  ANSWER_AREA_SELECTOR,
  BLANK_ANSWER_SELECTOR,
  ESSAY_FALLBACK_EDITOR_SELECTOR,
  ESSAY_PRIMARY_EDITOR_SELECTORS,
  OPTION_SELECTOR,
  SUBJECT_DESCRIPTION_SELECTOR,
  isInsideSubjectDescription,
} from './selectors';

/** 简答题主编辑器选择器（合成一条 selector 字符串供 querySelectorAll 一次拿到所有候选） */
const ESSAY_PRIMARY_EDITOR_SELECTOR = ESSAY_PRIMARY_EDITOR_SELECTORS.join(', ');

/**
 * 在 subject 元素中查找作答编辑器（排除题目描述中的 contenteditable）
 */
function findAnswerEditors(subjectEl: Element, type: QuestionType): HTMLElement[] {
  if (type === 'fill_in_blank') {
    let editors = Array.from(subjectEl.querySelectorAll(BLANK_ANSWER_SELECTOR)) as HTMLElement[];
    if (editors.length === 0) {
      editors = Array.from(
        subjectEl.querySelectorAll(`${SUBJECT_DESCRIPTION_SELECTOR} [contenteditable="true"]`),
      ) as HTMLElement[];
    }
    if (editors.length === 0) {
      editors = (Array.from(subjectEl.querySelectorAll('[contenteditable="true"]')) as HTMLElement[]).filter((el) => {
        const parent = el.closest(`${ANSWER_AREA_SELECTOR}, .blank-area`);
        if (parent) return true;
        if (el.children.length > 5) return false;
        return true;
      });
    }
    return editors;
  }

  if (type === 'short_answer' || type === 'unknown') {
    const visibleEditors = (
      Array.from(subjectEl.querySelectorAll(ESSAY_PRIMARY_EDITOR_SELECTOR)) as HTMLElement[]
    ).filter((el) => !isInsideSubjectDescription(el));
    if (visibleEditors.length > 0) return visibleEditors;

    const answerArea = subjectEl.querySelector(ANSWER_AREA_SELECTOR);
    if (answerArea) {
      const editables = Array.from(answerArea.querySelectorAll('[contenteditable="true"]')) as HTMLElement[];
      if (editables.length > 0) return editables;
    }

    const editables = (Array.from(subjectEl.querySelectorAll('[contenteditable="true"]')) as HTMLElement[]).filter(
      (el) => {
        if (isInsideSubjectDescription(el)) return false;
        if (el.offsetHeight < 20 && el.offsetWidth < 50) return false;
        return true;
      },
    );
    if (editables.length > 0) return editables;

    const textareas = Array.from(subjectEl.querySelectorAll('textarea')) as HTMLElement[];
    if (textareas.length > 0) return textareas;
  }

  return [];
}

/**
 * 同步简答题的 fallback 编辑器（隐藏 textarea / 平行 Simditor 实例）。
 *
 * FIXED: OUCHN 的 Simditor 通常会维护一个隐藏 textarea 作为表单提交字段；只写主编辑器
 *        而忽略 textarea，提交时可能拿到空字符串。这里把所有 fallback 编辑器都写一遍并
 *        用 writeWithVerify 校验，任何一个 fallback 失败都会被记录到日志（但不当作主流程失败，
 *        因为主编辑器已写入并触发了 angular digest，提交字段同步是"加固"层）。
 *
 * 返回成功同步的 fallback 数量；调用方仅用于日志，不影响 fillFailedQuestions 计数，
 * 避免主流程因为隐藏字段语义不明而误报失败。
 */
async function syncEssayFallbackEditors(
  subjectEl: Element,
  primaryEditor: HTMLElement,
  answerText: string,
): Promise<number> {
  const fallbackEditors = Array.from(subjectEl.querySelectorAll(ESSAY_FALLBACK_EDITOR_SELECTOR)) as HTMLElement[];

  let synced = 0;
  for (const editor of fallbackEditors) {
    if (editor === primaryEditor) continue;
    if (isInsideSubjectDescription(editor)) continue;

    const writeFn = editor instanceof HTMLTextAreaElement ? fillTextarea : fillEditable;
    const ok = await writeWithVerify(editor, answerText, writeFn);
    if (ok) synced++;
  }
  return synced;
}

/**
 * 填写选择题（单选、判断）
 */
function fillChoiceQuestion(subjectEl: Element, question: Question, answer: AnswerValue): boolean {
  if (typeof answer === 'object' && !Array.isArray(answer)) return false;
  const answerLabel = typeof answer === 'string' ? answer.trim().toUpperCase() : '';
  if (!answerLabel) return false;

  if (question.options) {
    const cleanLabel = answerLabel.replace(/[.、．\s]/g, '');
    const option = question.options.find((opt) => {
      const optLabel = opt.label.replace(/[.、．\s]/g, '').toUpperCase();
      return optLabel === cleanLabel;
    });
    if (option && option.value) {
      const input = subjectEl.querySelector(`input[ng-value="${option.value}"]`) as HTMLInputElement;
      if (input) {
        input.click();
        return true;
      }
    }
  }

  const optionElements = Array.from(subjectEl.querySelectorAll(OPTION_SELECTOR));
  const cleanAnswer = answerLabel.replace(/[.、．\s]/g, '');
  let targetEl = optionElements.find((optEl) => {
    const indexEl = optEl.querySelector('.option-index');
    const optText =
      indexEl?.textContent
        ?.trim()
        .replace(/[.、．\s]/g, '')
        .toUpperCase() || '';
    return optText === cleanAnswer;
  });

  // FIXED: 单选/判断题在按字母 label 找不到时，尝试用 AI 返回的"内容文本"匹配选项。
  //        ① 优先严格相等（content === rawAnswer），避免互相包含的选项被误选；
  //        ② 仅当 rawAnswer 长度 ≥3 时才走 includes 兜底，过短的字符（如 "对"/"错"/"是"/"否"）
  //           做 includes 反而容易把"对"匹配到"绝对正确"等长选项；判断题"对/错"在
  //           question.options 阶段已经能按 label 命中，不需要靠 includes。
  if (!targetEl && (question.type === 'single_selection' || question.type === 'true_or_false')) {
    const rawAnswer = (typeof answer === 'string' ? answer : '').trim();
    if (rawAnswer) {
      const exact = optionElements.find((optEl) => {
        const content = optEl.querySelector('.option-content')?.textContent?.trim() || '';
        return content === rawAnswer;
      });
      if (exact) {
        targetEl = exact;
      } else if (rawAnswer.length >= 3) {
        targetEl = optionElements.find((optEl) => {
          const content = optEl.querySelector('.option-content')?.textContent?.trim() || '';
          return content.includes(rawAnswer) || rawAnswer.includes(content);
        });
      }
    }
  }

  if (targetEl) {
    const input = targetEl.querySelector('input[type="radio"], input[type="checkbox"]') as HTMLInputElement;
    if (input) {
      input.click();
      return true;
    }
    (targetEl as HTMLElement).click();
    return true;
  }
  return false;
}

/**
 * 填写多选题
 */
function fillMultipleChoiceQuestion(subjectEl: Element, _question: Question, answer: AnswerValue): boolean {
  if (typeof answer === 'object' && !Array.isArray(answer)) return false;
  const answerLabels = Array.isArray(answer)
    ? answer.map((a) => String(a).trim().toUpperCase())
    : typeof answer === 'string'
      ? answer
          .split(/[,，\s]+/)
          .map((a) => a.trim().toUpperCase())
          .filter(Boolean)
      : [];
  if (answerLabels.length === 0) return false;

  let filled = 0;
  // FIXED: 把 querySelectorAll 提到循环外，避免每个 label 都重新扫描 DOM。
  const optionElements = Array.from(subjectEl.querySelectorAll(OPTION_SELECTOR));
  answerLabels.forEach((label) => {
    const cleanLabel = label.replace(/[.、．\s]/g, '');
    const targetEl = optionElements.find((optEl) => {
      const indexEl = optEl.querySelector('.option-index');
      const optText =
        indexEl?.textContent
          ?.trim()
          .replace(/[.、．\s]/g, '')
          .toUpperCase() || '';
      return optText === cleanLabel;
    });
    if (targetEl) {
      const input = targetEl.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (input && !input.checked) {
        input.click();
        filled++;
      } else if (input?.checked) {
        filled++;
      }
    }
  });
  return filled > 0;
}

/**
 * 填写填空题（支持多空）
 */
async function fillBlankQuestion(subjectEl: Element, question: Question, answer: AnswerValue): Promise<boolean> {
  if (getClozeSelects(subjectEl).length > 0) {
    return fillClozeSelectQuestion(subjectEl, question, answer);
  }

  const editors = findAnswerEditors(subjectEl, 'fill_in_blank');
  if (editors.length === 0) {
    warn(`题目 ${question.displayIndex}: 未找到填空编辑器`);
    return false;
  }

  let answers: string[];
  if (Array.isArray(answer)) {
    answers = answer.map((v) => String(v)).filter((v) => isValidAnswer(v));
  } else if (typeof answer === 'string') {
    if (editors.length > 1) {
      answers = answer.split(/\s*[|｜;；]\s*/).filter(Boolean);
      if (answers.length !== editors.length) answers = [answer];
    } else {
      answers = [answer];
    }
  } else {
    answers = [String(answer)];
  }

  let filled = 0;
  for (let idx = 0; idx < editors.length; idx++) {
    const value = answers[idx] ?? answers[answers.length - 1] ?? '';
    if (!value || !isValidAnswer(value)) continue;
    const editor = editors[idx];
    const writeFn = editor instanceof HTMLTextAreaElement ? fillTextarea : fillEditable;
    const ok = await writeWithVerify(editor, value, writeFn);
    if (ok) filled++;
    log(`题目 ${question.displayIndex} 空位 ${idx + 1}: ${ok ? '已填入' : '写入失败'} "${value.substring(0, 30)}"`);
  }
  return filled > 0;
}

/**
 * 填写简答题（增强版：写入校验 + 重试 + 等待编辑器挂载）
 */
async function fillEssayQuestion(subjectEl: Element, question: Question, answer: AnswerValue): Promise<boolean> {
  if (typeof answer === 'object' && !Array.isArray(answer)) return false;
  const answerText = Array.isArray(answer) ? answer.join('\n') : String(answer);
  if (!answerText || !isValidAnswer(answerText)) {
    warn(`题目 ${question.displayIndex}: 答案无效，跳过填写`);
    return false;
  }

  let editors = findAnswerEditors(subjectEl, 'short_answer');
  if (editors.length === 0) {
    const editor = await waitForEditor(subjectEl, '[contenteditable="true"], textarea', 3000);
    if (editor) editors = [editor];
  }
  if (editors.length === 0) {
    warn(`题目 ${question.displayIndex}: 未找到简答题编辑器`);
    return false;
  }

  const editor = editors[0];
  const writeFn = editor instanceof HTMLTextAreaElement ? fillTextarea : fillEditable;
  const verified = await writeWithVerify(editor, answerText, writeFn);
  // FIXED: 必须 await fallback 同步——以前 fire-and-forget 会让主流程在 stats 统计完成后
  //        才真正写完隐藏 textarea，提交时可能拿到旧值。
  const fallbackCount = await syncEssayFallbackEditors(subjectEl, editor, answerText);
  log(
    `题目 ${question.displayIndex}: 填入简答答案 (${answerText.length}字, verified=${verified}, fallback 同步 ${fallbackCount} 个)`,
  );
  return true;
}

// fillMatchingQuestion 已提取到 answer-match.ts

/**
 * 对单道题填写答案
 */
export async function fillAnswerForQuestion(question: Question, answer: AnswerValue): Promise<boolean> {
  const subjectEl = findQuestionElement(question);
  if (!subjectEl) {
    warn(`题目 ${question.displayIndex}: 未找到 DOM 元素`);
    return false;
  }

  let success = false;

  switch (question.type) {
    case 'single_selection':
    case 'true_or_false':
      success = fillChoiceQuestion(subjectEl, question, answer);
      break;
    case 'multiple_selection':
      success = fillMultipleChoiceQuestion(subjectEl, question, answer);
      break;
    case 'fill_in_blank':
      success = await fillBlankQuestion(subjectEl, question, answer);
      break;
    case 'short_answer':
      success = await fillEssayQuestion(subjectEl, question, answer);
      break;
    case 'matching':
      success = await fillMatchingQuestion(subjectEl, question, answer);
      break;
    case 'unknown':
    default:
      success = await fillEssayQuestion(subjectEl, question, answer);
      break;
  }

  return success;
}
