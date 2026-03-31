import type { HangInfo, ActivityReadRequest, ActivityReadResponse } from '@/types';
import { API_BASE_URL, DEFAULT_HANG_INTERVAL } from '@/constants';
import { ensureAllSectionsExpanded } from '@/utils/dom';

let isAutoHanging = false;
let hangQueue: HangInfo[] = [];
let currentHangIndex = 0;

/**
 * 更新挂机状态
 */
export function updateAutoHangStatus(message: string, type: 'info' | 'success' | 'warning' = 'info'): void {
  const statusEl = $('#auto-hang-status');
  statusEl
    .show()
    .text(message)
    .removeClass('ouchn-status-info ouchn-status-success ouchn-status-warning')
    .addClass(`ouchn-status-${type}`);
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
  $('#auto-hang-all-btn').text('停止挂机').removeClass('ouchn-btn-success').addClass('ouchn-btn-warning');

  // 检查并展开所有章节
  updateAutoHangStatus('检查课程章节状态...', 'info');
  await ensureAllSectionsExpanded();

  updateAutoHangStatus('正在扫描未完成的视频...', 'info');

  hangQueue = scanHangButtons();

  if (hangQueue.length === 0) {
    updateAutoHangStatus('没有找到需要挂机的视频！', 'warning');
    stopAutoHanging();
    return;
  }

  updateAutoHangStatus(`找到 ${hangQueue.length} 个视频需要挂机，开始自动挂机...`, 'success');
  currentHangIndex = 0;

  processNextHang();
}

/**
 * 处理下一个挂机任务
 */
export function processNextHang(): void {
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
  const interval = parseInt($('#auto-hang-interval').val() as string) || DEFAULT_HANG_INTERVAL;

  updateAutoHangStatus(`正在挂机 (${currentHangIndex + 1}/${hangQueue.length}): ${hangInfo.title}`, 'info');
  console.log('[一键挂机] 挂机:', hangInfo.title, '时长:', hangInfo.time);

  requestActivitiesRead(hangInfo.activityId, hangInfo.time, $(hangInfo.button));

  currentHangIndex++;
  updateAutoHangStatus(`挂机成功，等待 ${interval} 秒后继续...`, 'success');

  setTimeout(() => {
    processNextHang();
  }, interval * 1000);
}

/**
 * 停止挂机
 */
export function stopAutoHanging(): void {
  isAutoHanging = false;
  $('#auto-hang-all-btn').text('一键全部挂机').removeClass('ouchn-btn-warning').addClass('ouchn-btn-success');
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
