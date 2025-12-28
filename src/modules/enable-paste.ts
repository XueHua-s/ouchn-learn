const HOMEWORK_EDITOR_SELECTOR = '.simditor-body, textarea[disabled-paste], textarea[sim-editor]';

const CLIPBOARD_EVENTS: Array<keyof HTMLElementEventMap> = ['paste', 'copy', 'cut'];

function allowClipboardEvents(element: HTMLElement): void {
  if ((element as HTMLElement).dataset.clipboardUnlocked === 'true') {
    return;
  }

  element.dataset.clipboardUnlocked = 'true';

  if (element instanceof HTMLTextAreaElement) {
    element.removeAttribute('disabled-paste');
  }

  element.onpaste = null;
  element.oncopy = null;
  element.oncut = null;

  // Avoid blocking editor paste handlers on contenteditable nodes.
  if (!(element instanceof HTMLTextAreaElement)) {
    return;
  }

  for (const eventName of CLIPBOARD_EVENTS) {
    element.addEventListener(
      eventName,
      (event) => {
        event.stopImmediatePropagation();
      },
      true,
    );
  }
}

function scanAndUnlock(): void {
  document.querySelectorAll<HTMLElement>(HOMEWORK_EDITOR_SELECTOR).forEach((element) => {
    allowClipboardEvents(element);
  });
}

export function enableHomeworkCopyPaste(): void {
  scanAndUnlock();

  const observer = new MutationObserver(() => {
    scanAndUnlock();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled-paste'],
  });
}
