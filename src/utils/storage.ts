import { STORAGE_KEY, RETURN_URL_KEY } from '@/constants';
import type { ViewState } from '@/types';

/**
 * 保存查看状态到 localStorage
 */
export function saveViewState(state: ViewState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    console.log('[自动查看页面] 状态已保存:', state);
  } catch (e) {
    console.error('[自动查看页面] 保存状态失败:', e);
  }
}

/**
 * 从 localStorage 获取查看状态
 */
export function getViewState(): ViewState | null {
  try {
    const state = localStorage.getItem(STORAGE_KEY);
    return state ? JSON.parse(state) : null;
  } catch (e) {
    console.error('[自动查看页面] 读取状态失败:', e);
    return null;
  }
}

/**
 * 清除查看状态
 */
export function clearViewState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(RETURN_URL_KEY);
    console.log('[自动查看页面] 状态已清除');
  } catch (e) {
    console.error('[自动查看页面] 清除状态失败:', e);
  }
}

/**
 * 保存返回URL
 */
export function saveReturnUrl(url: string): void {
  localStorage.setItem(RETURN_URL_KEY, url);
}

/**
 * 获取返回URL
 */
export function getReturnUrl(): string | null {
  return localStorage.getItem(RETURN_URL_KEY);
}
