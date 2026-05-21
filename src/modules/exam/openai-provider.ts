import type { ExamConfig } from '@/types/exam';
import { REASONING_MODEL_RE, warn } from '@/types/exam';
import { sanitizeImageDataUri } from './question-detect';
import { getErrorText, isRateLimitError, requestJson, requestText, waitBeforeRateLimitRetry } from './provider-http';

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

type UrlParts = {
  basePath: string;
  suffix: string;
};

// FIXED: 部分 OpenAI 兼容端会按模型强制要求 stream=true；逐题并发时缓存能力探测结果，
//        避免每道题都先触发一次 400。删除会让同一套配置反复出现空答案。
const streamRequiredCache = new Set<string>();
// FIXED: 推理模型/兼容端可能在正则未覆盖时拒绝 temperature；缓存后续请求直接省略。
const temperatureUnsupportedCache = new Set<string>();
const MAX_OPENAI_ATTEMPTS = 5;

function splitUrlSuffix(url: string): UrlParts {
  const trimmedUrl = url.trim();
  const suffixIndex = trimmedUrl.search(/[?#]/);
  const rawBasePath = suffixIndex === -1 ? trimmedUrl : trimmedUrl.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? '' : trimmedUrl.slice(suffixIndex);
  return { basePath: rawBasePath.replace(/\/+$/, ''), suffix };
}

function isRootUrl(basePath: string): boolean {
  try {
    return new URL(basePath).pathname.replace(/\/+$/, '') === '';
  } catch {
    return false;
  }
}

function buildOpenAIChatCompletionsUrl(apiBaseUrl: string): string {
  const { basePath, suffix } = splitUrlSuffix(apiBaseUrl);

  if (/\/chat\/completions$/i.test(basePath)) {
    return `${basePath}${suffix}`;
  }
  if (/\/v1$/i.test(basePath)) {
    return `${basePath}/chat/completions${suffix}`;
  }
  // FIXED: 用户填官方/网关根地址时需要补 /v1；但自定义代理路径必须保留旧语义，
  //        否则 /proxy 会被改成 /proxy/v1 并破坏已有配置。
  if (isRootUrl(basePath)) {
    return `${basePath}/v1/chat/completions${suffix}`;
  }
  return `${basePath}/chat/completions${suffix}`;
}

function isOpenAIStreamRequiredError(err: unknown): boolean {
  return /stream must be set to true/i.test(getErrorText(err));
}

function isTemperatureUnsupportedError(err: unknown): boolean {
  return /temperature.*(deprecated|unsupported|not supported|invalid)/i.test(getErrorText(err));
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

function getCapabilityCacheKey(config: ExamConfig): string {
  return `${config.apiBaseUrl.replace(/\/+$/, '')}|${config.modelName}`;
}

function buildMessages(
  systemPrompt: string,
  userContent: OpenAIUserContent,
  isReasoningModel: boolean,
): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];
  messages.push({ role: isReasoningModel ? 'developer' : 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userContent });
  return messages;
}

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

export function buildOpenAIVisionContent(
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

export async function callOpenAI(
  config: ExamConfig,
  systemPrompt: string,
  userContent: OpenAIUserContent,
): Promise<string> {
  const isReasoningModel = REASONING_MODEL_RE.test(config.modelName);
  const messages = buildMessages(systemPrompt, userContent, isReasoningModel);
  const capabilityCacheKey = getCapabilityCacheKey(config);

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_OPENAI_ATTEMPTS; attempt++) {
    const requestBody: OpenAIRequestBody = { model: config.modelName, messages };
    if (!isReasoningModel && !temperatureUnsupportedCache.has(capabilityCacheKey)) {
      requestBody.temperature = 0.3;
    }
    if (streamRequiredCache.has(capabilityCacheKey)) {
      requestBody.stream = true;
    }

    try {
      return await requestOpenAICompletion(config, requestBody);
    } catch (err) {
      lastError = err;
      let shouldRetry = false;

      if (requestBody.temperature !== undefined && isTemperatureUnsupportedError(err)) {
        if (!temperatureUnsupportedCache.has(capabilityCacheKey)) {
          warn(`OpenAI 模型 ${config.modelName} 不接受 temperature，已自动改为省略该参数重试`);
        }
        temperatureUnsupportedCache.add(capabilityCacheKey);
        shouldRetry = true;
      }

      if (!requestBody.stream && isOpenAIStreamRequiredError(err)) {
        if (!streamRequiredCache.has(capabilityCacheKey)) {
          warn(`OpenAI 模型 ${config.modelName} 要求流式响应，已自动切换 stream=true 重试`);
        }
        streamRequiredCache.add(capabilityCacheKey);
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
