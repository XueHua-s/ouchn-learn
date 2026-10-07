import { DEFAULT_HANG_INTERVAL } from '@/constants';
import { ensureAllSectionsExpanded } from '@/utils/dom';
import type { TaskCallbacks, TaskStatusType } from '@/services/task-contracts';
import { completeHangActivity, prepareHangActivities, scanHangActivities, type HangActivity } from './hang-buttons';

interface HangRun {
  callbacks: TaskCallbacks;
  input: { getIntervalSeconds?: () => number; intervalSeconds: number };
  queue: HangActivity[];
  index: number;
  timer: number | null;
  onAbort: () => void;
}

let activeRun: HangRun | null = null;

function report(run: HangRun, message: string, type: TaskStatusType = 'info'): void {
  run.callbacks.onStatus({ message, type });
  console.log(`[一键挂机] ${message}`);
}

function finish(run: HangRun): void {
  if (activeRun !== run) return;
  activeRun = null;
  if (run.timer !== null) window.clearTimeout(run.timer);
  run.callbacks.signal?.removeEventListener('abort', run.onAbort);
  run.callbacks.onRunningChange?.(false);
}

/** 停止后不再推进队列。已经发出的平台请求仍可返回，其完成结果由活动模块保存。 */
export function stopAutoHanging(): void {
  if (activeRun) finish(activeRun);
}

function finishQueue(run: HangRun): void {
  const { tasks, unavailableCount } = scanHangActivities();
  const remaining = tasks.length + unavailableCount;
  report(
    run,
    remaining
      ? `本轮队列已完成；仍有 ${remaining} 个视频未完成，其中 ${unavailableCount} 个时长未就绪或尚未解锁，请稍后重新扫描`
      : '✅ 所有视频已挂机完成！',
    remaining ? 'warning' : 'success',
  );
  finish(run);
}

async function processNext(run: HangRun): Promise<void> {
  if (activeRun !== run) return;
  try {
    if (run.index >= run.queue.length) {
      finishQueue(run);
      return;
    }
    const activity = run.queue[run.index];
    report(run, `正在挂机 (${run.index + 1}/${run.queue.length}): ${activity.title}`);
    await completeHangActivity(activity.activityId);
    // FIXED: 停止/重启后旧请求只能更新活动结果，不能操作新运行的队列、回调或定时器。
    if (activeRun !== run) return;
    run.index++;
    if (run.index >= run.queue.length) {
      // FIXED: 完成前置视频可能解锁目录中缺时长的活动；队尾重新准备并纳入新任务，不能直接宣告结束。
      await prepareHangActivities({ retryUnavailable: true });
      if (activeRun !== run) return;
      const queued = new Set(run.queue.map((item) => item.activityId));
      run.queue.push(...scanHangActivities().tasks.filter((item) => !queued.has(item.activityId)));
      if (run.index >= run.queue.length) {
        finishQueue(run);
        return;
      }
    }
    const configured = run.input.getIntervalSeconds?.() ?? run.input.intervalSeconds;
    const interval = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 300) : DEFAULT_HANG_INTERVAL;
    report(run, `挂机成功，等待 ${interval} 秒后继续...`, 'success');
    run.timer = window.setTimeout(() => {
      run.timer = null;
      void processNext(run);
    }, interval * 1000);
  } catch (error) {
    if (activeRun !== run) return;
    console.error('[一键挂机] 任务失败', error);
    report(run, `挂机失败：${run.queue[run.index]?.title || '课程目录'}，请重新扫描后重试`, 'error');
    finish(run);
  }
}

/** 启动当前目录的有限队列；运行中再次调用即停止。参数与回调归属本次运行，不覆盖在途运行。 */
export async function startAutoHangAllWithCallbacks(
  input: { getIntervalSeconds?: () => number; intervalSeconds: number },
  callbacks: TaskCallbacks,
): Promise<void> {
  if (activeRun) {
    const previous = activeRun;
    report(previous, '已手动停止', 'warning');
    finish(previous);
    return;
  }
  if (callbacks.signal?.aborted) return;
  const run: HangRun = {
    callbacks,
    input,
    queue: [],
    index: 0,
    timer: null,
    onAbort: () => {
      if (activeRun !== run) return;
      report(run, '已停止', 'warning');
      finish(run);
    },
  };
  activeRun = run;
  callbacks.signal?.addEventListener('abort', run.onAbort, { once: true });
  callbacks.onRunningChange?.(true);
  report(run, '检查课程章节状态...');
  try {
    await ensureAllSectionsExpanded();
    if (activeRun !== run) return;
    report(run, '正在读取缺失的视频时长...');
    await prepareHangActivities();
    if (activeRun !== run) return;
    report(run, '正在扫描未完成的视频...');
    const { tasks, unavailableCount } = scanHangActivities();
    run.queue = tasks;
    if (!tasks.length) {
      report(
        run,
        unavailableCount ? `${unavailableCount} 个视频时长未就绪或尚未解锁，暂时无法挂机` : '没有找到需要挂机的视频！',
        'warning',
      );
      finish(run);
      return;
    }
    report(
      run,
      `找到 ${tasks.length} 个视频需要挂机${unavailableCount ? `，另有 ${unavailableCount} 个时长未就绪或尚未解锁` : ''}，开始自动挂机...`,
      'success',
    );
    void processNext(run);
  } catch (error) {
    if (activeRun !== run) return;
    console.error('[一键挂机] 目录准备失败', error);
    report(run, '课程目录准备失败，请重试', 'error');
    finish(run);
  }
}
