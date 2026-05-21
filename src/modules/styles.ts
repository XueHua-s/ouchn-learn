/**
 * 全局样式注入
 *
 * UI 方向：shadcn-style light workbench。
 * 说明：Userscript 产物是单文件 IIFE，不能依赖页面外部 CSS 资产；这里注入一组
 * scoped Tailwind utilities，React 组件用 Tailwind className 渲染，避免污染 OUCHN 页面。
 */
export function injectStyles(): void {
  const existing = document.getElementById('ouchn-tailwind-runtime-style');
  if (existing) return;

  const style = document.createElement('style');
  style.id = 'ouchn-tailwind-runtime-style';
  style.textContent = `
    #ouchn-react-renderer-root {
      position: relative;
      z-index: 999998;
      color-scheme: light;
      font-family: ui-sans-serif, 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif;
    }

    #ouchn-react-renderer-root *,
    #ouchn-react-renderer-root *::before,
    #ouchn-react-renderer-root *::after {
      box-sizing: border-box;
    }

    .ouchn-panel {
      position: fixed;
      top: 80px;
      right: 20px;
      width: 360px;
      max-width: calc(100vw - 24px);
      z-index: 999998;
      opacity: 0;
      transform: translateY(-10px) scale(0.985);
      animation: ouchn-panel-in 0.26s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      font-size: 14px;
      line-height: 1.4;
    }

    @media (max-width: 480px) {
      .ouchn-panel {
        right: 12px;
        width: calc(100vw - 24px);
      }
    }

    @keyframes ouchn-panel-in {
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .ouchn-panel-body {
      max-height: min(620px, calc(100vh - 120px));
      overflow-y: auto;
      transition: max-height 160ms ease, padding 160ms ease, opacity 160ms ease;
    }

    .ouchn-panel-body.collapsed {
      max-height: 0;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      opacity: 0;
      overflow: hidden;
    }

    .ouchn-panel-body::-webkit-scrollbar { width: 8px; }
    .ouchn-panel-body::-webkit-scrollbar-track { background: transparent; }
    .ouchn-panel-body::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border: 2px solid transparent;
      border-radius: 9999px;
      background-clip: content-box;
    }

    #ouchn-react-renderer-root .flex { display: flex; }
    #ouchn-react-renderer-root .inline-flex { display: inline-flex; }
    #ouchn-react-renderer-root .grid { display: grid; }
    #ouchn-react-renderer-root .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    #ouchn-react-renderer-root .items-start { align-items: flex-start; }
    #ouchn-react-renderer-root .items-center { align-items: center; }
    #ouchn-react-renderer-root .justify-center { justify-content: center; }
    #ouchn-react-renderer-root .justify-between { justify-content: space-between; }
    #ouchn-react-renderer-root .gap-1 { gap: 0.25rem; }
    #ouchn-react-renderer-root .gap-2 { gap: 0.5rem; }
    #ouchn-react-renderer-root .gap-3 { gap: 0.75rem; }
    #ouchn-react-renderer-root .space-y-1 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.25rem; }
    #ouchn-react-renderer-root .space-y-2 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.5rem; }
    #ouchn-react-renderer-root .space-y-3 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.75rem; }

    #ouchn-react-renderer-root .m-0 { margin: 0; }
    #ouchn-react-renderer-root .mb-3 { margin-bottom: 0.75rem; }
    #ouchn-react-renderer-root .ml-auto { margin-left: auto; }
    #ouchn-react-renderer-root .mt-0\\.5 { margin-top: 0.125rem; }
    #ouchn-react-renderer-root .p-0 { padding: 0; }
    #ouchn-react-renderer-root .p-1 { padding: 0.25rem; }
    #ouchn-react-renderer-root .p-3 { padding: 0.75rem; }
    #ouchn-react-renderer-root .p-4 { padding: 1rem; }
    #ouchn-react-renderer-root .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
    #ouchn-react-renderer-root .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
    #ouchn-react-renderer-root .px-4 { padding-left: 1rem; padding-right: 1rem; }
    #ouchn-react-renderer-root .py-0\\.5 { padding-top: 0.125rem; padding-bottom: 0.125rem; }
    #ouchn-react-renderer-root .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
    #ouchn-react-renderer-root .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
    #ouchn-react-renderer-root .py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }

    #ouchn-react-renderer-root .h-4 { height: 1rem; }
    #ouchn-react-renderer-root .h-8 { height: 2rem; }
    #ouchn-react-renderer-root .h-9 { height: 2.25rem; }
    #ouchn-react-renderer-root .h-10 { height: 2.5rem; }
    #ouchn-react-renderer-root .min-h-16 { min-height: 4rem; }
    #ouchn-react-renderer-root .w-4 { width: 1rem; }
    #ouchn-react-renderer-root .w-8 { width: 2rem; }
    #ouchn-react-renderer-root .w-9 { width: 2.25rem; }
    #ouchn-react-renderer-root .w-20 { width: 5rem; }
    #ouchn-react-renderer-root .w-full { width: 100%; }
    #ouchn-react-renderer-root .min-w-0 { min-width: 0; }
    #ouchn-react-renderer-root .shrink-0 { flex-shrink: 0; }

    #ouchn-react-renderer-root .cursor-move { cursor: move; }
    #ouchn-react-renderer-root .cursor-pointer { cursor: pointer; }
    #ouchn-react-renderer-root .select-none { user-select: none; }
    #ouchn-react-renderer-root .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #ouchn-react-renderer-root .rounded-md { border-radius: 0.375rem; }
    #ouchn-react-renderer-root .rounded-lg { border-radius: 0.5rem; }
    #ouchn-react-renderer-root .rounded-xl { border-radius: 0.75rem; }
    #ouchn-react-renderer-root .rounded-full { border-radius: 9999px; }
    #ouchn-react-renderer-root .rounded-t-xl { border-top-left-radius: 0.75rem; border-top-right-radius: 0.75rem; }
    #ouchn-react-renderer-root .border { border-width: 1px; border-style: solid; }
    #ouchn-react-renderer-root .border-b { border-bottom-width: 1px; border-bottom-style: solid; }
    #ouchn-react-renderer-root .border-transparent { border-color: transparent; }
    #ouchn-react-renderer-root .border-slate-200 { border-color: #e2e8f0; }
    #ouchn-react-renderer-root .border-slate-300 { border-color: #cbd5e1; }
    #ouchn-react-renderer-root .border-teal-200 { border-color: #99f6e4; }
    #ouchn-react-renderer-root .border-sky-200 { border-color: #bae6fd; }
    #ouchn-react-renderer-root .border-emerald-200 { border-color: #a7f3d0; }
    #ouchn-react-renderer-root .border-amber-200 { border-color: #fde68a; }
    #ouchn-react-renderer-root .border-rose-200 { border-color: #fecdd3; }

    #ouchn-react-renderer-root .bg-transparent { background-color: transparent; }
    #ouchn-react-renderer-root .bg-white { background-color: #ffffff; }
    #ouchn-react-renderer-root .bg-slate-50 { background-color: #f8fafc; }
    #ouchn-react-renderer-root .bg-slate-100 { background-color: #f1f5f9; }
    #ouchn-react-renderer-root .bg-teal-50 { background-color: #f0fdfa; }
    #ouchn-react-renderer-root .bg-teal-700 { background-color: #0f766e; }
    #ouchn-react-renderer-root .bg-emerald-50 { background-color: #ecfdf5; }
    #ouchn-react-renderer-root .bg-emerald-600 { background-color: #059669; }
    #ouchn-react-renderer-root .bg-amber-50 { background-color: #fffbeb; }
    #ouchn-react-renderer-root .bg-amber-500 { background-color: #f59e0b; }
    #ouchn-react-renderer-root .bg-rose-50 { background-color: #fff1f2; }
    #ouchn-react-renderer-root .bg-rose-600 { background-color: #e11d48; }
    #ouchn-react-renderer-root .bg-sky-50 { background-color: #f0f9ff; }

    #ouchn-react-renderer-root .text-center { text-align: center; }
    #ouchn-react-renderer-root .text-xs { font-size: 0.75rem; line-height: 1rem; }
    #ouchn-react-renderer-root .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
    #ouchn-react-renderer-root .font-medium { font-weight: 500; }
    #ouchn-react-renderer-root .font-semibold { font-weight: 600; }
    #ouchn-react-renderer-root .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    #ouchn-react-renderer-root .text-white { color: #ffffff; }
    #ouchn-react-renderer-root .text-slate-950 { color: #020617; }
    #ouchn-react-renderer-root .text-slate-900 { color: #0f172a; }
    #ouchn-react-renderer-root .text-slate-700 { color: #334155; }
    #ouchn-react-renderer-root .text-slate-600 { color: #475569; }
    #ouchn-react-renderer-root .text-slate-500 { color: #64748b; }
    #ouchn-react-renderer-root .text-slate-400 { color: #94a3b8; }
    #ouchn-react-renderer-root .text-teal-700 { color: #0f766e; }
    #ouchn-react-renderer-root .text-sky-800 { color: #075985; }
    #ouchn-react-renderer-root .text-emerald-800 { color: #065f46; }
    #ouchn-react-renderer-root .text-amber-900 { color: #78350f; }
    #ouchn-react-renderer-root .text-rose-800 { color: #9f1239; }

    #ouchn-react-renderer-root .shadow-sm { box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08); }
    #ouchn-react-renderer-root .shadow-2xl {
      box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(15, 23, 42, 0.04);
    }
    #ouchn-react-renderer-root .transition-colors {
      transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;
      transition-duration: 150ms;
      transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }

    #ouchn-react-renderer-root .placeholder\\:text-slate-400::placeholder { color: #94a3b8; }
    #ouchn-react-renderer-root .hover\\:bg-slate-50:hover { background-color: #f8fafc; }
    #ouchn-react-renderer-root .hover\\:bg-slate-100:hover { background-color: #f1f5f9; }
    #ouchn-react-renderer-root .hover\\:bg-white:hover { background-color: #ffffff; }
    #ouchn-react-renderer-root .hover\\:bg-teal-800:hover { background-color: #115e59; }
    #ouchn-react-renderer-root .hover\\:bg-emerald-700:hover { background-color: #047857; }
    #ouchn-react-renderer-root .hover\\:bg-amber-600:hover { background-color: #d97706; }
    #ouchn-react-renderer-root .hover\\:bg-rose-700:hover { background-color: #be123c; }
    #ouchn-react-renderer-root .hover\\:text-slate-950:hover { color: #020617; }
    #ouchn-react-renderer-root .focus-visible\\:outline-none:focus-visible { outline: 2px solid transparent; outline-offset: 2px; }
    #ouchn-react-renderer-root .focus-visible\\:ring-2:focus-visible {
      box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #0f766e;
    }
    #ouchn-react-renderer-root .focus-visible\\:ring-teal-700:focus-visible {
      --ouchn-ring-color: #0f766e;
    }
    #ouchn-react-renderer-root .disabled\\:cursor-not-allowed:disabled { cursor: not-allowed; }
    #ouchn-react-renderer-root .disabled\\:opacity-50:disabled { opacity: 0.5; }

    #ouchn-react-renderer-root button,
    #ouchn-react-renderer-root input,
    #ouchn-react-renderer-root textarea {
      font: inherit;
    }

    #ouchn-react-renderer-root input,
    #ouchn-react-renderer-root textarea {
      outline: none;
    }

    #ouchn-react-renderer-root textarea {
      resize: vertical;
    }

    #ouchn-react-renderer-root button {
      -webkit-tap-highlight-color: transparent;
    }

    #ouchn-react-renderer-root button:not(:disabled) {
      transition-property: color, background-color, border-color, box-shadow, transform;
      transition-duration: 150ms;
      transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }

    #ouchn-react-renderer-root button:not(:disabled):active {
      transform: translateY(1px);
    }

    #ouchn-react-renderer-root .ouchn-provider-tabs {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.375rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.5rem;
      background: #e2e8f0;
      padding: 0.25rem;
      box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.08);
    }

    #ouchn-react-renderer-root .ouchn-provider-tab {
      position: relative;
      display: inline-flex;
      height: 2.375rem;
      min-width: 0;
      align-items: center;
      justify-content: center;
      gap: 0.375rem;
      border: 1px solid transparent;
      border-radius: 0.375rem;
      background: transparent;
      color: #475569;
      cursor: pointer;
      font-size: 0.75rem;
      font-weight: 700;
      line-height: 1rem;
      outline: none;
    }

    #ouchn-react-renderer-root .ouchn-provider-tab::before {
      content: '';
      width: 0.375rem;
      height: 0.375rem;
      border-radius: 9999px;
      background: #94a3b8;
      box-shadow: 0 0 0 0 rgba(15, 118, 110, 0);
      transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1),
        box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    #ouchn-react-renderer-root .ouchn-provider-tab:hover {
      border-color: #cbd5e1;
      background: #f8fafc;
      color: #0f172a;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
    }

    #ouchn-react-renderer-root .ouchn-provider-tab[aria-selected='true'] {
      border-color: #0f766e;
      background: #0f766e;
      color: #ffffff;
      box-shadow: 0 6px 14px rgba(15, 118, 110, 0.26);
    }

    #ouchn-react-renderer-root .ouchn-provider-tab[aria-selected='true']::before {
      background: #ffffff;
      box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.22);
    }

    #ouchn-react-renderer-root .ouchn-provider-tab[aria-selected='true']:hover {
      background: #115e59;
      border-color: #115e59;
      color: #ffffff;
    }

    #ouchn-react-renderer-root .ouchn-provider-tab:focus-visible {
      box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #0f766e;
    }

    #ouchn-react-renderer-root .ouchn-provider-tab[aria-selected='true']:focus-visible {
      box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #0f766e, 0 6px 14px rgba(15, 118, 110, 0.26);
    }

    #ouchn-react-renderer-root .ouchn-status-row {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
    }

    #ouchn-react-renderer-root .ouchn-status-text {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    #ouchn-react-renderer-root .ouchn-progress-track {
      height: 0.25rem;
      margin-top: 0.5rem;
      overflow: hidden;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.7);
    }

    #ouchn-react-renderer-root .ouchn-progress-fill {
      height: 100%;
      border-radius: inherit;
      background: currentColor;
      opacity: 0.72;
      transition: width 180ms ease;
    }

    .ouchn-btn {
      width: 100%;
      border-radius: 0.375rem;
      border: 1px solid #cbd5e1;
      padding: 0.5rem 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }

    .ouchn-btn-primary,
    .ouchn-btn-success {
      background: #0f766e;
      color: #ffffff;
    }

    .ouchn-btn-secondary {
      background: #ffffff;
      color: #334155;
    }

    .ouchn-btn-warning {
      background: #f59e0b;
      color: #020617;
    }

    .ouchn-status {
      border-radius: 0.375rem;
      border: 1px solid #e2e8f0;
      padding: 0.5rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .ouchn-status-info {
      border-color: #bae6fd;
      background: #f0f9ff;
      color: #075985;
    }

    .ouchn-status-success {
      border-color: #a7f3d0;
      background: #ecfdf5;
      color: #065f46;
    }

    .ouchn-status-warning {
      border-color: #fde68a;
      background: #fffbeb;
      color: #78350f;
    }
  `;
  document.head.appendChild(style);
}
