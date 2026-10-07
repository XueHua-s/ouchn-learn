/**
 * DOM 写入原语：fillEditable / fillTextarea + 校验重试 + Angular 兼容
 */

import { warn } from '@/types/exam';
import { getPageWindow } from '@/utils/page-runtime';

/** 触发 AngularJS $setViewValue + $apply */
export function triggerAngularUpdate(el: HTMLElement, value: string): void {
  try {
    const ng = getPageWindow(el).angular;
    if (!ng) return;
    const ngEl = ng.element(el);
    const ctrl = ngEl.controller?.('ngModel');
    if (ctrl?.$setViewValue) {
      ctrl.$setViewValue(value);
      ctrl.$render?.();
    }
    const scope = ngEl.scope?.();
    if (scope?.$apply) {
      scope.$apply();
    }
  } catch {
    // 忽略
  }
}

/** 向 contenteditable 元素填入文本 */
export function fillEditable(el: HTMLElement, text: string): void {
  el.focus();

  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  document.execCommand('delete', false);
  document.execCommand('insertText', false, text);

  if (!el.textContent || el.textContent.trim() !== text.trim()) {
    el.textContent = text;
  }

  ['input', 'change', 'blur', 'keyup', 'keydown', 'compositionend'].forEach((evt) => {
    el.dispatchEvent(new Event(evt, { bubbles: true, cancelable: true }));
  });

  triggerAngularUpdate(el, text);
}

/** 向 textarea 填入文本（使用原生 value setter 确保框架检测） */
export function fillTextarea(el: HTMLElement, text: string): void {
  if (!(el instanceof HTMLTextAreaElement)) return;

  el.focus();

  // 原生 setter 绕过框架拦截
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, text);
  } else {
    el.value = text;
  }

  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
  ['change', 'blur', 'keyup'].forEach((evt) => {
    el.dispatchEvent(new Event(evt, { bubbles: true, cancelable: true }));
  });

  triggerAngularUpdate(el, text);
}

/** 读回元素中的当前文本值 */
function readBackValue(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement) return el.value?.trim() || '';
  return el.textContent?.trim() || '';
}

/**
 * 写入后等待并校验读回值。
 * FIXED: 不做重试写入——AngularJS 页面上重复 execCommand 会破坏已写入的内容。
 * Angular digest 可延迟同步，因此重复读回而不重复 execCommand；空值或旧值不能算成功。
 */
export async function writeWithVerify(
  el: HTMLElement,
  text: string,
  writeFn: (el: HTMLElement, text: string) => void,
): Promise<boolean> {
  // 写入一次
  writeFn(el, text);

  const normalize = (value: string) =>
    value
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .trim();
  for (const delay of [200, 300, 500]) {
    await new Promise((r) => setTimeout(r, delay));
    if (el.isConnected && normalize(readBackValue(el)) === normalize(text)) return true;
  }
  warn('writeWithVerify: 写入后的值未通过校验');
  return false;
}

/**
 * 等待编辑器 DOM 元素出现（用于延迟挂载的组件）
 */
export async function waitForEditor(container: Element, selector: string, timeout = 3000): Promise<HTMLElement | null> {
  const existing = container.querySelector(selector) as HTMLElement;
  if (existing) return existing;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);

    const observer = new MutationObserver(() => {
      const el = container.querySelector(selector) as HTMLElement;
      if (el) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(container, { childList: true, subtree: true });
  });
}
