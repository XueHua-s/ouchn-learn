/**
 * 自动答题模块
 * 检测答题页面并提供AI辅助答题功能
 */

import { makeDraggable } from '@/utils/helper';

interface ExamConfig {
  provider: 'openai' | 'gemini';
  modelName: string;
  apiKey: string;
  apiBaseUrl: string;
  customPrompt: string;
}

interface Question {
  index: number;
  type: 'single_selection' | 'multiple_selection' | 'true_or_false' | 'fill_in_blank' | 'short_answer';
  description: string;
  options?: Array<{
    label: string;
    content: string;
    value: string;
  }>;
  points: number;
}

interface AIResponse {
  questions: Array<{
    index: number;
    answer: string | string[];
  }>;
}

/**
 * 检查当前页面是否为答题页面
 */
export function isExamPage(): boolean {
  const url = window.location.href;
  // 匹配 https://lms.ouchn.cn/exam/{数字}/subjects#/take 格式
  const isMatch = /lms\.ouchn\.cn\/exam\/\d+\/subjects/.test(url) && url.includes('#/take');

  if (isMatch) {
    console.log('[AI答题] URL匹配成功:', url);
  }

  return isMatch;
}

/**
 * 创建AI答题面板（使用jQuery和已有样式）
 */
function createAIExamPanel(): void {
  // 检查是否已存在面板
  if ($('#ai-exam-panel').length > 0) {
    console.log('[AI答题] 面板已存在');
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
            <input type="text" id="ai-model-name-openai" placeholder="gpt-4o" value="${config.provider === 'openai' ? config.modelName : 'gpt-4o'}"
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

    // 更新tab按钮样式
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

    // 显示对应的配置区域
    panel.find('.ai-config-content').hide();
    panel.find(`.ai-config-content[data-provider="${provider}"]`).show();
  });

  // 设置初始选中的tab
  if (config.provider === 'gemini') {
    panel.find('.ai-tab-btn[data-provider="gemini"]').click();
  }

  // 绑定折叠事件
  panel.find('.download-toggle').on('click', function () {
    const body = panel.find('.download-body');
    body.toggleClass('collapsed');
    $(this).text(body.hasClass('collapsed') ? '+' : '−');
  });

  // 绑定保存配置事件
  $('#save-ai-config').on('click', () => {
    const config = getConfigFromPanel();
    saveConfig(config);
    showStatus('配置已保存', 'success');
  });

  // 绑定开始答题事件
  $('#start-ai-exam').on('click', async () => {
    const config = getConfigFromPanel();
    if (!validateConfig(config)) {
      showStatus('请填写完整的配置信息', 'error');
      return;
    }

    // 禁用按钮，显示加载状态
    const btn = $('#start-ai-exam');
    const originalText = btn.text();
    btn.prop('disabled', true).text('⏳ 处理中...');

    saveConfig(config);

    try {
      await startAutoExam(config);
    } finally {
      // 恢复按钮状态
      btn.prop('disabled', false).text(originalText);
    }
  });

  // 使面板可拖动
  makeDraggable(panel[0]);

  console.log('[AI答题] AI答题面板已创建');
}

/**
 * 从面板获取配置
 */
function getConfigFromPanel(): ExamConfig {
  // 获取当前选中的provider
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

/**
 * 验证配置
 */
function validateConfig(config: ExamConfig): boolean {
  return !!(config.modelName && config.apiKey && config.apiBaseUrl);
}

/**
 * 保存配置到本地存储
 */
function saveConfig(config: ExamConfig): void {
  localStorage.setItem('ai-exam-config', JSON.stringify(config));
}

/**
 * 从本地存储获取配置
 */
function getStoredConfig(): ExamConfig {
  const stored = localStorage.getItem('ai-exam-config');
  if (stored) {
    const config = JSON.parse(stored);
    // 兼容旧版本配置（没有provider字段）
    if (!config.provider) {
      config.provider = 'openai';
    }
    return config;
  }
  return {
    provider: 'openai',
    modelName: 'gpt-4o',
    apiKey: '',
    apiBaseUrl: 'https://api.openai.com/v1',
    customPrompt: '',
  };
}

/**
 * 显示状态消息
 */
function showStatus(message: string, type: 'success' | 'error' | 'info'): void {
  const statusEl = $('#ai-exam-status');
  if (statusEl.length) {
    statusEl.text(message);
    statusEl.removeClass('download-status-success download-status-error download-status-info');

    if (type === 'success') {
      statusEl.addClass('download-status-success');
    } else if (type === 'error') {
      statusEl.addClass('download-status-warning'); // 使用warning样式表示错误
    } else {
      statusEl.addClass('download-status-info');
    }

    statusEl.show();
  }
}

/**
 * 提取页面中的所有题目
 */
function extractQuestions(): Question[] {
  const questions: Question[] = [];
  const subjectElements = document.querySelectorAll('.subject');

  subjectElements.forEach((element) => {
    const classList = element.classList;
    let type: Question['type'] = 'single_selection';

    if (classList.contains('single_selection')) {
      type = 'single_selection';
    } else if (classList.contains('multiple_selection')) {
      type = 'multiple_selection';
    } else if (classList.contains('true_or_false')) {
      type = 'true_or_false';
    } else if (classList.contains('fill_in_blank')) {
      type = 'fill_in_blank';
    } else if (classList.contains('short_answer')) {
      type = 'short_answer';
    } else {
      return; // 跳过非题目元素（如标题）
    }

    // 获取题目序号
    const indexEl = element.querySelector('.subject-resort-index .ng-binding');
    const index = indexEl ? parseInt(indexEl.textContent || '0') : 0;

    // 获取题目描述
    const descEl = element.querySelector('.subject-description');
    const description = descEl?.textContent?.trim() || '';

    // 获取分数
    const pointsEl = element.querySelector('.summary-sub-title .ng-binding');
    const points = pointsEl ? parseInt(pointsEl.textContent || '0') : 0;

    const question: Question = {
      index,
      type,
      description,
      points,
    };

    // 如果是选择题或判断题，提取选项
    if (type === 'single_selection' || type === 'multiple_selection' || type === 'true_or_false') {
      const options: Question['options'] = [];
      const optionElements = element.querySelectorAll('.option');

      optionElements.forEach((optEl) => {
        const label = optEl.querySelector('.option-index')?.textContent?.trim() || '';
        const content = optEl.querySelector('.option-content')?.textContent?.trim() || '';
        const input = optEl.querySelector('input') as HTMLInputElement;
        const value = input?.getAttribute('ng-value') || '';

        options.push({ label, content, value });
      });

      question.options = options;
    }

    questions.push(question);
  });

  return questions;
}

/**
 * 调用AI API获取答案
 */
async function getAnswersFromAI(config: ExamConfig, htmlContent: string): Promise<AIResponse> {
  let prompt = `你是一个专业的考试答题助手。请仔细分析以下HTML内容中的题目，并给出正确答案。

HTML中包含着试卷的题目。你需要解析这些题目并回答。

- **题目序号**: 在 \`.subject-resort-index\` 中可以找到。
- **题目类型**: 在 \`.summary-sub-title\` 中可以找到 (单选题, 多选题, 判断题, 填空题, 简答题).
- **单选题/判断题**: 返回单个选项字母 (A, B, C...).
- **多选题**: 返回所有正确选项的字母，用逗号分隔 (e.g., A,C,D).
- **填空题/简答题**: 直接返回答案文本.
`;

  // 如果有自定义提示词，添加到prompt中
  if (config.customPrompt && config.customPrompt.trim()) {
    prompt += `\n补充说明：\n${config.customPrompt.trim()}\n`;
  }

  prompt += `
HTML内容如下:
\`\`\`html
${htmlContent}
\`\`\`

请以JSON格式返回答案，格式如下：
{
  "questions": [
    {
      "index": 1,
      "answer": "B"
    },
    {
      "index": 2,
      "answer": "A,C"
    }
  ]
}

只返回JSON，不要包含任何其他内容。`;

  try {
    // 检查是否为推理模型，这些模型不支持temperature参数
    // 包括: o1系列, gpt-5系列等
    const isReasoningModel = /^(o1|o1-mini|o1-preview|gpt-5)/i.test(config.modelName);

    // 构建请求体
    const requestBody: any = {
      model: config.modelName,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    // 只在非推理模型时添加temperature参数
    if (!isReasoningModel) {
      requestBody.temperature = 0.3;
    }

    console.log('[AI答题] 发送API请求，模型:', config.modelName, '是否为推理模型:', isReasoningModel);

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
      console.error('[AI答题] API请求失败:', errorText);
      throw new Error(`API请求失败: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';

    // 提取JSON内容（可能被\`\`\`json包裹）
    let jsonContent = content;
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1];
    }

    try {
      return JSON.parse(jsonContent);
    } catch (e) {
      console.error('解析AI返回的JSON失败', e);
      console.error('原始返回内容:', content);
      throw new Error('AI返回的JSON格式不正确');
    }
  } catch (error) {
    console.error('AI答题错误:', error);
    throw error;
  }
}

/**
 * 填写答案到页面
 */
function fillAnswers(questions: Question[], aiResponse: AIResponse): void {
  const answerMap = new Map<number, string | string[]>();
  aiResponse.questions.forEach((a) => {
    answerMap.set(a.index, a.answer);
  });

  questions.forEach((question) => {
    const answer = answerMap.get(question.index);
    if (!answer) return;

    const subjectElements = document.querySelectorAll('.subject');
    const subjectEl = Array.from(subjectElements).find((el) => {
      const indexEl = el.querySelector('.subject-resort-index .ng-binding');
      return indexEl && parseInt(indexEl.textContent || '0') === question.index;
    });

    if (!subjectEl) return;

    if (question.type === 'single_selection' || question.type === 'true_or_false') {
      // 单选题或判断题
      const answerLabel = typeof answer === 'string' ? answer.trim() : '';
      const option = question.options?.find((opt) => opt.label === answerLabel);

      if (option) {
        const input = subjectEl.querySelector(`input[ng-value="${option.value}"]`) as HTMLInputElement;
        if (input) {
          input.click();
          console.log(`题目 ${question.index}: 已选择 ${answerLabel}`);
        }
      }
    } else if (question.type === 'multiple_selection') {
      // 多选题
      const answerLabels = Array.isArray(answer)
        ? answer.map((a) => String(a).trim())
        : typeof answer === 'string'
          ? answer.split(',').map((a) => a.trim())
          : [];

      if (answerLabels.length > 0) {
        answerLabels.forEach((label) => {
          const optionElements = Array.from(subjectEl.querySelectorAll('.option'));
          const targetOptionEl = optionElements.find((optEl) => {
            const optionIndexEl = optEl.querySelector('.option-index');
            return optionIndexEl && optionIndexEl.textContent?.trim().toUpperCase() === label.toUpperCase();
          });

          if (targetOptionEl) {
            const input = targetOptionEl.querySelector('input[type="checkbox"]') as HTMLInputElement;
            if (input && !input.checked) {
              input.click();
              console.log(`题目 ${question.index}: 已选择 ${label}`);
            }
          }
        });
      }
    } else if (question.type === 'fill_in_blank') {
      // 填空题
      const answerInputs = subjectEl.querySelectorAll('.___answer[contenteditable="true"]');
      const answerText = typeof answer === 'string' ? answer : '';

      answerInputs.forEach((input, idx) => {
        if (idx === 0) {
          const inputEl = input as HTMLElement;

          // 方法1: 设置textContent
          inputEl.textContent = answerText;

          // 方法2: 设置innerText（某些情况下更有效）
          inputEl.innerText = answerText;

          // 方法3: 使用innerHTML
          inputEl.innerHTML = answerText;

          // 触发多个事件以确保Angular检测到变化
          const events = ['input', 'change', 'blur', 'keyup', 'keydown'];
          events.forEach((eventType) => {
            const event = new Event(eventType, { bubbles: true, cancelable: true });
            inputEl.dispatchEvent(event);
          });

          // 尝试触发Angular的ng-model更新
          try {
            // 获取Angular的scope并手动触发digest
            const angularEl = (window as any).angular?.element(inputEl);
            if (angularEl && angularEl.scope) {
              const scope = angularEl.scope();
              if (scope && scope.$apply) {
                scope.$apply();
              }
            }
          } catch (e) {
            console.log('无法触发Angular digest:', e);
          }

          // 模拟用户输入一个空格然后删除（触发变更检测）
          setTimeout(() => {
            inputEl.focus();
            document.execCommand('insertText', false, ' ');
            setTimeout(() => {
              const selection = window.getSelection();
              if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.setStart(inputEl, 0);
                range.setEnd(inputEl, inputEl.childNodes.length);
                selection.removeAllRanges();
                selection.addRange(range);
              }
              document.execCommand('delete', false);
              document.execCommand('insertText', false, answerText);
            }, 50);
          }, 100);

          console.log(`题目 ${question.index}: 已填入答案 ${answerText}`);
        }
      });
    } else if (question.type === 'short_answer') {
      // 简答题（实现方式类似填空题）
      const answerInput = subjectEl.querySelector('[contenteditable="true"]') as HTMLElement;
      if (answerInput) {
        const answerText = typeof answer === 'string' ? answer : '';

        // 设置内容
        answerInput.textContent = answerText;
        answerInput.innerText = answerText;
        answerInput.innerHTML = answerText;

        // 触发多个事件
        const events = ['input', 'change', 'blur', 'keyup', 'keydown'];
        events.forEach((eventType) => {
          const event = new Event(eventType, { bubbles: true, cancelable: true });
          answerInput.dispatchEvent(event);
        });

        // 尝试触发Angular更新
        try {
          const angularEl = (window as any).angular?.element(answerInput);
          if (angularEl && angularEl.scope) {
            const scope = angularEl.scope();
            if (scope && scope.$apply) {
              scope.$apply();
            }
          }
        } catch (e) {
          console.log('无法触发Angular digest:', e);
        }

        // 模拟用户输入
        setTimeout(() => {
          answerInput.focus();
          document.execCommand('insertText', false, ' ');
          setTimeout(() => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              range.setStart(answerInput, 0);
              range.setEnd(answerInput, answerInput.childNodes.length);
              selection.removeAllRanges();
              selection.addRange(range);
            }
            document.execCommand('delete', false);
            document.execCommand('insertText', false, answerText);
          }, 50);
        }, 100);

        console.log(`题目 ${question.index}: 已填入答案`);
      }
    }
  });
}

/**
 * 开始自动答题
 */
async function startAutoExam(config: ExamConfig): Promise<void> {
  try {
    showStatus('正在提取题目...', 'info');

    // 提取题目用于后续填入答案
    const questions = extractQuestions();
    console.log('提取到的题目:', questions);

    if (questions.length === 0) {
      showStatus('未找到题目，请确保页面已完全加载', 'error');
      return;
    }

    // 获取题目区域的HTML内容
    const paperContent = document.querySelector('.paper-content.card');
    if (!paperContent) {
      showStatus('未找到题目区域 (.paper-content.card)，无法继续', 'error');
      return;
    }
    const htmlContent = paperContent.outerHTML;

    showStatus(`已提取 ${questions.length} 道题目，正在调用AI分析...`, 'info');

    // 调用AI获取答案
    const aiResponse = await getAnswersFromAI(config, htmlContent);
    console.log('AI返回的答案:', aiResponse);

    showStatus('正在填写答案...', 'info');

    // 填写答案
    fillAnswers(questions, aiResponse);

    showStatus(`成功完成！已处理 ${aiResponse.questions.length} 道题目`, 'success');
  } catch (error) {
    console.error('自动答题失败:', error);
    showStatus(`答题失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
  }
}

/**
 * 尝试初始化面板
 */
function tryInitPanel(): void {
  console.log('[AI答题] tryInitPanel 被调用，当前URL:', window.location.href);

  if (!isExamPage()) {
    console.log('[AI答题] 当前页面不是答题页面');
    return;
  }

  // 检查面板是否已存在
  if ($('#ai-exam-panel').length > 0) {
    console.log('[AI答题] 面板已存在，跳过创建');
    return;
  }

  console.log('[AI答题] 准备创建AI答题面板');

  if (document.body) {
    createAIExamPanel();
    console.log('[AI答题] ✅ AI答题助手已就绪');
  } else {
    console.log('[AI答题] document.body未就绪，0.5秒后重试');
    setTimeout(tryInitPanel, 500);
  }
}

/**
 * 初始化自动答题功能
 */
export function initAutoExam(): void {
  console.log('[AI答题] ==================== 初始化开始 ====================');
  console.log('[AI答题] 脚本版本: 1.0.0');
  console.log('[AI答题] 当前URL:', window.location.href);
  console.log('[AI答题] 当前时间:', new Date().toLocaleString());

  // 立即尝试一次
  setTimeout(tryInitPanel, 1000);

  // 监听hash变化（单页应用路由）
  window.addEventListener('hashchange', () => {
    console.log('[AI答题] 检测到URL hash变化:', window.location.href);
    setTimeout(tryInitPanel, 500);
  });

  // 监听popstate事件（浏览器前进后退）
  window.addEventListener('popstate', () => {
    console.log('[AI答题] 检测到浏览器导航:', window.location.href);
    setTimeout(tryInitPanel, 500);
  });

  // 定期检查（每3秒检查一次，最多检查10次）
  let checkCount = 0;
  const intervalId = setInterval(() => {
    checkCount++;
    console.log(`[AI答题] 定期检查 (${checkCount}/10):`, window.location.href);

    if (isExamPage() && $('#ai-exam-panel').length === 0) {
      tryInitPanel();
    }

    if (checkCount >= 10) {
      console.log('[AI答题] 定期检查结束');
      clearInterval(intervalId);
    }
  }, 3000);

  console.log('[AI答题] ==================== 初始化配置完成 ====================');
}
