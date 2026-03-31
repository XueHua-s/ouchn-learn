/**
 * 树形菜单展开与资源扫描
 */

import type { ResourceItem } from '@/types';

/**
 * 等待DOM稳定
 */
export async function waitForDOMStable(timeout = 2000): Promise<void> {
  return new Promise((resolve) => {
    let timeoutId: number;
    const observer = new MutationObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        observer.disconnect();
        resolve();
      }, 500);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // 设置最大等待时间
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeout);
  });
}

/**
 * 展开所有树形菜单
 */
export async function expandAllTrees(statusCallback?: (message: string) => void): Promise<void> {
  statusCallback?.('正在展开所有菜单...');

  // 需要递归展开，因为展开父菜单后可能会出现新的子菜单
  let expanded = 0;
  let round = 0;
  const maxRounds = 10; // 防止无限循环

  while (round < maxRounds) {
    round++;

    // 查找所有折叠的子菜单（箭头为rotate(180deg)的是已展开，没有rotate或rotate(0deg)的是折叠的）
    const collapsedMenus = $('.full-screen-mode-sidebar-sub-menu-title svg')
      .filter(function () {
        const style = $(this).attr('style') || '';
        // 已展开的箭头包含 rotate(180deg)，未展开的不包含
        return !style.includes('rotate(180deg)');
      })
      .parent();

    if (collapsedMenus.length === 0) {
      break;
    }

    console.log(`[保存资源] 第 ${round} 轮，找到 ${collapsedMenus.length} 个折叠的菜单`);

    for (let i = 0; i < collapsedMenus.length; i++) {
      const menu = collapsedMenus[i];
      statusCallback?.(`展开菜单... (已展开 ${expanded + i + 1} 个)`);

      $(menu).trigger('click');
      await waitForDOMStable(800);
    }

    expanded += collapsedMenus.length;
  }

  statusCallback?.(`所有菜单已展开 (共 ${expanded} 个)`);
  console.log(`[保存资源] 所有菜单已展开 (共 ${expanded} 个)`);
}

/**
 * 获取所有学习资源项
 */
export function getAllResourceItems(): ResourceItem[] {
  const items: ResourceItem[] = [];

  $('.full-screen-mode-sidebar-menu-item').each((_, item) => {
    const $item = $(item);
    const icon = $item.find('i.activity-type-icon');
    const titleElement = $item.find('.text-too-long');
    const title = titleElement.text().trim();

    let type: 'video' | 'document' | 'unknown' = 'unknown';
    if (icon.hasClass('font-syllabus-online-video')) {
      type = 'video';
    } else if (icon.hasClass('font-syllabus-page')) {
      type = 'document';
    }

    if (type !== 'unknown') {
      items.push({
        element: item,
        type,
        title,
      });
    }
  });

  return items;
}
