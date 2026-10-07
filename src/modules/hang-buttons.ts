import { API_BASE_URL } from '@/constants';
import type { ActivityReadRequest, ActivityReadResponse } from '@/types';
import { extractNumber, timeStringToSeconds } from '@/utils/helper';

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
  failed: '重试挂机',
  ready: '点击挂机',
};

function getButtonStatus(video: VideoActivity): keyof typeof buttonLabels {
  if (video.complete) return 'complete';
  if (reads.get(video.activityId)?.status === 'pending') return 'pending';
  if (video.seconds === null) return 'unavailable';
  return reads.get(video.activityId)?.status === 'failed' ? 'failed' : 'ready';
}

// 平台活动 ID 全局唯一。请求结果保留至页面卸载，过滤/重建 DOM 不应丢失已确认的完成状态。
// 只保存发生过请求的活动，不持有 DOM 引用；失败时允许下一次操作重试。
const reads = new Map<string, ReadState>();

function readVideo(element: HTMLElement): VideoActivity | null {
  // FIXED: 题数、截止日期不是视频时长，只识别音视频活动；删除会误提交测试和作业。
  if (!element.querySelector('[ng-switch-when="online_video"]')) return null;
  const activityId = extractNumber(element.id);
  if (!/^\d+$/.test(activityId)) return null;
  const duration = element.querySelector(
    '.video-duration .attribute-value, .activity-attribute .attribute-value.number',
  );
  const value = duration?.textContent?.trim() || '';
  const seconds = /^\d+:[0-5]\d:[0-5]\d$/.test(value) ? timeStringToSeconds(value) : NaN;
  return {
    activityId,
    title: element.querySelector('.activity-header > .activity-title .title')?.textContent?.trim() || '未知视频',
    element,
    seconds: Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null,
    complete: Boolean(element.querySelector('.completeness.full')) || reads.get(activityId)?.status === 'complete',
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
  const title = video.seconds === null && !video.complete ? '平台尚未提供视频时长，时长就绪后自动恢复挂机按钮' : '';
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
  findVideos().forEach(renderButton);
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
