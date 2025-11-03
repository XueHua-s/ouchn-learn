import { DOM_STABLE_TIMEOUT, DOM_STABLE_TIME, MAX_AJAX_CHECKS, AJAX_CHECK_INTERVAL } from '@/constants';

/**
 * 等待DOM稳定（没有变化）
 */
export function waitForDomStable(timeout = DOM_STABLE_TIMEOUT, stableTime = DOM_STABLE_TIME): Promise<void> {
  return new Promise((resolve) => {
    let lastChangeTime = Date.now();
    let mutationCount = 0;
    const startTime = Date.now();

    console.log('[自动查看页面] 开始监控DOM变化...');

    const observer = new MutationObserver((mutations) => {
      mutationCount += mutations.length;
      lastChangeTime = Date.now();
      console.log(`[自动查看页面] 检测到DOM变化，总计 ${mutationCount} 次变化`);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    const checkInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastChange = now - lastChangeTime;
      const totalTime = now - startTime;

      console.log(`[自动查看页面] DOM稳定检查: 距离上次变化 ${timeSinceLastChange}ms`);

      if (timeSinceLastChange >= stableTime) {
        console.log(`[自动查看页面] DOM已稳定 (${stableTime}ms 内无变化，总计 ${mutationCount} 次变化)`);
        observer.disconnect();
        clearInterval(checkInterval);
        resolve();
      } else if (totalTime >= timeout) {
        console.log(`[自动查看页面] DOM监控超时 (${timeout}ms)，强制继续`);
        observer.disconnect();
        clearInterval(checkInterval);
        resolve();
      }
    }, 200);
  });
}

/**
 * 等待AJAX请求完成
 */
export function waitForAjaxComplete(): Promise<void> {
  return new Promise((resolve) => {
    let checkCount = 0;

    function checkAjax() {
      checkCount++;
      const activeRequests = ($ as unknown as { active?: number }).active || 0;

      console.log(`[自动查看页面] 检查AJAX状态 (${checkCount}/${MAX_AJAX_CHECKS}): 活动请求数 = ${activeRequests}`);

      if (activeRequests === 0) {
        console.log('[自动查看页面] AJAX请求已完成');
        resolve();
      } else if (checkCount >= MAX_AJAX_CHECKS) {
        console.log('[自动查看页面] AJAX等待超时，强制继续');
        resolve();
      } else {
        setTimeout(checkAjax, AJAX_CHECK_INTERVAL);
      }
    }

    checkAjax();
  });
}

/**
 * 等待页面完全加载（AJAX + DOM稳定）
 */
export async function waitForPageReady(updateStatus?: (msg: string, type: string) => void): Promise<void> {
  updateStatus?.('等待页面加载...', 'info');

  await waitForAjaxComplete();
  console.log('[自动查看页面] AJAX完成，开始监控DOM稳定性...');

  updateStatus?.('等待DOM稳定...', 'info');
  await waitForDomStable();

  updateStatus?.('页面已稳定，准备扫描...', 'info');
  console.log('[自动查看页面] 页面完全就绪！');
}
