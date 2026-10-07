import type { HangInfo, ActivityReadRequest, ActivityReadResponse } from '@/types';
import { API_BASE_URL, DEFAULT_HANG_INTERVAL } from '@/constants';
import { ensureAllSectionsExpanded } from '@/utils/dom';
import type { TaskCallbacks, TaskStatusType } from '@/services/task-contracts';
import { syncHangButtons } from './hang-buttons';

let isAutoHanging = false;
let hangQueue: HangInfo[] = [];
let currentHangIndex = 0;
let autoHangCallbacks: TaskCallbacks | null = null;
let autoHangGetIntervalSeconds: (() => number) | null = null;
let autoHangIntervalSeconds = 0;
// FIXED: 停止后快速重启时，旧异步展开流程或旧定时器不能继续消费新的 hangQueue。
//        这个 run token 是跨定时器/异步边界的幂等保护，删除会重新引入串扰。
let autoHangRunId = 0;
let autoHangTimer: number | null = null;
let skippedHangCount = 0;
const pendingReads = new Map<string, Promise<void>>();

function setAutoHangRunning(running: boolean): void {
  autoHangCallbacks?.onRunningChange?.(running);

  const button = $('#auto-hang-all-btn');
  if (!button.length) return;

  if (running) {
    button.text('停止挂机').removeClass('ouchn-btn-success').addClass('ouchn-btn-warning');
  } else {
    button.text('一键全部挂机').removeClass('ouchn-btn-warning').addClass('ouchn-btn-success');
  }
}

/**
 * 更新挂机状态
 */
export function updateAutoHangStatus(message: string, type: TaskStatusType = 'info'): void {
  autoHangCallbacks?.onStatus({ message, type });
  const classType = type === 'error' ? 'warning' : type;

  const statusEl = $('#auto-hang-status');
  if (!statusEl.length) {
    console.log(`[一键挂机] ${message}`);
    return;
  }

  statusEl
    .show()
    .text(message)
    .removeClass('ouchn-status-info ouchn-status-success ouchn-status-warning')
    .addClass(`ouchn-status-${classType}`);
  console.log(`[一键挂机] ${message}`);
}

/**
 * 扫描所有挂机按钮
 */
export function scanHangButtons(): HangInfo[] {
  syncHangButtons();
  const buttons: HangInfo[] = [];
  const allButtons = document.querySelectorAll('#auto-button, .auto-button');

  allButtons.forEach((button) => {
    const buttonElement = button as HTMLElement;
    if (!buttonElement.closest('.learning-activity')?.querySelector('[ng-switch-when="online_video"]')) return;
    const buttonText = buttonElement.textContent?.trim();

    if (buttonText === '点击挂机' || buttonText === '重试挂机') {
      const activityId = buttonElement.dataset.activityId;
      const time = buttonElement.dataset.time;

      if (activityId && time && Number.isFinite(Number(time)) && Number(time) > 0) {
        const activityElement = buttonElement.closest('.learning-activity, .activity-summary');
        let title = '未知视频';

        if (activityElement) {
          const titleEl = activityElement.querySelector('.activity-header > .activity-title .title');
          if (titleEl) {
            title = titleEl.textContent?.trim() || '未知视频';
          }
        }

        buttons.push({
          button: buttonElement,
          activityId: activityId,
          time: time,
          title: title,
        });
      }
    }
  });

  console.log('[一键挂机] 扫描结果:', buttons);
  return buttons;
}

/**
 * 开始一键全部挂机
 */
export async function startAutoHangAll(): Promise<void> {
  if (isAutoHanging) {
    stopAutoHanging();
    updateAutoHangStatus('已手动停止', 'warning');
    return;
  }

  isAutoHanging = true;
  const runId = ++autoHangRunId;
  setAutoHangRunning(true);

  // 检查并展开所有章节
  updateAutoHangStatus('检查课程章节状态...', 'info');
  try {
    await ensureAllSectionsExpanded();
  } catch (error) {
    if (!isAutoHanging || runId !== autoHangRunId) return;
    console.error('[一键挂机] 章节展开失败', error);
    updateAutoHangStatus('课程章节展开失败，请重试', 'error');
    stopAutoHanging();
    return;
  }
  if (!isAutoHanging || runId !== autoHangRunId) return;

  updateAutoHangStatus('正在扫描未完成的视频...', 'info');

  hangQueue = scanHangButtons();
  skippedHangCount = Array.from(document.querySelectorAll('.auto-button:not([data-time])')).filter(
    (button) => button.textContent === '时长未就绪',
  ).length;
  if (!isAutoHanging || runId !== autoHangRunId) return;

  if (hangQueue.length === 0) {
    updateAutoHangStatus(
      skippedHangCount ? `${skippedHangCount} 个视频时长未就绪，暂时无法挂机` : '没有找到需要挂机的视频！',
      'warning',
    );
    stopAutoHanging();
    return;
  }

  updateAutoHangStatus(`找到 ${hangQueue.length} 个视频需要挂机，开始自动挂机...`, 'success');
  currentHangIndex = 0;

  void processNextHang(runId);
}

/**
 * 处理下一个挂机任务
 */
export async function processNextHang(runId = autoHangRunId): Promise<void> {
  if (runId !== autoHangRunId) return;

  if (!isAutoHanging) {
    updateAutoHangStatus('已停止', 'warning');
    return;
  }

  if (currentHangIndex >= hangQueue.length) {
    updateAutoHangStatus(
      skippedHangCount ? `队列已完成；另有 ${skippedHangCount} 个视频时长未就绪，已跳过` : '✅ 所有视频已挂机完成！',
      skippedHangCount ? 'warning' : 'success',
    );
    stopAutoHanging();
    return;
  }

  const hangInfo = hangQueue[currentHangIndex];
  const configuredInterval =
    autoHangGetIntervalSeconds?.() ||
    autoHangIntervalSeconds ||
    parseInt($('#auto-hang-interval').val() as string) ||
    DEFAULT_HANG_INTERVAL;
  const interval =
    Number.isFinite(configuredInterval) && configuredInterval > 0 ? configuredInterval : DEFAULT_HANG_INTERVAL;

  updateAutoHangStatus(`正在挂机 (${currentHangIndex + 1}/${hangQueue.length}): ${hangInfo.title}`, 'info');
  console.log('[一键挂机] 挂机:', hangInfo.title, '时长:', hangInfo.time);

  try {
    await requestActivitiesRead(hangInfo.activityId, hangInfo.time, $(hangInfo.button));
  } catch (error) {
    if (!isAutoHanging || runId !== autoHangRunId) return;
    console.error('[一键挂机] 请求失败', error);
    updateAutoHangStatus(`挂机失败：${hangInfo.title}，请重试`, 'error');
    stopAutoHanging();
    return;
  }
  // FIXED: 请求返回前可能已经停止/重启，旧回调不能推进新队列或创建新定时器。
  if (!isAutoHanging || runId !== autoHangRunId) return;

  currentHangIndex++;
  updateAutoHangStatus(`挂机成功，等待 ${interval} 秒后继续...`, 'success');

  autoHangTimer = window.setTimeout(() => {
    autoHangTimer = null;
    void processNextHang(runId);
  }, interval * 1000);
}

/**
 * 停止挂机
 */
export function stopAutoHanging(): void {
  isAutoHanging = false;
  autoHangRunId++;
  if (autoHangTimer !== null) {
    window.clearTimeout(autoHangTimer);
    autoHangTimer = null;
  }
  setAutoHangRunning(false);
}

/**
 * 请求活动已读API
 */
export async function requestActivitiesRead(id: string, end: string, $button: JQuery): Promise<void> {
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(end)) || Number(end) <= 0) throw new Error('无效的视频信息');
  if ($button.text() === '已完成') return;
  // FIXED: 手动点击与批量任务可能命中同一视频，复用在途请求，删除会造成重复提交。
  const existing = pendingReads.get(id);
  if (existing) return existing;
  $button.attr('data-pending', 'true').attr('aria-disabled', 'true');
  const request = performActivitiesRead(id, end, $button);
  pendingReads.set(id, request);
  try {
    await request;
  } finally {
    pendingReads.delete(id);
    $button.removeAttr('data-pending').attr('aria-disabled', String($button.text() === '已完成'));
  }
}

async function performActivitiesRead(id: string, end: string, $button: JQuery): Promise<void> {
  const data: ActivityReadRequest = {
    start: 0,
    end: Number(end),
  };

  const response: ActivityReadResponse = await $.ajax({
    type: 'POST',
    url: `${API_BASE_URL}/course/activities-read/${id}`,
    contentType: 'application/json',
    data: JSON.stringify(data),
    timeout: 30000,
  });
  if (response?.completeness !== 'full') throw new Error('平台未确认学习完成');
  $button.text('已完成');
}

export async function startAutoHangAllWithCallbacks(
  input: { getIntervalSeconds?: () => number; intervalSeconds: number },
  callbacks: TaskCallbacks,
): Promise<void> {
  autoHangCallbacks = callbacks;
  autoHangGetIntervalSeconds = input.getIntervalSeconds || null;
  autoHangIntervalSeconds = input.intervalSeconds || DEFAULT_HANG_INTERVAL;
  return startAutoHangAll();
}
