import { create } from 'zustand';
import type { ExamConfig, ExamStats } from '@/types/exam';
import { getExamConfig, saveExamConfig } from '@/utils/storage';
import type { TaskStatusUpdate } from '@/services/task-contracts';
import { examRunnerService } from '@/services/exam-runner';
import {
  DEFAULT_CLAUDE_BASE_URL,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
} from '@/constants';

type Provider = ExamConfig['provider'];
type ProviderConfig = ExamConfig['providers'][Provider];
type ProviderField = keyof ProviderConfig;

interface ExamStore {
  config: ExamConfig;
  isRunning: boolean;
  stats: ExamStats | null;
  status: TaskStatusUpdate | null;
  runExam: () => Promise<void>;
  saveConfig: () => void;
  setConcurrency: (value: number) => void;
  setCustomPrompt: (value: string) => void;
  setProvider: (provider: Provider) => void;
  updateProviderConfig: (provider: Provider, field: ProviderField, value: string) => void;
}

function clampConcurrency(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 3;
  return Math.min(20, Math.max(1, Math.round(value)));
}

function getProviderDefaults(provider: Provider): ProviderConfig {
  if (provider === 'claude') {
    return { apiBaseUrl: DEFAULT_CLAUDE_BASE_URL, apiKey: '', modelName: DEFAULT_CLAUDE_MODEL };
  }

  return { apiBaseUrl: DEFAULT_OPENAI_BASE_URL, apiKey: '', modelName: DEFAULT_OPENAI_MODEL };
}

function normalizeProviderConfig(provider: Provider, config: ProviderConfig): ProviderConfig {
  const defaults = getProviderDefaults(provider);
  return {
    apiBaseUrl: config.apiBaseUrl.trim() || defaults.apiBaseUrl,
    apiKey: config.apiKey.trim(),
    modelName: config.modelName.trim() || defaults.modelName,
  };
}

function mirrorActiveProvider(config: ExamConfig, provider = config.provider): ExamConfig {
  const providers = {
    openai: normalizeProviderConfig('openai', config.providers.openai),
    claude: normalizeProviderConfig('claude', config.providers.claude),
  };
  const activeProviderConfig = providers[provider];
  return {
    ...config,
    provider,
    providers,
    modelName: activeProviderConfig.modelName,
    apiKey: activeProviderConfig.apiKey,
    apiBaseUrl: activeProviderConfig.apiBaseUrl,
    concurrency: clampConcurrency(config.concurrency),
  };
}

export const useExamStore = create<ExamStore>((set, get) => ({
  config: getExamConfig(),
  isRunning: false,
  stats: null,
  status: null,

  runExam: async () => {
    if (get().isRunning) return;

    const config = mirrorActiveProvider(get().config);
    if (!examRunnerService.validateExamConfig(config)) {
      set({ status: { message: '请填写完整的配置信息', type: 'error' } });
      return;
    }

    const saved = saveExamConfig(config);
    set({
      config,
      stats: null,
      status: saved ? null : { message: '配置保存失败，将仅用于本次答题', type: 'warning' },
    });

    await examRunnerService.runAutoExam(config, {
      onStatus: (status) => set({ status }),
      onRunningChange: (isRunning) => set({ isRunning }),
      onStats: (stats) => set({ stats }),
    });
  },

  saveConfig: () => {
    const config = mirrorActiveProvider(get().config);
    const saved = saveExamConfig(config);
    set({
      config,
      status: saved ? { message: '配置已保存', type: 'success' } : { message: '配置保存失败', type: 'error' },
    });
  },

  setConcurrency: (value) => {
    set((state) => ({ config: { ...state.config, concurrency: clampConcurrency(value) } }));
  },

  setCustomPrompt: (customPrompt) => {
    set((state) => ({ config: { ...state.config, customPrompt } }));
  },

  setProvider: (provider) => {
    set((state) => ({ config: mirrorActiveProvider(state.config, provider) }));
  },

  updateProviderConfig: (provider, field, value) => {
    set((state) => {
      const providers = {
        ...state.config.providers,
        [provider]: {
          ...state.config.providers[provider],
          [field]: value,
        },
      };

      return {
        config: mirrorActiveProvider(
          {
            ...state.config,
            providers,
          },
          state.config.provider,
        ),
      };
    });
  },
}));
