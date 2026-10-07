import { hangActivityForButton, syncHangButtons } from './hang-buttons';

let eventsInitialized = false;
let scanningTimer: number | null = null;

/** 页面生命周期内仅注册一次委托，React 面板重建不需要重新绑定。 */
export function initLegacyHangEvents(): void {
  if (eventsInitialized) return;
  eventsInitialized = true;
  $(document).on('click', '.auto-button', function (event) {
    event.preventDefault();
    event.stopPropagation();
    void hangActivityForButton(this as HTMLElement).catch((error: unknown) => {
      console.error('[视频挂机] 请求失败', error);
    });
  });
}

/** 兼容平台异步渲染目录；重复初始化不增加轮询定时器。 */
export function startAutoButtonScanning(): void {
  if (scanningTimer !== null) return;
  syncHangButtons();
  scanningTimer = window.setInterval(syncHangButtons, 500);
}
