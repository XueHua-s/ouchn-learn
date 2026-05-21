import type { ExamConfig, ExamStats, Question } from '@/types/exam';
import { log, warn, error } from '@/types/exam';
import type { ExamRunnerCallbacks, ExamRunnerService, TaskStatusType } from './task-contracts';
import { waitForQuestionsStable, extractQuestions } from '@/modules/exam/question-extract';
import { callProvider } from '@/modules/exam/ai-provider';
import { fillAnswersWithTools } from '@/modules/exam/tool-executor';

function createEmptyExamStats(): ExamStats {
  return {
    totalDomSubjects: 0,
    extractedCount: 0,
    aiReturnedCount: 0,
    filledCount: 0,
    toolCallCount: 0,
    toolSucceededCount: 0,
    toolFailedCount: 0,
    toolFailuresByCode: {},
    toolErrors: [],
    skippedQuestions: [],
    fillFailedQuestions: [],
    unknownTypeQuestions: [],
    imageQuestions: [],
    visionModeQuestions: [],
    degradedImageQuestions: [],
  };
}

/**
 * 把 stats 中的整数 index 列表映射回人类可读的 displayIndex 列表。
 * FIXED: 综合题子题 index 用 `parent*1000+sub` 编码，console 直接打印 `21003`
 *        会让用户困惑；这里用 questions 数组里同步保存的 displayIndex 翻译回 "21.3"。
 */
function toDisplayIndexes(indexes: number[], questions: Question[]): string[] {
  const map = new Map<number, string>();
  questions.forEach((q) => map.set(q.index, q.displayIndex));
  return indexes.map((idx) => map.get(idx) ?? String(idx));
}

function printExamStats(stats: ExamStats, questions: Question[]): void {
  log('===== 答题统计 =====');
  console.table({
    'DOM .subject 总数': stats.totalDomSubjects,
    提取题目数: stats.extractedCount,
    'AI 返回题目数': stats.aiReturnedCount,
    成功填写数: stats.filledCount,
    工具调用数: stats.toolCallCount,
    工具成功数: stats.toolSucceededCount,
    工具失败数: stats.toolFailedCount,
    '跳过 (AI未返回)': stats.skippedQuestions.length,
    填写失败数: stats.fillFailedQuestions.length,
    未知题型数: stats.unknownTypeQuestions.length,
    图片题数: stats.imageQuestions.length,
    多模态处理数: stats.visionModeQuestions.length,
    图片降级数: stats.degradedImageQuestions.length,
  });

  if (stats.skippedQuestions.length > 0) {
    warn('AI 未返回答案的题目:', toDisplayIndexes(stats.skippedQuestions, questions).join(', '));
  }
  if (stats.fillFailedQuestions.length > 0) {
    warn('填写失败的题目:', toDisplayIndexes(stats.fillFailedQuestions, questions).join(', '));
  }
  if (stats.toolErrors.length > 0) {
    warn('工具执行错误:', stats.toolErrors);
    warn('工具错误分类:', stats.toolFailuresByCode);
  }
  if (stats.unknownTypeQuestions.length > 0) {
    warn('未识别题型的题目:', toDisplayIndexes(stats.unknownTypeQuestions, questions).join(', '));
  }
  if (stats.degradedImageQuestions.length > 0) {
    warn('图片降级为文本模式的题目:', toDisplayIndexes(stats.degradedImageQuestions, questions).join(', '));
  }
}

function emitStatus(callbacks: ExamRunnerCallbacks, message: string, type: TaskStatusType = 'info'): void {
  callbacks.onStatus({ message, type });
}

export function validateExamConfig(config: ExamConfig): boolean {
  return !!(config.modelName && config.apiKey && config.apiBaseUrl);
}

export async function runAutoExam(config: ExamConfig, callbacks: ExamRunnerCallbacks): Promise<void> {
  const stats = createEmptyExamStats();
  let questions: Question[] = [];

  callbacks.onRunningChange?.(true);

  try {
    emitStatus(callbacks, '正在等待页面加载稳定...', 'info');

    const stableCount = await waitForQuestionsStable();
    stats.totalDomSubjects = stableCount;

    if (stableCount === 0) {
      emitStatus(callbacks, '未找到题目，请确保页面已完全加载', 'error');
      return;
    }

    emitStatus(callbacks, `检测到 ${stableCount} 个题目元素，正在提取...`, 'info');

    questions = extractQuestions();
    stats.extractedCount = questions.length;
    stats.unknownTypeQuestions = questions.filter((q) => q.type === 'unknown').map((q) => q.index);

    if (questions.length === 0) {
      emitStatus(callbacks, '题目提取失败，请检查页面结构', 'error');
      return;
    }

    emitStatus(callbacks, `已提取 ${questions.length} 道题目，正在调用 AI 分析...`, 'info');

    const aiResponse = await callProvider(config, questions, stats, (done, total) => {
      callbacks.onAiProgress?.(done, total);
      emitStatus(callbacks, `AI 答题中... ${done}/${total}`, 'info');
    });
    stats.aiReturnedCount = aiResponse.questions?.length || 0;

    log('AI 返回的答案:', aiResponse);

    if (!aiResponse.questions || aiResponse.questions.length === 0) {
      const firstFailure = aiResponse.failures?.[0];
      const detail = firstFailure ? `，首个错误：题目 ${firstFailure.displayIndex} ${firstFailure.message}` : '';
      emitStatus(callbacks, `AI 返回了空答案${detail}`, 'error');
      return;
    }

    emitStatus(callbacks, `AI 返回 ${aiResponse.questions.length} 道答案，正在填写...`, 'info');

    await fillAnswersWithTools(questions, aiResponse, stats);
    printExamStats(stats, questions);

    const parts = [`成功填写 ${stats.filledCount}/${questions.length} 道题`];
    if (stats.fillFailedQuestions.length > 0) {
      parts.push(`失败 ${stats.fillFailedQuestions.length} 道`);
    }
    if (stats.skippedQuestions.length > 0) {
      parts.push(`跳过 ${stats.skippedQuestions.length} 道`);
    }
    if (stats.visionModeQuestions.length > 0) {
      parts.push(`图片识别 ${stats.visionModeQuestions.length} 道`);
    }

    const statusType = stats.fillFailedQuestions.length > 0 || stats.skippedQuestions.length > 0 ? 'info' : 'success';
    emitStatus(callbacks, parts.join('，'), statusType);
  } catch (err) {
    error('自动答题失败:', err);
    printExamStats(stats, questions);
    emitStatus(callbacks, `答题失败: ${err instanceof Error ? err.message : '未知错误'}`, 'error');
  } finally {
    callbacks.onStats?.(stats);
    callbacks.onRunningChange?.(false);
  }
}

export const examRunnerService: ExamRunnerService = {
  runAutoExam,
  validateExamConfig,
};
