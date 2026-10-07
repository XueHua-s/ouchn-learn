import { API_BASE_URL } from '@/constants';
import type { ActivityReadRequest, ActivityReadResponse } from '@/types';
import { extractNumber, timeStringToSeconds } from '@/utils/helper';
import {
  getVideoDuration,
  isVideoDurationLoading,
  isVideoDurationLocked,
  loadVideoDuration,
  retryUnavailableVideoDurations,
} from './video-duration';

export interface HangActivity {
  activityId: string;
  title: string;
}

interface VideoActivity extends HangActivity {
  element: HTMLElement;
  seconds: number | null;
  complete: boolean;
}

type ReadState = { status: 'pending'; promise: Promise<void> } | { status: 'complete' } | { status: 'failed' };

const buttonLabels = {
  complete: '已完成',
  pending: '挂机中',
  unavailable: '时长未就绪',
  loading: '读取时长中',
  locked: '待解锁',
  failed: '重试挂机',
  ready: '点击挂机',
};

function getButtonStatus(video: VideoActivity): keyof typeof buttonLabels {
  if (video.complete) return 'complete';
  if (reads.get(video.activityId)?.status === 'pending') return 'pending';
  if (video.seconds === null && isVideoDurationLoading(video.activityId)) return 'loading';
  if (video.seconds === null && isVideoDurationLocked(video.activityId)) return 'locked';
  if (video.seconds === null) return 'unavailable';
  return reads.get(video.activityId)?.status === 'failed' ? 'failed' : 'ready';
}

// 平台活动 ID 全局唯一。请求结果保留至页面卸载，过滤/重建 DOM 不应丢失已确认的完成状态。
// 只保存发生过请求的活动，不持有 DOM 引用；失败时允许下一次操作重试。
const reads = new Map<string, ReadState>();

function readVideo(element: HTMLElement): VideoActivity | null {
  // FIXED: 前置条件弹窗也有 online_video 节点；必须限定活动自身的顶层摘要，不能匹配任意后代。
  const summary = element.querySelector<HTMLElement>(
    ':scope > .clickable-area > .activity-summary[ng-switch-when="online_video"]',
  );
  if (!summary) return null;
  const activityId = extractNumber(element.id);
  if (!/^\d+$/.test(activityId)) return null;
  const duration = summary.querySelector(
    '.video-duration .attribute-value, .activity-attribute .attribute-value.number',
  );
  const value = duration?.textContent?.trim() || '';
  const seconds = /^\d+:[0-5]\d:[0-5]\d$/.test(value) ? timeStringToSeconds(value) : NaN;
  return {
    activityId,
    title: summary.querySelector('.activity-header > .activity-title .title')?.textContent?.trim() || '未知视频',
    element,
    seconds: Number.isSafeInteger(seconds) && seconds > 0 ? seconds : getVideoDuration(activityId),
    complete:
      Boolean(summary.querySelector('.activity-operations-container .completeness.full')) ||
      reads.get(activityId)?.status === 'complete',
  };
}

function findVideos(): VideoActivity[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.learning-activity'))
    .map(readVideo)
    .filter((video): video is VideoActivity => video !== null);
}

function setAttributeIfChanged(button: HTMLElement, name: string, value: string): void {
  if (button.getAttribute(name) !== value) button.setAttribute(name, value);
}

function renderButton(video: VideoActivity): void {
  let button = video.element.querySelector<HTMLElement>('.auto-button');
  if (!button) {
    button = document.createElement('button');
    button.className = 'button button-green small gtm-label auto-button';
    button.setAttribute('type', 'button');
    button.style.cssText = 'font-size:12px;min-width:58px;margin-left:4px;';
    video.element.prepend(button);
  }
  const status = getButtonStatus(video);
  const disabled = status !== 'ready' && status !== 'failed';
  const text = buttonLabels[status];
  const title =
    status === 'locked'
      ? '请先完成平台要求的前置活动，完成后自动重新检查'
      : video.seconds === null && !video.complete
        ? '正在尝试读取媒体时长；读取失败会稍后自动重试'
        : '';
  // FIXED: 每 500ms 扫描不得重写相同 DOM，否则全页 MutationObserver 永远无法达到稳定窗口。
  //        文案只负责展示；是否可执行始终由平台元数据与 reads 决定。
  setAttributeIfChanged(button, 'aria-disabled', String(disabled));
  if (button.tagName === 'BUTTON') {
    if (disabled && !button.hasAttribute('disabled')) button.setAttribute('disabled', '');
    else if (!disabled && button.hasAttribute('disabled')) button.removeAttribute('disabled');
  }
  setAttributeIfChanged(button, 'title', title);
  if (button.textContent !== text) button.textContent = text;
}

/** 同步可见目录中的按钮。相同输入不产生 DOM mutation；重建的条目继承请求状态。 */
export function syncHangButtons(): void {
  for (const video of findVideos()) {
    if (!video.complete && video.seconds === null) {
      void loadVideoDuration(video.activityId);
    }
    renderButton(video);
  }
}

/** 批量任务开始前等待缺失时长的有限元数据读取，避免后台读取尚未完成就跳过视频。 */
export async function prepareHangActivities(options: { retryUnavailable?: boolean } = {}): Promise<void> {
  const missing = findVideos().filter((video) => !video.complete && video.seconds === null);
  await Promise.all(missing.map((video) => loadVideoDuration(video.activityId)));
  if (options.retryUnavailable) {
    // 等在途读取结束后再清除失败冷却；前置任务完成前发出的 403 不能盖过本次解锁重试。
    retryUnavailableVideoDurations();
    await Promise.all(missing.map((video) => loadVideoDuration(video.activityId)));
  }
  syncHangButtons();
}

/** 获取当前未完成的视频及缺失时长数量。包含在途请求，批量任务可等待其结果。 */
export function scanHangActivities(): { tasks: HangActivity[]; unavailableCount: number } {
  const tasks: HangActivity[] = [];
  let unavailableCount = 0;
  const seen = new Set<string>();
  for (const video of findVideos()) {
    renderButton(video);
    if (seen.has(video.activityId) || video.complete) continue;
    seen.add(video.activityId);
    if (video.seconds === null) unavailableCount++;
    else tasks.push({ activityId: video.activityId, title: video.title });
  }
  return { tasks, unavailableCount };
}

/** 用最新平台时长提交并等待完成确认；同一 ID 的并发操作共享请求，不依赖任何按钮实例。 */
export async function completeHangActivity(activityId: string): Promise<void> {
  if (!/^\d+$/.test(activityId)) throw new Error('无效的视频 ID');
  const state = reads.get(activityId);
  if (state?.status === 'complete') return;
  if (state?.status === 'pending') return state.promise;
  const video = findVideos().find((item) => item.activityId === activityId);
  if (!video) throw new Error('视频已离开当前目录，请重新扫描');
  if (video.complete) return;
  if (video.seconds === null) throw new Error('平台尚未提供有效的视频时长');
  const seconds = video.seconds;

  // FIXED: 先登记 Promise 再开始请求，手动操作、批量运行及 DOM 重建都只能共享同一在途状态。
  const promise = Promise.resolve().then(async () => {
    try {
      const data: ActivityReadRequest = { start: 0, end: seconds };
      const response: ActivityReadResponse = await $.ajax({
        type: 'POST',
        url: `${API_BASE_URL}/course/activities-read/${activityId}`,
        contentType: 'application/json',
        data: JSON.stringify(data),
        timeout: 30000,
      });
      if (response?.completeness !== 'full') throw new Error('平台未确认学习完成');
      reads.set(activityId, { status: 'complete' });
      retryUnavailableVideoDurations();
    } catch (error) {
      reads.set(activityId, { status: 'failed' });
      throw error;
    } finally {
      syncHangButtons();
    }
  });
  reads.set(activityId, { status: 'pending', promise });
  syncHangButtons();
  return promise;
}

/** 委托事件入口：由所属活动判断可执行性，按钮文案/属性均不是业务状态。 */
export async function hangActivityForButton(button: HTMLElement): Promise<void> {
  const element = button.closest<HTMLElement>('.learning-activity');
  const video = element ? readVideo(element) : null;
  if (!video || video.complete || video.seconds === null) return;
  return completeHangActivity(video.activityId);
}
