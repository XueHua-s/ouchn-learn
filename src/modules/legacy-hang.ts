import { timeStringToSeconds, extractNumber } from '@/utils/helper';
import { requestActivitiesRead } from './auto-hang';

/**
 * 初始化原有的挂机按钮点击事件
 */
export function initLegacyHangEvents(): void {
  $(document).on('click', '#auto-button', function () {
    const $this = $(this);
    const activityId = (this as HTMLElement).dataset.activityId;
    const time = (this as HTMLElement).dataset.time;

    if (activityId && time) {
      requestActivitiesRead(activityId, time, $this);
    }
  });
}

/**
 * 定期扫描并创建挂机按钮
 */
export function startAutoButtonScanning(): void {
  setInterval(() => {
    const activities = document.getElementsByClassName('learning-activity ng-scope');

    for (const element of Array.from(activities)) {
      const autoButton = element.getElementsByClassName('auto-button');
      if (autoButton && autoButton.length > 0) {
        continue;
      }

      const id = extractNumber(element.id);
      const activityValue = element.getElementsByClassName('attribute-value number ng-binding');

      if (activityValue.length > 0) {
        const completeness = element.getElementsByClassName('completeness full');
        const activityTimeStr = activityValue[0].textContent;

        if (activityTimeStr) {
          const time = timeStringToSeconds(activityTimeStr);
          const buttonText = completeness && completeness.length > 0 ? '已完成' : '点击挂机';
          const btnHtml = `<span id="auto-button" class="button button-green small gtm-label auto-button" style="font-size: 12px; width: 58px; margin-left: 4px;" data-activity-id="${id}" data-time="${time}">${buttonText}</span>`;

          $(element).prepend(btnHtml);
          console.log('课程id:', id, '时间:', time);
        }
      }
    }
  }, 500);
}
