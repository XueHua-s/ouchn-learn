/**
 * AI Provider 适配层：Prompt 构建 + OpenAI/Gemini API 调用 + 响应解析
 */

import type { ExamConfig, Question, AIResponse, ExamStats } from '@/types/exam';
import { REASONING_MODEL_RE, log, warn, error } from '@/types/exam';
import { resolveImageBase64, sanitizeImageDataUri } from './question-detect';
import { findSubjectElement } from './question-extract';

// ============================================================
// Prompt 构建器
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
// 多模态消息构建
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
    const safeUri = sanitizeImageDataUri(b64);
    if (safeUri) {
      parts.push({
        type: 'image_url',
        image_url: { url: safeUri, detail: 'high' },
      });
    }
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
    const safeUri = sanitizeImageDataUri(b64);
    if (!safeUri) return;

    const match = safeUri.match(/^data:(image\/[^;]+);base64,(.+)$/s);
    if (match) {
      parts.push({
        inlineData: { mimeType: match[1], data: match[2] },
      });
    }
  });

  return parts;
}

// ============================================================
// API 调用
// ============================================================

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

// ============================================================
// 响应解析
// ============================================================

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

// ============================================================
// 统一调用入口
// ============================================================

/**
 * 调用 AI 提供商并解析响应
 */
export async function callProvider(config: ExamConfig, questions: Question[], stats: ExamStats): Promise<AIResponse> {
  const systemPrompt = buildSystemPrompt();
  const userPromptText = buildUserPrompt(questions, config.customPrompt);

  // 检查是否有图片题需要多模态
  const imageQuestions = questions.filter((q) => q.hasImage && q.images.length > 0);
  stats.imageQuestions = imageQuestions.map((q) => q.index);

  const resolvedImageBase64List: string[] = [];

  if (imageQuestions.length > 0) {
    log(`检测到 ${imageQuestions.length} 道图片题，尝试提取图片...`);

    for (const q of imageQuestions) {
      const subjectEl = findSubjectElement(q.index);
      if (!subjectEl) continue;

      for (const img of q.images) {
        const base64 = await resolveImageBase64(img, subjectEl);
        // resolveImageBase64 的返回值已经过 sanitizeImageDataUri 校验，
        // 但这里做最终防线：再次确认是合法 jpeg/png data URI
        if (base64 && sanitizeImageDataUri(base64)) {
          resolvedImageBase64List.push(base64);
          if (!stats.visionModeQuestions.includes(q.index)) {
            stats.visionModeQuestions.push(q.index);
          }
        } else {
          if (!stats.degradedImageQuestions.includes(q.index)) {
            stats.degradedImageQuestions.push(q.index);
          }
          warn(`题目 ${q.index} 的图片无法安全提取，降级为文本模式`);
        }
      }
    }
  }

  // 只有确实拿到了合法图片才走多模态，否则退回纯文本
  const useVision = resolvedImageBase64List.length > 0;
  if (imageQuestions.length > 0) {
    log(
      `图片提取结果: ${resolvedImageBase64List.length} 张合法图片,`,
      `${stats.degradedImageQuestions.length} 张降级,`,
      useVision ? '走多模态' : '退回纯文本',
    );
  }

  let rawContent: string;

  if (config.provider === 'openai') {
    if (useVision) {
      const visionContent = buildOpenAIVisionContent(userPromptText, resolvedImageBase64List);
      rawContent = await callOpenAI(config, systemPrompt, visionContent);
    } else {
      rawContent = await callOpenAI(config, systemPrompt, userPromptText);
    }
  } else if (config.provider === 'gemini') {
    if (useVision) {
      const visionParts = buildGeminiVisionParts(userPromptText, resolvedImageBase64List);
      rawContent = await callGemini(config, systemPrompt, visionParts);
    } else {
      rawContent = await callGemini(config, systemPrompt, userPromptText);
    }
  } else {
    throw new Error(`不支持的 provider: ${config.provider}`);
  }

  return parseModelResponse(rawContent);
}
