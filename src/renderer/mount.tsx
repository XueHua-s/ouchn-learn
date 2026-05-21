import { createRoot, type Root } from 'react-dom/client';
import { App } from './App';
import { detectPageMode } from './page-mode';
import { usePanelStore } from '@/store/panel-store';

const HOST_ID = 'ouchn-react-renderer-root';

let root: Root | null = null;
let routeListenersAttached = false;
let routePollTimer: number | null = null;
let retryTimer: number | null = null;

function updatePageMode(): void {
  usePanelStore.getState().setPageMode(detectPageMode());
}

function ensureHost(): HTMLElement | null {
  if (!document.body) return null;

  const existingHost = document.getElementById(HOST_ID);
  if (existingHost) return existingHost;

  const host = document.createElement('div');
  host.id = HOST_ID;
  document.body.appendChild(host);
  return host;
}

function attachRouteListeners(): void {
  if (routeListenersAttached) return;
  window.addEventListener('hashchange', updatePageMode);
  window.addEventListener('popstate', updatePageMode);
  routeListenersAttached = true;
}

function startRoutePolling(): void {
  if (routePollTimer !== null) return;

  let checkCount = 0;
  routePollTimer = window.setInterval(() => {
    checkCount++;
    updatePageMode();
    if (checkCount >= 10 && routePollTimer !== null) {
      window.clearInterval(routePollTimer);
      routePollTimer = null;
    }
  }, 3000);
}

export function mountOuchnRenderer(): void {
  const host = ensureHost();
  if (!host) {
    retryTimer = window.setTimeout(mountOuchnRenderer, 300);
    return;
  }

  if (retryTimer !== null) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }

  attachRouteListeners();
  startRoutePolling();
  updatePageMode();
  usePanelStore.getState().setMounted(true);

  if (root) return;

  root = createRoot(host, {
    onCaughtError(error) {
      console.error('[React渲染] 捕获组件错误:', error);
    },
    onRecoverableError(error) {
      console.warn('[React渲染] 可恢复错误:', error);
    },
    onUncaughtError(error) {
      console.error('[React渲染] 未捕获错误:', error);
    },
  });
  root.render(<App />);
}

export function unmountOuchnRenderer(): void {
  if (retryTimer !== null) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }

  if (routeListenersAttached) {
    window.removeEventListener('hashchange', updatePageMode);
    window.removeEventListener('popstate', updatePageMode);
    routeListenersAttached = false;
  }

  if (routePollTimer !== null) {
    window.clearInterval(routePollTimer);
    routePollTimer = null;
  }

  root?.unmount();
  root = null;
  usePanelStore.getState().setMounted(false);
  document.getElementById(HOST_ID)?.remove();
}
