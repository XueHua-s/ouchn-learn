/**
 * AI 答题工具执行器：负责 lookup、shape guard、语义校验、串行 DOM 执行和统计落账。
 */

import type { AIResponse, AnswerValue, ExamStats, Question } from '@/types/exam';
import { log, warn } from '@/types/exam';
import { findExamTool } from './tool-registry';
import {
  createToolError,
  previewUnknownInput,
  type AnswerMatchingPairs,
  type ExamToolContext,
  type ExamToolResult,
  type ExamToolUse,
  type ExamToolUseSource,
} from './tool-contract';

type ExamToolBatch = { isConcurrencySafe: boolean; toolUses: ExamToolUse[] };

function answerToStringArray(answer: AnswerValue): string[] {
  if (answer && typeof answer === 'object' && !Array.isArray(answer)) return Object.values(answer).map(String);
  return Array.isArray(answer) ? answer.map(String) : [String(answer)];
}

function answerToMatchingPairs(answer: AnswerValue): AnswerMatchingPairs {
  if (typeof answer === 'object' && answer !== null && !Array.isArray(answer)) return answer;
  if (Array.isArray(answer)) return answer.map(String);
  return String(answer);
}

function createToolUseId(source: ExamToolUseSource, question: Question): string {
  return `${source}:${question.index}`;
}

function answerToToolUse(question: Question, answer: AnswerValue, source: ExamToolUseSource): ExamToolUse {
  switch (question.type) {
    case 'single_selection':
    case 'true_or_false':
      return {
        id: createToolUseId(source, question),
        tool: 'answer_choice',
        input: { questionIndex: question.index, answer: String(answer) },
        source,
      };
    case 'multiple_selection':
      return {
        id: createToolUseId(source, question),
        tool: 'answer_multiple_choice',
        input: { questionIndex: question.index, answers: answerToStringArray(answer) },
        source,
      };
    case 'fill_in_blank':
      return {
        id: createToolUseId(source, question),
        tool: 'answer_blank',
        input: { questionIndex: question.index, answers: answerToStringArray(answer) },
        source,
      };
    case 'matching':
      return {
        id: createToolUseId(source, question),
        tool: 'answer_matching',
        input: { questionIndex: question.index, pairs: answerToMatchingPairs(answer) },
        source,
      };
    case 'short_answer':
    case 'unknown':
    default:
      return {
        id: createToolUseId(source, question),
        tool: 'answer_essay',
        input: { questionIndex: question.index, answer: answerToStringArray(answer).join('\n') },
        source,
      };
  }
}

function withToolUseMetadata(result: ExamToolResult, toolUse: ExamToolUse): ExamToolResult {
  return {
    ...result,
    metadata: {
      toolUseId: toolUse.id,
      source: toolUse.source,
    },
  };
}

function buildToolContext(questions: Question[], stats: ExamStats, signal?: AbortSignal): ExamToolContext {
  return {
    questions,
    questionByIndex: new Map(questions.map((question) => [question.index, question])),
    stats,
    signal,
  };
}

function updateStatsFromToolResult(result: ExamToolResult, stats: ExamStats): void {
  if (result.ok) {
    stats.toolSucceededCount++;
    stats.filledCount += result.filledCount;
    log(`题目 ${result.questionIndex}: ${result.tool} 执行成功`);
    return;
  }

  stats.toolFailedCount++;
  stats.toolFailuresByCode[result.code] = (stats.toolFailuresByCode[result.code] || 0) + 1;
  stats.toolErrors.push({
    tool: result.tool,
    questionIndex: result.questionIndex,
    code: result.code,
    message: result.message,
    retryable: result.retryable,
    toolUseId: result.metadata?.toolUseId,
    source: result.metadata?.source,
  });

  if (result.questionIndex !== undefined && !stats.fillFailedQuestions.includes(result.questionIndex)) {
    stats.fillFailedQuestions.push(result.questionIndex);
  }
  warn(`${result.tool}: ${result.message} (${result.code}, retryable=${result.retryable})`);
}

async function runExamToolUse(toolUse: ExamToolUse, context: ExamToolContext): Promise<ExamToolResult> {
  if (context.signal?.aborted) {
    return withToolUseMetadata(
      createToolError({
        tool: toolUse.tool,
        code: 'tool_execution_cancelled',
        message: '工具执行已取消',
        retryable: false,
      }),
      toolUse,
    );
  }

  const tool = findExamTool(toolUse.tool);
  if (!tool) {
    return withToolUseMetadata(
      createToolError({
        tool: 'unknown',
        code: 'unknown_tool',
        message: `未知答题工具: ${toolUse.tool}`,
        retryable: true,
      }),
      toolUse,
    );
  }

  if (!tool.inputSchema(toolUse.input)) {
    return withToolUseMetadata(
      createToolError({
        tool: tool.name,
        code: 'invalid_tool_input',
        message: `${tool.name} 输入结构无效: ${previewUnknownInput(toolUse.input)}`,
        retryable: true,
      }),
      toolUse,
    );
  }

  const validationError = tool.validateInput?.(toolUse.input, context);
  if (validationError) return withToolUseMetadata(validationError, toolUse);

  try {
    return withToolUseMetadata(await tool.execute(toolUse.input, context), toolUse);
  } catch (err) {
    return withToolUseMetadata(
      createToolError({
        tool: tool.name,
        code: 'dom_write_failed',
        message: err instanceof Error ? err.message : String(err),
        retryable: false,
      }),
      toolUse,
    );
  }
}

function isToolUseConcurrencySafe(toolUse: ExamToolUse): boolean {
  const tool = findExamTool(toolUse.tool);
  if (!tool || !tool.inputSchema(toolUse.input)) return false;
  try {
    return Boolean(tool.isConcurrencySafe(toolUse.input));
  } catch {
    return false;
  }
}

function partitionToolUses(toolUses: ExamToolUse[]): ExamToolBatch[] {
  return toolUses.reduce<ExamToolBatch[]>((batches, toolUse) => {
    const isConcurrencySafe = isToolUseConcurrencySafe(toolUse);
    const currentBatch = batches[batches.length - 1];
    if (isConcurrencySafe && currentBatch?.isConcurrencySafe) {
      currentBatch.toolUses.push(toolUse);
      return batches;
    }
    batches.push({ isConcurrencySafe, toolUses: [toolUse] });
    return batches;
  }, []);
}

async function runToolBatch(batch: ExamToolBatch, context: ExamToolContext): Promise<ExamToolResult[]> {
  if (!batch.isConcurrencySafe) {
    const results: ExamToolResult[] = [];
    for (const toolUse of batch.toolUses) {
      results.push(await runExamToolUse(toolUse, context));
    }
    return results;
  }

  return Promise.all(batch.toolUses.map((toolUse) => runExamToolUse(toolUse, context)));
}

export async function runExamTools(
  questions: Question[],
  toolUses: ExamToolUse[],
  stats: ExamStats,
  signal?: AbortSignal,
): Promise<ExamToolResult[]> {
  stats.toolCallCount += toolUses.length;
  const context = buildToolContext(questions, stats, signal);
  const results: ExamToolResult[] = [];

  for (const batch of partitionToolUses(toolUses)) {
    const batchResults = await runToolBatch(batch, context);
    batchResults.forEach((result) => updateStatsFromToolResult(result, stats));
    results.push(...batchResults);
  }

  return results;
}

export async function fillAnswersWithTools(
  questions: Question[],
  aiResponse: AIResponse,
  stats: ExamStats,
): Promise<ExamToolResult[]> {
  const answerMap = new Map<number, AnswerValue>();
  aiResponse.questions.forEach((item) => answerMap.set(item.index, item.answer));

  if (aiResponse.questions.length !== questions.length) {
    const aiIndexes = Array.from(answerMap.keys()).sort((a, b) => a - b);
    const localIndexes = questions.map((question) => question.index).sort((a, b) => a - b);
    warn(
      `AI 返回题数(${aiResponse.questions.length}) ≠ 本地题数(${questions.length})`,
      '| AI:',
      aiIndexes.join(','),
      '| 本地:',
      localIndexes.join(','),
    );
  }

  // 单次遍历同时产出 toolUses 与 skipped 记录，避免之前两遍扫描 + 反查 toolUseIndexes 的重复簿记。
  const toolUses: ExamToolUse[] = [];
  for (const question of questions) {
    const answer = answerMap.get(question.index);
    if (answer === undefined || answer === null) {
      stats.skippedQuestions.push(question.index);
      warn(`题目 ${question.displayIndex}: AI 未返回答案，跳过`);
      continue;
    }
    toolUses.push(answerToToolUse(question, answer, 'legacy-ai-response'));
  }

  return runExamTools(questions, toolUses, stats);
}
