import { makeDraggable } from '@/utils/helper';
import { startAutoViewPages } from './auto-view';
import { startAutoHangAll } from './auto-hang';
import { startAutoMaterialDownload } from './auto-material-download';
import { startSaveAllResources } from './save-resources';
import { DEFAULT_HANG_INTERVAL } from '@/constants';

/**
 * 检查当前URL是否为全屏学习活动页面
 */
function isFullScreenLearningActivity(): boolean {
  const url = window.location.href;
  return url.includes('/learning-activity/full-screen#/');
}

/**
 * 创建下载面板
 */
export function createDownloadPanel(): void {
  // 如果是全屏学习活动页面，显示简化版面板
  if (isFullScreenLearningActivity()) {
    console.log('[面板] 检测到全屏学习活动页面，显示简化版面板');
    createFullScreenPanel();
    return;
  }

  const panel = $(`
    <div class="ouchn-panel download-panel">
      <div class="ouchn-panel-header download-header">
        <h3 class="ouchn-panel-title">资源下载</h3>
        <button class="ouchn-panel-toggle">−</button>
      </div>
      <div class="ouchn-panel-body">
        <button class="ouchn-btn ouchn-btn-primary" id="auto-view-pages-btn">
          一键查看所有页面
        </button>

        <div class="ouchn-status ouchn-status-info" id="auto-view-status" style="display:none;">
          准备开始...
        </div>

        <hr class="ouchn-divider">

        <div class="ouchn-input-row">
          <label class="ouchn-label">下载间隔(秒)</label>
          <input type="number" class="ouchn-input ouchn-input-sm" id="material-download-interval"
                 value="10" min="5" max="60">
        </div>

        <button class="ouchn-btn ouchn-btn-secondary" id="auto-download-materials-btn">
          批量下载参考资料
        </button>

        <div class="ouchn-status ouchn-status-info" id="auto-download-status" style="display:none;">
          准备开始...
        </div>

        <hr class="ouchn-divider">

        <div class="ouchn-input-row">
          <label class="ouchn-label">挂机间隔(秒)</label>
          <input type="number" class="ouchn-input ouchn-input-sm" id="auto-hang-interval"
                 value="${DEFAULT_HANG_INTERVAL}" min="10" max="300">
        </div>

        <button class="ouchn-btn ouchn-btn-success" id="auto-hang-all-btn">
          一键全部挂机
        </button>

        <div class="ouchn-status ouchn-status-info" id="auto-hang-status" style="display:none;">
          准备开始...
        </div>
      </div>
    </div>
  `);

  $('body').append(panel);

  // 绑定折叠事件
  panel.find('.ouchn-panel-toggle').on('click', function () {
    const body = panel.find('.ouchn-panel-body');
    body.toggleClass('collapsed');
    $(this).text(body.hasClass('collapsed') ? '+' : '−');
  });

  // 绑定按钮事件
  $('#auto-view-pages-btn').on('click', startAutoViewPages);
  $('#auto-download-materials-btn').on('click', startAutoMaterialDownload);
  $('#auto-hang-all-btn').on('click', startAutoHangAll);

  // 使面板可拖动
  makeDraggable(panel[0]);
}

/**
 * 创建全屏学习活动页面的简化版面板
 */
function createFullScreenPanel(): void {
  const panel = $(`
    <div class="ouchn-panel download-panel">
      <div class="ouchn-panel-header download-header">
        <h3 class="ouchn-panel-title">资源下载</h3>
        <button class="ouchn-panel-toggle">−</button>
      </div>
      <div class="ouchn-panel-body">
        <button class="ouchn-btn ouchn-btn-primary" id="save-all-resources-btn">
          保存所有学习资源
        </button>

        <div class="ouchn-status ouchn-status-info" id="save-all-status" style="display:none;">
          准备开始...
        </div>
      </div>
    </div>
  `);

  $('body').append(panel);

  // 绑定折叠事件
  panel.find('.ouchn-panel-toggle').on('click', function () {
    const body = panel.find('.ouchn-panel-body');
    body.toggleClass('collapsed');
    $(this).text(body.hasClass('collapsed') ? '+' : '−');
  });

  // 绑定保存所有资源按钮事件
  $('#save-all-resources-btn').on('click', startSaveAllResources);

  // 使面板可拖动
  makeDraggable(panel[0]);
}
