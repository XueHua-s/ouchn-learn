/**
 * AI 答题面板：UI 创建、配置管理、主流程编排
 */

import type { ExamConfig, ExamStats } from '@/types/exam';
import { log, warn, error } from '@/types/exam';
import { makeDraggable } from '@/utils/helper';
import { saveExamConfig, getExamConfig } from '@/utils/storage';
import { waitForQuestionsStable, extractQuestions } from './question-extract';
import { callProvider } from './ai-provider';
import { fillAnswers } from './answer-fill';

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

    // 逐题并发调用 AI
    const aiResponse = await callProvider(config, questions, stats, (done, total) => {
      showStatus(`AI 答题中... ${done}/${total}`, 'info');
    });
    stats.aiReturnedCount = aiResponse.questions?.length || 0;

    log('AI 返回的答案:', aiResponse);

    if (!aiResponse.questions || aiResponse.questions.length === 0) {
      showStatus('AI 返回了空答案', 'error');
      return;
    }

    showStatus(`AI 返回 ${aiResponse.questions.length} 道答案，正在填写...`, 'info');

    // 填写答案
    await fillAnswers(questions, aiResponse, stats);

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

function getConfigFromPanel(): ExamConfig {
  const activeTab = $('.ai-tab-btn.active');
  const provider = (activeTab.data('provider') as 'openai' | 'gemini') || 'openai';

  return {
    provider: provider,
    modelName: ($(`#ai-model-name-${provider}`) as any).val() || '',
    apiKey: ($(`#ai-api-key-${provider}`) as any).val() || '',
    apiBaseUrl: ($(`#ai-base-url-${provider}`) as any).val() || '',
    customPrompt: ($('#ai-custom-prompt') as any).val() || '',
    concurrency: parseInt(($('#ai-concurrency') as any).val(), 10) || 3,
  };
}

function validateConfig(config: ExamConfig): boolean {
  return !!(config.modelName && config.apiKey && config.apiBaseUrl);
}

function showStatus(message: string, type: 'success' | 'error' | 'info'): void {
  const statusEl = $('#ai-exam-status');
  if (statusEl.length) {
    statusEl.text(message);
    statusEl.removeClass('ouchn-status-success ouchn-status-warning ouchn-status-info');

    if (type === 'success') {
      statusEl.addClass('ouchn-status-success');
    } else if (type === 'error') {
      statusEl.addClass('ouchn-status-warning');
    } else {
      statusEl.addClass('ouchn-status-info');
    }

    statusEl.show();
  }
}

function createAIExamPanel(): void {
  if ($('#ai-exam-panel').length > 0) {
    log('面板已存在');
    return;
  }

  const config = getExamConfig();
  const panel = $(`
    <div class="ouchn-panel download-panel" id="ai-exam-panel">
      <div class="ouchn-panel-header download-header">
        <h3 class="ouchn-panel-title">AI 自动答题</h3>
        <button class="ouchn-panel-toggle">−</button>
      </div>
      <div class="ouchn-panel-body">
        <div class="ouchn-tabs">
          <button class="ouchn-tab ai-tab-btn active" data-provider="openai">OpenAI</button>
          <button class="ouchn-tab ai-tab-btn" data-provider="gemini">Gemini</button>
        </div>

        <div class="ai-config-content" data-provider="openai">
          <div class="ouchn-field">
            <label class="ouchn-label">模型名称</label>
            <input type="text" class="ouchn-input" id="ai-model-name-openai" placeholder="gpt-4.1"
                   value="${config.provider === 'openai' ? config.modelName : 'gpt-4.1'}">
          </div>
          <div class="ouchn-field">
            <label class="ouchn-label">API Key</label>
            <input type="password" class="ouchn-input" id="ai-api-key-openai" placeholder="sk-..."
                   value="${config.provider === 'openai' ? config.apiKey : ''}">
          </div>
          <div class="ouchn-field">
            <label class="ouchn-label">Base URL</label>
            <input type="text" class="ouchn-input" id="ai-base-url-openai" placeholder="https://api.openai.com/v1"
                   value="${config.provider === 'openai' ? config.apiBaseUrl : 'https://api.openai.com/v1'}">
          </div>
        </div>

        <div class="ai-config-content" data-provider="gemini" style="display:none;">
          <div class="ouchn-field">
            <label class="ouchn-label">模型名称</label>
            <input type="text" class="ouchn-input" id="ai-model-name-gemini" placeholder="gemini-pro"
                   value="${config.provider === 'gemini' ? config.modelName : 'gemini-pro'}">
          </div>
          <div class="ouchn-field">
            <label class="ouchn-label">API Key</label>
            <input type="password" class="ouchn-input" id="ai-api-key-gemini" placeholder="AIza..."
                   value="${config.provider === 'gemini' ? config.apiKey : ''}">
          </div>
          <div class="ouchn-field">
            <label class="ouchn-label">Base URL</label>
            <input type="text" class="ouchn-input" id="ai-base-url-gemini" placeholder="https://generativelanguage.googleapis.com/v1beta"
                   value="${config.provider === 'gemini' ? config.apiBaseUrl : 'https://generativelanguage.googleapis.com/v1beta'}">
          </div>
        </div>

        <div class="ouchn-field">
          <label class="ouchn-label">自定义提示词 (可选)</label>
          <textarea class="ouchn-textarea" id="ai-custom-prompt" rows="3"
                    placeholder="例如: 这是C语言考试...">${config.customPrompt}</textarea>
        </div>

        <div class="ouchn-input-row">
          <label class="ouchn-label">答题并发数</label>
          <input type="number" class="ouchn-input ouchn-input-sm" id="ai-concurrency"
                 value="${config.concurrency || 3}" min="1" max="20">
        </div>

        <button class="ouchn-btn ouchn-btn-primary" id="start-ai-exam">开始 AI 答题</button>
        <button class="ouchn-btn ouchn-btn-secondary" id="save-ai-config">保存配置</button>

        <div class="ouchn-status ouchn-status-info" id="ai-exam-status" style="display:none;">
          准备开始...
        </div>
      </div>
    </div>
  `);

  $('body').append(panel);

  // 绑定 Tab 切换事件
  panel.find('.ai-tab-btn').on('click', function () {
    const provider = $(this).data('provider');
    panel.find('.ai-tab-btn').removeClass('active');
    $(this).addClass('active');
    panel.find('.ai-config-content').hide();
    panel.find(`.ai-config-content[data-provider="${provider}"]`).show();
  });

  if (config.provider === 'gemini') {
    panel.find('.ai-tab-btn[data-provider="gemini"]').trigger('click');
  }

  panel.find('.ouchn-panel-toggle').on('click', function () {
    const body = panel.find('.ouchn-panel-body');
    body.toggleClass('collapsed');
    $(this).text(body.hasClass('collapsed') ? '+' : '−');
  });

  $('#save-ai-config').on('click', () => {
    const config = getConfigFromPanel();
    saveExamConfig(config);
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

    saveExamConfig(config);

    try {
      await startAutoExam(config);
    } finally {
      btn.prop('disabled', false).text(originalText);
    }
  });

  makeDraggable(panel[0]);

  log('AI答题面板已创建');
}

export function isExamPage(): boolean {
  const url = window.location.href;
  const isMatch = /lms\.ouchn\.cn\/exam\/\d+\/subjects/.test(url) && url.includes('#/take');
  if (isMatch) {
    log('URL匹配成功:', url);
  }
  return isMatch;
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
