import { timeStringToSeconds, extractNumber } from '@/utils/helper';

/** 同步按钮，供定时扫描和批量任务启动时共用。 */
export function syncHangButtons(): void {
  for (const element of Array.from(document.querySelectorAll<HTMLElement>('.learning-activity'))) {
    // FIXED: 测试题数、资料日期不是视频时长；必须限定音视频活动，删除会误提交其它任务。
    if (!element.querySelector('[ng-switch-when="online_video"]')) continue;
    const id = extractNumber(element.id);
    if (!/^\d+$/.test(id)) continue;
    const duration = element.querySelector(
      '.video-duration .attribute-value, .activity-attribute .attribute-value.number',
    );
    const value = duration?.textContent?.trim() || '';
    const seconds = /^\d+:[0-5]\d:[0-5]\d$/.test(value) ? timeStringToSeconds(value) : NaN;
    const ready = Number.isSafeInteger(seconds) && seconds > 0;
    const complete = Boolean(element.querySelector('.completeness.full'));
    let button = element.querySelector<HTMLElement>('.auto-button');
    if (!button) {
      button = document.createElement('span');
      button.className = 'button button-green small gtm-label auto-button';
      button.style.cssText = 'font-size:12px;min-width:58px;margin-left:4px;';
      element.prepend(button);
    }
    button.dataset.activityId = id;
    // FIXED: 平台仍在处理的视频没有时长，显示不可执行原因并持续重试扫描，不能伪造观看秒数。
    if (ready) button.dataset.time = String(seconds);
    else delete button.dataset.time;
    button.setAttribute(
      'aria-disabled',
      String(!ready || complete || button.textContent === '已完成' || button.dataset.pending === 'true'),
    );
    button.title = ready ? '' : '平台尚未提供视频时长（可能仍在转码），时长就绪后自动恢复挂机按钮';
    if (complete) button.textContent = '已完成';
    else if (!ready) button.textContent = '时长未就绪';
    else if (button.textContent !== '已完成' && button.textContent !== '重试挂机') button.textContent = '点击挂机';
  }
}
