/**
 * 题目提取管道：等待 DOM 稳定 → 遍历 .subject → 构建 Question[]
 */

import type { Question } from '@/types/exam';
import { IMAGE_HINT_KEYWORDS, SUB_INDEX_MULTIPLIER, log, warn } from '@/types/exam';
import { detectQuestionType, extractQuestionImages } from './question-detect';
import {
  ANALYSIS_PARENT_CLASS,
  BLANK_ANSWER_SELECTOR,
  BLANK_IN_DESCRIPTION_SELECTOR,
  OPTION_SELECTOR,
  SUBJECT_DESCRIPTION_SELECTOR,
  SUBJECT_INDEX_SELECTORS,
  SUBJECT_SELECTOR,
  SUB_SUBJECT_SELECTOR,
} from './selectors';

/**
 * 综合题父材料截断长度。
 * FIXED: 综合题展开为 N 个子题后，每个子题都把父题阅读材料拼到 description 里发给 AI；
 *        对 2000 字阅读材料 + 5 子题，token 消耗 = 阅读材料 × 5 ≈ 10K，成本与延迟都被放大 5x。
 *        截断到 800 字可保留主要语义同时控制成本。如需完整材料，可调高此值或改 batch 模式。
 */
const PARENT_DESCRIPTION_MAX_LEN = 800;

/** 顶层题号显示字符串 */
function buildTopDisplayIndex(index: number): string {
  return String(index);
}

/** 子题号显示字符串：父-子，例如 "21.3" */
function buildSubDisplayIndex(parentIndex: number, subIndex: number): string {
  return `${parentIndex}.${subIndex}`;
}

/**
 * 子题 index 整数编码。
 * FIXED: 旧实现 `Number("21.03")` 会让 AI 返回 "21.3" 时 answerMap 匹配失败，
 *        且无法支持 100+ 子题。新方案用整数 `parent*1000 + sub`，全链路稳定。
 */
function buildSubQuestionIndex(parentIndex: number, subIndex: number): number {
  if (subIndex >= SUB_INDEX_MULTIPLIER) {
    warn(`子题号 ${subIndex} 超过 SUB_INDEX_MULTIPLIER=${SUB_INDEX_MULTIPLIER}，编码可能与其他题号冲突`);
  }
  return parentIndex * SUB_INDEX_MULTIPLIER + subIndex;
}

/**
 * 等待题目数量稳定
 */
export async function waitForQuestionsStable(timeout = 8000): Promise<number> {
  const start = Date.now();
  let lastCount = 0;
  let stableTimes = 0;

  while (Date.now() - start < timeout) {
    const count = document.querySelectorAll(SUBJECT_SELECTOR).length;
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

  const finalCount = document.querySelectorAll(SUBJECT_SELECTOR).length;
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
  const subjectElements = document.querySelectorAll(SUBJECT_SELECTOR);
  return Array.from(subjectElements).find((el) => parseQuestionIndex(el) === index) || null;
}

/**
 * 根据 Question 信息找到实际可作答 DOM。
 * FIXED: OUCHN 的综合题把可作答小题放在 `.sub-subject` 里，顶层 `.subject`
 *        只是阅读材料容器。只按顶层题号定位会把 21/22/23 当成简答题，导致 radio
 *        小题全部无法填写；这里用 parentIndex + subIndex 重新落到真实小题节点。
 */
export function findQuestionElement(question: Pick<Question, 'index' | 'parentIndex' | 'subIndex'>): Element | null {
  if (isSubQuestion(question)) {
    const parentEl = findSubjectElement(question.parentIndex);
    if (!parentEl) return null;

    const subSubjectElements = Array.from(parentEl.querySelectorAll(SUB_SUBJECT_SELECTOR));
    const matched = subSubjectElements.find((subEl, idx) => {
      const parsedIndex = parseQuestionIndex(subEl);
      return parsedIndex === question.subIndex || (parsedIndex === 0 && idx + 1 === question.subIndex);
    });

    return matched || subSubjectElements[question.subIndex - 1] || null;
  }

  return findSubjectElement(question.index);
}

/**
 * 类型守卫：当前 Question 是否是综合题展开后的子题。
 * FIXED: 比 `parentIndex !== undefined && subIndex !== undefined` 更显式，
 *        且使 TS 自动 narrow，下游可直接读 question.parentIndex 不用断言。
 */
function isSubQuestion(
  question: Pick<Question, 'index' | 'parentIndex' | 'subIndex'>,
): question is Pick<Question, 'index'> & { parentIndex: number; subIndex: number } {
  return question.parentIndex !== undefined && question.subIndex !== undefined;
}

function parseQuestionIndex(element: Element): number {
  let indexEl: Element | null = null;
  for (const sel of SUBJECT_INDEX_SELECTORS) {
    indexEl = element.querySelector(sel);
    if (indexEl) break;
  }
  if (!indexEl) return 0;

  const match = indexEl.textContent?.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function hasAnalysisSubQuestions(element: Element): boolean {
  return element.classList.contains(ANALYSIS_PARENT_CLASS) && element.querySelectorAll(SUB_SUBJECT_SELECTOR).length > 0;
}

function extractChoiceOptions(element: Element): NonNullable<Question['options']> {
  const options: NonNullable<Question['options']> = [];
  const optionElements = element.querySelectorAll(OPTION_SELECTOR);

  optionElements.forEach((optEl) => {
    const label = optEl.querySelector('.option-index')?.textContent?.trim() || '';
    const content = optEl.querySelector('.option-content')?.textContent?.trim() || '';
    const input = optEl.querySelector('input') as HTMLInputElement;
    const value = input?.getAttribute('ng-value') || input?.value || '';

    options.push({ label, content, value });
  });

  return options;
}

function cleanMatchingText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractVueWrapperPrimaryText(element: Element): string {
  const directText = Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || '')
    .join(' ')
    .trim();
  if (directText) return cleanMatchingText(directText);

  const firstLeaf = Array.from(element.querySelectorAll('span, p, [data-v-5512d720]')).find((node) => {
    const text = cleanMatchingText(node.textContent || '');
    return text.length > 0 && text.length < 120 && !node.querySelector('span, p');
  });
  return cleanMatchingText(firstLeaf?.textContent || element.textContent || '');
}

function getMatchingPanelText(panel: Element): string {
  const contentCenter = panel.querySelector('.content-center');
  if (contentCenter) return extractVueWrapperPrimaryText(contentCenter);
  return cleanMatchingText(panel.textContent || '');
}

function extractMatchingQuestionData(element: Element): {
  items: NonNullable<Question['matchingItems']>;
  options: NonNullable<Question['matchingOptions']>;
} {
  const items: NonNullable<Question['matchingItems']> = [];
  const options: NonNullable<Question['matchingOptions']> = [];

  const rows = Array.from(element.querySelectorAll('.matching-answer-box > ul > li')).filter(
    (row) => row.querySelector('[drag-type="to"]') && row.querySelector('.list-panel:not(.option):not(.panel-desc)'),
  );

  rows.forEach((row, idx) => {
    const stemPanel = row.querySelector('.list-panel:not(.option):not(.panel-desc)');
    const stem = stemPanel ? getMatchingPanelText(stemPanel) : '';
    if (stem) {
      items.push({ key: String(idx + 1), stem, poolLabel: '' });
    }
  });

  const poolElements = Array.from(
    element.querySelectorAll(
      '.answer-pool .clone-area.drag-area[data-option-id], .answer-pool .clone-area.drag-area, ' +
        '.match-item-right, .answer-pool-item, .match-target, [dnd-list] > *, .drag-item',
    ),
  );

  const seenOptions = new Set<string>();
  poolElements.forEach((poolEl, idx) => {
    const content = getMatchingPanelText(poolEl);
    if (!content || seenOptions.has(content)) return;
    seenOptions.add(content);

    const optionId = poolEl.getAttribute('data-option-id') || '';
    const label = optionId || String.fromCharCode(65 + options.length);
    options.push({ label, content, value: optionId || String(idx + 1) });
  });

  if (items.length === 0) {
    const qText = element.textContent || '';
    const circledNums = qText.match(/[①②③④⑤⑥⑦⑧⑨⑩][^①②③④⑤⑥⑦⑧⑨⑩\n]*/g);
    circledNums?.forEach((seg, idx) => {
      const text = cleanMatchingText(seg);
      if (text.length > 1) items.push({ key: String(idx + 1), stem: text, poolLabel: '' });
    });
  }

  return { items, options };
}

function extractAnalysisSubQuestions(parentElement: Element, parentIndex: number, sectionTitle: string): Question[] {
  const parentDescEl = parentElement.querySelector(SUBJECT_DESCRIPTION_SELECTOR);
  const rawParentDescription = parentDescEl?.textContent?.trim() || '';
  // FIXED: 综合题展开后每个子题都拼接父材料 → token 浪费 N 倍，截断到 PARENT_DESCRIPTION_MAX_LEN。
  const parentDescription =
    rawParentDescription.length > PARENT_DESCRIPTION_MAX_LEN
      ? rawParentDescription.substring(0, PARENT_DESCRIPTION_MAX_LEN) + '…[材料截断]'
      : rawParentDescription;
  const subSubjectElements = Array.from(parentElement.querySelectorAll(SUB_SUBJECT_SELECTOR));

  return subSubjectElements.map((subElement, idx) => {
    const parsedSubIndex = parseQuestionIndex(subElement);
    const subIndex = parsedSubIndex || idx + 1;
    const { type, rawTypeText } = detectQuestionType(subElement);
    const scoreEl = subElement.querySelector('.summary-sub-title');
    const scoreText = scoreEl?.textContent?.trim() || '';
    const subDescEl = subElement.querySelector(SUBJECT_DESCRIPTION_SELECTOR);
    const subDescription = subDescEl?.textContent?.trim() || '';
    const description = [parentDescription, subDescription].filter(Boolean).join('\n\n');
    const images = extractQuestionImages(subElement);
    const options = extractChoiceOptions(subElement);
    const questionType = type === 'unknown' && options.length > 0 ? 'single_selection' : type;
    const displayIndex = buildSubDisplayIndex(parentIndex, subIndex);

    const question: Question = {
      index: buildSubQuestionIndex(parentIndex, subIndex),
      parentIndex,
      subIndex,
      displayIndex,
      type: questionType,
      sectionTitle,
      scoreText,
      description,
      rawText: [parentDescription, subElement.textContent?.trim() || '']
        .filter(Boolean)
        .join('\n\n')
        .substring(0, 2000),
      blankCount: 0,
      hasImage: images.length > 0,
      images,
      rawClassName: subElement.className,
      rawTypeText,
      modelHints: [
        `综合题 ${parentIndex} 的第 ${subIndex} 小题（人类显示题号 ${displayIndex}），回填时需要定位到嵌套 .sub-subject`,
      ],
    };

    if (['single_selection', 'multiple_selection', 'true_or_false'].includes(question.type) || options.length > 0) {
      question.options = options;
    }

    return question;
  });
}

/**
 * 提取页面中的所有题目（增强版）
 */
export function extractQuestions(): Question[] {
  const questions: Question[] = [];
  const subjectElements = document.querySelectorAll(SUBJECT_SELECTOR);

  log(`DOM 中共找到 ${subjectElements.length} 个 .subject 元素`);

  // FIXED: 用 1-based 计数器兜底，确保永远不会出现 index=0
  let fallbackIndex = 0;

  subjectElements.forEach((element) => {
    fallbackIndex++;

    // 检测题型
    const { type, rawTypeText } = detectQuestionType(element);

    // 获取题目序号 - 多选择器兜底
    let index = parseQuestionIndex(element);

    // 获取题目描述和分数
    const descEl = element.querySelector(SUBJECT_DESCRIPTION_SELECTOR);
    const description = descEl?.textContent?.trim() || '';
    const scoreEl = element.querySelector('.summary-sub-title');
    const hasScore = scoreEl && /\d+\s*分/.test(scoreEl.textContent || '');

    // FIXED: 过滤非题目元素（章节标题、分隔符等）
    // 条件：无法解析题号 + 无分数信息 + (无描述 或 type=unknown)
    // 日志中表现为 description 极短 (≤10字符)、type=unknown、scoreText 为空
    if (index === 0 && !hasScore) {
      if (!description || type === 'unknown') {
        return;
      }
    }

    // index=0 说明 DOM 解析不到题号，用 1-based 遍历序号兜底
    if (index === 0) {
      warn(`第 ${fallbackIndex} 个 .subject 元素无法解析题号，使用兜底序号 ${fallbackIndex}`);
      index = fallbackIndex;
    }

    const scoreText = scoreEl?.textContent?.trim() || '';

    // 获取章节标题
    const sectionTitle = getCurrentSectionTitle(element);

    if (hasAnalysisSubQuestions(element)) {
      const subQuestions = extractAnalysisSubQuestions(element, index, sectionTitle);
      log(`综合题 ${index}: 展开 ${subQuestions.length} 个嵌套小题`);
      questions.push(...subQuestions);
      return;
    }

    // 提取图片
    const images = extractQuestionImages(element);
    const hasImage = images.length > 0;

    // 检测填空空位数（去重：同一个元素只算一次）
    let blankCount = 0;
    if (type === 'fill_in_blank') {
      const descBlanks = new Set(Array.from(element.querySelectorAll(BLANK_IN_DESCRIPTION_SELECTOR)));
      if (descBlanks.size > 0) {
        blankCount = descBlanks.size;
      } else {
        const allBlanks = new Set(
          Array.from(element.querySelectorAll(`${BLANK_ANSWER_SELECTOR}, [contenteditable="true"]`)),
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
      displayIndex: buildTopDisplayIndex(index),
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
      question.options = extractChoiceOptions(element);
    }

    // unknown 类型也尝试提取选项（万一有选项结构）
    if (type === 'unknown') {
      const options = extractChoiceOptions(element);
      if (options.length > 0) {
        question.options = options;
        if (element.querySelector('input[type="radio"]')) {
          question.type = 'single_selection';
        } else if (element.querySelector('input[type="checkbox"]')) {
          question.type = 'multiple_selection';
        }
      }
    }

    // 匹配题：提取左侧题干项和答案池
    if (question.type === 'matching') {
      const { items: matchingItems, options: matchingOptions } = extractMatchingQuestionData(element);

      question.matchingItems = matchingItems;
      question.matchingOptions = matchingOptions;
      question.modelHints.push(
        `匹配题：左侧有 ${matchingItems.length} 项，答案池有 ${matchingOptions.length} 个选项`,
        `左侧词汇: ${matchingItems.map((item) => `${item.key}. ${item.stem}`).join(' | ')}`,
        `答案池: ${matchingOptions.map((option) => `${option.label}: ${option.content}`).join(' | ')}`,
      );
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
