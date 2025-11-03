import { STORAGE_KEY, RETURN_URL_KEY, COURSE_CONFIG_KEY, MATERIAL_CACHE_KEY } from '@/constants';
import type { ViewState, CourseConfig, MaterialAttachment } from '@/types';

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

/**
 * 保存课程配置
 */
export function saveCourseConfig(config: CourseConfig): void {
  try {
    localStorage.setItem(COURSE_CONFIG_KEY, JSON.stringify(config));
    console.log('[课程配置] 配置已保存:', config);
  } catch (e) {
    console.error('[课程配置] 保存配置失败:', e);
  }
}

/**
 * 获取课程配置
 */
export function getCourseConfig(): CourseConfig {
  try {
    const config = localStorage.getItem(COURSE_CONFIG_KEY);
    return config ? JSON.parse(config) : { coursePrefix: '' };
  } catch (e) {
    console.error('[课程配置] 读取配置失败:', e);
    return { coursePrefix: '' };
  }
}

/**
 * 保存资料缓存（用于页面跳转时传递信息）
 */
export function saveMaterialCache(material: MaterialAttachment): void {
  try {
    localStorage.setItem(MATERIAL_CACHE_KEY, JSON.stringify(material));
    console.log('[资料缓存] 已保存:', material);
  } catch (e) {
    console.error('[资料缓存] 保存失败:', e);
  }
}

/**
 * 获取资料缓存
 */
export function getMaterialCache(): MaterialAttachment | null {
  try {
    const cache = localStorage.getItem(MATERIAL_CACHE_KEY);
    return cache ? JSON.parse(cache) : null;
  } catch (e) {
    console.error('[资料缓存] 读取失败:', e);
    return null;
  }
}

/**
 * 清除资料缓存
 */
export function clearMaterialCache(): void {
  try {
    localStorage.removeItem(MATERIAL_CACHE_KEY);
  } catch (e) {
    console.error('[资料缓存] 清除失败:', e);
  }
}
