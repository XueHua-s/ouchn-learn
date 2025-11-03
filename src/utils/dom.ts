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

/**
 * 检查并展开所有课程章节
 */
export async function ensureAllSectionsExpanded(): Promise<void> {
  console.log('[批量功能] 检查课程章节展开状态...');

  // 查找全部展开/收起按钮
  const toggleButton = document.querySelector<HTMLElement>(
    'a.expand-collapse-all-button[toggle-group-manager="course-section"]',
  );

  if (!toggleButton) {
    console.log('[批量功能] 未找到展开/收起按钮，跳过检查');
    return;
  }

  // 检查按钮中的文字内容
  const buttonText = toggleButton.textContent?.trim() || '';
  console.log(`[批量功能] 当前按钮状态: ${buttonText}`);

  // 如果是"全部展开"状态，说明当前是收起的，需要点击展开
  if (buttonText === '全部展开') {
    console.log('[批量功能] 检测到章节处于收起状态，正在展开所有章节...');
    toggleButton.click();

    // 等待DOM稳定
    console.log('[批量功能] 等待章节展开完成...');
    await waitForDomStable();

    console.log('[批量功能] 所有章节已展开');
  } else if (buttonText === '全部收起') {
    console.log('[批量功能] 所有章节已处于展开状态');
  } else {
    console.log(`[批量功能] 未知的按钮状态: ${buttonText}`);
  }
}
