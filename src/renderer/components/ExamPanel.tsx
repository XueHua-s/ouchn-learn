import { useShallow } from 'zustand/react/shallow';
import { useExamStore } from '@/store/exam-store';
import {
  DEFAULT_CLAUDE_BASE_URL,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
} from '@/constants';
import { PanelShell } from './PanelShell';
import { ProviderTabs } from './ProviderTabs';
import { FormField } from './FormField';
import { StatusMessage } from './StatusMessage';

export function ExamPanel() {
  const state = useExamStore(
    useShallow((store) => ({
      aiProgress: store.aiProgress,
      config: store.config,
      isRunning: store.isRunning,
      runExam: store.runExam,
      saveConfig: store.saveConfig,
      setConcurrency: store.setConcurrency,
      setCustomPrompt: store.setCustomPrompt,
      setProvider: store.setProvider,
      status: store.status,
      stats: store.stats,
      updateProviderConfig: store.updateProviderConfig,
    })),
  );

  const activeProviderConfig = state.config.providers[state.config.provider];
  const providerDefaults =
    state.config.provider === 'claude'
      ? { baseUrl: DEFAULT_CLAUDE_BASE_URL, model: DEFAULT_CLAUDE_MODEL }
      : { baseUrl: DEFAULT_OPENAI_BASE_URL, model: DEFAULT_OPENAI_MODEL };

  return (
    <PanelShell id="ai-exam-panel" title="AI 自动答题">
      <ProviderTabs activeProvider={state.config.provider} onChange={state.setProvider} />

      <FormField
        id={`ai-model-name-${state.config.provider}`}
        label="模型名称"
        onChange={(value) => state.updateProviderConfig(state.config.provider, 'modelName', value)}
        placeholder={providerDefaults.model}
        value={activeProviderConfig.modelName}
      />
      <FormField
        id={`ai-api-key-${state.config.provider}`}
        label="API Key"
        onChange={(value) => state.updateProviderConfig(state.config.provider, 'apiKey', value)}
        placeholder={state.config.provider === 'claude' ? 'sk-ant-...' : 'sk-...'}
        type="password"
        value={activeProviderConfig.apiKey}
      />
      <FormField
        id={`ai-base-url-${state.config.provider}`}
        label="Base URL"
        onChange={(value) => state.updateProviderConfig(state.config.provider, 'apiBaseUrl', value)}
        placeholder={providerDefaults.baseUrl}
        value={activeProviderConfig.apiBaseUrl}
      />
      <FormField
        id="ai-custom-prompt"
        label="自定义提示词 (可选)"
        onChange={state.setCustomPrompt}
        placeholder="例如: 这是C语言考试..."
        rows={3}
        textarea
        value={state.config.customPrompt || ''}
      />

      <div className="ouchn-input-row">
        <label className="ouchn-label" htmlFor="ai-concurrency">
          答题并发数
        </label>
        <input
          className="ouchn-input ouchn-input-sm"
          id="ai-concurrency"
          max={20}
          min={1}
          onChange={(event) => state.setConcurrency(Number(event.currentTarget.value))}
          type="number"
          value={state.config.concurrency || 3}
        />
      </div>

      <button
        className="ouchn-btn ouchn-btn-primary"
        disabled={state.isRunning}
        onClick={() => void state.runExam()}
        type="button"
      >
        {state.isRunning ? '处理中...' : '开始 AI 答题'}
      </button>
      <button className="ouchn-btn ouchn-btn-secondary" onClick={state.saveConfig} type="button">
        保存配置
      </button>

      <StatusMessage status={state.status} />
      {state.aiProgress ? (
        <div className="ouchn-status ouchn-status-info">
          AI 进度 {`${state.aiProgress.done}/${state.aiProgress.total}`}
        </div>
      ) : null}
      {state.stats ? (
        <div className="ouchn-status ouchn-status-info">
          填写 {state.stats.filledCount}/{state.stats.extractedCount}，工具成功 {state.stats.toolSucceededCount}
        </div>
      ) : null}
    </PanelShell>
  );
}
