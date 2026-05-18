/**
 * Tampermonkey 沙箱 → 页面运行时的访问层。
 *
 * 设计意图：脚本运行在 Tampermonkey 沙箱中，但需要触达页面真实的 `window`、AngularJS、
 *          jQuery 与原生构造器（DragEvent / DataTransfer 等）。各 exam 模块过去都各自
 *          维护一份 `PageWindow` 类型与 `getPageWindow()` 实现，造成 3 处副本同步问题。
 *          这里收敛为一处事实来源，下游只允许从本模块导入。
 *
 * 不要在 src/modules/* 重新声明 `Angular*` 类型或重写 `getPageWindow`；要扩展能力请回到本文件。
 */

export type AngularNgModelController = {
  $setViewValue?: (value: string) => void;
  $render?: () => void;
  $modelValue?: unknown;
  $viewValue?: unknown;
};

export type AngularScope = {
  $apply?: () => void;
  $eval?: (expression: string, locals?: Record<string, unknown>) => unknown;
  $evalAsync?: () => void;
  $parent?: AngularScope;
  [key: string]: unknown;
};

export type AngularInjector = {
  get?: (name: string) => unknown;
};

export type AngularParseResult = {
  assign?: (scope: AngularScope, value: unknown) => void;
};

export type AngularParse = (expression: string) => AngularParseResult;

export type AngularElement = {
  controller?: (name: string) => AngularNgModelController | undefined;
  injector?: () => AngularInjector | undefined;
  scope?: () => AngularScope | undefined;
  isolateScope?: () => AngularScope | undefined;
};

export type AngularGlobal = {
  element: (el: Element) => AngularElement;
};

export type PageWindow = Window &
  typeof globalThis & {
    angular?: AngularGlobal;
    jQuery?: JQueryStatic;
    $?: JQueryStatic;
  };

/**
 * 获取页面真实 window：优先 Tampermonkey 的 `unsafeWindow`，其次以传入元素的 `ownerDocument`
 * 兜底（处理 iframe / shadow root 情况），最后退回到当前作用域的 `window`。
 *
 * 传 `element` 是因为脚本可能从 iframe 内 DOM 节点回溯，直接用 `window` 会跨上下文丢失 Angular。
 */
export function getPageWindow(element?: Element): PageWindow {
  const unsafeWin = (globalThis as unknown as { unsafeWindow?: PageWindow }).unsafeWindow;
  return unsafeWin || (element?.ownerDocument.defaultView as PageWindow | null) || (window as unknown as PageWindow);
}
