/**
 * 匹配题专用：DOM 侦测 + 答案解析 + 多级 fallback 填写
 */

import type { AnswerValue, Question } from '@/types/exam';
import { warn } from '@/types/exam';
import { getPageWindow, type AngularScope } from '@/utils/page-runtime';
import { buildMatchingPlan, normalizeMatchingText, type MatchingPlan } from './matching-answer';

type MatchingOptionLike = {
  id?: string | number;
  content?: string;
  [key: string]: unknown;
};

type MatchingSubSubjectLike = {
  note?: MatchingOptionLike;
  answer_number?: string | number;
  answeredOption?: string | number;
  [key: string]: unknown;
};

type MatchingSubjectLike = {
  options?: MatchingOptionLike[];
  sub_subjects?: MatchingSubSubjectLike[];
  [key: string]: unknown;
};

function cleanVisibleText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function getPrimaryText(element: Element): string {
  const directText = Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || '')
    .join(' ')
    .trim();
  if (directText) return cleanVisibleText(directText);

  return cleanVisibleText(
    element.querySelector('.content-center')?.firstElementChild?.textContent || element.textContent || '',
  );
}

function textsMatch(candidate: string, expected: string): boolean {
  const a = normalizeMatchingText(candidate);
  return a.length > 0 && a === normalizeMatchingText(expected);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function getAngularScope(subjectEl: Element): AngularScope | null {
  try {
    const ng = getPageWindow(subjectEl).angular;
    const wrapped = ng?.element(subjectEl);
    return wrapped?.scope?.() || wrapped?.isolateScope?.() || null;
  } catch {
    return null;
  }
}

/**
 * 填写匹配题（多级 fallback）
 */
export async function fillMatchingQuestion(
  subjectEl: Element,
  question: Question,
  answer: AnswerValue,
): Promise<boolean> {
  const plan = buildMatchingPlan(question, answer);
  if (!plan.ok) {
    warn('题目 ' + question.displayIndex + ': ' + plan.message);
    return false;
  }
  // FIXED: 必须逐槽核对，不能以派发事件或部分写入冒充整题成功。
  if (!subjectEl.isConnected || getOuchnMatchingRows(subjectEl).length !== plan.pairs.length) return false;
  const scope = getAngularScope(subjectEl);
  if (scope && resolveSubjectFromScope(scope)) {
    // 已识别平台模型时，只走平台保存链路；失败后不能再猜测其他字段覆盖答案。
    return (await tryOuchnAngularModel(subjectEl, plan.pairs)) && (await verifyMatchingResult(subjectEl, plan.pairs));
  }

  // FIXED: 沙箱无法读取 Angular scope 时保留已知 OUCHN 拖拽结构的兼容路径。
  // 源选项按稳定 ID 定位，目标按提取时的槽位序号定位，不点击任意按钮或猜测 ng-model。
  for (const drag of [dispatchDragCloneable, humanLikeDrag]) {
    const rows = getOuchnMatchingRows(subjectEl);
    const sources = Array.from(subjectEl.querySelectorAll<HTMLElement>('.answer-pool .clone-area.drag-area'));
    for (const { key, option } of plan.pairs) {
      const candidates = sources.filter((source) => {
        const id = getOptionId(source);
        return id ? id === option.value : textsMatch(getPrimaryText(source), option.content);
      });
      const target = rows[Number(key) - 1]?.querySelector<HTMLElement>('[drag-type="to"]');
      if (candidates.length !== 1 || !target) return false;
      await drag(candidates[0], target);
    }
    if (await verifyMatchingResult(subjectEl, plan.pairs)) return true;
  }
  warn('题目 ' + question.displayIndex + ': 匹配槽位未通过写入校验');
  return false;
}

function getOptionId(element: Element | null | undefined): string | undefined {
  return element?.getAttribute('data-option-id') || element?.id.match(/^drag-node-(\d+)$/)?.[1];
}

function resolveSubjectFromScope(scope: AngularScope): MatchingSubjectLike | null {
  const directSubject = scope.subject;
  if (isObjectRecord(directSubject) && directSubject.type === 'matching' && Array.isArray(directSubject.sub_subjects)) {
    return directSubject as MatchingSubjectLike;
  }

  for (const value of Object.values(scope)) {
    if (isObjectRecord(value) && value.type === 'matching' && Array.isArray(value.sub_subjects)) {
      return value as MatchingSubjectLike;
    }
  }

  return null;
}

/** 验证 DOM 槽位与平台模型均对应目标选项；等待渲染，但不重复写入。 */
async function verifyMatchingResult(subjectEl: Element, pairs: MatchingPlan): Promise<boolean> {
  const check = () => {
    const rows = getOuchnMatchingRows(subjectEl);
    const scope = getAngularScope(subjectEl);
    const model = scope ? resolveSubjectFromScope(scope) : null;
    return (
      subjectEl.isConnected &&
      rows.length === pairs.length &&
      pairs.every(({ key, option }) => {
        const index = Number(key) - 1;
        const target = rows[index]?.querySelector('[drag-type="to"]');
        const clone = target?.querySelector('.clone-area');
        const id = getOptionId(clone);
        const domMatches = id
          ? id === option.value
          : Boolean(target && textsMatch(getPrimaryText(target), option.content));
        const slot = model?.sub_subjects?.[index];
        return (
          domMatches &&
          (!model ||
            (String(slot?.answer_number) === option.value &&
              String(slot?.answeredOption) === option.value &&
              String(slot?.note?.id) === option.value))
        );
      })
    );
  };
  if (check()) return true;
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (check()) return true;
  }
  return false;
}

async function tryOuchnAngularModel(subjectEl: Element, pairs: MatchingPlan): Promise<boolean> {
  const scope = getAngularScope(subjectEl);
  const subject = scope ? resolveSubjectFromScope(scope) : null;
  if (!scope || !subject?.sub_subjects?.length || !subject.options?.length) return false;
  if (subject.sub_subjects.length !== pairs.length) return false;
  const writes = pairs.map(({ key, option }) => ({
    slot: subject.sub_subjects?.[Number(key) - 1],
    option: subject.options?.find((candidate) => String(candidate.id) === option.value),
  }));
  if (writes.some((write) => !write.slot || !write.option)) return false;
  let saveScope: AngularScope | undefined = scope;
  while (saveScope && typeof saveScope.onChangeSubmission !== 'function') saveScope = saveScope.$parent;
  if (!saveScope) return false;
  // FIXED: 全量解析成功才修改模型；只写已确认的字段，不能强行把未填满的题标为已完成。
  for (const write of writes) {
    write.slot!.note = write.option!;
    write.slot!.answer_number = write.option!.id;
    // 平台 collectAnswerData 读取 answeredOption；只改变 note/answer_number 会出现显示已填但提交为空。
    write.slot!.answeredOption = write.option!.id;
  }
  try {
    scope.$apply?.();
  } catch {
    scope.$evalAsync?.();
  }
  // 平台 onChangeSubmission 接收当前匹配题。dragAddCallback 会重新解析拖拽 DOM，
  // 直接模型写入时调用它可能以尚未渲染的旧节点覆盖新答案，因此只通知保存回调。
  (saveScope.onChangeSubmission as (value: MatchingSubjectLike) => void).call(saveScope, subject);
  return true;
}

function getOuchnMatchingRows(subjectEl: Element): HTMLElement[] {
  return Array.from(subjectEl.querySelectorAll('.matching-answer-box > ul > li')).filter((row) => {
    return row.querySelector('[drag-type="to"]') && row.querySelector('.list-panel:not(.option):not(.panel-desc)');
  }) as HTMLElement[];
}

function createDragEvent(type: string, dataTransfer: DataTransfer): DragEvent | Event {
  const pageWin = getPageWindow();
  try {
    return new pageWin.DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
  } catch {
    const event = new pageWin.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
    return event;
  }
}

function dispatchDragCloneable(source: HTMLElement, target: HTMLElement): boolean {
  const pageWin = getPageWindow(source);
  const events: Array<[HTMLElement, string]> = [
    [source, 'mousedown'],
    [source, 'dragstart'],
    [target, 'dragenter'],
    [target, 'dragover'],
    [target, 'drop'],
    [source, 'dragend'],
    [target, 'mouseup'],
  ];

  try {
    const dt = new pageWin.DataTransfer();
    events.forEach(([el, type]) => {
      if (type.startsWith('drag') || type === 'drop') {
        el.dispatchEvent(createDragEvent(type, dt));
      } else {
        el.dispatchEvent(new pageWin.MouseEvent(type, { bubbles: true, cancelable: true }));
      }
    });
    return true;
  } catch (err) {
    warn('OUCHN 匹配题拖拽事件派发失败，已跳过拖拽兜底:', err);
    return false;
  }
}

function getElementCenter(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function dispatchPointerMouse(el: Element, type: string, x: number, y: number): void {
  const pageWin = getPageWindow(el);
  const init: MouseEventInit & PointerEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: 0,
    buttons: type === 'mouseup' || type === 'pointerup' ? 0 : 1,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };

  if (type.startsWith('pointer') && typeof pageWin.PointerEvent === 'function') {
    el.dispatchEvent(new pageWin.PointerEvent(type, init));
    return;
  }
  el.dispatchEvent(new pageWin.MouseEvent(type, init));
}

async function humanLikeDrag(source: HTMLElement, target: HTMLElement): Promise<boolean> {
  try {
    source.scrollIntoView({ block: 'center', inline: 'center' });
    target.scrollIntoView({ block: 'center', inline: 'center' });
    await new Promise((r) => setTimeout(r, 80));

    const start = getElementCenter(source);
    const end = getElementCenter(target);
    const doc = source.ownerDocument;

    dispatchPointerMouse(source, 'pointerdown', start.x, start.y);
    dispatchPointerMouse(source, 'mousedown', start.x, start.y);
    await new Promise((r) => setTimeout(r, 80));

    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const ratio = i / steps;
      const x = start.x + (end.x - start.x) * ratio;
      const y = start.y + (end.y - start.y) * ratio;
      const hover = doc.elementFromPoint(x, y) || target;
      dispatchPointerMouse(hover, 'pointermove', x, y);
      dispatchPointerMouse(hover, 'mousemove', x, y);
      await new Promise((r) => setTimeout(r, 18));
    }

    dispatchPointerMouse(target, 'pointerup', end.x, end.y);
    dispatchPointerMouse(target, 'mouseup', end.x, end.y);
    dispatchPointerMouse(target, 'click', end.x, end.y);
    return true;
  } catch (err) {
    warn('匹配题坐标拖拽失败，已跳过真人式拖拽兜底:', err);
    return false;
  }
}
