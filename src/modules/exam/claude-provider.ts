import type { ExamConfig } from '@/types/exam';
import { warn } from '@/types/exam';
import { sanitizeImageDataUri } from './question-detect';
import { appendQueryParam, getErrorText, requestJson, requestWithProviderRetry } from './provider-http';

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
type ClaudeMode = 'claude-code' | 'standard';

const CLAUDE_CODE_SYSTEM_PROMPT = "You are Claude Code, Anthropic's official CLI for Claude.";
const CLAUDE_CODE_BETA_HEADER = 'oauth-2025-04-20,interleaved-thinking-2025-05-14,claude-code-20250219';
const CLAUDE_CODE_USER_AGENT = 'claude-cli/2.1.2 (external, cli)';
const CLAUDE_MODE_LABELS: Record<ClaudeMode, string> = {
  'claude-code': 'Claude Code 兼容调用',
  standard: '标准 Anthropic API',
};

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

function hasClaudeCodeSignal(config: ExamConfig): boolean {
  return (
    /claude[-_\s]?code|beta=true|oauth/i.test(config.apiBaseUrl) ||
    /claude[-_\s]?code/i.test(config.modelName) ||
    /^sk-ant-oat/i.test(config.apiKey)
  );
}

function getClaudeAttemptOrder(config: ExamConfig): ClaudeMode[] {
  const shouldPreferClaudeCode = hasClaudeCodeSignal(config) || !isOfficialAnthropicBaseUrl(config.apiBaseUrl);

  // FIXED: Claude Code 代理通常要求 Bearer + beta=true 调用形态；先按 Code 模式探测，
  //        失败后自动回退标准 Anthropic。官方 Anthropic 默认仍只走标准 API，避免错误发送 OAuth beta header。
  if (shouldPreferClaudeCode) {
    return ['claude-code', 'standard'];
  }

  return ['standard'];
}

async function requestClaudeMessagesWithRetry(
  providerLabel: string,
  url: string,
  headers: Record<string, string>,
  requestBody: ClaudeMessagesRequestBody,
): Promise<string> {
  return requestWithProviderRetry(providerLabel, async () => {
    const data = await requestJson<ClaudeMessagesResponse>(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    const text = data.content?.find((part) => part.type === 'text')?.text || '';
    if (!text.trim()) {
      throw new Error(`${providerLabel} 响应缺少 text 内容`);
    }
    return text;
  });
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

function requestClaudeByMode(
  mode: ClaudeMode,
  config: ExamConfig,
  endpoint: string,
  systemPrompt: string,
  content: ClaudeUserContent,
): Promise<string> {
  if (mode === 'claude-code') {
    return requestClaudeCodeMessages(config, endpoint, systemPrompt, content);
  }
  return requestStandardClaudeMessages(config, endpoint, systemPrompt, content);
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
  const attemptOrder = getClaudeAttemptOrder(config);
  const failures: Array<{ mode: ClaudeMode; error: unknown }> = [];

  for (let index = 0; index < attemptOrder.length; index++) {
    const mode = attemptOrder[index];
    try {
      return await requestClaudeByMode(mode, config, endpoint, systemPrompt, content);
    } catch (err) {
      failures.push({ mode, error: err });
      const nextMode = attemptOrder[index + 1];
      if (nextMode) {
        warn(
          `${CLAUDE_MODE_LABELS[mode]}失败，尝试${CLAUDE_MODE_LABELS[nextMode]}: ${getErrorText(err).substring(
            0,
            160,
          )}`,
        );
      }
    }
  }

  throw new Error(
    failures
      .map(({ mode, error: failure }) => `${CLAUDE_MODE_LABELS[mode]}失败: ${getErrorText(failure).substring(0, 240)}`)
      .join('; '),
  );
}
