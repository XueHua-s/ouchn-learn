/**
 * AI Provider 适配层：逐题请求 + p-limit 并发控制
 */

import pLimit from 'p-limit';
import type { ExamConfig, Question, AIResponse, ExamStats } from '@/types/exam';
import { REASONING_MODEL_RE, log, warn, error, isValidAnswer } from '@/types/exam';
import { resolveImageBase64, sanitizeImageDataUri } from './question-detect';
import { findSubjectElement } from './question-extract';

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
10. 匹配题 answer 返回 JSON 对象，key 是左侧题干标识(如"①")，value 是对应的右侧答案标签(如"A"或"F")。

输出格式：
{ "index": 1, "type": "single_selection", "answer": "C" }`;
}

/** 构建单道题的 user prompt */
function buildSingleQuestionPrompt(q: Question, customPrompt: string): string {
  const questionText = q.description.length > 10 ? q.description : q.rawText.substring(0, 2000);
  const item: Record<string, any> = {
    index: q.index,
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
    item.matchingItems = q.matchingItems.map((m) => m.stem);
    item.note = '匹配题：请返回 JSON 对象，key 是左侧标识(如①)，value 是对应的右侧答案标签';
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
// 多模态消息构建
// ============================================================

function buildOpenAIVisionContent(
  textContent: string,
  imageBase64List: string[],
): Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> {
  const parts: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [];
  parts.push({ type: 'text', text: textContent });
  imageBase64List.forEach((b64) => {
    const safeUri = sanitizeImageDataUri(b64);
    if (safeUri) {
      parts.push({ type: 'image_url', image_url: { url: safeUri, detail: 'high' } });
    }
  });
  return parts;
}

function buildGeminiVisionParts(
  textContent: string,
  imageBase64List: string[],
): Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  parts.push({ text: textContent });
  imageBase64List.forEach((b64) => {
    const safeUri = sanitizeImageDataUri(b64);
    if (!safeUri) return;
    const match = safeUri.match(/^data:(image\/[^;]+);base64,(.+)$/s);
    if (match) {
      parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
  });
  return parts;
}

// ============================================================
// API 调用（单次）
// ============================================================

async function callOpenAI(
  config: ExamConfig,
  systemPrompt: string,
  userContent: string | Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }>,
): Promise<string> {
  const isReasoningModel = REASONING_MODEL_RE.test(config.modelName);
  const messages: any[] = [];

  if (isReasoningModel) {
    messages.push({ role: 'developer', content: systemPrompt });
  } else {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userContent });

  const requestBody: any = { model: config.modelName, messages };
  if (!isReasoningModel) {
    requestBody.temperature = 0.3;
  }

  const response = await fetch(`${config.apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI ${response.status}: ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(
  config: ExamConfig,
  systemPrompt: string,
  userContent: string | Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>,
): Promise<string> {
  const url = `${config.apiBaseUrl}/models/${config.modelName}:generateContent?key=${config.apiKey}`;
  const parts = Array.isArray(userContent) ? userContent : [{ text: userContent }];

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.3 },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini ${response.status}: ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ============================================================
// 单题响应解析
// ============================================================

/** 解析单题 AI 返回，提取 { index, answer } */
function parseSingleAnswer(
  rawContent: string,
  expectedIndex: number,
): { index: number; answer: string | string[] } | null {
  let content = rawContent.trim();

  // 移除 markdown code fence
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) content = fenceMatch[1];

  // 提取 JSON 对象
  const objMatch = content.match(/\{[\s\S]*\}/);
  if (objMatch) content = objMatch[0];

  try {
    const parsed = JSON.parse(content);
    // FIXED: 逐题模式下强制用 expectedIndex，不信任 AI 返回的 index，
    // 防止 AI 返回错误题号导致答案错配
    if (parsed.answer !== undefined) {
      if (!isValidAnswer(parsed.answer)) {
        warn(`题目 ${expectedIndex}: AI 返回无效答案 "${String(parsed.answer).substring(0, 50)}"，丢弃`);
        return null;
      }
      return { index: expectedIndex, answer: parsed.answer };
    }
    if (parsed.questions?.[0]?.answer !== undefined) {
      const q = parsed.questions[0];
      if (!isValidAnswer(q.answer)) {
        warn(`题目 ${expectedIndex}: AI 返回无效答案，丢弃`);
        return null;
      }
      return { index: expectedIndex, answer: q.answer };
    }
    warn(`题目 ${expectedIndex}: AI 返回结构无 answer 字段`);
    return null;
  } catch {
    error(`题目 ${expectedIndex}: JSON 解析失败，原文:`, rawContent.substring(0, 300));
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
): Promise<{ index: number; answer: string | string[] } | null> {
  const userPrompt = buildSingleQuestionPrompt(q, config.customPrompt);

  // 提取图片
  const imageBase64List: string[] = [];
  if (q.hasImage && q.images.length > 0) {
    const subjectEl = findSubjectElement(q.index);
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
    let rawContent: string;
    const useVision = imageBase64List.length > 0;

    if (config.provider === 'openai') {
      if (useVision) {
        const visionContent = buildOpenAIVisionContent(userPrompt, imageBase64List);
        rawContent = await callOpenAI(config, systemPrompt, visionContent);
      } else {
        rawContent = await callOpenAI(config, systemPrompt, userPrompt);
      }
    } else if (config.provider === 'gemini') {
      if (useVision) {
        const visionParts = buildGeminiVisionParts(userPrompt, imageBase64List);
        rawContent = await callGemini(config, systemPrompt, visionParts);
      } else {
        rawContent = await callGemini(config, systemPrompt, userPrompt);
      }
    } else {
      throw new Error(`不支持的 provider: ${config.provider}`);
    }

    return parseSingleAnswer(rawContent, q.index);
  } catch (err) {
    error(`题目 ${q.index} 请求失败:`, err instanceof Error ? err.message : err);
    return null;
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

  // 收集成功的答案
  const answers = results.filter((r): r is NonNullable<typeof r> => r !== null);

  log(`AI 返回: ${answers.length}/${questions.length} 道有答案`);

  return { questions: answers };
}
