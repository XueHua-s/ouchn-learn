/**
 * AI 答题工具协议：provider 只能表达受控答题意图，DOM 细节由本地工具层封装。
 */

import type { ExamStats, Question } from '@/types/exam';

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

/**
 * 匹配题入参的合法形态：
 * - Record：直接映射 stem → option label/value（最规范）。
 * - string[]：按 matchingItems 的位置顺序排列的右侧 label/value（位置性）。
 * - string：兜底纯文本，registry 会用 JSON.parse + "stem: value" 文本解析回退。
 *
 * 当前与 AnswerValue 结构等价（string | string[] | Record<string, string>），
 * 因此可以直接传给底层 fillAnswerForQuestion / validateMatchingPairs 而无需转换。
 */
export type AnswerMatchingPairs = Record<string, string> | string | string[];

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

/**
 * 工具调用来源。当前只有把 legacy AIResponse 翻译成工具意图这一条路径；
 * 接入 provider 原生 tool calling 或 JSON envelope 时再扩展此 union，executor/stats 无需改动。
 */
export type ExamToolUseSource = 'legacy-ai-response';

export interface ExamToolUse<Input = unknown> {
  id?: string;
  tool: ExamToolName;
  input: Input;
  source: ExamToolUseSource;
}

/**
 * 一次工具调用的诊断元数据。executor 在每个 ExamToolResult 上回填，
 * 让上层 stats 能反查到调用 id（toolUseId）和路径（source）。
 */
export interface ExamToolRunMetadata {
  toolUseId?: string;
  source?: ExamToolUseSource;
}

/**
 * 工具执行结果。
 * - 成功路径必须带 questionIndex 和 filledCount（默认 1，由 createToolSuccess 保证）。
 * - 失败路径必须带 ExamToolErrorCode + 可读 message + retryable 标志；
 *   绝不把失败折叠成 boolean —— 失败原因要可被 provider 反馈和 stats 分类。
 */
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

/**
 * 工具运行期需要的上下文：题目集合、按 index 的快速查找表、共享 stats、可选取消信号。
 * 由 tool-executor 在每批调用前组装一次。
 */
export interface ExamToolContext {
  questions: Question[];
  questionByIndex: Map<number, Question>;
  stats: ExamStats;
  signal?: AbortSignal;
}

/**
 * 工具的运行时契约。
 * - inputSchema 是唯一允许从 unknown 收窄到 ExamToolInput 的 type guard。
 * - executor 已经保证调 validateInput / execute 前输入通过了 inputSchema，
 *   因此后两者不需要再做结构性检查。
 * - isConcurrencySafe 默认 false（DOM 写入串行）；仅在纯读工具上作者可覆盖为 true。
 */
export interface ExamTool {
  name: ExamToolName;
  description: string;
  inputSchema: (input: unknown) => input is ExamToolInput;
  validateInput?: (input: ExamToolInput, context: ExamToolContext) => ExamToolResult | null;
  isConcurrencySafe: (input: ExamToolInput) => boolean;
  execute: (input: ExamToolInput, context: ExamToolContext) => Promise<ExamToolResult>;
}

/**
 * 工具作者使用的类型化定义。
 * 写出 inputSchema 后，validateInput/execute 内部的 input 会自动收窄为具体 Input，
 * 然后由 buildExamTool 做一次类型擦除，存入 registry。
 */
export interface ExamToolDefinition<Input extends ExamToolInput> {
  name: ExamToolName;
  description: string;
  inputSchema: (input: unknown) => input is Input;
  validateInput?: (input: Input, context: ExamToolContext) => ExamToolResult | null;
  isConcurrencySafe?: (input: Input) => boolean;
  execute: (input: Input, context: ExamToolContext) => Promise<ExamToolResult>;
}

/**
 * 把类型化的 ExamToolDefinition 装配成 registry 可存储的 ExamTool。
 * 默认 isConcurrencySafe = () => false——DOM 写入禁止并发，仅在显式覆盖时允许。
 */
export function buildExamTool<Input extends ExamToolInput>(def: ExamToolDefinition<Input>): ExamTool {
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema as ExamTool['inputSchema'],
    validateInput: def.validateInput as ExamTool['validateInput'],
    isConcurrencySafe: (def.isConcurrencySafe ?? (() => false)) as ExamTool['isConcurrencySafe'],
    execute: def.execute as ExamTool['execute'],
  };
}

/**
 * 构造成功结果。filledCount 缺省为 1，省去每个工具重复书写。
 */
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

/**
 * 构造失败结果。retryable 必须由作者显式判定：
 * - 结构性错误（如 invalid_answer_shape）一般 retryable=true，让 provider 重发。
 * - DOM 写入失败、找不到题目这类一般 retryable=false，避免死循环。
 */
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

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

export function isAnswerMatchingInput(input: unknown): input is AnswerMatchingInput {
  return (
    isRecord(input) &&
    isPositiveInteger(input.questionIndex) &&
    (typeof input.pairs === 'string' || isStringArray(input.pairs) || isStringRecord(input.pairs))
  );
}
