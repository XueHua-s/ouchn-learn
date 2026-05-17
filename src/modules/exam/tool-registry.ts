/**
 * AI 答题工具注册表：把受控工具意图映射到现有、已验证的 DOM 填写能力。
 */

import type { AnswerValue, Question, QuestionType } from '@/types/exam';
import { isValidAnswer } from '@/types/exam';
import { findQuestionElement } from './question-extract';
import { fillAnswerForQuestion } from './answer-fill';
import {
  buildExamTool,
  createToolError,
  createToolSuccess,
  isAnswerBlankInput,
  isAnswerChoiceInput,
  isAnswerEssayInput,
  isAnswerMatchingInput,
  isAnswerMultipleChoiceInput,
  matchingPairsToAnswerValue,
  type AnswerBlankInput,
  type AnswerChoiceInput,
  type AnswerEssayInput,
  type AnswerMatchingInput,
  type AnswerMultipleChoiceInput,
  type ExamTool,
  type ExamToolContext,
  type ExamToolName,
  type ExamToolResult,
} from './tool-contract';

export interface RunnableExamTool {
  name: ExamToolName;
  description: string;
  inputSchema: (input: unknown) => boolean;
  validateInput?: (input: unknown, context: ExamToolContext) => ExamToolResult | null;
  isConcurrencySafe: (input: unknown) => boolean;
  isReadOnly: (input: unknown) => boolean;
  execute: (input: unknown, context: ExamToolContext) => Promise<ExamToolResult>;
}

function getQuestion(context: ExamToolContext, questionIndex: number): Question | null {
  return context.questionByIndex.get(questionIndex) || null;
}

function questionNotFound(tool: ExamToolName, questionIndex: number): ExamToolResult {
  return createToolError({
    tool,
    questionIndex,
    code: 'question_not_found',
    message: `未找到题目 index=${questionIndex}`,
    retryable: false,
  });
}

function invalidShape(tool: ExamToolName, questionIndex: number, message: string): ExamToolResult {
  return createToolError({
    tool,
    questionIndex,
    code: 'invalid_answer_shape',
    message,
    retryable: true,
  });
}

function unsupportedType(tool: ExamToolName, question: Question, expected: string): ExamToolResult {
  return createToolError({
    tool,
    questionIndex: question.index,
    code: 'unsupported_question_type',
    message: `题目 ${question.displayIndex} 类型为 ${question.type}，不能使用 ${tool}，期望 ${expected}`,
    retryable: true,
  });
}

function domNotFound(tool: ExamToolName, question: Question): ExamToolResult | null {
  if (findQuestionElement(question)) return null;
  return createToolError({
    tool,
    questionIndex: question.index,
    code: 'question_not_found',
    message: `题目 ${question.displayIndex}: 未找到 DOM 元素`,
    retryable: false,
  });
}

function validateQuestionType(
  tool: ExamToolName,
  context: ExamToolContext,
  questionIndex: number,
  allowedTypes: QuestionType[],
  expected: string,
): ExamToolResult | null {
  const question = getQuestion(context, questionIndex);
  if (!question) return questionNotFound(tool, questionIndex);
  if (!allowedTypes.includes(question.type)) return unsupportedType(tool, question, expected);
  return domNotFound(tool, question);
}

function cleanOptionLabel(label: string): string {
  return label
    .trim()
    .replace(/[.、．\s]/g, '')
    .toUpperCase();
}

function cleanMatchingText(text: string): string {
  return text
    .replace(/[\s\u00a0]+/g, '')
    .replace(/[.、．:：;；,，()（）【】[\]]/g, '')
    .toLowerCase();
}

function matchingTextMatches(candidate: string, expected: string): boolean {
  const normalizedCandidate = cleanMatchingText(candidate);
  const normalizedExpected = cleanMatchingText(expected);
  if (!normalizedCandidate || !normalizedExpected) return false;
  return (
    normalizedCandidate === normalizedExpected ||
    normalizedCandidate.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedCandidate)
  );
}

function parseMatchingEntries(answer: AnswerValue): Array<[string, string]> | null {
  if (typeof answer === 'object' && answer !== null && !Array.isArray(answer)) {
    return Object.entries(answer).map(([key, value]) => [key, String(value)]);
  }

  if (Array.isArray(answer)) return null;

  const text = String(answer).trim();
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.entries(parsed).map(([key, value]) => [key, String(value)]);
    }
    if (Array.isArray(parsed)) return null;
  } catch {
    // Not JSON; continue with loose textual pair parsing.
  }

  const entries: Array<[string, string]> = [];
  for (const line of text.split(/[,，;；\n]+/)) {
    const match = line.match(/(.+?)\s*[-=→>:：]+\s*(.+)/);
    if (match) entries.push([match[1], match[2]]);
  }
  return entries;
}

function getMatchingAnswerValues(answer: AnswerValue, entries: Array<[string, string]> | null): string[] {
  if (entries) return entries.map(([, value]) => value);
  if (Array.isArray(answer)) return answer.map(String);
  return [];
}

function validateChoiceAnswer(tool: ExamToolName, question: Question, answer: string): ExamToolResult | null {
  const rawAnswer = answer.trim();
  if (!rawAnswer || !isValidAnswer(rawAnswer)) {
    return invalidShape(tool, question.index, `题目 ${question.displayIndex}: 答案为空或无效`);
  }

  const options = question.options || [];
  if (options.length === 0) return null;

  const cleanAnswer = cleanOptionLabel(rawAnswer);
  const matchesLabel = options.some((opt) => cleanOptionLabel(opt.label) === cleanAnswer);
  if (matchesLabel) return null;

  if (question.type === 'single_selection' || question.type === 'true_or_false') {
    const matchesContent = options.some((opt) => {
      const content = opt.content.trim();
      return (
        content === rawAnswer || (rawAnswer.length >= 3 && (content.includes(rawAnswer) || rawAnswer.includes(content)))
      );
    });
    if (matchesContent) return null;
  }

  return createToolError({
    tool,
    questionIndex: question.index,
    code: 'unknown_option_label',
    message: `题目 ${question.displayIndex}: 未识别选项 "${rawAnswer}"`,
    retryable: true,
  });
}

function validateMultipleChoiceAnswers(question: Question, answers: string[]): ExamToolResult | null {
  if (answers.length === 0 || !answers.some((answer) => isValidAnswer(answer))) {
    return invalidShape('answer_multiple_choice', question.index, `题目 ${question.displayIndex}: 多选答案为空或无效`);
  }

  const options = question.options || [];
  if (options.length === 0) return null;

  const optionLabels = new Set(options.map((opt) => cleanOptionLabel(opt.label)));
  const unknown = answers.find((answer) => !optionLabels.has(cleanOptionLabel(answer)));
  if (!unknown) return null;

  return createToolError({
    tool: 'answer_multiple_choice',
    questionIndex: question.index,
    code: 'unknown_option_label',
    message: `题目 ${question.displayIndex}: 未识别多选选项 "${unknown}"`,
    retryable: true,
  });
}

function validateBlankAnswers(question: Question, answers: string[]): ExamToolResult | null {
  if (answers.length === 0 || !answers.some((answer) => isValidAnswer(answer))) {
    return invalidShape('answer_blank', question.index, `题目 ${question.displayIndex}: 填空答案为空或无效`);
  }

  if (question.blankCount > 1 && answers.length > 1 && answers.length !== question.blankCount) {
    return createToolError({
      tool: 'answer_blank',
      questionIndex: question.index,
      code: 'blank_count_mismatch',
      message: `题目 ${question.displayIndex}: 需要 ${question.blankCount} 个空位答案，实际 ${answers.length} 个`,
      retryable: true,
    });
  }

  return null;
}

function validateMatchingPairs(question: Question, answer: AnswerValue): ExamToolResult | null {
  if (!isValidAnswer(answer)) {
    return invalidShape('answer_matching', question.index, `题目 ${question.displayIndex}: 匹配答案为空或无效`);
  }

  const entries = parseMatchingEntries(answer);
  if (entries && entries.length === 0) {
    return createToolError({
      tool: 'answer_matching',
      questionIndex: question.index,
      code: 'matching_pair_unresolved',
      message: `题目 ${question.displayIndex}: 无法解析匹配关系`,
      retryable: true,
    });
  }

  if (entries && question.matchingItems?.length) {
    const expectedKeys = new Set(question.matchingItems.map((item) => cleanMatchingText(item.key)));
    for (const [key] of entries) {
      const normalizedKey = cleanMatchingText(key);
      const matchedKey = expectedKeys.has(normalizedKey);
      const matchedStem = question.matchingItems.some((item) => matchingTextMatches(key, item.stem));
      if (!matchedKey && !matchedStem) {
        return createToolError({
          tool: 'answer_matching',
          questionIndex: question.index,
          code: 'matching_pair_unresolved',
          message: `题目 ${question.displayIndex}: 未识别匹配题左侧项 "${key}"`,
          retryable: true,
        });
      }
    }
  }

  const values = getMatchingAnswerValues(answer, entries);
  if (values.length > 0 && question.matchingOptions?.length) {
    const optionLabels = new Set(question.matchingOptions.map((option) => cleanMatchingText(option.label)));
    const optionValues = new Set(question.matchingOptions.map((option) => cleanMatchingText(option.value)));
    for (const value of values) {
      const normalizedValue = cleanMatchingText(value);
      const matchedLabel = optionLabels.has(normalizedValue) || optionValues.has(normalizedValue);
      const matchedContent = question.matchingOptions.some((option) => matchingTextMatches(value, option.content));
      if (!matchedLabel && !matchedContent) {
        return createToolError({
          tool: 'answer_matching',
          questionIndex: question.index,
          code: 'matching_pair_unresolved',
          message: `题目 ${question.displayIndex}: 未识别匹配题右侧项 "${value}"`,
          retryable: true,
        });
      }
    }
  }

  return null;
}

async function executeAnswer(tool: ExamToolName, question: Question, answer: AnswerValue): Promise<ExamToolResult> {
  const success = await fillAnswerForQuestion(question, answer);
  if (success) return createToolSuccess(tool, question.index);
  return createToolError({
    tool,
    questionIndex: question.index,
    code: 'dom_write_failed',
    message: `题目 ${question.displayIndex} (${question.type}): DOM 写入失败`,
    retryable: false,
  });
}

const answerChoiceTool = buildExamTool<AnswerChoiceInput>({
  name: 'answer_choice',
  description: '填写单选题或判断题答案。',
  inputSchema: isAnswerChoiceInput,
  validateInput(input, context) {
    const typeError = validateQuestionType(
      'answer_choice',
      context,
      input.questionIndex,
      ['single_selection', 'true_or_false'],
      'single_selection/true_or_false',
    );
    if (typeError) return typeError;
    const question = getQuestion(context, input.questionIndex);
    return question ? validateChoiceAnswer('answer_choice', question, input.answer) : null;
  },
  async execute(input, context) {
    const question = getQuestion(context, input.questionIndex);
    if (!question) return questionNotFound('answer_choice', input.questionIndex);
    return executeAnswer('answer_choice', question, input.answer);
  },
});

const answerMultipleChoiceTool = buildExamTool<AnswerMultipleChoiceInput>({
  name: 'answer_multiple_choice',
  description: '填写多选题答案。',
  inputSchema: isAnswerMultipleChoiceInput,
  validateInput(input, context) {
    const typeError = validateQuestionType(
      'answer_multiple_choice',
      context,
      input.questionIndex,
      ['multiple_selection'],
      'multiple_selection',
    );
    if (typeError) return typeError;
    const question = getQuestion(context, input.questionIndex);
    return question ? validateMultipleChoiceAnswers(question, input.answers) : null;
  },
  async execute(input, context) {
    const question = getQuestion(context, input.questionIndex);
    if (!question) return questionNotFound('answer_multiple_choice', input.questionIndex);
    return executeAnswer('answer_multiple_choice', question, input.answers);
  },
});

const answerBlankTool = buildExamTool<AnswerBlankInput>({
  name: 'answer_blank',
  description: '填写填空题答案。',
  inputSchema: isAnswerBlankInput,
  validateInput(input, context) {
    const typeError = validateQuestionType(
      'answer_blank',
      context,
      input.questionIndex,
      ['fill_in_blank'],
      'fill_in_blank',
    );
    if (typeError) return typeError;
    const question = getQuestion(context, input.questionIndex);
    return question ? validateBlankAnswers(question, input.answers) : null;
  },
  async execute(input, context) {
    const question = getQuestion(context, input.questionIndex);
    if (!question) return questionNotFound('answer_blank', input.questionIndex);
    return executeAnswer('answer_blank', question, input.answers);
  },
});

const answerEssayTool = buildExamTool<AnswerEssayInput>({
  name: 'answer_essay',
  description: '填写简答题或未知题型的文本答案。',
  inputSchema: isAnswerEssayInput,
  validateInput(input, context) {
    const typeError = validateQuestionType(
      'answer_essay',
      context,
      input.questionIndex,
      ['short_answer', 'unknown'],
      'short_answer/unknown',
    );
    if (typeError) return typeError;
    const question = getQuestion(context, input.questionIndex);
    if (!question) return null;
    if (!input.answer.trim() || !isValidAnswer(input.answer)) {
      return invalidShape('answer_essay', question.index, `题目 ${question.displayIndex}: 简答答案为空或无效`);
    }
    return null;
  },
  async execute(input, context) {
    const question = getQuestion(context, input.questionIndex);
    if (!question) return questionNotFound('answer_essay', input.questionIndex);
    return executeAnswer('answer_essay', question, input.answer);
  },
});

const answerMatchingTool = buildExamTool<AnswerMatchingInput>({
  name: 'answer_matching',
  description: '填写匹配题答案。',
  inputSchema: isAnswerMatchingInput,
  validateInput(input, context) {
    const typeError = validateQuestionType('answer_matching', context, input.questionIndex, ['matching'], 'matching');
    if (typeError) return typeError;
    const question = getQuestion(context, input.questionIndex);
    return question ? validateMatchingPairs(question, matchingPairsToAnswerValue(input.pairs)) : null;
  },
  async execute(input, context) {
    const question = getQuestion(context, input.questionIndex);
    if (!question) return questionNotFound('answer_matching', input.questionIndex);
    return executeAnswer('answer_matching', question, matchingPairsToAnswerValue(input.pairs));
  },
});

function toRunnableTool<Input>(tool: ExamTool<Input>): RunnableExamTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    validateInput(input, context) {
      if (!tool.inputSchema(input)) {
        return createToolError({
          tool: tool.name,
          code: 'invalid_tool_input',
          message: `${tool.name} 输入结构无效`,
          retryable: true,
        });
      }
      return tool.validateInput?.(input, context) || null;
    },
    isConcurrencySafe(input) {
      return tool.inputSchema(input) ? tool.isConcurrencySafe(input) : false;
    },
    isReadOnly(input) {
      return tool.inputSchema(input) ? tool.isReadOnly(input) : false;
    },
    async execute(input, context) {
      if (!tool.inputSchema(input)) {
        return createToolError({
          tool: tool.name,
          code: 'invalid_tool_input',
          message: `${tool.name} 输入结构无效`,
          retryable: true,
        });
      }
      return tool.execute(input, context);
    },
  };
}

export const EXAM_TOOLS = [
  toRunnableTool(answerChoiceTool),
  toRunnableTool(answerMultipleChoiceTool),
  toRunnableTool(answerBlankTool),
  toRunnableTool(answerEssayTool),
  toRunnableTool(answerMatchingTool),
] as const;

export function findExamTool(name: string): RunnableExamTool | undefined {
  return EXAM_TOOLS.find((tool) => tool.name === name);
}
