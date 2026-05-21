import { backOff } from 'exponential-backoff';
import { warn } from '@/types/exam';

type HttpError = Error & {
  status?: number;
  responseText?: string;
};

const PROVIDER_RETRY_COUNT = 2;
const PROVIDER_RETRY_MIN_TIMEOUT_MS = 1500;
const PROVIDER_RETRY_MAX_TIMEOUT_MS = 4000;
const PROVIDER_RETRY_FACTOR = PROVIDER_RETRY_MAX_TIMEOUT_MS / PROVIDER_RETRY_MIN_TIMEOUT_MS;
const PROVIDER_REQUEST_TIMEOUT_MS = 60000;

function createHttpError(status: number, responseText: string): HttpError {
  const err = new Error(`${status}: ${responseText.substring(0, 300)}`) as HttpError;
  err.status = status;
  err.responseText = responseText;
  return err;
}

export function getErrorText(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }
  const httpErr = err as HttpError;
  return `${err.message} ${httpErr.responseText || ''}`;
}

export function getHttpStatus(err: unknown): number | undefined {
  return err instanceof Error ? (err as HttpError).status : undefined;
}

export function isRateLimitError(err: unknown): boolean {
  return getHttpStatus(err) === 429 || /(rate[_\s-]?limit|too many requests)/i.test(getErrorText(err));
}

export function isRetryableProviderError(err: unknown): boolean {
  const status = getHttpStatus(err);
  if (status !== undefined && (status === 408 || status === 429 || status >= 500)) {
    return true;
  }
  return (
    isRateLimitError(err) ||
    /(network request failed|网络请求失败|网络请求超时|timeout|overloaded)/i.test(getErrorText(err))
  );
}

export function requestWithProviderRetry<T>(
  provider: string,
  request: () => Promise<T>,
  shouldRetry: (err: unknown) => boolean = isRetryableProviderError,
): Promise<T> {
  return backOff(request, {
    numOfAttempts: PROVIDER_RETRY_COUNT + 1,
    startingDelay: PROVIDER_RETRY_MIN_TIMEOUT_MS,
    maxDelay: PROVIDER_RETRY_MAX_TIMEOUT_MS,
    timeMultiple: PROVIDER_RETRY_FACTOR,
    jitter: 'none',
    retry: (err, attemptNumber) => {
      if (!shouldRetry(err) || attemptNumber > PROVIDER_RETRY_COUNT) {
        return false;
      }
      const retryDelay = Math.min(
        Math.round(PROVIDER_RETRY_MIN_TIMEOUT_MS * PROVIDER_RETRY_FACTOR ** (attemptNumber - 1)),
        PROVIDER_RETRY_MAX_TIMEOUT_MS,
      );
      // FIXED: 代理/上游对 Claude Opus 等模型可能限流较紧；逐题并发时短退避可避免整批空答案。
      warn(`${provider} 请求失败，${Math.round(retryDelay / 1000)} 秒后自动重试`);
      return true;
    },
  });
}

export function appendQueryParam(url: string, key: string, value: string): string {
  if (new RegExp(`[?&]${key}=`).test(url)) {
    return url;
  }
  const hashIndex = url.indexOf('#');
  const urlWithoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
  return `${urlWithoutHash}${urlWithoutHash.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}${hash}`;
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
}

function isPrivateIpv4Host(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function isPrivateIpv6Host(hostname: string): boolean {
  return hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:');
}

function isIntranetHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === 'host.docker.internal' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.internal') ||
    !hostname.includes('.')
  );
}

function isAllowedHttpProviderHost(hostname: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);
  return (
    isIntranetHostname(normalizedHostname) ||
    isPrivateIpv4Host(normalizedHostname) ||
    isPrivateIpv6Host(normalizedHostname)
  );
}

function validateProviderUrl(url: string): void {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('AI Base URL 格式无效');
  }

  // FIXED: 自定义 OpenAI/Claude 兼容代理是既有能力，内网 HTTP 代理不能被 React 迁移误伤。
  //        公网仍要求 HTTPS，避免 API Key 被明文发送到非受信网络。
  if (
    parsedUrl.protocol !== 'https:' &&
    !(parsedUrl.protocol === 'http:' && isAllowedHttpProviderHost(parsedUrl.hostname))
  ) {
    throw new Error('AI Base URL 必须使用 HTTPS 或本机/内网地址');
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('AI Base URL 不能包含用户名或密码');
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PROVIDER_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('网络请求超时');
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  validateProviderUrl(url);

  const gmRequest = globalThis.GM_xmlhttpRequest;
  if (typeof gmRequest === 'function') {
    return new Promise((resolve, reject) => {
      gmRequest({
        method: init.method === 'POST' ? 'POST' : 'GET',
        url,
        headers: init.headers as Record<string, string>,
        data: typeof init.body === 'string' ? init.body : undefined,
        responseType: 'json',
        timeout: PROVIDER_REQUEST_TIMEOUT_MS,
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

  return fetchWithTimeout(url, init).then(async (response) => {
    if (!response.ok) {
      const errorText = await response.text();
      throw createHttpError(response.status, errorText);
    }
    return (await response.json()) as T;
  });
}

export function requestText(url: string, init: RequestInit): Promise<string> {
  validateProviderUrl(url);

  const gmRequest = globalThis.GM_xmlhttpRequest;
  if (typeof gmRequest === 'function') {
    return new Promise((resolve, reject) => {
      gmRequest({
        method: init.method === 'POST' ? 'POST' : 'GET',
        url,
        headers: init.headers as Record<string, string>,
        data: typeof init.body === 'string' ? init.body : undefined,
        timeout: PROVIDER_REQUEST_TIMEOUT_MS,
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

  return fetchWithTimeout(url, init).then(async (response) => {
    const responseText = await response.text();
    if (!response.ok) {
      throw createHttpError(response.status, responseText);
    }
    return responseText;
  });
}
