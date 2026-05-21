import type { HangInfo, ActivityReadRequest, ActivityReadResponse } from '@/types';
import { API_BASE_URL, DEFAULT_HANG_INTERVAL } from '@/constants';
import { ensureAllSectionsExpanded } from '@/utils/dom';
import type { TaskCallbacks, TaskStatusType } from '@/services/task-contracts';

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
  const buttons: HangInfo[] = [];
  const allButtons = document.querySelectorAll('#auto-button, .auto-button');

  allButtons.forEach((button) => {
    const buttonElement = button as HTMLElement;
    const buttonText = buttonElement.textContent?.trim();

    if (buttonText === '点击挂机') {
      const activityId = buttonElement.dataset.activityId;
      const time = buttonElement.dataset.time;

      if (activityId && time) {
        const activityElement = buttonElement.closest('.learning-activity, .activity-summary');
        let title = '未知视频';

        if (activityElement) {
          const titleEl = activityElement.querySelector('.activity-title .title, .title');
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
  await ensureAllSectionsExpanded();
  if (!isAutoHanging || runId !== autoHangRunId) return;

  updateAutoHangStatus('正在扫描未完成的视频...', 'info');

  hangQueue = scanHangButtons();
  if (!isAutoHanging || runId !== autoHangRunId) return;

  if (hangQueue.length === 0) {
    updateAutoHangStatus('没有找到需要挂机的视频！', 'warning');
    stopAutoHanging();
    return;
  }

  updateAutoHangStatus(`找到 ${hangQueue.length} 个视频需要挂机，开始自动挂机...`, 'success');
  currentHangIndex = 0;

  processNextHang(runId);
}

/**
 * 处理下一个挂机任务
 */
export function processNextHang(runId = autoHangRunId): void {
  if (runId !== autoHangRunId) return;

  if (!isAutoHanging) {
    updateAutoHangStatus('已停止', 'warning');
    return;
  }

  if (currentHangIndex >= hangQueue.length) {
    updateAutoHangStatus('✅ 所有视频已挂机完成！', 'success');
    stopAutoHanging();
    return;
  }

  const hangInfo = hangQueue[currentHangIndex];
  const interval =
    autoHangGetIntervalSeconds?.() ||
    autoHangIntervalSeconds ||
    parseInt($('#auto-hang-interval').val() as string) ||
    DEFAULT_HANG_INTERVAL;

  updateAutoHangStatus(`正在挂机 (${currentHangIndex + 1}/${hangQueue.length}): ${hangInfo.title}`, 'info');
  console.log('[一键挂机] 挂机:', hangInfo.title, '时长:', hangInfo.time);

  requestActivitiesRead(hangInfo.activityId, hangInfo.time, $(hangInfo.button));

  currentHangIndex++;
  updateAutoHangStatus(`挂机成功，等待 ${interval} 秒后继续...`, 'success');

  autoHangTimer = window.setTimeout(() => {
    autoHangTimer = null;
    processNextHang(runId);
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
export function requestActivitiesRead(id: string, end: string, $button: JQuery): void {
  const data: ActivityReadRequest = {
    start: 0,
    end: parseInt(end),
  };

  $.ajax({
    type: 'POST',
    url: `${API_BASE_URL}/course/activities-read/${id}`,
    contentType: 'application/json',
    data: JSON.stringify(data),
    success: function (response: ActivityReadResponse) {
      console.log('响应结果', response);
      if (response.completeness === 'full') {
        $button.text('已完成');
      }
    },
  });
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
