// ============================================================
// 自动答题模块 - 类型定义与常量
// ============================================================

export type QuestionType =
  | 'single_selection'
  | 'multiple_selection'
  | 'true_or_false'
  | 'fill_in_blank'
  | 'short_answer'
  | 'matching'
  | 'unknown';

export interface ExamConfig {
  provider: 'openai' | 'gemini';
  modelName: string;
  apiKey: string;
  apiBaseUrl: string;
  customPrompt: string;
  concurrency: number;
}

export interface QuestionImage {
  src: string;
  alt: string;
  dataAttrs: Record<string, string>;
  base64?: string;
}

export interface Question {
  index: number;
  type: QuestionType;
  sectionTitle: string;
  scoreText: string;
  description: string;
  rawText: string;
  options?: Array<{
    label: string;
    content: string;
    value: string;
  }>;
  blankCount: number;
  hasImage: boolean;
  images: QuestionImage[];
  rawClassName: string;
  rawTypeText: string;
  modelHints: string[];
  /** 匹配题专用：左侧题干项 */
  matchingItems?: Array<{ stem: string; poolLabel: string }>;
}

export interface AIResponse {
  questions: Array<{
    index: number;
    type?: string;
    answer: string | string[];
  }>;
}

export interface ExamStats {
  totalDomSubjects: number;
  extractedCount: number;
  aiReturnedCount: number;
  filledCount: number;
  skippedQuestions: number[];
  fillFailedQuestions: number[];
  unknownTypeQuestions: number[];
  imageQuestions: number[];
  visionModeQuestions: number[];
  degradedImageQuestions: number[];
}

// ============================================================
// 常量
// ============================================================

export const LOG_PREFIX = '[AI答题]';

/** 题型文字 -> 内部类型映射 */
export const TYPE_TEXT_MAP: Array<{ pattern: RegExp; type: QuestionType }> = [
  { pattern: /单选题/, type: 'single_selection' },
  { pattern: /多选题/, type: 'multiple_selection' },
  { pattern: /判断题/, type: 'true_or_false' },
  { pattern: /填空题/, type: 'fill_in_blank' },
  { pattern: /简答题|综合题|应用题|论述题|分析题|计算题|编程题/, type: 'short_answer' },
  { pattern: /匹配题|配对题/, type: 'matching' },
];

/** class -> 内部类型映射（兜底） */
export const TYPE_CLASS_MAP: Array<{ className: string; type: QuestionType }> = [
  { className: 'single_selection', type: 'single_selection' },
  { className: 'multiple_selection', type: 'multiple_selection' },
  { className: 'true_or_false', type: 'true_or_false' },
  { className: 'fill_in_blank', type: 'fill_in_blank' },
  { className: 'short_answer', type: 'short_answer' },
  { className: 'essay', type: 'short_answer' },
  { className: 'subjective', type: 'short_answer' },
  { className: 'comprehensive', type: 'short_answer' },
  { className: 'application', type: 'short_answer' },
  { className: 'question_answer', type: 'short_answer' },
  { className: 'answer_question', type: 'short_answer' },
  { className: 'matching', type: 'matching' },
  { className: 'match', type: 'matching' },
];

/** 图片题关键词 */
export const IMAGE_HINT_KEYWORDS = [
  '如图所示',
  '如图',
  '见图',
  '状态转换图',
  '算法框图',
  '左侧所示',
  '右侧所示',
  '流程图',
  '示意图',
  '框图',
];

/** AI 返回的无效答案模式，这些不应填入页面 */
const INVALID_ANSWER_PATTERNS = [
  /^图片信息不足$/,
  /^无法(判断|确定|识别|作答)/,
  /^(无|没有)(法|足够)(的?)信息/,
  /^本题无法/,
  /^根据图片.*无法/,
  /^无法识别/,
];

/** 判断 AI 返回的答案是否有效（非空、非占位文本） */
export function isValidAnswer(answer: string | string[]): boolean {
  if (Array.isArray(answer)) {
    return answer.length > 0 && answer.some((a) => isValidAnswer(a));
  }
  const text = String(answer).trim();
  if (!text) return false;
  return !INVALID_ANSWER_PATTERNS.some((p) => p.test(text));
}

/** 推理模型正则：不支持 temperature */
export const REASONING_MODEL_RE = /^(o1|o1-mini|o1-preview|o3|o3-mini|o3-pro|o4-mini|gpt-5)/i;

// ============================================================
// 日志工具
// ============================================================

export function log(...args: any[]) {
  console.log(LOG_PREFIX, ...args);
}

export function warn(...args: any[]) {
  console.warn(LOG_PREFIX, ...args);
}

export function error(...args: any[]) {
  console.error(LOG_PREFIX, ...args);
}
