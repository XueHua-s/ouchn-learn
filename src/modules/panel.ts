import { makeDraggable } from '@/utils/helper';
import { updateCoursePrefix } from './resource-download';
import { startAutoViewPages } from './auto-view';
import { startAutoHangAll } from './auto-hang';
import { DEFAULT_HANG_INTERVAL } from '@/constants';
import { getCourseConfig } from '@/utils/storage';

/**
 * 创建下载面板
 */
export function createDownloadPanel(): void {
  const config = getCourseConfig();

  const panel = $(`
    <div class="download-panel">
      <div class="download-header">
        <h3 class="download-title">📥 资源下载</h3>
        <button class="download-toggle">−</button>
      </div>
      <div class="download-body">
        <div style="margin: 10px 0;">
          <label style="font-size: 12px; color: #666; display: flex; flex-direction: column; gap: 5px;">
            <span>课程名称前缀:</span>
            <div style="display: flex; gap: 5px;">
              <input type="text" id="course-prefix-input" value="${config.coursePrefix || ''}" placeholder="例如: 计算机组成原理"
                     style="flex: 1; padding: 5px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
              <button class="download-btn download-btn-secondary" id="save-prefix-btn" style="padding: 5px 12px; font-size: 12px;">
                保存
              </button>
            </div>
            <span style="font-size: 11px; color: #999;">文件下载时会自动添加此前缀</span>
          </label>
        </div>

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
  $('#auto-view-pages-btn').on('click', startAutoViewPages);
  $('#auto-hang-all-btn').on('click', startAutoHangAll);

  // 绑定保存前缀按钮
  $('#save-prefix-btn').on('click', function () {
    const prefix = ($('#course-prefix-input').val() as string).trim();
    updateCoursePrefix(prefix);
  });

  // 使面板可拖动
  makeDraggable(panel[0]);
}
