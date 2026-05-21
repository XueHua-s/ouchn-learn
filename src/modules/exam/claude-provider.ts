import type { ExamConfig } from '@/types/exam';
import { warn } from '@/types/exam';
import { sanitizeImageDataUri } from './question-detect';
import {
  appendQueryParam,
  getErrorText,
  getHttpStatus,
  isRateLimitError,
  RATE_LIMIT_MAX_ATTEMPTS,
  requestJson,
  waitBeforeRateLimitRetry,
} from './provider-http';

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
type UrlParts = {
  basePath: string;
  suffix: string;
};

const CLAUDE_CODE_SYSTEM_PROMPT = "You are Claude Code, Anthropic's official CLI for Claude.";
const CLAUDE_CODE_BETA_HEADER = 'oauth-2025-04-20,interleaved-thinking-2025-05-14,claude-code-20250219';
const CLAUDE_CODE_USER_AGENT = 'claude-cli/2.1.2 (external, cli)';

function splitUrlSuffix(url: string): UrlParts {
  const trimmedUrl = url.trim();
  const suffixIndex = trimmedUrl.search(/[?#]/);
  const rawBasePath = suffixIndex === -1 ? trimmedUrl : trimmedUrl.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? '' : trimmedUrl.slice(suffixIndex);
  return { basePath: rawBasePath.replace(/\/+$/, ''), suffix };
}

function buildClaudeMessagesUrl(apiBaseUrl: string): string {
  const { basePath, suffix } = splitUrlSuffix(apiBaseUrl);
  if (/\/messages$/i.test(basePath)) {
    return `${basePath}${suffix}`;
  }
  return /\/v1$/i.test(basePath) ? `${basePath}/messages${suffix}` : `${basePath}/v1/messages${suffix}`;
}

function isOfficialAnthropicBaseUrl(apiBaseUrl: string): boolean {
  try {
    return new URL(apiBaseUrl).hostname === 'api.anthropic.com';
  } catch {
    return false;
  }
}

function shouldTryClaudeCodeFallback(config: ExamConfig, err: unknown): boolean {
  const errorText = getErrorText(err);
  const isOfficialAnthropic = isOfficialAnthropicBaseUrl(config.apiBaseUrl);
  if (isOfficialAnthropic) {
    return false;
  }
  if (/claude\s*code|anthropic-beta|oauth|beta=true|bearer/i.test(errorText)) {
    return true;
  }

  // FIXED: 部分 Claude 兼容代理把标准 Anthropic header 误报为 429，但官方 Anthropic
  //        的 429 应继续作为限流处理；否则会把正常标准调用静默改成 Claude Code 协议。
  return getHttpStatus(err) === 429;
}

async function requestClaudeMessagesWithRetry(
  providerLabel: string,
  url: string,
  headers: Record<string, string>,
  requestBody: ClaudeMessagesRequestBody,
  shouldStopRetry?: (err: unknown) => boolean,
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS; attempt++) {
    try {
      const data = await requestJson<ClaudeMessagesResponse>(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      return data.content?.find((part) => part.type === 'text')?.text || '';
    } catch (err) {
      lastError = err;
      if (
        shouldStopRetry?.(err) ||
        !isRateLimitError(err) ||
        !(await waitBeforeRateLimitRetry(providerLabel, attempt))
      ) {
        throw err;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function requestStandardClaudeMessages(
  config: ExamConfig,
  endpoint: string,
  systemPrompt: string,
  content: ClaudeUserContent,
): Promise<string> {
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
      // FIXED: Claude 新模型会直接拒绝 temperature（报 deprecated/invalid_request_error）。
      //        该字段本身可选，省略后使用服务端默认值，避免断点调用整批返回空答案。
      max_tokens: 2048,
    },
    (err) => shouldTryClaudeCodeFallback(config, err),
  );
}

function requestClaudeCodeMessages(
  config: ExamConfig,
  endpoint: string,
  systemPrompt: string,
  content: ClaudeUserContent,
): Promise<string> {
  return requestClaudeMessagesWithRetry(
    'Claude Code',
    appendQueryParam(endpoint, 'beta', 'true'),
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
      max_tokens: 2048,
    },
  );
}

export function buildClaudeVisionContent(
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

export async function callClaude(
  config: ExamConfig,
  systemPrompt: string,
  userContent: ClaudeUserContent,
): Promise<string> {
  const content: ClaudeUserContent = Array.isArray(userContent) ? userContent : [{ type: 'text', text: userContent }];
  const endpoint = buildClaudeMessagesUrl(config.apiBaseUrl);

  try {
    return await requestStandardClaudeMessages(config, endpoint, systemPrompt, content);
  } catch (err) {
    if (!shouldTryClaudeCodeFallback(config, err)) {
      throw err;
    }
    warn(`标准 Anthropic API 请求失败，尝试 Claude Code 兼容调用: ${getErrorText(err).substring(0, 160)}`);
    try {
      return await requestClaudeCodeMessages(config, endpoint, systemPrompt, content);
    } catch (fallbackErr) {
      throw new Error(
        `标准 Anthropic API 失败: ${getErrorText(err).substring(0, 160)}; Claude Code 兼容调用失败: ${getErrorText(
          fallbackErr,
        ).substring(0, 300)}`,
      );
    }
  }
}
