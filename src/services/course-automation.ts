import type { CourseAutomationService, TaskCallbacks } from './task-contracts';
import { startAutoViewPagesWithCallbacks, checkAndResumeAutoViewWithCallbacks } from '@/modules/auto-view';
import { startAutoHangAllWithCallbacks } from '@/modules/auto-hang';
import { startAutoMaterialDownloadWithCallbacks } from '@/modules/auto-material-download';
import { startSaveAllResourcesWithCallbacks } from '@/modules/save-resources';

export const courseAutomationService: CourseAutomationService = {
  startAutoViewPages(callbacks: TaskCallbacks) {
    return startAutoViewPagesWithCallbacks(callbacks);
  },

  startMaterialDownload(input: { intervalSeconds: number }, callbacks: TaskCallbacks) {
    return startAutoMaterialDownloadWithCallbacks(input, callbacks);
  },

  startAutoHangAll(input: { getIntervalSeconds?: () => number; intervalSeconds: number }, callbacks: TaskCallbacks) {
    return startAutoHangAllWithCallbacks(input, callbacks);
  },

  saveAllResources(callbacks: TaskCallbacks) {
    return startSaveAllResourcesWithCallbacks(callbacks);
  },

  checkAndResumeAutoView(callbacks: TaskCallbacks) {
    return checkAndResumeAutoViewWithCallbacks(callbacks);
  },
};
