/**
 * 自动答题模块 v2.0
 * 重构版：修复漏题、多空填空、图片OCR、稳定编辑器定位、审计日志
 */

import { makeDraggable } from '@/utils/helper';

// ============================================================
// 类型定义
// ============================================================

type QuestionType =
  | 'single_selection'
  | 'multiple_selection'
  | 'true_or_false'
  | 'fill_in_blank'
  | 'short_answer'
  | 'unknown';

interface ExamConfig {
  provider: 'openai' | 'gemini';
  modelName: string;
  apiKey: string;
  apiBaseUrl: string;
  customPrompt: string;
}

interface QuestionImage {
  src: string;
  alt: string;
  dataAttrs: Record<string, string>;
  base64?: string;
}

interface Question {
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
}

interface AIResponse {
  questions: Array<{
    index: number;
    type?: string;
    answer: string | string[];
  }>;
}

interface ExamStats {
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

const LOG_PREFIX = '[AI答题]';

/** 题型文字 -> 内部类型映射 */
const TYPE_TEXT_MAP: Array<{ pattern: RegExp; type: QuestionType }> = [
  { pattern: /单选题/, type: 'single_selection' },
  { pattern: /多选题/, type: 'multiple_selection' },
  { pattern: /判断题/, type: 'true_or_false' },
  { pattern: /填空题/, type: 'fill_in_blank' },
  { pattern: /简答题|综合题|应用题|论述题|分析题|计算题|编程题/, type: 'short_answer' },
];

/** class -> 内部类型映射（兜底） */
const TYPE_CLASS_MAP: Array<{ className: string; type: QuestionType }> = [
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
];

/** 图片题关键词 */
const IMAGE_HINT_KEYWORDS = [
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

/** 推理模型正则：不支持 temperature */
const REASONING_MODEL_RE = /^(o1|o1-mini|o1-preview|o3|o3-mini|o3-pro|o4-mini|gpt-5)/i;

// ============================================================
// 工具函数
// ============================================================

function log(...args: any[]) {
  console.log(LOG_PREFIX, ...args);
}

function warn(...args: any[]) {
  console.warn(LOG_PREFIX, ...args);
}

function error(...args: any[]) {
  console.error(LOG_PREFIX, ...args);
}

// ============================================================
// 1. 题型检测
// ============================================================

/**
 * 基于页面可见文字 + class 兜底的题型检测
 */
function detectQuestionType(element: Element): { type: QuestionType; rawTypeText: string } {
  // 优先：读取题型可见文字
  const summaryEl = element.querySelector('.summary-sub-title');
  const typeText = summaryEl?.textContent?.trim() || '';

  for (const { pattern, type } of TYPE_TEXT_MAP) {
    if (pattern.test(typeText)) {
      return { type, rawTypeText: typeText };
    }
  }

  // 兜底：读取 class
  const classList = element.classList;
  for (const { className, type } of TYPE_CLASS_MAP) {
    if (classList.contains(className)) {
      return { type, rawTypeText: typeText || className };
    }
  }

  // 再兜底：如果有 input[type="radio"]，可能是选择/判断题
  if (element.querySelector('input[type="radio"]')) {
    const optionCount = element.querySelectorAll('.option').length;
    if (optionCount === 2) {
      return { type: 'true_or_false', rawTypeText: typeText || 'inferred_true_or_false' };
    }
    return { type: 'single_selection', rawTypeText: typeText || 'inferred_single_selection' };
  }
  if (element.querySelector('input[type="checkbox"]')) {
    return { type: 'multiple_selection', rawTypeText: typeText || 'inferred_multiple_selection' };
  }

  // 如果有 contenteditable 或 textarea，可能是填空/简答
  const editables = element.querySelectorAll('[contenteditable="true"], textarea');
  if (editables.length > 0) {
    // 检查填空关键词
    if (/填空/.test(typeText) || /请按题目中的空缺顺序/.test(element.textContent || '')) {
      return { type: 'fill_in_blank', rawTypeText: typeText || 'inferred_fill_in_blank' };
    }
    return { type: 'short_answer', rawTypeText: typeText || 'inferred_short_answer' };
  }

  // 未知类型 - 不丢弃
  warn('未识别题型，将保留为 unknown', { typeText, classList: Array.from(classList) });
  return { type: 'unknown', rawTypeText: typeText || 'unknown' };
}

// ============================================================
// 2. 图片提取
// ============================================================

/**
 * 提取题目中的所有图片信息
 */
function extractQuestionImages(element: Element): QuestionImage[] {
  const images: QuestionImage[] = [];
  const imgElements = element.querySelectorAll('img');

  imgElements.forEach((img) => {
    const src = img.src || img.getAttribute('src') || '';
    const alt = img.alt || '';

    // 收集 data-* 属性
    const dataAttrs: Record<string, string> = {};
    Array.from(img.attributes).forEach((attr) => {
      if (attr.name.startsWith('data-')) {
        dataAttrs[attr.name] = attr.value;
      }
    });

    images.push({ src, alt, dataAttrs });
  });

  // 检查背景图
  const allElements = element.querySelectorAll('*');
  allElements.forEach((el) => {
    const style = window.getComputedStyle(el);
    const bgImage = style.backgroundImage;
    if (bgImage && bgImage !== 'none' && bgImage.startsWith('url(')) {
      const urlMatch = bgImage.match(/url\(["']?(.*?)["']?\)/);
      if (urlMatch && urlMatch[1]) {
        images.push({ src: urlMatch[1], alt: 'background-image', dataAttrs: {} });
      }
    }
  });

  return images;
}

/**
 * 对题目区域进行 canvas 截图，返回 base64
 */
async function captureQuestionImage(element: Element): Promise<string | null> {
  try {
    const html2canvas = (window as any).html2canvas;
    if (!html2canvas) {
      warn('html2canvas 不可用，无法截图');
      return null;
    }

    const canvas = await html2canvas(element, {
      useCORS: true,
      allowTaint: true,
      scale: 1.5,
      logging: false,
    });

    return canvas.toDataURL('image/jpeg', 0.8);
  } catch (e) {
    warn('截图失败:', e);
    return null;
  }
}

/**
 * 尝试获取图片的 base64 数据
 * 优先：直接读取 img src (如果是 data URI 或同源)
 * 兜底：canvas 截图整个题目区域
 */
async function resolveImageBase64(image: QuestionImage, questionElement: Element): Promise<string | null> {
  const { src } = image;

  // 已经是 base64
  if (src.startsWith('data:image/')) {
    return src;
  }

  // 尝试通过 canvas 读取 img 元素
  if (src && src !== 'in-rich-content' && !src.startsWith('data:')) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const loaded = await new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (val: boolean) => {
          if (!settled) {
            settled = true;
            resolve(val);
          }
        };
        img.onload = () => settle(true);
        img.onerror = () => settle(false);
        img.src = src;
        setTimeout(() => settle(false), 5000);
      });

      if (loaded) {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          return canvas.toDataURL('image/jpeg', 0.85);
        }
      }
    } catch {
      // 跨域或其他错误，继续兜底
    }
  }

  // 兜底：对整个题目区域截图
  return captureQuestionImage(questionElement);
}

// ============================================================
// 3. 题目提取
// ============================================================

/**
 * 等待题目数量稳定
 */
async function waitForQuestionsStable(timeout = 8000): Promise<number> {
  const start = Date.now();
  let lastCount = 0;
  let stableTimes = 0;

  while (Date.now() - start < timeout) {
    const count = document.querySelectorAll('.subject').length;
    if (count > 0 && count === lastCount) {
      stableTimes++;
      if (stableTimes >= 3) {
        log(`题目数量已稳定: ${count} 道`);
        return count;
      }
    } else {
      stableTimes = 0;
      lastCount = count;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const finalCount = document.querySelectorAll('.subject').length;
  warn(`等待题目稳定超时，当前数量: ${finalCount}`);
  return finalCount;
}

/**
 * 获取当前章节标题
 */
function getCurrentSectionTitle(element: Element): string {
  // 向上查找最近的章节标题
  let prev = element.previousElementSibling;
  while (prev) {
    const text = prev.textContent?.trim() || '';
    if (/^[一二三四五六七八九十]+、/.test(text)) {
      return text;
    }
    // 检查是否是 section-title 类
    if (prev.classList?.contains('section-title') || prev.classList?.contains('paper-section-title')) {
      return text;
    }
    prev = prev.previousElementSibling;
  }

  // 尝试从父元素里找
  const parent = element.closest('.paper-section, .exam-section, .section');
  if (parent) {
    const titleEl = parent.querySelector('.section-title, .paper-section-title, h3, h4');
    if (titleEl) return titleEl.textContent?.trim() || '';
  }

  return '';
}

/**
 * 提取页面中的所有题目（增强版）
 */
function extractQuestions(): Question[] {
  const questions: Question[] = [];
  const subjectElements = document.querySelectorAll('.subject');

  log(`DOM 中共找到 ${subjectElements.length} 个 .subject 元素`);

  subjectElements.forEach((element) => {
    // 检测题型
    const { type, rawTypeText } = detectQuestionType(element);

    // 获取题目序号 - 多选择器兜底
    const indexEl =
      element.querySelector('.subject-resort-index .ng-binding') ||
      element.querySelector('.subject-resort-index') ||
      element.querySelector('.subject-index');
    let index = 0;
    if (indexEl) {
      const match = indexEl.textContent?.match(/(\d+)/);
      index = match ? parseInt(match[1]) : 0;
    }

    // 如果序号为 0 且没有题目描述，可能是非题目元素（如章节标题、分隔符），跳过
    const descEl = element.querySelector('.subject-description');
    const description = descEl?.textContent?.trim() || '';
    if (index === 0 && !description && type === 'unknown') {
      return;
    }

    // 获取分数文字
    const scoreEl = element.querySelector('.summary-sub-title');
    const scoreText = scoreEl?.textContent?.trim() || '';

    // 获取章节标题
    const sectionTitle = getCurrentSectionTitle(element);

    // 提取图片
    const images = extractQuestionImages(element);
    const hasImage = images.length > 0;

    // 检测填空空位数（去重：同一个元素只算一次）
    let blankCount = 0;
    if (type === 'fill_in_blank') {
      // 优先从题目描述区域找空位
      const descBlanks = new Set(
        Array.from(
          element.querySelectorAll('.subject-description [contenteditable="true"], .subject-description .___answer'),
        ),
      );
      if (descBlanks.size > 0) {
        blankCount = descBlanks.size;
      } else {
        // 兜底：所有 contenteditable（去重）
        const allBlanks = new Set(
          Array.from(element.querySelectorAll('.___answer[contenteditable="true"], [contenteditable="true"]')),
        );
        blankCount = allBlanks.size;
      }
    }

    // 构建 modelHints
    const modelHints: string[] = [];
    if (hasImage) {
      modelHints.push('此题包含图片');
      const questionText = element.textContent || '';
      IMAGE_HINT_KEYWORDS.forEach((kw) => {
        if (questionText.includes(kw)) {
          modelHints.push(`图片关键词: ${kw}`);
        }
      });
    }
    if (blankCount > 1) {
      modelHints.push(`此题有 ${blankCount} 个空位，请返回数组答案`);
    }

    const rawText = element.textContent?.trim() || '';

    const question: Question = {
      index,
      type,
      sectionTitle,
      scoreText,
      description,
      rawText: rawText.substring(0, 2000),
      blankCount,
      hasImage,
      images,
      rawClassName: element.className,
      rawTypeText,
      modelHints,
    };

    // 提取选项（选择题、判断题）
    if (['single_selection', 'multiple_selection', 'true_or_false'].includes(type)) {
      const options: Question['options'] = [];
      const optionElements = element.querySelectorAll('.option');

      optionElements.forEach((optEl) => {
        const label = optEl.querySelector('.option-index')?.textContent?.trim() || '';
        const content = optEl.querySelector('.option-content')?.textContent?.trim() || '';
        const input = optEl.querySelector('input') as HTMLInputElement;
        const value = input?.getAttribute('ng-value') || input?.value || '';

        options.push({ label, content, value });
      });

      question.options = options;
    }

    // unknown 类型也尝试提取选项（万一有选项结构）
    if (type === 'unknown') {
      const optionElements = element.querySelectorAll('.option');
      if (optionElements.length > 0) {
        const options: Question['options'] = [];
        optionElements.forEach((optEl) => {
          const label = optEl.querySelector('.option-index')?.textContent?.trim() || '';
          const content = optEl.querySelector('.option-content')?.textContent?.trim() || '';
          const input = optEl.querySelector('input') as HTMLInputElement;
          const value = input?.getAttribute('ng-value') || input?.value || '';
          options.push({ label, content, value });
        });
        question.options = options;
        // 有选项的 unknown 提升为 single_selection
        if (element.querySelector('input[type="radio"]')) {
          question.type = 'single_selection';
        } else if (element.querySelector('input[type="checkbox"]')) {
          question.type = 'multiple_selection';
        }
      }
    }

    questions.push(question);
  });

  // 打印摘要
  log('===== 题目提取摘要 =====');
  console.table(
    questions.map((q) => ({
      index: q.index,
      type: q.type,
      rawTypeText: q.rawTypeText,
      section: q.sectionTitle.substring(0, 20),
      score: q.scoreText,
      hasImage: q.hasImage,
      imageCount: q.images.length,
      blankCount: q.blankCount,
      descLen: q.description.length,
      hints: q.modelHints.join('; '),
    })),
  );

  return questions;
}

// ============================================================
// 4. Prompt 构建器
// ============================================================

function buildSystemPrompt(): string {
  return `你是一个在线考试答题解析器。你的任务是根据提供的题目数据（题干、题型、选项、填空空位信息、图片、截图 OCR 文本）生成严格可解析的 JSON 答案结果。

规则：
1. 必须逐题作答，不允许漏题。
2. 输出必须是纯 JSON，不要输出 markdown，不要输出解释。
3. 如果题目是单选题或判断题，answer 返回单个选项字母，如 "A"。
4. 如果题目是多选题，answer 返回数组，如 ["A","C","D"]。
5. 如果题目是单空填空题，answer 返回字符串。
6. 如果题目是多空填空题，answer 返回字符串数组，顺序必须与空位顺序一致。
7. 如果题目是简答题、综合题、应用题，answer 返回字符串。
8. 如果题目包含图片、流程图、状态图、框图，必须结合图片内容一起判断。
9. 如果图片不可见、模糊、缺失，且无法仅凭文本可靠作答，answer 返回 "图片信息不足"。
10. 不要编造不存在的图片细节。
11. 保持题号 index 与输入一致。
12. 若无法确定答案，也必须保留该题并给出最合理结果，不能直接跳过。

如果题目包含图片，请执行以下策略：
1. 先识别图片中的文字（OCR），包括标题、标注、节点名称、箭头说明、流程步骤、表格文字、状态名。
2. 再理解图片的结构关系，例如：
   - 流程图中的先后顺序
   - 状态转换图中的状态与迁移
   - 算法框图中的判断分支与执行步骤
   - 表格中的行列对应关系
3. 将图片识别结果与题干文字联合判断，不要只看图片，也不要只看题干。
4. 若图片仅能部分识别，应基于"可见文字 + 可见结构 + 题干上下文"谨慎作答。
5. 若图片信息明显不足，明确返回"图片信息不足"，不要伪造图中内容。

输出格式示例：
{
  "questions": [
    { "index": 1, "type": "single_selection", "answer": "C" },
    { "index": 2, "type": "multiple_selection", "answer": ["A", "C"] },
    { "index": 3, "type": "fill_in_blank", "answer": ["答案1", "答案2", "答案3"] },
    { "index": 4, "type": "short_answer", "answer": "这里填写简答内容" }
  ]
}`;
}

function buildUserPrompt(questions: Question[], customPrompt: string): string {
  let prompt = '请根据以下题目列表作答。\n\n';

  if (customPrompt && customPrompt.trim()) {
    prompt += `补充说明：${customPrompt.trim()}\n\n`;
  }

  prompt += '题目列表：\n';
  prompt += '```json\n';

  const questionsForPrompt = questions.map((q) => {
    // 如果 description 太短（可能被 contenteditable 吞掉），用 rawText 补充
    const questionText = q.description.length > 10 ? q.description : q.rawText.substring(0, 2000);
    const item: any = {
      index: q.index,
      type: q.type,
      section: q.sectionTitle,
      score: q.scoreText,
      question: questionText,
    };

    if (q.options && q.options.length > 0) {
      item.options = q.options.map((o) => `${o.label} ${o.content}`);
    }

    if (q.blankCount > 0) {
      item.blankCount = q.blankCount;
      item.note = `此题有${q.blankCount}个空位，请返回长度为${q.blankCount}的字符串数组`;
    }

    if (q.modelHints.length > 0) {
      item.hints = q.modelHints;
    }

    if (q.hasImage && q.images.length > 0) {
      item.imageInfo = q.images.map((img) => ({
        src: img.src ? img.src.substring(0, 200) : 'embedded',
        alt: img.alt,
      }));
    }

    return item;
  });

  prompt += JSON.stringify(questionsForPrompt, null, 2);
  prompt += '\n```\n\n';

  prompt += `共 ${questions.length} 道题，请全部作答，不要遗漏。只返回 JSON，不要包含其他内容。`;

  return prompt;
}

// ============================================================
// 5. Provider 适配层
// ============================================================

/**
 * 构建 OpenAI 多模态消息内容（含图片）
 */
function buildOpenAIVisionContent(
  textContent: string,
  imageBase64List: string[],
): Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> {
  const parts: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [];

  parts.push({ type: 'text', text: textContent });

  imageBase64List.forEach((b64) => {
    const url = b64.startsWith('data:image/') ? b64 : `data:image/jpeg;base64,${b64}`;
    parts.push({
      type: 'image_url',
      image_url: { url, detail: 'high' },
    });
  });

  return parts;
}

/**
 * 构建 Gemini 多模态消息内容（含图片）
 */
function buildGeminiVisionParts(
  textContent: string,
  imageBase64List: string[],
): Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  parts.push({ text: textContent });

  imageBase64List.forEach((b64) => {
    let data = b64;
    let mimeType = 'image/jpeg';

    if (b64.startsWith('data:')) {
      const match = b64.match(/^data:(image\/[^;]+);base64,(.+)$/s);
      if (match) {
        mimeType = match[1];
        data = match[2];
      } else {
        // 无法解析 data URI，尝试去掉前缀
        const commaIdx = b64.indexOf(',');
        if (commaIdx !== -1) {
          data = b64.substring(commaIdx + 1);
        }
      }
    }

    parts.push({
      inlineData: { mimeType, data },
    });
  });

  return parts;
}

/**
 * 调用 OpenAI 兼容 API
 */
async function callOpenAI(
  config: ExamConfig,
  systemPrompt: string,
  userContent: string | Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }>,
): Promise<string> {
  const isReasoningModel = REASONING_MODEL_RE.test(config.modelName);

  const messages: any[] = [];

  // 推理模型使用 developer 角色，非推理模型用 system
  if (isReasoningModel) {
    messages.push({ role: 'developer', content: systemPrompt });
  } else {
    messages.push({ role: 'system', content: systemPrompt });
  }

  messages.push({ role: 'user', content: userContent });

  const requestBody: any = {
    model: config.modelName,
    messages,
  };

  if (!isReasoningModel) {
    requestBody.temperature = 0.3;
  }

  log(
    '发送 OpenAI API 请求，模型:',
    config.modelName,
    '推理模型:',
    isReasoningModel,
    '多模态:',
    Array.isArray(userContent),
  );

  const response = await fetch(`${config.apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    error('OpenAI API 请求失败:', response.status, errorText);
    throw new Error(`OpenAI API 请求失败: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * 调用 Gemini API
 */
async function callGemini(
  config: ExamConfig,
  systemPrompt: string,
  userContent: string | Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>,
): Promise<string> {
  const url = `${config.apiBaseUrl}/models/${config.modelName}:generateContent?key=${config.apiKey}`;

  const parts = Array.isArray(userContent) ? userContent : [{ text: userContent }];

  const requestBody = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    generationConfig: {
      temperature: 0.3,
    },
  };

  log('发送 Gemini API 请求，模型:', config.modelName, '多模态:', Array.isArray(userContent));

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    error('Gemini API 请求失败:', response.status, errorText);
    throw new Error(`Gemini API 请求失败: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * 解析模型返回内容为 AIResponse
 */
function parseModelResponse(rawContent: string): AIResponse {
  let content = rawContent.trim();

  // 移除 markdown code fence
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    content = jsonMatch[1];
  }

  // 尝试提取 JSON 对象
  const objMatch = content.match(/\{[\s\S]*\}/);
  if (objMatch) {
    content = objMatch[0];
  }

  try {
    const parsed = JSON.parse(content);

    // 兼容两种格式
    if (parsed.questions && Array.isArray(parsed.questions)) {
      return parsed as AIResponse;
    }

    // 如果返回的是数组
    if (Array.isArray(parsed)) {
      return { questions: parsed };
    }

    error('解析后的 JSON 结构不符合预期:', parsed);
    throw new Error('AI 返回的 JSON 结构不正确');
  } catch (e) {
    error('JSON 解析失败，原始内容:', rawContent.substring(0, 500));
    throw new Error(`AI 返回的 JSON 格式不正确: ${e instanceof Error ? e.message : '未知错误'}`);
  }
}

/**
 * 统一调用入口
 */
async function callProvider(config: ExamConfig, questions: Question[], stats: ExamStats): Promise<AIResponse> {
  const systemPrompt = buildSystemPrompt();
  const userPromptText = buildUserPrompt(questions, config.customPrompt);

  // 检查是否有图片题需要多模态
  const imageQuestions = questions.filter((q) => q.hasImage && q.images.length > 0);
  stats.imageQuestions = imageQuestions.map((q) => q.index);

  let hasVisionContent = false;
  const resolvedImageBase64List: string[] = [];

  if (imageQuestions.length > 0) {
    log(`检测到 ${imageQuestions.length} 道图片题，尝试提取图片...`);

    for (const q of imageQuestions) {
      const subjectEl = findSubjectElement(q.index);
      if (!subjectEl) continue;

      for (const img of q.images) {
        const base64 = await resolveImageBase64(img, subjectEl);
        if (base64) {
          resolvedImageBase64List.push(base64);
          hasVisionContent = true;
          if (!stats.visionModeQuestions.includes(q.index)) {
            stats.visionModeQuestions.push(q.index);
          }
        } else {
          if (!stats.degradedImageQuestions.includes(q.index)) {
            stats.degradedImageQuestions.push(q.index);
          }
          warn(`题目 ${q.index} 的图片无法提取，降级为文本模式`);
        }
      }
    }
  }

  let rawContent: string;

  if (config.provider === 'openai') {
    if (hasVisionContent && resolvedImageBase64List.length > 0) {
      log('使用 OpenAI 多模态模式');
      const visionContent = buildOpenAIVisionContent(userPromptText, resolvedImageBase64List);
      rawContent = await callOpenAI(config, systemPrompt, visionContent);
    } else {
      log('使用 OpenAI 纯文本模式');
      rawContent = await callOpenAI(config, systemPrompt, userPromptText);
    }
  } else if (config.provider === 'gemini') {
    if (hasVisionContent && resolvedImageBase64List.length > 0) {
      log('使用 Gemini 多模态模式');
      const visionParts = buildGeminiVisionParts(userPromptText, resolvedImageBase64List);
      rawContent = await callGemini(config, systemPrompt, visionParts);
    } else {
      log('使用 Gemini 纯文本模式');
      rawContent = await callGemini(config, systemPrompt, userPromptText);
    }
  } else {
    throw new Error(`不支持的 provider: ${config.provider}`);
  }

  return parseModelResponse(rawContent);
}

// ============================================================
// 6. 答案填写
// ============================================================

/**
 * 向 contenteditable 元素填入文本，确保触发框架变更检测
 */
function fillEditable(el: HTMLElement, text: string): void {
  // 聚焦到目标元素
  el.focus();

  // 先用 Selection API 选中元素内全部内容，再删除
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // 使用 execCommand 模拟用户输入（作用于当前 selection，即此元素内部）
  document.execCommand('delete', false);
  document.execCommand('insertText', false, text);

  // 补充直接设置（兜底，防止 execCommand 不生效）
  if (!el.textContent || el.textContent.trim() !== text.trim()) {
    el.textContent = text;
  }

  // 触发事件（必须在所有赋值方式之后，确保不论哪种方式生效都能被框架检测到）
  ['input', 'change', 'blur', 'keyup', 'keydown', 'compositionend'].forEach((eventType) => {
    el.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
  });

  // 尝试触发 Angular digest
  try {
    const angularEl = (window as any).angular?.element(el);
    if (angularEl?.scope) {
      const scope = angularEl.scope();
      scope?.$apply?.();
    }
  } catch {
    // 忽略
  }
}

/**
 * 向 textarea 填入文本
 */
function fillTextarea(el: HTMLTextAreaElement, text: string): void {
  el.focus();
  el.value = text;

  // 使用 InputEvent 以更好地触发框架检测
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
  ['change', 'blur', 'keyup'].forEach((eventType) => {
    el.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
  });

  // Angular 兜底
  try {
    const angularEl = (window as any).angular?.element(el);
    if (angularEl?.scope) {
      const scope = angularEl.scope();
      scope?.$apply?.();
    }
  } catch {
    // 忽略
  }
}

/**
 * 在 subject 元素中查找作答编辑器（排除题目描述中的 contenteditable）
 */
function findAnswerEditors(subjectEl: Element, type: QuestionType): HTMLElement[] {
  if (type === 'fill_in_blank') {
    // 填空题：优先 .___answer，再 subject-description 内的 contenteditable，最后宽泛查找
    let editors = Array.from(subjectEl.querySelectorAll('.___answer[contenteditable="true"]')) as HTMLElement[];

    if (editors.length === 0) {
      editors = Array.from(
        subjectEl.querySelectorAll('.subject-description [contenteditable="true"]'),
      ) as HTMLElement[];
    }

    if (editors.length === 0) {
      // 宽泛查找：排除明显不是答案编辑器的
      editors = (Array.from(subjectEl.querySelectorAll('[contenteditable="true"]')) as HTMLElement[]).filter((el) => {
        // 排除题目描述中只读的装饰性 contenteditable
        const parent = el.closest('.subject-operate, .subject-answer, .answer-area, .blank-area');
        if (parent) return true;
        // 排除很大的容器型 contenteditable
        if (el.children.length > 5) return false;
        return true;
      });
    }

    return editors;
  }

  if (type === 'short_answer' || type === 'unknown') {
    // 简答题：优先 textarea，再 contenteditable
    const textareas = Array.from(subjectEl.querySelectorAll('textarea')) as HTMLElement[];
    if (textareas.length > 0) return textareas;

    // 查找作答区域的 contenteditable
    const answerArea = subjectEl.querySelector('.subject-operate, .subject-answer, .answer-area');
    if (answerArea) {
      const editables = Array.from(answerArea.querySelectorAll('[contenteditable="true"]')) as HTMLElement[];
      if (editables.length > 0) return editables;
    }

    // 兜底：所有 contenteditable，排除语言选择器附近的和题目描述中的
    const allEditables = Array.from(subjectEl.querySelectorAll('[contenteditable="true"]')) as HTMLElement[];

    return allEditables.filter((el) => {
      // 排除题目描述内的（填空空位）
      if (el.closest('.subject-description')) return false;
      // 排除太小的（可能是装饰性）
      if (el.offsetHeight < 20 && el.offsetWidth < 50) return false;
      return true;
    });
  }

  return [];
}

/**
 * 找到对应题目的 DOM 元素
 */
function findSubjectElement(index: number): Element | null {
  const subjectElements = document.querySelectorAll('.subject');
  return (
    Array.from(subjectElements).find((el) => {
      const indexEl =
        el.querySelector('.subject-resort-index .ng-binding') || el.querySelector('.subject-resort-index');
      if (!indexEl) return false;
      const match = indexEl.textContent?.match(/(\d+)/);
      return match && parseInt(match[1]) === index;
    }) || null
  );
}

/**
 * 填写选择题（单选、判断）
 */
function fillChoiceQuestion(subjectEl: Element, question: Question, answer: string | string[]): boolean {
  const answerLabel = typeof answer === 'string' ? answer.trim().toUpperCase() : '';
  if (!answerLabel) return false;

  // 方案1：通过 options 的 ng-value 精确点击
  if (question.options) {
    // 清理选项标签格式：支持 "A" "A." "A、" 等
    const cleanLabel = answerLabel.replace(/[.、．\s]/g, '');
    const option = question.options.find((opt) => {
      const optLabel = opt.label.replace(/[.、．\s]/g, '').toUpperCase();
      return optLabel === cleanLabel;
    });

    if (option && option.value) {
      const input = subjectEl.querySelector(`input[ng-value="${option.value}"]`) as HTMLInputElement;
      if (input) {
        input.click();
        return true;
      }
    }
  }

  // 方案2：通过可见文字匹配选项标签
  const optionElements = Array.from(subjectEl.querySelectorAll('.option'));
  const cleanAnswer = answerLabel.replace(/[.、．\s]/g, '');
  let targetEl = optionElements.find((optEl) => {
    const indexEl = optEl.querySelector('.option-index');
    const optText =
      indexEl?.textContent
        ?.trim()
        .replace(/[.、．\s]/g, '')
        .toUpperCase() || '';
    return optText === cleanAnswer;
  });

  // 方案3：判断题内容匹配（AI 可能返回 "正确"/"错误"/"对"/"错" 而非字母）
  if (!targetEl && question.type === 'true_or_false') {
    const rawAnswer = (typeof answer === 'string' ? answer : '').trim();
    targetEl = optionElements.find((optEl) => {
      const content = optEl.querySelector('.option-content')?.textContent?.trim() || '';
      return content === rawAnswer || content.includes(rawAnswer) || rawAnswer.includes(content);
    });
  }

  if (targetEl) {
    const input = targetEl.querySelector('input[type="radio"], input[type="checkbox"]') as HTMLInputElement;
    if (input) {
      input.click();
      return true;
    }
    // 直接点击选项容器
    (targetEl as HTMLElement).click();
    return true;
  }

  return false;
}

/**
 * 填写多选题
 */
function fillMultipleChoiceQuestion(subjectEl: Element, _question: Question, answer: string | string[]): boolean {
  const answerLabels = Array.isArray(answer)
    ? answer.map((a) => String(a).trim().toUpperCase())
    : typeof answer === 'string'
      ? answer
          .split(/[,，\s]+/)
          .map((a) => a.trim().toUpperCase())
          .filter(Boolean)
      : [];

  if (answerLabels.length === 0) return false;

  let filled = 0;
  answerLabels.forEach((label) => {
    const cleanLabel = label.replace(/[.、．\s]/g, '');
    const optionElements = Array.from(subjectEl.querySelectorAll('.option'));
    const targetEl = optionElements.find((optEl) => {
      const indexEl = optEl.querySelector('.option-index');
      const optText =
        indexEl?.textContent
          ?.trim()
          .replace(/[.、．\s]/g, '')
          .toUpperCase() || '';
      return optText === cleanLabel;
    });

    if (targetEl) {
      const input = targetEl.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (input && !input.checked) {
        input.click();
        filled++;
      } else if (input?.checked) {
        filled++; // 已选中也算成功
      }
    }
  });

  return filled > 0;
}

/**
 * 填写填空题（支持多空）
 */
function fillBlankQuestion(subjectEl: Element, question: Question, answer: string | string[]): boolean {
  const editors = findAnswerEditors(subjectEl, 'fill_in_blank');
  if (editors.length === 0) {
    warn(`题目 ${question.index}: 未找到填空编辑器`);
    return false;
  }

  // 解析答案为数组
  let answers: string[];
  if (Array.isArray(answer)) {
    answers = answer.map((v) => String(v));
  } else if (typeof answer === 'string') {
    // 尝试按分隔符拆分
    if (editors.length > 1) {
      answers = answer.split(/\s*[|｜;；]\s*/).filter(Boolean);
      // 如果拆分后数量不匹配，用原始字符串填所有空
      if (answers.length !== editors.length) {
        answers = [answer];
      }
    } else {
      answers = [answer];
    }
  } else {
    answers = [String(answer)];
  }

  log(`题目 ${question.index}: ${editors.length} 个空位, ${answers.length} 个答案`);

  let filled = 0;
  editors.forEach((editor, idx) => {
    const value = answers[idx] ?? answers[answers.length - 1] ?? '';
    if (!value) return;

    if (editor instanceof HTMLTextAreaElement) {
      fillTextarea(editor, value);
    } else {
      fillEditable(editor, value);
    }
    filled++;
    log(`题目 ${question.index} 空位 ${idx + 1}: 已填入 "${value}"`);
  });

  return filled > 0;
}

/**
 * 填写简答题 / 应用题 / 综合题
 */
function fillEssayQuestion(subjectEl: Element, question: Question, answer: string | string[]): boolean {
  const answerText = Array.isArray(answer) ? answer.join('\n') : String(answer);
  if (!answerText || answerText === '图片信息不足') {
    warn(`题目 ${question.index}: 答案为空或图片信息不足，跳过填写`);
    return false;
  }

  const editors = findAnswerEditors(subjectEl, 'short_answer');
  if (editors.length === 0) {
    warn(`题目 ${question.index}: 未找到简答题编辑器`);
    return false;
  }

  const editor = editors[0];
  if (editor instanceof HTMLTextAreaElement) {
    fillTextarea(editor, answerText);
  } else {
    fillEditable(editor, answerText);
  }

  log(`题目 ${question.index}: 已填入简答/应用题答案 (${answerText.length} 字)`);
  return true;
}

/**
 * 统一填写入口
 */
function fillAnswerForQuestion(question: Question, answer: string | string[], stats: ExamStats): boolean {
  const subjectEl = findSubjectElement(question.index);
  if (!subjectEl) {
    warn(`题目 ${question.index}: 未找到 DOM 元素`);
    stats.fillFailedQuestions.push(question.index);
    return false;
  }

  let success = false;

  switch (question.type) {
    case 'single_selection':
    case 'true_or_false':
      success = fillChoiceQuestion(subjectEl, question, answer);
      break;

    case 'multiple_selection':
      success = fillMultipleChoiceQuestion(subjectEl, question, answer);
      break;

    case 'fill_in_blank':
      success = fillBlankQuestion(subjectEl, question, answer);
      break;

    case 'short_answer':
    case 'unknown':
      success = fillEssayQuestion(subjectEl, question, answer);
      break;

    default:
      // 尝试作为简答题处理
      success = fillEssayQuestion(subjectEl, question, answer);
      break;
  }

  if (success) {
    stats.filledCount++;
    log(`题目 ${question.index} (${question.type}): 填写成功`);
  } else {
    stats.fillFailedQuestions.push(question.index);
    warn(`题目 ${question.index} (${question.type}): 填写失败`);
  }

  return success;
}

/**
 * 批量填写所有答案
 */
function fillAnswers(questions: Question[], aiResponse: AIResponse, stats: ExamStats): void {
  const answerMap = new Map<number, string | string[]>();
  aiResponse.questions.forEach((a) => {
    answerMap.set(a.index, a.answer);
  });

  questions.forEach((question) => {
    const answer = answerMap.get(question.index);
    if (answer === undefined || answer === null) {
      stats.skippedQuestions.push(question.index);
      warn(`题目 ${question.index}: AI 未返回答案，跳过`);
      return;
    }

    fillAnswerForQuestion(question, answer, stats);
  });
}

// ============================================================
// 7. 审计日志
// ============================================================

function printExamStats(stats: ExamStats): void {
  log('===== 答题统计 =====');
  console.table({
    'DOM .subject 总数': stats.totalDomSubjects,
    提取题目数: stats.extractedCount,
    'AI 返回题目数': stats.aiReturnedCount,
    成功填写数: stats.filledCount,
    '跳过 (AI未返回)': stats.skippedQuestions.length,
    填写失败数: stats.fillFailedQuestions.length,
    未知题型数: stats.unknownTypeQuestions.length,
    图片题数: stats.imageQuestions.length,
    多模态处理数: stats.visionModeQuestions.length,
    图片降级数: stats.degradedImageQuestions.length,
  });

  if (stats.skippedQuestions.length > 0) {
    warn('AI 未返回答案的题目:', stats.skippedQuestions.join(', '));
  }
  if (stats.fillFailedQuestions.length > 0) {
    warn('填写失败的题目:', stats.fillFailedQuestions.join(', '));
  }
  if (stats.unknownTypeQuestions.length > 0) {
    warn('未识别题型的题目:', stats.unknownTypeQuestions.join(', '));
  }
  if (stats.degradedImageQuestions.length > 0) {
    warn('图片降级为文本模式的题目:', stats.degradedImageQuestions.join(', '));
  }
}

// ============================================================
// 8. 主流程
// ============================================================

/**
 * 开始自动答题
 */
async function startAutoExam(config: ExamConfig): Promise<void> {
  const stats: ExamStats = {
    totalDomSubjects: 0,
    extractedCount: 0,
    aiReturnedCount: 0,
    filledCount: 0,
    skippedQuestions: [],
    fillFailedQuestions: [],
    unknownTypeQuestions: [],
    imageQuestions: [],
    visionModeQuestions: [],
    degradedImageQuestions: [],
  };

  try {
    showStatus('正在等待页面加载稳定...', 'info');

    // 等待题目稳定
    const stableCount = await waitForQuestionsStable();
    stats.totalDomSubjects = stableCount;

    if (stableCount === 0) {
      showStatus('未找到题目，请确保页面已完全加载', 'error');
      return;
    }

    showStatus(`检测到 ${stableCount} 个题目元素，正在提取...`, 'info');

    // 提取题目
    const questions = extractQuestions();
    stats.extractedCount = questions.length;
    stats.unknownTypeQuestions = questions.filter((q) => q.type === 'unknown').map((q) => q.index);

    if (questions.length === 0) {
      showStatus('题目提取失败，请检查页面结构', 'error');
      return;
    }

    showStatus(`已提取 ${questions.length} 道题目，正在调用 AI 分析...`, 'info');

    // 调用 AI
    const aiResponse = await callProvider(config, questions, stats);
    stats.aiReturnedCount = aiResponse.questions?.length || 0;

    log('AI 返回的答案:', aiResponse);

    if (!aiResponse.questions || aiResponse.questions.length === 0) {
      showStatus('AI 返回了空答案', 'error');
      return;
    }

    showStatus(`AI 返回 ${aiResponse.questions.length} 道答案，正在填写...`, 'info');

    // 填写答案
    fillAnswers(questions, aiResponse, stats);

    // 打印统计
    printExamStats(stats);

    // 构建完成信息
    const parts = [`成功填写 ${stats.filledCount}/${questions.length} 道题`];
    if (stats.fillFailedQuestions.length > 0) {
      parts.push(`失败 ${stats.fillFailedQuestions.length} 道`);
    }
    if (stats.skippedQuestions.length > 0) {
      parts.push(`跳过 ${stats.skippedQuestions.length} 道`);
    }
    if (stats.visionModeQuestions.length > 0) {
      parts.push(`图片识别 ${stats.visionModeQuestions.length} 道`);
    }

    const statusType = stats.fillFailedQuestions.length > 0 || stats.skippedQuestions.length > 0 ? 'info' : 'success';
    showStatus(parts.join('，'), statusType);
  } catch (err) {
    error('自动答题失败:', err);
    printExamStats(stats);
    showStatus(`答题失败: ${err instanceof Error ? err.message : '未知错误'}`, 'error');
  }
}

// ============================================================
// 面板 UI / 配置 / 初始化（保留原有结构，更新默认值）
// ============================================================

export function isExamPage(): boolean {
  const url = window.location.href;
  const isMatch = /lms\.ouchn\.cn\/exam\/\d+\/subjects/.test(url) && url.includes('#/take');
  if (isMatch) {
    log('URL匹配成功:', url);
  }
  return isMatch;
}

function createAIExamPanel(): void {
  if ($('#ai-exam-panel').length > 0) {
    log('面板已存在');
    return;
  }

  const config = getStoredConfig();
  const panel = $(`
    <div class="download-panel" id="ai-exam-panel" style="max-height: none;">
      <div class="download-header">
        <h3 class="download-title">🤖 AI 自动答题</h3>
        <button class="download-toggle">−</button>
      </div>
      <div class="download-body" style="max-height: none; overflow-y: visible;">
        <!-- Tab切换 -->
        <div style="display: flex; gap: 10px; margin-bottom: 15px; border-bottom: 2px solid #e0e0e0; padding-bottom: 5px;">
          <button class="ai-tab-btn active" data-provider="openai" style="flex: 1; padding: 8px; border: none; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 6px 6px 0 0; cursor: pointer; font-weight: bold; transition: all 0.3s;">
            OpenAI
          </button>
          <button class="ai-tab-btn" data-provider="gemini" style="flex: 1; padding: 8px; border: none; background: #f0f0f0; color: #666; border-radius: 6px 6px 0 0; cursor: pointer; font-weight: bold; transition: all 0.3s;">
            Gemini
          </button>
        </div>

        <!-- OpenAI配置 -->
        <div class="ai-config-content" data-provider="openai">
          <div style="margin-bottom: 12px;">
            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">模型名称:</label>
            <input type="text" id="ai-model-name-openai" placeholder="gpt-4.1" value="${config.provider === 'openai' ? config.modelName : 'gpt-4.1'}"
                   style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
          </div>

          <div style="margin-bottom: 12px;">
            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">API Key:</label>
            <input type="password" id="ai-api-key-openai" placeholder="sk-..." value="${config.provider === 'openai' ? config.apiKey : ''}"
                   style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
          </div>

          <div style="margin-bottom: 12px;">
            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Base URL:</label>
            <input type="text" id="ai-base-url-openai" placeholder="https://api.openai.com/v1" value="${config.provider === 'openai' ? config.apiBaseUrl : 'https://api.openai.com/v1'}"
                   style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
          </div>
        </div>

        <!-- Gemini配置 -->
        <div class="ai-config-content" data-provider="gemini" style="display: none;">
          <div style="margin-bottom: 12px;">
            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">模型名称:</label>
            <input type="text" id="ai-model-name-gemini" placeholder="gemini-pro" value="${config.provider === 'gemini' ? config.modelName : 'gemini-pro'}"
                   style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
          </div>

          <div style="margin-bottom: 12px;">
            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">API Key:</label>
            <input type="password" id="ai-api-key-gemini" placeholder="AIza..." value="${config.provider === 'gemini' ? config.apiKey : ''}"
                   style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
          </div>

          <div style="margin-bottom: 12px;">
            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Base URL:</label>
            <input type="text" id="ai-base-url-gemini" placeholder="https://generativelanguage.googleapis.com/v1beta" value="${config.provider === 'gemini' ? config.apiBaseUrl : 'https://generativelanguage.googleapis.com/v1beta'}"
                   style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
          </div>
        </div>

        <!-- 共用的自定义提示词 -->
        <div style="margin-bottom: 12px;">
          <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">自定义提示词 (可选):</label>
          <textarea id="ai-custom-prompt" rows="3" placeholder="例如: 这是C语言考试..."
                    style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; resize: vertical; min-height: 60px;">${config.customPrompt}</textarea>
        </div>

        <button class="download-btn download-btn-primary" id="start-ai-exam">
          🚀 开始AI答题
        </button>

        <button class="download-btn download-btn-secondary" id="save-ai-config">
          💾 保存配置
        </button>

        <div class="download-status download-status-info" id="ai-exam-status" style="display:none;">
          准备开始...
        </div>
      </div>
    </div>
  `);

  $('body').append(panel);

  // 绑定Tab切换事件
  panel.find('.ai-tab-btn').on('click', function () {
    const provider = $(this).data('provider');

    panel.find('.ai-tab-btn').each(function () {
      if ($(this).data('provider') === provider) {
        $(this).addClass('active').css({
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
        });
      } else {
        $(this).removeClass('active').css({
          background: '#f0f0f0',
          color: '#666',
        });
      }
    });

    panel.find('.ai-config-content').hide();
    panel.find(`.ai-config-content[data-provider="${provider}"]`).show();
  });

  if (config.provider === 'gemini') {
    panel.find('.ai-tab-btn[data-provider="gemini"]').click();
  }

  panel.find('.download-toggle').on('click', function () {
    const body = panel.find('.download-body');
    body.toggleClass('collapsed');
    $(this).text(body.hasClass('collapsed') ? '+' : '−');
  });

  $('#save-ai-config').on('click', () => {
    const config = getConfigFromPanel();
    saveConfig(config);
    showStatus('配置已保存', 'success');
  });

  $('#start-ai-exam').on('click', async () => {
    const config = getConfigFromPanel();
    if (!validateConfig(config)) {
      showStatus('请填写完整的配置信息', 'error');
      return;
    }

    const btn = $('#start-ai-exam');
    const originalText = btn.text();
    btn.prop('disabled', true).text('⏳ 处理中...');

    saveConfig(config);

    try {
      await startAutoExam(config);
    } finally {
      btn.prop('disabled', false).text(originalText);
    }
  });

  makeDraggable(panel[0]);

  log('AI答题面板已创建');
}

function getConfigFromPanel(): ExamConfig {
  const activeTab = $('.ai-tab-btn.active');
  const provider = (activeTab.data('provider') as 'openai' | 'gemini') || 'openai';

  return {
    provider: provider,
    modelName: ($(`#ai-model-name-${provider}`) as any).val() || '',
    apiKey: ($(`#ai-api-key-${provider}`) as any).val() || '',
    apiBaseUrl: ($(`#ai-base-url-${provider}`) as any).val() || '',
    customPrompt: ($('#ai-custom-prompt') as any).val() || '',
  };
}

function validateConfig(config: ExamConfig): boolean {
  return !!(config.modelName && config.apiKey && config.apiBaseUrl);
}

function saveConfig(config: ExamConfig): void {
  localStorage.setItem('ai-exam-config', JSON.stringify(config));
}

function getStoredConfig(): ExamConfig {
  const stored = localStorage.getItem('ai-exam-config');
  if (stored) {
    const config = JSON.parse(stored);
    if (!config.provider) {
      config.provider = 'openai';
    }
    return config;
  }
  return {
    provider: 'openai',
    modelName: 'gpt-4.1',
    apiKey: '',
    apiBaseUrl: 'https://api.openai.com/v1',
    customPrompt: '',
  };
}

function showStatus(message: string, type: 'success' | 'error' | 'info'): void {
  const statusEl = $('#ai-exam-status');
  if (statusEl.length) {
    statusEl.text(message);
    statusEl.removeClass('download-status-success download-status-error download-status-info download-status-warning');

    if (type === 'success') {
      statusEl.addClass('download-status-success');
    } else if (type === 'error') {
      statusEl.addClass('download-status-warning');
    } else {
      statusEl.addClass('download-status-info');
    }

    statusEl.show();
  }
}

function tryInitPanel(): void {
  log('tryInitPanel 被调用，当前URL:', window.location.href);

  if (!isExamPage()) {
    return;
  }

  if ($('#ai-exam-panel').length > 0) {
    return;
  }

  if (document.body) {
    createAIExamPanel();
    log('AI答题助手已就绪');
  } else {
    setTimeout(tryInitPanel, 500);
  }
}

export function initAutoExam(): void {
  log('==================== 初始化开始 ====================');
  log('脚本版本: 2.0.0');
  log('当前URL:', window.location.href);

  setTimeout(tryInitPanel, 1000);

  window.addEventListener('hashchange', () => {
    setTimeout(tryInitPanel, 500);
  });

  window.addEventListener('popstate', () => {
    setTimeout(tryInitPanel, 500);
  });

  let checkCount = 0;
  const intervalId = setInterval(() => {
    checkCount++;
    if (isExamPage() && $('#ai-exam-panel').length === 0) {
      tryInitPanel();
    }
    if (checkCount >= 10) {
      clearInterval(intervalId);
    }
  }, 3000);

  log('==================== 初始化配置完成 ====================');
}
