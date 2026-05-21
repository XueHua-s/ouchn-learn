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

export function requestJson<T>(url: string, init: RequestInit): Promise<T> {
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

export function requestText(url: string, init: RequestInit): Promise<string> {
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
