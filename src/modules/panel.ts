import { makeDraggable } from '@/utils/helper';
import { scanResources, downloadAllResources } from './resource-download';
import { startAutoViewPages } from './auto-view';
import { startAutoHangAll } from './auto-hang';
import { DEFAULT_HANG_INTERVAL } from '@/constants';

/**
 * 创建下载面板
 */
export function createDownloadPanel(): void {
  const panel = $(`
    <div class="download-panel">
      <div class="download-header">
        <h3 class="download-title">📥 资源下载</h3>
        <button class="download-toggle">−</button>
      </div>
      <div class="download-body">
        <div class="download-status download-status-info" id="download-status">
          等待扫描资源...
        </div>

        <button class="download-btn download-btn-primary" id="scan-resources-btn">
          🔍 扫描当前页面资源
        </button>

        <button class="download-btn download-btn-success" id="download-all-btn" style="display:none;">
          📦 下载全部资源
        </button>

        <div class="resource-list" id="resource-list" style="display:none;"></div>

        <hr style="margin: 15px 0; border: none; border-top: 1px solid #e0e0e0;">

        <button class="download-btn download-btn-primary" id="auto-view-pages-btn">
          👀 一键查看所有页面
        </button>

        <div class="download-status download-status-info" id="auto-view-status" style="display:none;">
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
  $('#scan-resources-btn').on('click', scanResources);
  $('#download-all-btn').on('click', downloadAllResources);
  $('#auto-view-pages-btn').on('click', startAutoViewPages);
  $('#auto-hang-all-btn').on('click', startAutoHangAll);

  // 使面板可拖动
  makeDraggable(panel[0]);
}
