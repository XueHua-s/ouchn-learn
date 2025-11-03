/**
 * 创建并注入样式
 */
export function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    /* 下载面板样式 */
    .download-panel {
      position: fixed;
      top: 80px;
      right: 20px;
      width: 320px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      z-index: 999998;
      font-family: 'Microsoft YaHei', Arial, sans-serif;
    }

    .download-header {
      background: rgba(0,0,0,0.2);
      padding: 12px 15px;
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-radius: 12px 12px 0 0;
    }

    .download-title {
      color: #fff;
      font-size: 16px;
      font-weight: bold;
      margin: 0;
    }

    .download-toggle {
      background: none;
      border: none;
      color: #fff;
      font-size: 20px;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
    }

    .download-body {
      padding: 15px;
      background: #fff;
      max-height: 500px;
      overflow-y: auto;
      border-radius: 0 0 12px 12px;
    }

    .download-body.collapsed {
      display: none;
    }

    .download-btn {
      width: 100%;
      padding: 10px;
      margin: 6px 0;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.3s;
    }

    .download-btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
    }

    .download-btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .download-btn-success {
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      color: #fff;
    }

    .download-btn-success:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(56, 239, 125, 0.4);
    }

    .download-status {
      padding: 8px;
      margin: 8px 0;
      border-radius: 6px;
      font-size: 12px;
      text-align: center;
    }

    .download-status-info {
      background: #e3f2fd;
      color: #1976d2;
    }

    .download-status-success {
      background: #e8f5e9;
      color: #388e3c;
    }

    .download-status-warning {
      background: #fff3e0;
      color: #f57c00;
    }

    .resource-list {
      max-height: 300px;
      overflow-y: auto;
      margin: 10px 0;
    }

    .resource-item {
      padding: 8px;
      margin: 5px 0;
      background: #f9f9f9;
      border-radius: 6px;
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-left: 3px solid #667eea;
    }

    .resource-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 8px;
    }

    .resource-download-btn {
      padding: 4px 10px;
      background: #667eea;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      white-space: nowrap;
    }

    .resource-download-btn:hover {
      background: #5568d3;
    }
  `;
  document.head.appendChild(style);
}
