import type { ExamConfig, ExamStats } from '@/types/exam';

export type TaskStatusType = 'info' | 'success' | 'warning' | 'error';

export interface TaskProgress {
  done: number;
  total: number;
}

export interface TaskStatusUpdate {
  type: TaskStatusType;
  message: string;
  progress?: TaskProgress;
}

export interface TaskCallbacks {
  onStatus(update: TaskStatusUpdate): void;
  onRunningChange?(running: boolean): void;
  signal?: AbortSignal;
}

export interface CourseAutomationService {
  startAutoViewPages(callbacks: TaskCallbacks): Promise<void>;
  startMaterialDownload(input: { intervalSeconds: number }, callbacks: TaskCallbacks): Promise<void>;
  startAutoHangAll(
    input: { getIntervalSeconds?: () => number; intervalSeconds: number },
    callbacks: TaskCallbacks,
  ): Promise<void>;
  saveAllResources(callbacks: TaskCallbacks): Promise<void>;
  checkAndResumeAutoView(callbacks: TaskCallbacks): Promise<void>;
}

export interface ExamRunnerCallbacks extends TaskCallbacks {
  onStats?(stats: ExamStats): void;
}

export interface ExamRunnerService {
  runAutoExam(config: ExamConfig, callbacks: ExamRunnerCallbacks): Promise<void>;
  validateExamConfig(config: ExamConfig): boolean;
}

export function toStatusType(type: string): TaskStatusType {
  if (type === 'success' || type === 'warning' || type === 'error') return type;
  return 'info';
}
