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
  /** 当前用于答题请求的 provider；modelName/apiKey/apiBaseUrl 始终镜像 providers[provider]。 */
  provider: 'openai' | 'claude';
  modelName: string;
  apiKey: string;
  apiBaseUrl: string;
  customPrompt: string;
  concurrency: number;
  /** 两个 Tab 各自独立保存配置，避免切换 provider 时覆盖另一套输入。 */
  providers: Record<
    'openai' | 'claude',
    {
      modelName: string;
      apiKey: string;
      apiBaseUrl: string;
    }
  >;
}

export interface QuestionImage {
  src: string;
  alt: string;
  dataAttrs: Record<string, string>;
  base64?: string;
}

export type MatchingAnswer = Record<string, string>;

export type AnswerValue = string | string[] | MatchingAnswer;

/**
 * 综合题子题号编码倍数。
 * FIXED: 用整数 `parentIndex * SUB_INDEX_MULTIPLIER + subIndex` 编码子题 index，
 *        替代旧的 `Number("21.03")` 浮点编码方案。理由：
 *        ① 浮点 21.3 ≠ 21.03 会让 AI 返回 "21.3" 时 answerMap 匹配失败；
 *        ② padStart(2) 只支持 ≤99 个子题，且写在 stats 数组里和真实题号混淆；
 *        ③ 整数编码可以稳定 round-trip JSON、做 Map key、排序、打印。
 *        SUB_INDEX_MULTIPLIER=1000 支持每父题最多 999 个子题，远大于现实需求；
 *        与真实顶层题号区分（顶层题号通常为 1-100，子题 index 总会 ≥1001）。
 *        修改此常量需要同步检查：buildSubQuestionIndex / decodeSubQuestionIndex /
 *        AI prompt 中对 index 编码的描述。
 */
export const SUB_INDEX_MULTIPLIER = 1000;

export interface Question {
  /**
   * 题目唯一标识。
   * - 顶层题：使用 DOM 中解析出的题号（1-based 整数）。
   * - 综合题展开后的子题：`parentIndex * SUB_INDEX_MULTIPLIER + subIndex`，例如父 21 子 3 → 21003。
   * 始终是整数，可安全用作 Map key 和 stats 数组元素。
   */
  index: number;
  /** 综合题展开后的小题会保留父题号，用于回填时重新定位嵌套 DOM */
  parentIndex?: number;
  /** 综合题展开后的小题序号，例如 21 题下的第 3 小题（1-based） */
  subIndex?: number;
  /**
   * 给人类阅读的题号字符串。
   * - 顶层题：`"21"`
   * - 子题：`"21.3"`（与 index 编码无关，仅用于日志/UI/AI prompt 的人类可读标识）
   */
  displayIndex: string;
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
  matchingItems?: Array<{ key: string; stem: string; poolLabel: string }>;
  /** 匹配题专用：右侧答案池 */
  matchingOptions?: Array<{ label: string; content: string; value: string }>;
}

export interface AIResponse {
  questions: Array<{
    index: number;
    type?: string;
    answer: AnswerValue;
  }>;
  failures?: Array<{
    questionIndex: number;
    displayIndex: string;
    message: string;
  }>;
}

export interface ExamStats {
  totalDomSubjects: number;
  extractedCount: number;
  aiReturnedCount: number;
  filledCount: number;
  toolSucceededCount: number;
  toolFailedCount: number;
  toolErrors: Array<{
    tool: string;
    questionIndex?: number;
    code: string;
    message: string;
    retryable: boolean;
    toolUseId?: string;
    source?: string;
  }>;
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
export function isValidAnswer(answer: AnswerValue): boolean {
  if (answer && typeof answer === 'object' && !Array.isArray(answer)) {
    return Object.keys(answer).length > 0 && Object.values(answer).some((v) => isValidAnswer(String(v)));
  }
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

export function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args);
}

export function warn(...args: unknown[]) {
  console.warn(LOG_PREFIX, ...args);
}

export function error(...args: unknown[]) {
  console.error(LOG_PREFIX, ...args);
}
