import { warn } from '@/types/exam';

type HttpError = Error & {
  status?: number;
  responseText?: string;
};

const RATE_LIMIT_RETRY_DELAYS_MS = [1500, 4000];
export const RATE_LIMIT_MAX_ATTEMPTS = RATE_LIMIT_RETRY_DELAYS_MS.length + 1;

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
  return getHttpStatus(err) === 429 || /rate[_ ]?limit/i.test(getErrorText(err));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function waitBeforeRateLimitRetry(provider: string, attempt: number): Promise<boolean> {
  const retryDelay = RATE_LIMIT_RETRY_DELAYS_MS[attempt];
  if (retryDelay === undefined) return false;

  // FIXED: 代理/上游对 Claude Opus 等模型可能限流较紧；逐题并发时短退避可避免整批空答案。
  warn(`${provider} 请求被限流，${Math.round(retryDelay / 1000)} 秒后自动重试`);
  await delay(retryDelay);
  return true;
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
