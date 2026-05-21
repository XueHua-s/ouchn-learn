import { create } from 'zustand';
import { DEFAULT_HANG_INTERVAL } from '@/constants';
import type { TaskStatusUpdate } from '@/services/task-contracts';
import { courseAutomationService } from '@/services/course-automation';

interface CourseStore {
  autoHangStatus: TaskStatusUpdate | null;
  autoViewStatus: TaskStatusUpdate | null;
  hangIntervalSeconds: number;
  isAutoHanging: boolean;
  isAutoViewing: boolean;
  isMaterialDownloading: boolean;
  isSavingResources: boolean;
  materialDownloadStatus: TaskStatusUpdate | null;
  materialIntervalSeconds: number;
  saveResourcesStatus: TaskStatusUpdate | null;
  checkAndResumeAutoView: () => Promise<void>;
  setHangIntervalSeconds: (value: number) => void;
  setMaterialIntervalSeconds: (value: number) => void;
  startAutoHang: () => Promise<void>;
  startAutoView: () => Promise<void>;
  startMaterialDownload: () => Promise<void>;
  startSaveAllResources: () => Promise<void>;
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export const useCourseStore = create<CourseStore>((set, get) => ({
  autoHangStatus: null,
  autoViewStatus: null,
  hangIntervalSeconds: DEFAULT_HANG_INTERVAL,
  isAutoHanging: false,
  isAutoViewing: false,
  isMaterialDownloading: false,
  isSavingResources: false,
  materialDownloadStatus: null,
  materialIntervalSeconds: 10,
  saveResourcesStatus: null,

  checkAndResumeAutoView: async () => {
    await courseAutomationService.checkAndResumeAutoView({
      onStatus: (autoViewStatus) => set({ autoViewStatus }),
      onRunningChange: (isAutoViewing) => set({ isAutoViewing }),
    });
  },

  setHangIntervalSeconds: (value) => set({ hangIntervalSeconds: clampNumber(value, 10, 300, DEFAULT_HANG_INTERVAL) }),
  setMaterialIntervalSeconds: (value) => set({ materialIntervalSeconds: clampNumber(value, 5, 60, 10) }),

  startAutoHang: async () => {
    const { hangIntervalSeconds } = get();
    await courseAutomationService.startAutoHangAll(
      {
        getIntervalSeconds: () => get().hangIntervalSeconds || DEFAULT_HANG_INTERVAL,
        intervalSeconds: hangIntervalSeconds,
      },
      {
        onStatus: (autoHangStatus) => set({ autoHangStatus }),
        onRunningChange: (isAutoHanging) => set({ isAutoHanging }),
      },
    );
  },

  startAutoView: async () => {
    await courseAutomationService.startAutoViewPages({
      onStatus: (autoViewStatus) => set({ autoViewStatus }),
      onRunningChange: (isAutoViewing) => set({ isAutoViewing }),
    });
  },

  startMaterialDownload: async () => {
    if (get().isMaterialDownloading) return;
    const { materialIntervalSeconds } = get();
    await courseAutomationService.startMaterialDownload(
      { intervalSeconds: materialIntervalSeconds },
      {
        onStatus: (materialDownloadStatus) => set({ materialDownloadStatus }),
        onRunningChange: (isMaterialDownloading) => set({ isMaterialDownloading }),
      },
    );
  },

  startSaveAllResources: async () => {
    if (get().isSavingResources) return;
    await courseAutomationService.saveAllResources({
      onStatus: (saveResourcesStatus) => set({ saveResourcesStatus }),
      onRunningChange: (isSavingResources) => set({ isSavingResources }),
    });
  },
}));
