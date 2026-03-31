/**
 * 全局样式注入
 *
 * 设计方向：Industrial-Tech — 深色面板、高对比强调色、精确的间距与交互态
 * 避免：紫色渐变+白底、Arial/Inter 等泛用字体
 */
export function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    /* ========== 主题变量 ========== */
    .ouchn-panel {
      --panel-bg: #1a1d23;
      --panel-surface: #22262e;
      --panel-border: #2e333d;
      --panel-radius: 10px;

      --text-primary: #e8eaed;
      --text-secondary: #9aa0a8;
      --text-muted: #6b737e;

      --accent: #00d4aa;
      --accent-hover: #00f0c0;
      --accent-glow: rgba(0, 212, 170, 0.25);

      --warn: #f0a030;
      --warn-glow: rgba(240, 160, 48, 0.2);

      --danger: #f05050;
      --danger-bg: rgba(240, 80, 80, 0.12);

      --success-bg: rgba(0, 212, 170, 0.1);
      --info-bg: rgba(96, 165, 250, 0.1);
      --info-text: #60a5fa;

      --font-body: 'PingFang SC', 'Noto Sans SC', 'Source Han Sans CN', system-ui, sans-serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;

      --shadow-panel: 0 8px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--panel-border);
      --shadow-btn: 0 2px 8px rgba(0, 0, 0, 0.3);

      --transition-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
      --transition-normal: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* ========== 面板容器 ========== */
    .ouchn-panel {
      position: fixed;
      top: 80px;
      right: 20px;
      width: 320px;
      background: var(--panel-bg);
      border-radius: var(--panel-radius);
      box-shadow: var(--shadow-panel);
      z-index: 999998;
      font-family: var(--font-body);
      font-size: 13px;
      color: var(--text-primary);
      opacity: 0;
      transform: translateY(-12px) scale(0.98);
      animation: ouchn-panel-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes ouchn-panel-in {
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* ========== 面板头部 ========== */
    .ouchn-panel-header {
      background: var(--panel-surface);
      padding: 10px 14px;
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-radius: var(--panel-radius) var(--panel-radius) 0 0;
      border-bottom: 1px solid var(--panel-border);
      user-select: none;
    }

    .ouchn-panel-title {
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 600;
      margin: 0;
      letter-spacing: 0.3px;
    }

    .ouchn-panel-toggle {
      background: none;
      border: 1px solid var(--panel-border);
      color: var(--text-secondary);
      font-size: 14px;
      cursor: pointer;
      padding: 0;
      width: 22px;
      height: 22px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--transition-fast);
      line-height: 1;
    }

    .ouchn-panel-toggle:hover {
      background: var(--panel-border);
      color: var(--text-primary);
    }

    /* ========== 面板主体 ========== */
    .ouchn-panel-body {
      padding: 14px;
      background: var(--panel-bg);
      max-height: 520px;
      overflow-y: auto;
      border-radius: 0 0 var(--panel-radius) var(--panel-radius);
      transition: max-height var(--transition-normal), padding var(--transition-normal), opacity var(--transition-normal);
    }

    .ouchn-panel-body.collapsed {
      max-height: 0;
      padding-top: 0;
      padding-bottom: 0;
      opacity: 0;
      overflow: hidden;
    }

    .ouchn-panel-body::-webkit-scrollbar {
      width: 4px;
    }

    .ouchn-panel-body::-webkit-scrollbar-track {
      background: transparent;
    }

    .ouchn-panel-body::-webkit-scrollbar-thumb {
      background: var(--panel-border);
      border-radius: 2px;
    }

    /* ========== 按钮系统 ========== */
    .ouchn-btn {
      width: 100%;
      padding: 9px 12px;
      margin: 5px 0;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      font-family: var(--font-body);
      cursor: pointer;
      transition: all var(--transition-fast);
      position: relative;
      letter-spacing: 0.2px;
    }

    .ouchn-btn:active {
      transform: scale(0.98);
    }

    .ouchn-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      transform: none !important;
      box-shadow: none !important;
    }

    .ouchn-btn-primary {
      background: var(--accent);
      color: #0a0f14;
      box-shadow: var(--shadow-btn);
    }

    .ouchn-btn-primary:hover:not(:disabled) {
      background: var(--accent-hover);
      box-shadow: 0 4px 16px var(--accent-glow);
    }

    .ouchn-btn-secondary {
      background: var(--panel-surface);
      color: var(--text-primary);
      border: 1px solid var(--panel-border);
    }

    .ouchn-btn-secondary:hover:not(:disabled) {
      background: var(--panel-border);
      border-color: var(--text-muted);
    }

    .ouchn-btn-success {
      background: linear-gradient(135deg, #059669, #10b981);
      color: #fff;
      box-shadow: var(--shadow-btn);
    }

    .ouchn-btn-success:hover:not(:disabled) {
      box-shadow: 0 4px 16px rgba(16, 185, 129, 0.35);
    }

    .ouchn-btn-warning {
      background: var(--warn);
      color: #1a1d23;
      box-shadow: var(--shadow-btn);
    }

    .ouchn-btn-warning:hover:not(:disabled) {
      box-shadow: 0 4px 16px var(--warn-glow);
    }

    /* ========== 状态提示 ========== */
    .ouchn-status {
      padding: 8px 10px;
      margin: 6px 0;
      border-radius: 6px;
      font-size: 12px;
      text-align: center;
      border: 1px solid transparent;
      transition: all var(--transition-fast);
    }

    .ouchn-status-info {
      background: var(--info-bg);
      color: var(--info-text);
      border-color: rgba(96, 165, 250, 0.2);
    }

    .ouchn-status-success {
      background: var(--success-bg);
      color: var(--accent);
      border-color: rgba(0, 212, 170, 0.2);
    }

    .ouchn-status-warning {
      background: var(--danger-bg);
      color: var(--danger);
      border-color: rgba(240, 80, 80, 0.2);
    }

    /* ========== 表单控件 ========== */
    .ouchn-input,
    .ouchn-textarea {
      width: 100%;
      padding: 8px 10px;
      background: var(--panel-surface);
      border: 1px solid var(--panel-border);
      border-radius: 6px;
      color: var(--text-primary);
      font-family: var(--font-body);
      font-size: 13px;
      box-sizing: border-box;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
      outline: none;
    }

    .ouchn-input:focus,
    .ouchn-textarea:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px var(--accent-glow);
    }

    .ouchn-input::placeholder,
    .ouchn-textarea::placeholder {
      color: var(--text-muted);
    }

    .ouchn-textarea {
      resize: vertical;
      min-height: 56px;
    }

    .ouchn-label {
      font-size: 11px;
      color: var(--text-secondary);
      display: block;
      margin-bottom: 4px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .ouchn-field {
      margin-bottom: 10px;
    }

    .ouchn-input-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 8px 0;
    }

    .ouchn-input-row .ouchn-label {
      margin-bottom: 0;
    }

    .ouchn-input-sm {
      width: 80px;
      padding: 5px 8px;
      text-align: center;
      font-family: var(--font-mono);
      font-size: 13px;
    }

    /* ========== Tab 切换 ========== */
    .ouchn-tabs {
      display: flex;
      gap: 2px;
      margin-bottom: 12px;
      background: var(--panel-surface);
      border-radius: 6px;
      padding: 2px;
    }

    .ouchn-tab {
      flex: 1;
      padding: 7px 8px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
      font-family: var(--font-body);
      transition: all var(--transition-fast);
      letter-spacing: 0.3px;
    }

    .ouchn-tab:hover {
      color: var(--text-secondary);
      background: rgba(255, 255, 255, 0.04);
    }

    .ouchn-tab.active {
      background: var(--accent);
      color: #0a0f14;
    }

    /* ========== 分隔线 ========== */
    .ouchn-divider {
      margin: 12px 0;
      border: none;
      border-top: 1px solid var(--panel-border);
    }

    /* ========== 旧 class 兼容层（过渡用，面板内联模板引用） ========== */
    .download-panel { /* 兼容旧 panel.ts / exam-panel.ts 的 selector */ }
    .download-header { /* 兼容 makeDraggable 查找 */ }
  `;
  document.head.appendChild(style);
}
