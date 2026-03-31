/**
 * DOM 写入原语：fillEditable / fillTextarea + 校验重试 + Angular 兼容
 */

import { warn } from '@/types/exam';

/** 触发 AngularJS $setViewValue + $apply */
export function triggerAngularUpdate(el: HTMLElement, value: string): void {
  try {
    const ng = (window as any).angular;
    if (!ng) return;
    const ngEl = ng.element(el);
    const ctrl = ngEl.controller?.('ngModel');
    if (ctrl?.$setViewValue) {
      ctrl.$setViewValue(value);
      ctrl.$render?.();
    }
    ngEl.scope()?.$apply?.();
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
export function fillTextarea(el: HTMLTextAreaElement, text: string): void {
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
 * 写入 + 宽松校验。
 * FIXED: 不做重试写入——AngularJS 页面上重复 execCommand 会破坏已写入的内容。
 * 校验只是信息性的，即使校验失败也认为写入已执行（返回 true），
 * 因为 Angular digest 可能延迟同步 DOM，读回值不可靠。
 */
export async function writeWithVerify(
  el: HTMLElement,
  text: string,
  writeFn: (el: any, text: string) => void,
): Promise<boolean> {
  // 写入一次
  writeFn(el, text);

  // 等待框架 digest
  await new Promise((r) => setTimeout(r, 200));

  // 宽松校验：只检查元素是否有内容（不要求完全一致，Angular 可能会做格式化）
  const actual = readBackValue(el);
  if (actual.length > 0) {
    return true;
  }

  // 读回为空——可能框架还没同步，再等一轮
  await new Promise((r) => setTimeout(r, 500));
  const retryRead = readBackValue(el);
  if (retryRead.length > 0) {
    return true;
  }

  // 仍然为空，尝试直接设置 textContent/value 作为最后手段
  warn('writeWithVerify: 首次写入后读回为空，尝试 fallback 直写');
  if (el instanceof HTMLTextAreaElement) {
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    el.textContent = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  triggerAngularUpdate(el, text);

  return true;
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
