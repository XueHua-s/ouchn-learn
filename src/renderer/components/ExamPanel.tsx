import { Bot, Gauge, KeyRound, PlayCircle, Save, ServerCog } from 'lucide-react';
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
import { Button, FieldRow, Input, PanelSection, Pill } from './ui';

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
      <PanelSection
        action={
          <Pill className={state.isRunning ? 'border-amber-200 bg-amber-50 text-amber-900' : undefined}>
            {state.isRunning ? '处理中' : '就绪'}
          </Pill>
        }
        description="选择模型服务并保存独立配置"
        icon={<Bot className="h-4 w-4" />}
        title="模型配置"
      >
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
      </PanelSection>

      <PanelSection description="控制并发与补充题目上下文" icon={<ServerCog className="h-4 w-4" />} title="执行参数">
        <FieldRow label="答题并发数">
          <Input
            className="w-20 text-center"
            id="ai-concurrency"
            max={20}
            min={1}
            onChange={(event) => state.setConcurrency(Number(event.currentTarget.value))}
            type="number"
            value={state.config.concurrency || 3}
          />
        </FieldRow>
        <FormField
          id="ai-custom-prompt"
          label="自定义提示词 (可选)"
          onChange={state.setCustomPrompt}
          placeholder="例如: 这是 C 语言考试..."
          rows={3}
          textarea
          value={state.config.customPrompt || ''}
        />
      </PanelSection>

      <div className="grid grid-cols-2 gap-2">
        <Button disabled={state.isRunning} onClick={() => void state.runExam()}>
          <PlayCircle className="h-4 w-4" />
          {state.isRunning ? '处理中...' : '开始答题'}
        </Button>
        <Button onClick={state.saveConfig} variant="secondary">
          <Save className="h-4 w-4" />
          保存配置
        </Button>
      </div>

      <StatusMessage status={state.status} />
      {state.aiProgress ? (
        <div className="flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800">
          <Gauge className="h-4 w-4" />
          AI 进度 {state.aiProgress.done}/{state.aiProgress.total}
        </div>
      ) : null}
      {state.stats ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
          <KeyRound className="h-4 w-4" />
          填写 {state.stats.filledCount}/{state.stats.extractedCount}，工具成功 {state.stats.toolSucceededCount}
        </div>
      ) : null}
    </PanelShell>
  );
}
