/**
 * AI Provider 适配层：逐题请求 + p-limit 并发控制
 */

import pLimit from 'p-limit';
import type { ExamConfig, Question, AIResponse, ExamStats, AnswerValue } from '@/types/exam';
import { REASONING_MODEL_RE, log, warn, error, isValidAnswer } from '@/types/exam';
import { resolveImageBase64, sanitizeImageDataUri } from './question-detect';
import { findQuestionElement } from './question-extract';

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

type OpenAITextContent = { type: 'text'; text: string };
type OpenAIImageContent = { type: 'image_url'; image_url: { url: string; detail: 'high' } };
type OpenAIUserContent = string | Array<OpenAITextContent | OpenAIImageContent>;
type OpenAIMessage = { role: 'developer' | 'system' | 'user'; content: OpenAIUserContent };
type OpenAIRequestBody = {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  stream?: boolean;
};
type OpenAIMessageContent = string | Array<{ type?: string; text?: string }>;
type OpenAIChatResponse = { choices?: Array<{ message?: { content?: OpenAIMessageContent } }> };
type OpenAIStreamChunk = {
  choices?: Array<{
    delta?: { content?: string | null };
    message?: { content?: OpenAIMessageContent };
    text?: string;
  }>;
};

type ClaudeTextContent = { type: 'text'; text: string };
type ClaudeImageContent = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
type ClaudeUserContent = string | Array<ClaudeTextContent | ClaudeImageContent>;
type ClaudeMessagesResponse = { content?: Array<{ type?: string; text?: string }> };
type ClaudeMessagesRequestBody = {
  model: string;
  system: string;
  messages: Array<{ role: 'user'; content: ClaudeUserContent }>;
  max_tokens: number;
};

type ProviderFailure = {
  questionIndex: number;
  displayIndex: string;
  message: string;
};

type HttpError = Error & {
  status?: number;
  responseText?: string;
};

// FIXED: 部分 OpenAI 兼容端会按模型强制要求 stream=true；逐题并发时缓存能力探测结果，
//        避免每道题都先触发一次 400。删除会让同一套配置反复出现空答案。
const openAIStreamRequiredCache = new Set<string>();
// FIXED: 推理模型/兼容端可能在正则未覆盖时拒绝 temperature；缓存后续请求直接省略。
const openAITemperatureUnsupportedCache = new Set<string>();
const RATE_LIMIT_RETRY_DELAYS_MS = [1500, 4000];
const CLAUDE_CODE_SYSTEM_PROMPT = "You are Claude Code, Anthropic's official CLI for Claude.";
const CLAUDE_CODE_BETA_HEADER = 'oauth-2025-04-20,interleaved-thinking-2025-05-14,claude-code-20250219';
const CLAUDE_CODE_USER_AGENT = 'claude-cli/2.1.2 (external, cli)';

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
// 多模态消息构建
// ============================================================

function buildOpenAIVisionContent(
  textContent: string,
  imageBase64List: string[],
): Array<OpenAITextContent | OpenAIImageContent> {
  const parts: Array<OpenAITextContent | OpenAIImageContent> = [];
  parts.push({ type: 'text', text: textContent });
  imageBase64List.forEach((b64) => {
    const safeUri = sanitizeImageDataUri(b64);
    if (safeUri) {
      parts.push({ type: 'image_url', image_url: { url: safeUri, detail: 'high' } });
    }
  });
  return parts;
}

function buildClaudeVisionContent(
  textContent: string,
  imageBase64List: string[],
): Array<ClaudeTextContent | ClaudeImageContent> {
  const parts: Array<ClaudeTextContent | ClaudeImageContent> = [];
  parts.push({ type: 'text', text: textContent });
  imageBase64List.forEach((b64) => {
    const safeUri = sanitizeImageDataUri(b64);
    if (!safeUri) return;
    const match = safeUri.match(/^data:(image\/[^;]+);base64,(.+)$/s);
    if (match) {
      parts.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } });
    }
  });
  return parts;
}

function buildClaudeMessagesUrl(apiBaseUrl: string): string {
  const baseUrl = apiBaseUrl.replace(/\/+$/, '');
  if (/\/messages(?:\?|$)/.test(baseUrl)) {
    return baseUrl;
  }
  return baseUrl.endsWith('/v1') ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;
}

function withQueryParam(url: string, key: string, value: string): string {
  if (new RegExp(`[?&]${key}=`).test(url)) {
    return url;
  }
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
}

function buildOpenAIChatCompletionsUrl(apiBaseUrl: string): string {
  const baseUrl = apiBaseUrl.replace(/\/+$/, '');
  // FIXED: 面板里用户常填网关根地址。
  //        OpenAI 兼容接口实际在 /v1/chat/completions；若直接拼 /chat/completions 会命中网页入口，
  //        返回 200 HTML 后解析失败，表现为 AI 空答案。
  if (/\/chat\/completions(?:\?|$)/.test(baseUrl)) {
    return baseUrl;
  }
  return baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
}

function createHttpError(status: number, responseText: string): HttpError {
  const err = new Error(`${status}: ${responseText.substring(0, 300)}`) as HttpError;
  err.status = status;
  err.responseText = responseText;
  return err;
}

function getErrorText(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }
  const httpErr = err as HttpError;
  return `${err.message} ${httpErr.responseText || ''}`;
}

function isOpenAIStreamRequiredError(err: unknown): boolean {
  return /stream must be set to true/i.test(getErrorText(err));
}

function isTemperatureUnsupportedError(err: unknown): boolean {
  return /temperature.*(deprecated|unsupported|not supported|invalid)/i.test(getErrorText(err));
}

function isRateLimitError(err: unknown): boolean {
  return (err instanceof Error && (err as HttpError).status === 429) || /rate[_ ]?limit/i.test(getErrorText(err));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitBeforeRateLimitRetry(provider: string, attempt: number): Promise<boolean> {
  const retryDelay = RATE_LIMIT_RETRY_DELAYS_MS[attempt];
  if (retryDelay === undefined) return false;

  // FIXED: 代理/上游对 Claude Opus 等模型可能限流较紧；逐题并发时短退避可避免整批空答案。
  warn(`${provider} 请求被限流，${Math.round(retryDelay / 1000)} 秒后自动重试`);
  await delay(retryDelay);
  return true;
}

function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const gmRequest = globalThis.GM_xmlhttpRequest;
  if (typeof gmRequest === 'function') {
    return new Promise((resolve, reject) => {
      gmRequest({
        method: init.method === 'POST' ? 'POST' : 'GET',
        url,
        headers: init.headers as Record<string, string>,
        data: typeof init.body === 'string' ? init.body : undefined,
        responseType: 'json',
        onload: (response) => {
          if (response.status < 200 || response.status >= 300) {
            const responseText = response.responseText || JSON.stringify(response.response || '');
            reject(createHttpError(response.status, responseText));
            return;
          }
          if (response.response !== null && response.response !== undefined) {
            resolve(response.response as T);
            return;
          }
          try {
            resolve(JSON.parse(response.responseText) as T);
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        },
        onerror: () => reject(new Error('网络请求失败')),
        ontimeout: () => reject(new Error('网络请求超时')),
      });
    });
  }

  return fetch(url, init).then(async (response) => {
    if (!response.ok) {
      const errorText = await response.text();
      throw createHttpError(response.status, errorText);
    }
    return (await response.json()) as T;
  });
}

function requestText(url: string, init: RequestInit): Promise<string> {
  const gmRequest = globalThis.GM_xmlhttpRequest;
  if (typeof gmRequest === 'function') {
    return new Promise((resolve, reject) => {
      gmRequest({
        method: init.method === 'POST' ? 'POST' : 'GET',
        url,
        headers: init.headers as Record<string, string>,
        data: typeof init.body === 'string' ? init.body : undefined,
        onload: (response) => {
          const responseText = response.responseText || String(response.response || '');
          if (response.status < 200 || response.status >= 300) {
            reject(createHttpError(response.status, responseText));
            return;
          }
          resolve(responseText);
        },
        onerror: () => reject(new Error('网络请求失败')),
        ontimeout: () => reject(new Error('网络请求超时')),
      });
    });
  }

  return fetch(url, init).then(async (response) => {
    const responseText = await response.text();
    if (!response.ok) {
      throw createHttpError(response.status, responseText);
    }
    return responseText;
  });
}

function extractOpenAIContent(content: OpenAIMessageContent | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content.map((part) => (typeof part.text === 'string' ? part.text : '')).join('');
}

function extractOpenAIChatResponse(data: OpenAIChatResponse): string {
  return extractOpenAIContent(data.choices?.[0]?.message?.content);
}

function extractOpenAIStreamChunk(chunk: OpenAIStreamChunk): string {
  return (
    chunk.choices
      ?.map((choice) => {
        if (typeof choice.delta?.content === 'string') {
          return choice.delta.content;
        }
        if (choice.message) {
          return extractOpenAIContent(choice.message.content);
        }
        return choice.text || '';
      })
      .join('') || ''
  );
}

function parseOpenAIStreamContent(responseText: string): string {
  const trimmed = responseText.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('{')) {
    try {
      return extractOpenAIChatResponse(JSON.parse(trimmed) as OpenAIChatResponse);
    } catch {
      return '';
    }
  }

  let content = '';
  trimmed.split(/\r?\n/).forEach((line) => {
    const normalizedLine = line.trimStart();
    if (!normalizedLine.startsWith('data:')) return;

    const payload = normalizedLine.slice(5).trim();
    if (!payload || payload === '[DONE]') return;

    try {
      content += extractOpenAIStreamChunk(JSON.parse(payload) as OpenAIStreamChunk);
    } catch {
      warn('OpenAI 流式片段解析失败:', payload.substring(0, 120));
    }
  });
  return content;
}

// ============================================================
// API 调用（单次）
// ============================================================

async function requestOpenAICompletion(config: ExamConfig, requestBody: OpenAIRequestBody): Promise<string> {
  const url = buildOpenAIChatCompletionsUrl(config.apiBaseUrl);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` };

  if (requestBody.stream) {
    const responseText = await requestText(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });
    return parseOpenAIStreamContent(responseText);
  }

  const data = await requestJson<OpenAIChatResponse>(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });
  return extractOpenAIChatResponse(data);
}

async function requestClaudeMessagesWithRetry(
  providerLabel: string,
  url: string,
  headers: Record<string, string>,
  requestBody: ClaudeMessagesRequestBody,
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < RATE_LIMIT_RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      const data = await requestJson<ClaudeMessagesResponse>(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      return data.content?.find((part: { type?: string; text?: string }) => part.type === 'text')?.text || '';
    } catch (err) {
      lastError = err;
      if (!isRateLimitError(err) || !(await waitBeforeRateLimitRetry(providerLabel, attempt))) {
        throw err;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function callOpenAI(config: ExamConfig, systemPrompt: string, userContent: OpenAIUserContent): Promise<string> {
  const isReasoningModel = REASONING_MODEL_RE.test(config.modelName);
  const messages: OpenAIMessage[] = [];
  const capabilityCacheKey = `${config.apiBaseUrl.replace(/\/+$/, '')}|${config.modelName}`;

  if (isReasoningModel) {
    messages.push({ role: 'developer', content: systemPrompt });
  } else {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userContent });

  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    const requestBody: OpenAIRequestBody = { model: config.modelName, messages };
    if (!isReasoningModel && !openAITemperatureUnsupportedCache.has(capabilityCacheKey)) {
      requestBody.temperature = 0.3;
    }
    if (openAIStreamRequiredCache.has(capabilityCacheKey)) {
      requestBody.stream = true;
    }

    try {
      return await requestOpenAICompletion(config, requestBody);
    } catch (err) {
      lastError = err;
      let shouldRetry = false;

      if (requestBody.temperature !== undefined && isTemperatureUnsupportedError(err)) {
        if (!openAITemperatureUnsupportedCache.has(capabilityCacheKey)) {
          warn(`OpenAI 模型 ${config.modelName} 不接受 temperature，已自动改为省略该参数重试`);
        }
        openAITemperatureUnsupportedCache.add(capabilityCacheKey);
        shouldRetry = true;
      }

      if (!requestBody.stream && isOpenAIStreamRequiredError(err)) {
        if (!openAIStreamRequiredCache.has(capabilityCacheKey)) {
          warn(`OpenAI 模型 ${config.modelName} 要求流式响应，已自动切换 stream=true 重试`);
        }
        openAIStreamRequiredCache.add(capabilityCacheKey);
        shouldRetry = true;
      }

      if (!shouldRetry && isRateLimitError(err)) {
        shouldRetry = await waitBeforeRateLimitRetry('OpenAI', attempt);
      }

      if (!shouldRetry) {
        throw err;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function callClaude(config: ExamConfig, systemPrompt: string, userContent: ClaudeUserContent): Promise<string> {
  const content: ClaudeUserContent = Array.isArray(userContent) ? userContent : [{ type: 'text', text: userContent }];
  const endpoint = buildClaudeMessagesUrl(config.apiBaseUrl);

  // FIXED: 该代理的 Claude 模型按 Claude Code 官方调用形态工作：
  //        /v1/messages?beta=true + Authorization Bearer + anthropic-beta。
  //        普通 Anthropic 请求会返回 429，导致整批空答案。
  try {
    return await requestClaudeMessagesWithRetry(
      'Claude',
      withQueryParam(endpoint, 'beta', 'true'),
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': CLAUDE_CODE_BETA_HEADER,
        'user-agent': CLAUDE_CODE_USER_AGENT,
      },
      {
        model: config.modelName,
        system: CLAUDE_CODE_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: systemPrompt },
          { role: 'user', content },
        ],
        // FIXED: Claude 新模型会直接拒绝 temperature（报 deprecated/invalid_request_error）。
        //        该字段本身可选，省略后使用服务端默认值，避免断点调用整批返回空答案。
        max_tokens: 2048,
      },
    );
  } catch (err) {
    if (isRateLimitError(err)) {
      throw err;
    }
    warn(`Claude Code 风格请求失败，回退标准 Anthropic API: ${getErrorText(err).substring(0, 160)}`);
  }

  return requestClaudeMessagesWithRetry(
    'Claude',
    endpoint,
    {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    {
      model: config.modelName,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
      max_tokens: 2048,
    },
  );
}

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
