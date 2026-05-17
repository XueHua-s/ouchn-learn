/**
 * AI 答题工具协议：provider 只能表达受控答题意图，DOM 细节由本地工具层封装。
 */

import type { AnswerValue, ExamStats, Question } from '@/types/exam';

export type ExamToolName =
  | 'answer_choice'
  | 'answer_multiple_choice'
  | 'answer_blank'
  | 'answer_essay'
  | 'answer_matching';

export type ExamToolErrorCode =
  | 'unknown_tool'
  | 'invalid_tool_input'
  | 'question_not_found'
  | 'invalid_answer_shape'
  | 'unknown_option_label'
  | 'blank_count_mismatch'
  | 'matching_pair_unresolved'
  | 'dom_write_failed'
  | 'unsupported_question_type'
  | 'provider_parse_failed'
  | 'provider_request_failed'
  | 'partial_tool_success'
  | 'tool_execution_cancelled';

export interface AnswerChoiceInput {
  questionIndex: number;
  answer: string;
}

export interface AnswerMultipleChoiceInput {
  questionIndex: number;
  answers: string[];
}

export interface AnswerBlankInput {
  questionIndex: number;
  answers: string[];
}

export interface AnswerEssayInput {
  questionIndex: number;
  answer: string;
}

export type AnswerMatchingPairs = Record<string, string> | Array<{ left: string; right: string }> | string | string[];

export interface AnswerMatchingInput {
  questionIndex: number;
  pairs: AnswerMatchingPairs;
}

export type ExamToolInput =
  | AnswerChoiceInput
  | AnswerMultipleChoiceInput
  | AnswerBlankInput
  | AnswerEssayInput
  | AnswerMatchingInput;

export type ExamToolUseSource = 'legacy-ai-response' | 'json-envelope' | 'native-tool';

export interface ExamToolUse<Input = unknown> {
  id?: string;
  tool: ExamToolName;
  input: Input;
  source: ExamToolUseSource;
}

export interface ExamToolRunMetadata {
  toolUseId?: string;
  source?: ExamToolUseSource;
  sequence?: number;
}

export type ExamToolResult =
  | {
      ok: true;
      tool: ExamToolName;
      questionIndex: number;
      filledCount: number;
      verified?: boolean;
      warnings?: string[];
      metadata?: ExamToolRunMetadata;
    }
  | {
      ok: false;
      tool: ExamToolName | 'unknown';
      questionIndex?: number;
      code: ExamToolErrorCode;
      message: string;
      retryable: boolean;
      partial?: boolean;
      metadata?: ExamToolRunMetadata;
    };

export interface ExamToolContext {
  questions: Question[];
  questionByIndex: Map<number, Question>;
  stats: ExamStats;
  signal?: AbortSignal;
}

export interface ExamTool<Input> {
  name: ExamToolName;
  description: string;
  inputSchema: (input: unknown) => input is Input;
  validateInput?: (input: Input, context: ExamToolContext) => ExamToolResult | null;
  isConcurrencySafe: (input: Input) => boolean;
  isReadOnly: (input: Input) => boolean;
  execute: (input: Input, context: ExamToolContext) => Promise<ExamToolResult>;
}

export type ExamToolDefinition<Input> = Omit<ExamTool<Input>, 'isConcurrencySafe' | 'isReadOnly'> &
  Partial<Pick<ExamTool<Input>, 'isConcurrencySafe' | 'isReadOnly'>>;

export interface ProviderVisibleToolDescription {
  name: ExamToolName;
  description: string;
  inputExample: ExamToolInput;
}

export const PROVIDER_VISIBLE_EXAM_TOOLS: ProviderVisibleToolDescription[] = [
  {
    name: 'answer_choice',
    description: 'Answer one single-choice or true/false question by option label or exact option text.',
    inputExample: { questionIndex: 1, answer: 'C' },
  },
  {
    name: 'answer_multiple_choice',
    description: 'Answer one multiple-choice question with option labels.',
    inputExample: { questionIndex: 2, answers: ['A', 'C'] },
  },
  {
    name: 'answer_blank',
    description: 'Fill one blank question. The answers array follows the blank order.',
    inputExample: { questionIndex: 3, answers: ['TCP', 'UDP'] },
  },
  {
    name: 'answer_essay',
    description: 'Write one short-answer, essay, or fallback text answer.',
    inputExample: { questionIndex: 4, answer: '答案文本' },
  },
  {
    name: 'answer_matching',
    description: 'Answer one matching question using left item keys/stems mapped to right option labels/content.',
    inputExample: { questionIndex: 5, pairs: { '1': 'A' } },
  },
];

export function buildExamTool<Input>(def: ExamToolDefinition<Input>): ExamTool<Input> {
  return {
    validateInput: () => null,
    isConcurrencySafe: () => false,
    isReadOnly: () => false,
    ...def,
  };
}

export function createToolSuccess(
  tool: ExamToolName,
  questionIndex: number,
  options: { filledCount?: number; verified?: boolean; warnings?: string[] } = {},
): ExamToolResult {
  return {
    ok: true,
    tool,
    questionIndex,
    filledCount: options.filledCount ?? 1,
    verified: options.verified,
    warnings: options.warnings,
  };
}

export function createToolError(args: {
  tool: ExamToolName | 'unknown';
  code: ExamToolErrorCode;
  message: string;
  retryable: boolean;
  questionIndex?: number;
  partial?: boolean;
}): ExamToolResult {
  return { ok: false, ...args };
}

export function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

export function previewUnknownInput(input: unknown, maxLength = 200): string {
  try {
    const serialized = JSON.stringify(input);
    if (serialized !== undefined) return serialized.substring(0, maxLength);
  } catch {
    // Fall through for circular or otherwise unserializable inputs.
  }
  return String(input).substring(0, maxLength);
}

export function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function isAnswerChoiceInput(input: unknown): input is AnswerChoiceInput {
  return isRecord(input) && isPositiveInteger(input.questionIndex) && typeof input.answer === 'string';
}

export function isAnswerMultipleChoiceInput(input: unknown): input is AnswerMultipleChoiceInput {
  return isRecord(input) && isPositiveInteger(input.questionIndex) && isStringArray(input.answers);
}

export function isAnswerBlankInput(input: unknown): input is AnswerBlankInput {
  return isRecord(input) && isPositiveInteger(input.questionIndex) && isStringArray(input.answers);
}

export function isAnswerEssayInput(input: unknown): input is AnswerEssayInput {
  return isRecord(input) && isPositiveInteger(input.questionIndex) && typeof input.answer === 'string';
}

function isMatchingPairArray(value: unknown): value is Array<{ left: string; right: string }> {
  return (
    Array.isArray(value) &&
    value.every((item) => isRecord(item) && typeof item.left === 'string' && typeof item.right === 'string')
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

export function isAnswerMatchingInput(input: unknown): input is AnswerMatchingInput {
  return (
    isRecord(input) &&
    isPositiveInteger(input.questionIndex) &&
    (typeof input.pairs === 'string' ||
      isStringArray(input.pairs) ||
      isStringRecord(input.pairs) ||
      isMatchingPairArray(input.pairs))
  );
}

export function matchingPairsToAnswerValue(pairs: AnswerMatchingPairs): AnswerValue {
  if (typeof pairs === 'string' || isStringArray(pairs)) return pairs;
  if (!Array.isArray(pairs)) return pairs;
  return pairs.reduce<Record<string, string>>((acc, pair) => {
    acc[pair.left] = pair.right;
    return acc;
  }, {});
}
