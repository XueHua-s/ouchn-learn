/**
 * 答案填写：将 AI 返回的答案写入页面 DOM
 */

import type { QuestionType, Question, AIResponse, ExamStats } from '@/types/exam';
import { log, warn, isValidAnswer } from '@/types/exam';
import { findSubjectElement } from './question-extract';
import { fillEditable, fillTextarea, writeWithVerify, waitForEditor, triggerAngularUpdate } from './answer-write';

/**
 * 在 subject 元素中查找作答编辑器（排除题目描述中的 contenteditable）
 */
function findAnswerEditors(subjectEl: Element, type: QuestionType): HTMLElement[] {
  if (type === 'fill_in_blank') {
    let editors = Array.from(subjectEl.querySelectorAll('.___answer[contenteditable="true"]')) as HTMLElement[];
    if (editors.length === 0) {
      editors = Array.from(
        subjectEl.querySelectorAll('.subject-description [contenteditable="true"]'),
      ) as HTMLElement[];
    }
    if (editors.length === 0) {
      editors = (Array.from(subjectEl.querySelectorAll('[contenteditable="true"]')) as HTMLElement[]).filter((el) => {
        const parent = el.closest('.subject-operate, .subject-answer, .answer-area, .blank-area');
        if (parent) return true;
        if (el.children.length > 5) return false;
        return true;
      });
    }
    return editors;
  }

  if (type === 'short_answer' || type === 'unknown') {
    const textareas = Array.from(subjectEl.querySelectorAll('textarea')) as HTMLElement[];
    if (textareas.length > 0) return textareas;

    const answerArea = subjectEl.querySelector('.subject-operate, .subject-answer, .answer-area');
    if (answerArea) {
      const editables = Array.from(answerArea.querySelectorAll('[contenteditable="true"]')) as HTMLElement[];
      if (editables.length > 0) return editables;
    }

    return (Array.from(subjectEl.querySelectorAll('[contenteditable="true"]')) as HTMLElement[]).filter((el) => {
      if (el.closest('.subject-description')) return false;
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
        filled++;
      }
    }
  });
  return filled > 0;
}

/**
 * 填写填空题（支持多空）
 */
async function fillBlankQuestion(subjectEl: Element, question: Question, answer: string | string[]): Promise<boolean> {
  const editors = findAnswerEditors(subjectEl, 'fill_in_blank');
  if (editors.length === 0) {
    warn(`题目 ${question.index}: 未找到填空编辑器`);
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
    log(`题目 ${question.index} 空位 ${idx + 1}: ${ok ? '已填入' : '写入失败'} "${value.substring(0, 30)}"`);
  }
  return filled > 0;
}

/**
 * 填写简答题（增强版：写入校验 + 重试 + 等待编辑器挂载）
 */
async function fillEssayQuestion(subjectEl: Element, question: Question, answer: string | string[]): Promise<boolean> {
  const answerText = Array.isArray(answer) ? answer.join('\n') : String(answer);
  if (!answerText || !isValidAnswer(answerText)) {
    warn(`题目 ${question.index}: 答案无效，跳过填写`);
    return false;
  }

  let editors = findAnswerEditors(subjectEl, 'short_answer');
  if (editors.length === 0) {
    const editor = await waitForEditor(subjectEl, '[contenteditable="true"], textarea', 3000);
    if (editor) editors = [editor];
  }
  if (editors.length === 0) {
    warn(`题目 ${question.index}: 未找到简答题编辑器`);
    return false;
  }

  const editor = editors[0];
  const writeFn = editor instanceof HTMLTextAreaElement ? fillTextarea : fillEditable;
  const verified = await writeWithVerify(editor, answerText, writeFn);
  log(`题目 ${question.index}: 填入简答答案 (${answerText.length}字, verified=${verified})`);
  return true;
}

/**
 * 填写匹配题
 */
async function fillMatchingQuestion(
  subjectEl: Element,
  question: Question,
  answer: string | string[],
): Promise<boolean> {
  // 解析 AI 返回的匹配关系
  let matchMap: Record<string, string> = {};

  if (typeof answer === 'string') {
    try {
      matchMap = JSON.parse(answer);
    } catch {
      // 尝试解析 "① → A, ② → B" 格式
      answer.split(/[,，;\n]+/).forEach((pair) => {
        const parts = pair.split(/\s*[-=→>:：]\s*/);
        if (parts.length >= 2) matchMap[parts[0].trim()] = parts[1].trim();
      });
    }
  } else if (Array.isArray(answer)) {
    const stems = question.matchingItems || [];
    answer.forEach((val, idx) => {
      const key = stems[idx]?.stem?.match(/[①②③④⑤⑥⑦⑧⑨⑩]/)?.[0] || String(idx + 1);
      matchMap[key] = String(val);
    });
  }

  if (Object.keys(matchMap).length === 0) {
    warn(`题目 ${question.index}: 无法解析匹配题答案`);
    return false;
  }

  log(`题目 ${question.index}: 匹配答案`, matchMap);

  // 策略 1：AngularJS scope 直接操作
  let filled = 0;
  try {
    const ng = (window as any).angular;
    if (ng) {
      const scope = ng.element(subjectEl).scope();
      if (scope) {
        // 搜索 scope 上的 answer/answers/matchAnswer 对象
        const ansObj = scope.answer || scope.answers || scope.matchAnswer || scope.matching;
        if (ansObj && typeof ansObj === 'object') {
          Object.entries(matchMap).forEach(([key, value]) => {
            ansObj[key] = value;
            filled++;
          });
          scope.$apply?.();
          if (filled > 0) {
            log(`题目 ${question.index}: 通过 AngularJS scope 填入 ${filled} 项`);
            return true;
          }
        }
      }
    }
  } catch {
    // 继续 fallback
  }

  // 策略 2：查找 drop target / slot，写入 textContent
  const dropTargets = subjectEl.querySelectorAll(
    '.match-target, .drop-zone, [dnd-list], .matching-answer-slot, .match-answer',
  );
  for (const [key, value] of Object.entries(matchMap)) {
    const target = Array.from(dropTargets).find(
      (el) => el.closest(`[data-index="${key}"]`) !== null || el.parentElement?.textContent?.includes(key),
    ) as HTMLElement | undefined;
    if (target) {
      target.textContent = value;
      triggerAngularUpdate(target, value);
      filled++;
    }
  }

  if (filled > 0) {
    log(`题目 ${question.index}: 通过 DOM 写入填入 ${filled} 项`);
  } else {
    warn(`题目 ${question.index}: 匹配题填写失败，未找到可操作的 DOM 目标`);
  }
  return filled > 0;
}

/**
 * 对单道题填写答案
 */
async function fillAnswerForQuestion(
  question: Question,
  answer: string | string[],
  stats: ExamStats,
): Promise<boolean> {
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
export async function fillAnswers(questions: Question[], aiResponse: AIResponse, stats: ExamStats): Promise<void> {
  const answerMap = new Map<number, string | string[]>();
  aiResponse.questions.forEach((a) => {
    answerMap.set(a.index, a.answer);
  });

  const aiIndexes = Array.from(answerMap.keys()).sort((a, b) => a - b);
  const localIndexes = questions.map((q) => q.index).sort((a, b) => a - b);
  if (aiResponse.questions.length !== questions.length) {
    warn(
      `AI 返回题数(${aiResponse.questions.length}) ≠ 本地题数(${questions.length})`,
      '| AI:',
      aiIndexes.join(','),
      '| 本地:',
      localIndexes.join(','),
    );
  }

  for (const question of questions) {
    const answer = answerMap.get(question.index);
    if (answer === undefined || answer === null) {
      stats.skippedQuestions.push(question.index);
      warn(`题目 ${question.index}: AI 未返回答案，跳过`);
      continue;
    }
    await fillAnswerForQuestion(question, answer, stats);
  }
}
