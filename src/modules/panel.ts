import { makeDraggable } from '@/utils/helper';
import { startAutoViewPages } from './auto-view';
import { startAutoHangAll } from './auto-hang';
import { startAutoMaterialDownload } from './auto-material-download';
import { startSaveAllResources } from './auto-save-resources';
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
    <div class="download-panel">
      <div class="download-header">
        <h3 class="download-title">📥 资源下载</h3>
        <button class="download-toggle">−</button>
      </div>
      <div class="download-body">
        <button class="download-btn download-btn-primary" id="auto-view-pages-btn">
          👀 一键查看所有页面
        </button>

        <div class="download-status download-status-info" id="auto-view-status" style="display:none;">
          准备开始...
        </div>

        <hr style="margin: 15px 0; border: none; border-top: 1px solid #e0e0e0;">

        <div style="margin: 10px 0;">
          <label style="font-size: 12px; color: #666; display: flex; align-items: center; justify-content: space-between;">
            <span>下载间隔(秒):</span>
            <input type="number" id="material-download-interval" value="10" min="5" max="60"
                   style="width: 80px; padding: 5px; border: 1px solid #ddd; border-radius: 4px; text-align: center;">
          </label>
        </div>

        <button class="download-btn download-btn-secondary" id="auto-download-materials-btn">
          📥 批量下载参考资料
        </button>

        <div class="download-status download-status-info" id="auto-download-status" style="display:none;">
          准备开始...
        </div>

        <hr style="margin: 15px 0; border: none; border-top: 1px solid #e0e0e0;">

        <div style="margin: 10px 0;">
          <label style="font-size: 12px; color: #666; display: flex; align-items: center; justify-content: space-between;">
            <span>挂机间隔(秒):</span>
            <input type="number" id="auto-hang-interval" value="${DEFAULT_HANG_INTERVAL}" min="10" max="300"
                   style="width: 80px; padding: 5px; border: 1px solid #ddd; border-radius: 4px; text-align: center;">
          </label>
        </div>

        <button class="download-btn download-btn-success" id="auto-hang-all-btn">
          🎬 一键全部挂机
        </button>

        <div class="download-status download-status-info" id="auto-hang-status" style="display:none;">
          准备开始...
        </div>
      </div>
    </div>
  `);

  $('body').append(panel);

  // 绑定折叠事件
  panel.find('.download-toggle').on('click', function () {
    const body = panel.find('.download-body');
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
    <div class="download-panel">
      <div class="download-header">
        <h3 class="download-title">📥 资源下载</h3>
        <button class="download-toggle">−</button>
      </div>
      <div class="download-body">
        <button class="download-btn download-btn-primary" id="save-all-resources-btn">
          💾 保存所有学习资源
        </button>

        <div class="download-status download-status-info" id="save-all-status" style="display:none;">
          准备开始...
        </div>
      </div>
    </div>
  `);

  $('body').append(panel);

  // 绑定折叠事件
  panel.find('.download-toggle').on('click', function () {
    const body = panel.find('.download-body');
    body.toggleClass('collapsed');
    $(this).text(body.hasClass('collapsed') ? '+' : '−');
  });

  // 绑定保存所有资源按钮事件
  $('#save-all-resources-btn').on('click', startSaveAllResources);

  // 使面板可拖动
  makeDraggable(panel[0]);
}
