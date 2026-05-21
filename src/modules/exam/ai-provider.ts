/**
 * AI Provider 适配层：逐题请求 + p-limit 并发控制
 */

import pLimit from 'p-limit';
import type { ExamConfig, Question, AIResponse, ExamStats, AnswerValue } from '@/types/exam';
import { log, warn, error, isValidAnswer } from '@/types/exam';
import { resolveImageBase64, sanitizeImageDataUri } from './question-detect';
import { findQuestionElement } from './question-extract';
import { callClaude, buildClaudeVisionContent } from './claude-provider';
import { callOpenAI, buildOpenAIVisionContent } from './openai-provider';

type PromptQuestionItem = {
  index: string;
  type: Question['type'];
  section: string;
  score: string;
  question: string;
  options?: string[];
  blankCount?: number;
  note?: string;
  matchingItems?: string[];
  matchingOptions?: string[];
  hints?: string[];
};

type ProviderFailure = {
  questionIndex: number;
  displayIndex: string;
  message: string;
};

// ============================================================
// Prompt 构建
// ============================================================

function buildSystemPrompt(): string {
  return `你是一个在线考试答题解析器。根据题目数据生成 JSON 答案。

规则：
1. 输出纯 JSON，不要 markdown，不要解释。
2. 单选/判断题 answer 返回字母如 "A"。
3. 多选题 answer 返回数组如 ["A","C"]。
4. 单空填空题 answer 返回字符串。
5. 多空填空题 answer 返回字符串数组，顺序与空位一致。
6. 简答/综合/应用题 answer 返回字符串。
7. 含图片时结合图片内容判断。图片不可见则尽力根据文本推断。
8. 不要编造图片细节。保持 index 与输入一致。
9. 无法确定也必须给出最合理结果，不要返回空答案。
10. 匹配题 answer 返回 JSON 对象，key 是左侧题干标识或词汇(如"1"、"①"、"cigarette")，value 是对应的右侧答案池内容或标签(如"香烟"或"A")。

输出格式：
{ "index": 1, "type": "single_selection", "answer": "C" }`;
}

/** 构建单道题的 user prompt */
function buildSingleQuestionPrompt(q: Question, customPrompt: string): string {
  const questionText = q.description.length > 10 ? q.description : q.rawText.substring(0, 2000);
  // FIXED: 给 AI 看的是 displayIndex（"21" 或 "21.3"），AI 友好；
  //        我们仅用 q.index（整数）做内部 round-trip，AI 返回的 index 我们也不信任。
  const item: PromptQuestionItem = {
    index: q.displayIndex,
    type: q.type,
    section: q.sectionTitle,
    score: q.scoreText,
    question: questionText,
  };

  if (q.options && q.options.length > 0) {
    item.options = q.options.map((o) => `${o.label} ${o.content}`);
  }
  if (q.blankCount > 0) {
    item.blankCount = q.blankCount;
    item.note = `此题有${q.blankCount}个空位，请返回长度为${q.blankCount}的字符串数组`;
  }
  if (q.matchingItems && q.matchingItems.length > 0) {
    item.matchingItems = q.matchingItems.map((m) => `${m.key}. ${m.stem}`);
    item.matchingOptions = q.matchingOptions?.map((o) => `${o.label}: ${o.content}`) || [];
    item.note = '匹配题：请返回 JSON 对象，key 用左侧编号或词汇，value 用右侧答案池内容或标签';
  }
  if (q.modelHints.length > 0) {
    item.hints = q.modelHints;
  }

  let prompt = '';
  if (customPrompt && customPrompt.trim()) {
    prompt += `补充说明：${customPrompt.trim()}\n\n`;
  }
  prompt += '请作答以下题目，只返回一个 JSON 对象：\n';
  prompt += '```json\n' + JSON.stringify(item, null, 2) + '\n```';
  return prompt;
}

// ============================================================
// API 调用（单次）
// ============================================================

async function callQuestionProvider(
  config: ExamConfig,
  systemPrompt: string,
  userPrompt: string,
  imageBase64List: string[],
): Promise<string> {
  const useVision = imageBase64List.length > 0;

  if (config.provider === 'openai') {
    if (useVision) {
      return callOpenAI(config, systemPrompt, buildOpenAIVisionContent(userPrompt, imageBase64List));
    }
    return callOpenAI(config, systemPrompt, userPrompt);
  }

  if (config.provider === 'claude') {
    if (useVision) {
      return callClaude(config, systemPrompt, buildClaudeVisionContent(userPrompt, imageBase64List));
    }
    return callClaude(config, systemPrompt, userPrompt);
  }

  throw new Error(`不支持的 provider: ${config.provider}`);
}

function markImageDegraded(stats: ExamStats, questionIndex: number): void {
  stats.visionModeQuestions = stats.visionModeQuestions.filter((idx) => idx !== questionIndex);
  if (!stats.degradedImageQuestions.includes(questionIndex)) {
    stats.degradedImageQuestions.push(questionIndex);
  }
}

// ============================================================
// 单题响应解析
// ============================================================

/** 解析单题 AI 返回，提取 { index, answer } */
function parseSingleAnswer(
  rawContent: string,
  expectedIndex: number,
  displayIndex: string,
): { index: number; answer: AnswerValue } | null {
  let content = rawContent.trim();

  // 移除 markdown code fence
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) content = fenceMatch[1];

  // 提取 JSON 对象
  const objMatch = content.match(/\{[\s\S]*\}/);
  if (objMatch) content = objMatch[0];

  try {
    const parsed = JSON.parse(content);
    // FIXED: 逐题模式下强制用 expectedIndex（整数），不信任 AI 返回的 index。
    //        AI 看到的是 displayIndex 字符串，可能返回 "21.3" 也可能返回 21；
    //        我们一律忽略并强制写回内部整数 index，保证 answerMap 命中。
    if (parsed.answer !== undefined) {
      if (!isValidAnswer(parsed.answer)) {
        warn(`题目 ${displayIndex}: AI 返回无效答案 "${String(parsed.answer).substring(0, 50)}"，丢弃`);
        return null;
      }
      return { index: expectedIndex, answer: parsed.answer };
    }
    if (parsed.questions?.[0]?.answer !== undefined) {
      const q = parsed.questions[0];
      if (!isValidAnswer(q.answer)) {
        warn(`题目 ${displayIndex}: AI 返回无效答案，丢弃`);
        return null;
      }
      return { index: expectedIndex, answer: q.answer };
    }
    warn(`题目 ${displayIndex}: AI 返回结构无 answer 字段`);
    return null;
  } catch {
    error(`题目 ${displayIndex}: JSON 解析失败，原文:`, rawContent.substring(0, 300));
    return null;
  }
}

// ============================================================
// 单题请求（含图片提取）
// ============================================================

/** 对单道题发起 AI 请求，返回解析后的答案或 null */
async function callSingleQuestion(
  config: ExamConfig,
  q: Question,
  systemPrompt: string,
  stats: ExamStats,
): Promise<{ answer: { index: number; answer: AnswerValue } | null; failure?: ProviderFailure }> {
  const userPrompt = buildSingleQuestionPrompt(q, config.customPrompt);

  // 提取图片
  const imageBase64List: string[] = [];
  if (q.hasImage && q.images.length > 0) {
    const subjectEl = findQuestionElement(q);
    if (subjectEl) {
      for (const img of q.images) {
        const base64 = await resolveImageBase64(img, subjectEl);
        if (base64 && sanitizeImageDataUri(base64)) {
          imageBase64List.push(base64);
        }
      }
    }
    if (imageBase64List.length > 0) {
      if (!stats.visionModeQuestions.includes(q.index)) {
        stats.visionModeQuestions.push(q.index);
      }
    } else {
      if (!stats.degradedImageQuestions.includes(q.index)) {
        stats.degradedImageQuestions.push(q.index);
      }
    }
  }

  try {
    const useVision = imageBase64List.length > 0;
    const rawContent = await callQuestionProvider(config, systemPrompt, userPrompt, imageBase64List);
    const parsedAnswer = parseSingleAnswer(rawContent, q.index, q.displayIndex);

    if (parsedAnswer || !useVision) {
      return { answer: parsedAnswer };
    }

    // FIXED: 题干内的装饰图/控件背景偶发误判为题图时，视觉请求可能返回空或无效答案。
    //        用同一题文本重试一次，避免纯文本题因为图片链路失败被直接跳过。
    warn(`题目 ${q.displayIndex}: 视觉模式未得到有效答案，降级为文本模式重试`);
    markImageDegraded(stats, q.index);
    const fallbackRawContent = await callQuestionProvider(config, systemPrompt, userPrompt, []);
    return { answer: parseSingleAnswer(fallbackRawContent, q.index, q.displayIndex) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (imageBase64List.length > 0) {
      warn(`题目 ${q.displayIndex}: 视觉请求失败，降级为文本模式重试:`, message);
      markImageDegraded(stats, q.index);
      try {
        const fallbackRawContent = await callQuestionProvider(config, systemPrompt, userPrompt, []);
        const fallbackAnswer = parseSingleAnswer(fallbackRawContent, q.index, q.displayIndex);
        if (fallbackAnswer) {
          return { answer: fallbackAnswer };
        }
      } catch (fallbackErr) {
        const fallbackMessage = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        error(`题目 ${q.displayIndex} 文本重试失败:`, fallbackMessage);
        return {
          answer: null,
          failure: {
            questionIndex: q.index,
            displayIndex: q.displayIndex,
            message: `${message}; 文本重试失败: ${fallbackMessage}`,
          },
        };
      }
    }

    error(`题目 ${q.displayIndex} 请求失败:`, message);
    return {
      answer: null,
      failure: {
        questionIndex: q.index,
        displayIndex: q.displayIndex,
        message,
      },
    };
  }
}

// ============================================================
// 公开接口：逐题并发请求
// ============================================================

/**
 * 逐题并发调用 AI，返回聚合的 AIResponse。
 * 使用 p-limit 控制并发数（由 config.concurrency 决定）。
 * 单题失败不影响其他题。
 */
export async function callProvider(
  config: ExamConfig,
  questions: Question[],
  stats: ExamStats,
  onProgress?: (done: number, total: number) => void,
): Promise<AIResponse> {
  const systemPrompt = buildSystemPrompt();
  const concurrency = Math.max(1, Math.min(config.concurrency || 3, 20));
  const limit = pLimit(concurrency);

  log(`逐题请求模式，并发数: ${concurrency}，共 ${questions.length} 道题`);

  stats.imageQuestions = questions.filter((q) => q.hasImage && q.images.length > 0).map((q) => q.index);

  let doneCount = 0;
  const results = await Promise.all(
    questions.map((q) =>
      limit(async () => {
        const result = await callSingleQuestion(config, q, systemPrompt, stats);
        doneCount++;
        onProgress?.(doneCount, questions.length);
        return result;
      }),
    ),
  );

  const answers = results.map((r) => r.answer).filter((r): r is NonNullable<typeof r> => r !== null);
  const failures = results.map((r) => r.failure).filter((failure): failure is ProviderFailure => failure !== undefined);

  log(`AI 返回: ${answers.length}/${questions.length} 道有答案`);

  return { questions: answers, failures };
}
