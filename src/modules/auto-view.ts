import type { PageElement } from '@/types';
import { saveViewState, getViewState, clearViewState, saveReturnUrl, getReturnUrl } from '@/utils/storage';
import { waitForPageReady, ensureAllSectionsExpanded } from '@/utils/dom';
import type { TaskCallbacks, TaskStatusType } from '@/services/task-contracts';
import { toStatusType } from '@/services/task-contracts';

let isAutoViewing = false;
let autoViewCallbacks: TaskCallbacks | null = null;
// FIXED: 停止后如果旧的等待/跳转流程继续执行，会误点下一个页面。
//        run token 贯穿异步边界，确保只有当前任务能点击或跳转。
let autoViewRunId = 0;

function setAutoViewRunning(running: boolean): void {
  autoViewCallbacks?.onRunningChange?.(running);

  const button = $('#auto-view-pages-btn');
  if (!button.length) return;

  if (running) {
    button.text('停止查看').removeClass('ouchn-btn-primary').addClass('ouchn-btn-warning');
  } else {
    button.text('一键查看所有页面').removeClass('ouchn-btn-warning').addClass('ouchn-btn-primary');
  }
}

/**
 * 更新自动查看状态
 */
export function updateAutoViewStatus(message: string, type: TaskStatusType = 'info'): void {
  autoViewCallbacks?.onStatus({ message, type });
  const classType = type === 'error' ? 'warning' : type;

  const statusEl = $('#auto-view-status');
  if (!statusEl.length) {
    console.log(`[自动查看页面] ${message}`);
    return;
  }

  statusEl
    .show()
    .text(message)
    .removeClass('ouchn-status-info ouchn-status-success ouchn-status-warning')
    .addClass(`ouchn-status-${classType}`);
  console.log(`[自动查看页面] ${message}`);
}

/**
 * 扫描并返回可点击的元素
 */
export function scanAndGetClickableElements(): PageElement[] {
  const result: PageElement[] = [];

  const activities = document.querySelectorAll('.learning-activity, .activity-summary');

  activities.forEach((activity, index) => {
    const completenessBar = activity.querySelector('.completeness');
    if (!completenessBar) return;

    const isNotComplete = completenessBar.classList.contains('none');
    if (!isNotComplete) return;

    const tooltipInner = activity.querySelector('.ivu-tooltip-inner');
    if (!tooltipInner) return;

    const tooltipText = tooltipInner.textContent || (tooltipInner as HTMLElement).innerText;
    if (tooltipText.includes('查看页面')) {
      const titleEl = activity.querySelector('.activity-title .title, .title');
      const title = titleEl ? titleEl.textContent?.trim() : '未知页面';

      let clickableArea = activity.querySelector('.clickable-area') as HTMLElement | null;
      if (!clickableArea) {
        clickableArea = activity.closest('.clickable-area') as HTMLElement | null;
      }
      if (!clickableArea && activity.classList.contains('clickable-area')) {
        clickableArea = activity as HTMLElement;
      }

      if (clickableArea) {
        result.push({
          element: clickableArea,
          title: title || '未知页面',
          index: index,
        });
      }
    }
  });

  console.log('[自动查看页面] 当前扫描到未完成页面:', result.length);
  return result;
}

/**
 * 开始自动查看页面
 */
export async function startAutoViewPages(): Promise<void> {
  if (isAutoViewing) {
    stopAutoViewing();
    clearViewState();
    updateAutoViewStatus('已手动停止', 'warning');
    return;
  }

  isAutoViewing = true;
  const runId = ++autoViewRunId;
  setAutoViewRunning(true);

  // 检查并展开所有章节
  updateAutoViewStatus('检查课程章节状态...', 'info');
  await ensureAllSectionsExpanded();
  if (!isAutoViewing || runId !== autoViewRunId) return;

  updateAutoViewStatus('正在扫描未完成的页面...', 'info');

  const pageElements = scanAndGetClickableElements();

  if (pageElements.length === 0) {
    updateAutoViewStatus('没有找到需要查看的页面！', 'warning');
    stopAutoViewing();
    return;
  }

  const returnUrl = window.location.href;
  saveReturnUrl(returnUrl);

  saveViewState({
    isActive: true,
    processedCount: 0,
    returnUrl: returnUrl,
  });

  updateAutoViewStatus(`找到 ${pageElements.length} 个需要查看的页面，开始自动查看...`, 'success');

  setTimeout(() => {
    if (!isAutoViewing || runId !== autoViewRunId) return;
    processNextPageWithState(runId);
  }, 500);
}

/**
 * 处理下一个页面
 */
export async function processNextPageWithState(runId = autoViewRunId): Promise<void> {
  const state = getViewState();
  if (!isAutoViewing || runId !== autoViewRunId || !state || !state.isActive) {
    console.log('[自动查看页面] 没有活动的查看任务');
    return;
  }

  await waitForPageReady((msg, type) => updateAutoViewStatus(msg, toStatusType(type)));
  if (!isAutoViewing || runId !== autoViewRunId) return;

  const latestState = getViewState();
  if (!latestState || !latestState.isActive) {
    console.log('[自动查看页面] 查看任务已停止');
    return;
  }

  console.log('[自动查看页面] 重新扫描页面...');
  const currentPageList = scanAndGetClickableElements();
  if (!isAutoViewing || runId !== autoViewRunId) return;

  if (currentPageList.length === 0) {
    updateAutoViewStatus('✅ 所有页面已查看完成！', 'success');
    clearViewState();
    stopAutoViewing();
    return;
  }

  const processedCount = latestState.processedCount || 0;
  updateAutoViewStatus(`正在查看第 ${processedCount + 1} 个: ${currentPageList[0].title}`, 'info');

  console.log('[自动查看页面] 点击:', currentPageList[0].title);
  if (!isAutoViewing || runId !== autoViewRunId || !getViewState()?.isActive) return;
  currentPageList[0].element.click();

  saveViewState({
    isActive: true,
    processedCount: processedCount + 1,
    returnUrl: latestState.returnUrl,
  });

  console.log('[自动查看页面] 等待页面跳转...');
}

/**
 * 停止自动查看
 */
export function stopAutoViewing(): void {
  isAutoViewing = false;
  autoViewRunId++;
  setAutoViewRunning(false);
}

/**
 * 检查并恢复自动查看任务
 */
export async function checkAndResumeAutoView(): Promise<void> {
  const state = getViewState();
  const returnUrl = getReturnUrl();

  if (!state || !state.isActive) {
    return;
  }

  console.log('[自动查看页面] 检测到活动状态，当前URL:', window.location.href);
  console.log('[自动查看页面] 返回URL:', returnUrl);

  isAutoViewing = true;
  const runId = ++autoViewRunId;
  setAutoViewRunning(true);

  if (returnUrl && window.location.href === returnUrl) {
    console.log('[自动查看页面] 检测到返回目标页面，继续执行...');

    updateAutoViewStatus(`继续自动查看 (已处理 ${state.processedCount || 0} 个)...`, 'info');

    setTimeout(() => {
      if (!isAutoViewing || runId !== autoViewRunId) return;
      processNextPageWithState(runId);
    }, 500);
  } else {
    console.log('[自动查看页面] 当前在查看页面中，等待页面稳定...');
    console.log('[自动查看页面] 将跳转到:', returnUrl);

    updateAutoViewStatus('查看页面中...', 'info');

    await waitForPageReady((msg, type) => updateAutoViewStatus(msg, toStatusType(type)));
    if (!isAutoViewing || runId !== autoViewRunId || !getViewState()?.isActive) return;
    console.log('[自动查看页面] 查看页面已稳定，准备返回...');

    setTimeout(() => {
      if (!isAutoViewing || runId !== autoViewRunId || !getViewState()?.isActive) return;
      console.log('[自动查看页面] 跳转回课程页面');
      if (returnUrl) {
        window.location.href = returnUrl;
      }
    }, 1000);
  }
}

export async function startAutoViewPagesWithCallbacks(callbacks: TaskCallbacks): Promise<void> {
  autoViewCallbacks = callbacks;
  return startAutoViewPages();
}

export async function checkAndResumeAutoViewWithCallbacks(callbacks: TaskCallbacks): Promise<void> {
  autoViewCallbacks = callbacks;
  return checkAndResumeAutoView();
}
