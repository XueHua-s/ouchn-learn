import { createRoot, type Root } from 'react-dom/client';
import { App } from './App';
import { detectPageMode } from './page-mode';
import { usePanelStore } from '@/store/panel-store';

const HOST_ID = 'ouchn-react-renderer-root';

let root: Root | null = null;
let routeListenersAttached = false;
let routePollTimer: number | null = null;
let retryTimer: number | null = null;
let lastObservedHref = window.location.href;

function updatePageMode(): void {
  lastObservedHref = window.location.href;
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

  // OUCHN 的 Angular/Vue 页面存在只调用 history.pushState/replaceState 的跳转；
  // hashchange/popstate 不一定触发，因此持续轻量比较 URL，只有变化时才更新 store。
  routePollTimer = window.setInterval(() => {
    if (window.location.href === lastObservedHref) return;
    lastObservedHref = window.location.href;
    updatePageMode();
  }, 1000);
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
