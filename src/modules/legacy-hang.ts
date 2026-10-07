import { syncHangButtons } from './hang-buttons';
import { requestActivitiesRead } from './auto-hang';

/** 初始化单个视频的挂机事件。 */
export function initLegacyHangEvents(): void {
  $(document).on('click', '.auto-button', function () {
    const button = this as HTMLElement;
    if (button.getAttribute('aria-disabled') === 'true' || button.textContent === '已完成') return;
    const { activityId, time } = button.dataset;
    if (activityId && time) {
      void requestActivitiesRead(activityId, time, $(button)).catch((error: unknown) => {
        console.error('[视频挂机] 请求失败', error);
        button.textContent = '重试挂机';
      });
    }
  });
}

export function startAutoButtonScanning(): void {
  syncHangButtons();
  setInterval(syncHangButtons, 500);
}
