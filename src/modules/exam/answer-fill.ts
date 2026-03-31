/**
 * 答案填写：将 AI 返回的答案写入页面 DOM
 */

import type { QuestionType, Question, AIResponse, ExamStats } from '@/types/exam';
import { log, warn } from '@/types/exam';
import { findSubjectElement } from './question-extract';

/**
 * 向 contenteditable 元素填入文本，确保触发框架变更检测
 */
function fillEditable(el: HTMLElement, text: string): void {
  // 聚焦到目标元素
  el.focus();

  // 先用 Selection API 选中元素内全部内容，再删除
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // 使用 execCommand 模拟用户输入（作用于当前 selection，即此元素内部）
  document.execCommand('delete', false);
  document.execCommand('insertText', false, text);

  // 补充直接设置（兜底，防止 execCommand 不生效）
  if (!el.textContent || el.textContent.trim() !== text.trim()) {
    el.textContent = text;
  }

  // 触发事件（必须在所有赋值方式之后，确保不论哪种方式生效都能被框架检测到）
  ['input', 'change', 'blur', 'keyup', 'keydown', 'compositionend'].forEach((eventType) => {
    el.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
  });

  // 尝试触发 Angular digest
  try {
    const angularEl = (window as any).angular?.element(el);
    if (angularEl?.scope) {
      const scope = angularEl.scope();
      scope?.$apply?.();
    }
  } catch {
    // 忽略
  }
}

/**
 * 向 textarea 填入文本
 */
function fillTextarea(el: HTMLTextAreaElement, text: string): void {
  el.focus();
  el.value = text;

  // 使用 InputEvent 以更好地触发框架检测
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
  ['change', 'blur', 'keyup'].forEach((eventType) => {
    el.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
  });

  // Angular 兜底
  try {
    const angularEl = (window as any).angular?.element(el);
    if (angularEl?.scope) {
      const scope = angularEl.scope();
      scope?.$apply?.();
    }
  } catch {
    // 忽略
  }
}

/**
 * 在 subject 元素中查找作答编辑器（排除题目描述中的 contenteditable）
 */
function findAnswerEditors(subjectEl: Element, type: QuestionType): HTMLElement[] {
  if (type === 'fill_in_blank') {
    // 填空题：优先 .___answer，再 subject-description 内的 contenteditable，最后宽泛查找
    let editors = Array.from(subjectEl.querySelectorAll('.___answer[contenteditable="true"]')) as HTMLElement[];

    if (editors.length === 0) {
      editors = Array.from(
        subjectEl.querySelectorAll('.subject-description [contenteditable="true"]'),
      ) as HTMLElement[];
    }

    if (editors.length === 0) {
      // 宽泛查找：排除明显不是答案编辑器的
      editors = (Array.from(subjectEl.querySelectorAll('[contenteditable="true"]')) as HTMLElement[]).filter((el) => {
        // 排除题目描述中只读的装饰性 contenteditable
        const parent = el.closest('.subject-operate, .subject-answer, .answer-area, .blank-area');
        if (parent) return true;
        // 排除很大的容器型 contenteditable
        if (el.children.length > 5) return false;
        return true;
      });
    }

    return editors;
  }

  if (type === 'short_answer' || type === 'unknown') {
    // 简答题：优先 textarea，再 contenteditable
    const textareas = Array.from(subjectEl.querySelectorAll('textarea')) as HTMLElement[];
    if (textareas.length > 0) return textareas;

    // 查找作答区域的 contenteditable
    const answerArea = subjectEl.querySelector('.subject-operate, .subject-answer, .answer-area');
    if (answerArea) {
      const editables = Array.from(answerArea.querySelectorAll('[contenteditable="true"]')) as HTMLElement[];
      if (editables.length > 0) return editables;
    }

    // 兜底：所有 contenteditable，排除语言选择器附近的和题目描述中的
    const allEditables = Array.from(subjectEl.querySelectorAll('[contenteditable="true"]')) as HTMLElement[];

    return allEditables.filter((el) => {
      // 排除题目描述内的（填空空位）
      if (el.closest('.subject-description')) return false;
      // 排除太小的（可能是装饰性）
      if (el.offsetHeight < 20 && el.offsetWidth < 50) return false;
      return true;
    });
  }

  return [];
}

/**
 * 填写选择题（单选、判断）
 */
function fillChoiceQuestion(subjectEl: Element, question: Question, answer: string | string[]): boolean {
  const answerLabel = typeof answer === 'string' ? answer.trim().toUpperCase() : '';
  if (!answerLabel) return false;

  // 方案1：通过 options 的 ng-value 精确点击
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

  // 方案2：通过可见文字匹配选项标签
  const optionElements = Array.from(subjectEl.querySelectorAll('.option'));
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

  // 方案3：判断题内容匹配（AI 可能返回 "正确"/"错误"/"对"/"错" 而非字母）
  if (!targetEl && question.type === 'true_or_false') {
    const rawAnswer = (typeof answer === 'string' ? answer : '').trim();
    targetEl = optionElements.find((optEl) => {
      const content = optEl.querySelector('.option-content')?.textContent?.trim() || '';
      return content === rawAnswer || content.includes(rawAnswer) || rawAnswer.includes(content);
    });
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
function fillMultipleChoiceQuestion(subjectEl: Element, _question: Question, answer: string | string[]): boolean {
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
  answerLabels.forEach((label) => {
    const cleanLabel = label.replace(/[.、．\s]/g, '');
    const optionElements = Array.from(subjectEl.querySelectorAll('.option'));
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
        filled++; // 已选中也算成功
      }
    }
  });

  return filled > 0;
}

/**
 * 填写填空题（支持多空）
 */
function fillBlankQuestion(subjectEl: Element, question: Question, answer: string | string[]): boolean {
  const editors = findAnswerEditors(subjectEl, 'fill_in_blank');
  if (editors.length === 0) {
    warn(`题目 ${question.index}: 未找到填空编辑器`);
    return false;
  }

  // 解析答案为数组
  let answers: string[];
  if (Array.isArray(answer)) {
    answers = answer.map((v) => String(v));
  } else if (typeof answer === 'string') {
    if (editors.length > 1) {
      answers = answer.split(/\s*[|｜;；]\s*/).filter(Boolean);
      if (answers.length !== editors.length) {
        answers = [answer];
      }
    } else {
      answers = [answer];
    }
  } else {
    answers = [String(answer)];
  }

  log(`题目 ${question.index}: ${editors.length} 个空位, ${answers.length} 个答案`);

  let filled = 0;
  editors.forEach((editor, idx) => {
    const value = answers[idx] ?? answers[answers.length - 1] ?? '';
    if (!value) return;

    if (editor instanceof HTMLTextAreaElement) {
      fillTextarea(editor, value);
    } else {
      fillEditable(editor, value);
    }
    filled++;
    log(`题目 ${question.index} 空位 ${idx + 1}: 已填入 "${value}"`);
  });

  return filled > 0;
}

/**
 * 填写简答题 / 应用题 / 综合题
 */
function fillEssayQuestion(subjectEl: Element, question: Question, answer: string | string[]): boolean {
  const answerText = Array.isArray(answer) ? answer.join('\n') : String(answer);
  if (!answerText || answerText === '图片信息不足') {
    warn(`题目 ${question.index}: 答案为空或图片信息不足，跳过填写`);
    return false;
  }

  const editors = findAnswerEditors(subjectEl, 'short_answer');
  if (editors.length === 0) {
    warn(`题目 ${question.index}: 未找到简答题编辑器`);
    return false;
  }

  const editor = editors[0];
  if (editor instanceof HTMLTextAreaElement) {
    fillTextarea(editor, answerText);
  } else {
    fillEditable(editor, answerText);
  }

  log(`题目 ${question.index}: 已填入简答/应用题答案 (${answerText.length} 字)`);
  return true;
}

/**
 * 对单道题填写答案
 */
function fillAnswerForQuestion(question: Question, answer: string | string[], stats: ExamStats): boolean {
  const subjectEl = findSubjectElement(question.index);
  if (!subjectEl) {
    warn(`题目 ${question.index}: 未找到 DOM 元素`);
    stats.fillFailedQuestions.push(question.index);
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
      success = fillBlankQuestion(subjectEl, question, answer);
      break;

    case 'short_answer':
    case 'unknown':
      success = fillEssayQuestion(subjectEl, question, answer);
      break;

    default:
      // 尝试作为简答题处理
      success = fillEssayQuestion(subjectEl, question, answer);
      break;
  }

  if (success) {
    stats.filledCount++;
    log(`题目 ${question.index} (${question.type}): 填写成功`);
  } else {
    stats.fillFailedQuestions.push(question.index);
    warn(`题目 ${question.index} (${question.type}): 填写失败`);
  }

  return success;
}

/**
 * 批量填写所有答案
 */
export function fillAnswers(questions: Question[], aiResponse: AIResponse, stats: ExamStats): void {
  const answerMap = new Map<number, string | string[]>();
  aiResponse.questions.forEach((a) => {
    answerMap.set(a.index, a.answer);
  });

  questions.forEach((question) => {
    const answer = answerMap.get(question.index);
    if (answer === undefined || answer === null) {
      stats.skippedQuestions.push(question.index);
      warn(`题目 ${question.index}: AI 未返回答案，跳过`);
      return;
    }

    fillAnswerForQuestion(question, answer, stats);
  });
}
