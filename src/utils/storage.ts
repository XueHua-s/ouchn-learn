import {
  STORAGE_KEY,
  RETURN_URL_KEY,
  COURSE_CONFIG_KEY,
  MATERIAL_CACHE_KEY,
  EXAM_CONFIG_KEY,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_CLAUDE_BASE_URL,
} from '@/constants';
import type { ViewState, CourseConfig, MaterialAttachment } from '@/types';
import type { ExamConfig } from '@/types/exam';

type ExamProvider = ExamConfig['provider'];
type ProviderConfig = ExamConfig['providers'][ExamProvider];

function getDefaultProviderConfig(provider: ExamProvider): ProviderConfig {
  if (provider === 'claude') {
    return {
      modelName: DEFAULT_CLAUDE_MODEL,
      apiKey: '',
      apiBaseUrl: DEFAULT_CLAUDE_BASE_URL,
    };
  }

  return {
    modelName: DEFAULT_OPENAI_MODEL,
    apiKey: '',
    apiBaseUrl: DEFAULT_OPENAI_BASE_URL,
  };
}

function withProviderDefaults(provider: ExamProvider, config?: ProviderConfig): ProviderConfig {
  const defaults = getDefaultProviderConfig(provider);
  return {
    modelName: config?.modelName || defaults.modelName,
    apiKey: config?.apiKey || '',
    apiBaseUrl: config?.apiBaseUrl || defaults.apiBaseUrl,
  };
}

function createDefaultExamConfig(): ExamConfig {
  const providers = {
    openai: getDefaultProviderConfig('openai'),
    claude: getDefaultProviderConfig('claude'),
  };

  return {
    provider: 'openai',
    modelName: providers.openai.modelName,
    apiKey: providers.openai.apiKey,
    apiBaseUrl: providers.openai.apiBaseUrl,
    customPrompt: '',
    concurrency: 3,
    providers,
  };
}

function normalizeExamConfig(config: ExamConfig): ExamConfig {
  const provider: ExamProvider = config.provider === 'claude' ? 'claude' : 'openai';
  const providers = {
    openai: withProviderDefaults('openai', config.providers.openai),
    claude: withProviderDefaults('claude', config.providers.claude),
  };

  const activeProviderConfig = providers[provider];
  return {
    provider,
    modelName: activeProviderConfig.modelName,
    apiKey: activeProviderConfig.apiKey,
    apiBaseUrl: activeProviderConfig.apiBaseUrl,
    customPrompt: config.customPrompt || '',
    concurrency: Math.max(1, config.concurrency || 3),
    providers,
  };
}

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

/**
 * 保存 AI 答题配置
 */
export function saveExamConfig(config: ExamConfig): void {
  try {
    localStorage.setItem(EXAM_CONFIG_KEY, JSON.stringify(normalizeExamConfig(config)));
  } catch (e) {
    console.error('[AI答题] 保存配置失败:', e);
  }
}

/**
 * 获取 AI 答题配置
 */
export function getExamConfig(): ExamConfig {
  try {
    const stored = localStorage.getItem(EXAM_CONFIG_KEY);
    if (stored) {
      return normalizeExamConfig(JSON.parse(stored));
    }
  } catch (e) {
    console.error('[AI答题] 读取配置失败:', e);
  }
  return createDefaultExamConfig();
}
