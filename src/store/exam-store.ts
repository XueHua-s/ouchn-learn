import { create } from 'zustand';
import type { ExamConfig, ExamStats } from '@/types/exam';
import { getExamConfig, saveExamConfig } from '@/utils/storage';
import type { TaskStatusUpdate } from '@/services/task-contracts';
import { examRunnerService } from '@/services/exam-runner';

type Provider = ExamConfig['provider'];
type ProviderConfig = ExamConfig['providers'][Provider];
type ProviderField = keyof ProviderConfig;

interface ExamStore {
  aiProgress: { done: number; total: number } | null;
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
  if (!Number.isFinite(value)) return 3;
  return Math.min(20, Math.max(1, Math.round(value)));
}

function mirrorActiveProvider(config: ExamConfig, provider = config.provider): ExamConfig {
  const activeProviderConfig = config.providers[provider];
  return {
    ...config,
    provider,
    modelName: activeProviderConfig.modelName,
    apiKey: activeProviderConfig.apiKey,
    apiBaseUrl: activeProviderConfig.apiBaseUrl,
  };
}

export const useExamStore = create<ExamStore>((set, get) => ({
  aiProgress: null,
  config: getExamConfig(),
  isRunning: false,
  stats: null,
  status: null,

  runExam: async () => {
    const config = mirrorActiveProvider(get().config);
    if (!examRunnerService.validateExamConfig(config)) {
      set({ status: { message: '请填写完整的配置信息', type: 'error' } });
      return;
    }

    saveExamConfig(config);
    set({ aiProgress: null, config, stats: null });

    await examRunnerService.runAutoExam(config, {
      onStatus: (status) => set({ status }),
      onRunningChange: (isRunning) => set({ isRunning }),
      onAiProgress: (done, total) => set({ aiProgress: { done, total } }),
      onStats: (stats) => set({ stats }),
    });
  },

  saveConfig: () => {
    const config = mirrorActiveProvider(get().config);
    saveExamConfig(config);
    set({ config, status: { message: '配置已保存', type: 'success' } });
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
