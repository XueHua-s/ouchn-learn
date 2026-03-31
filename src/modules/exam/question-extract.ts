/**
 * 题目提取管道：等待 DOM 稳定 → 遍历 .subject → 构建 Question[]
 */

import type { Question } from '@/types/exam';
import { IMAGE_HINT_KEYWORDS, log, warn } from '@/types/exam';
import { detectQuestionType, extractQuestionImages } from './question-detect';

/**
 * 等待题目数量稳定
 */
export async function waitForQuestionsStable(timeout = 8000): Promise<number> {
  const start = Date.now();
  let lastCount = 0;
  let stableTimes = 0;

  while (Date.now() - start < timeout) {
    const count = document.querySelectorAll('.subject').length;
    if (count > 0 && count === lastCount) {
      stableTimes++;
      if (stableTimes >= 3) {
        log(`题目数量已稳定: ${count} 道`);
        return count;
      }
    } else {
      stableTimes = 0;
      lastCount = count;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const finalCount = document.querySelectorAll('.subject').length;
  warn(`等待题目稳定超时，当前数量: ${finalCount}`);
  return finalCount;
}

/**
 * 获取当前章节标题
 */
function getCurrentSectionTitle(element: Element): string {
  // 向上查找最近的章节标题
  let prev = element.previousElementSibling;
  while (prev) {
    const text = prev.textContent?.trim() || '';
    if (/^[一二三四五六七八九十]+、/.test(text)) {
      return text;
    }
    if (prev.classList?.contains('section-title') || prev.classList?.contains('paper-section-title')) {
      return text;
    }
    prev = prev.previousElementSibling;
  }

  // 尝试从父元素里找
  const parent = element.closest('.paper-section, .exam-section, .section');
  if (parent) {
    const titleEl = parent.querySelector('.section-title, .paper-section-title, h3, h4');
    if (titleEl) return titleEl.textContent?.trim() || '';
  }

  return '';
}

/**
 * 根据题号找到对应的 .subject DOM 元素
 */
export function findSubjectElement(index: number): Element | null {
  const subjectElements = document.querySelectorAll('.subject');
  return (
    Array.from(subjectElements).find((el) => {
      const indexEl =
        el.querySelector('.subject-resort-index .ng-binding') || el.querySelector('.subject-resort-index');
      if (!indexEl) return false;
      const match = indexEl.textContent?.match(/(\d+)/);
      return match && parseInt(match[1]) === index;
    }) || null
  );
}

/**
 * 提取页面中的所有题目（增强版）
 */
export function extractQuestions(): Question[] {
  const questions: Question[] = [];
  const subjectElements = document.querySelectorAll('.subject');

  log(`DOM 中共找到 ${subjectElements.length} 个 .subject 元素`);

  // FIXED: 用 1-based 计数器兜底，确保永远不会出现 index=0
  let fallbackIndex = 0;

  subjectElements.forEach((element) => {
    fallbackIndex++;

    // 检测题型
    const { type, rawTypeText } = detectQuestionType(element);

    // 获取题目序号 - 多选择器兜底
    const indexEl =
      element.querySelector('.subject-resort-index .ng-binding') ||
      element.querySelector('.subject-resort-index') ||
      element.querySelector('.subject-index');
    let index = 0;
    if (indexEl) {
      const match = indexEl.textContent?.match(/(\d+)/);
      index = match ? parseInt(match[1]) : 0;
    }

    // 如果序号为 0 且没有题目描述，可能是非题目元素（如章节标题、分隔符），跳过
    const descEl = element.querySelector('.subject-description');
    const description = descEl?.textContent?.trim() || '';
    if (index === 0 && !description && type === 'unknown') {
      return;
    }

    // index=0 说明 DOM 解析不到题号，用 1-based 遍历序号兜底
    if (index === 0) {
      warn(`第 ${fallbackIndex} 个 .subject 元素无法解析题号，使用兜底序号 ${fallbackIndex}`);
      index = fallbackIndex;
    }

    // 获取分数文字
    const scoreEl = element.querySelector('.summary-sub-title');
    const scoreText = scoreEl?.textContent?.trim() || '';

    // 获取章节标题
    const sectionTitle = getCurrentSectionTitle(element);

    // 提取图片
    const images = extractQuestionImages(element);
    const hasImage = images.length > 0;

    // 检测填空空位数（去重：同一个元素只算一次）
    let blankCount = 0;
    if (type === 'fill_in_blank') {
      const descBlanks = new Set(
        Array.from(
          element.querySelectorAll('.subject-description [contenteditable="true"], .subject-description .___answer'),
        ),
      );
      if (descBlanks.size > 0) {
        blankCount = descBlanks.size;
      } else {
        const allBlanks = new Set(
          Array.from(element.querySelectorAll('.___answer[contenteditable="true"], [contenteditable="true"]')),
        );
        blankCount = allBlanks.size;
      }
    }

    // 构建 modelHints
    const modelHints: string[] = [];
    if (hasImage) {
      modelHints.push('此题包含图片');
      const questionText = element.textContent || '';
      IMAGE_HINT_KEYWORDS.forEach((kw) => {
        if (questionText.includes(kw)) {
          modelHints.push(`图片关键词: ${kw}`);
        }
      });
    }
    if (blankCount > 1) {
      modelHints.push(`此题有 ${blankCount} 个空位，请返回数组答案`);
    }

    const rawText = element.textContent?.trim() || '';

    const question: Question = {
      index,
      type,
      sectionTitle,
      scoreText,
      description,
      rawText: rawText.substring(0, 2000),
      blankCount,
      hasImage,
      images,
      rawClassName: element.className,
      rawTypeText,
      modelHints,
    };

    // 提取选项（选择题、判断题）
    if (['single_selection', 'multiple_selection', 'true_or_false'].includes(type)) {
      const options: Question['options'] = [];
      const optionElements = element.querySelectorAll('.option');

      optionElements.forEach((optEl) => {
        const label = optEl.querySelector('.option-index')?.textContent?.trim() || '';
        const content = optEl.querySelector('.option-content')?.textContent?.trim() || '';
        const input = optEl.querySelector('input') as HTMLInputElement;
        const value = input?.getAttribute('ng-value') || input?.value || '';

        options.push({ label, content, value });
      });

      question.options = options;
    }

    // unknown 类型也尝试提取选项（万一有选项结构）
    if (type === 'unknown') {
      const optionElements = element.querySelectorAll('.option');
      if (optionElements.length > 0) {
        const options: Question['options'] = [];
        optionElements.forEach((optEl) => {
          const label = optEl.querySelector('.option-index')?.textContent?.trim() || '';
          const content = optEl.querySelector('.option-content')?.textContent?.trim() || '';
          const input = optEl.querySelector('input') as HTMLInputElement;
          const value = input?.getAttribute('ng-value') || input?.value || '';
          options.push({ label, content, value });
        });
        question.options = options;
        if (element.querySelector('input[type="radio"]')) {
          question.type = 'single_selection';
        } else if (element.querySelector('input[type="checkbox"]')) {
          question.type = 'multiple_selection';
        }
      }
    }

    questions.push(question);
  });

  // 打印摘要
  log('===== 题目提取摘要 =====');
  console.table(
    questions.map((q) => ({
      index: q.index,
      type: q.type,
      rawTypeText: q.rawTypeText,
      section: q.sectionTitle.substring(0, 20),
      score: q.scoreText,
      hasImage: q.hasImage,
      imageCount: q.images.length,
      blankCount: q.blankCount,
      descLen: q.description.length,
      hints: q.modelHints.join('; '),
    })),
  );

  return questions;
}
