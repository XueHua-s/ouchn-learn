/**
 * OUCHN 考试页面 DOM 选择器常量。
 *
 * FIXED: 在 answer-fill.ts 与 question-extract.ts 多处复用 `.simditor-body`、
 *        `.subject-description`、`.answer-area` 等选择器；以前散落各文件维护，
 *        OUCHN 平台改 class 名时需要在多个地方同步修改（典型的"信息泄漏"）。
 *        集中放在本模块后，未来调整选择器只改这里一处。
 *
 * 不要在该模块外用裸字符串重复声明这些 selector，统一引用此处常量或 helper。
 */

/** 顶层题目容器（每道题一个） */
export const SUBJECT_SELECTOR = '.subject';

/** 综合题嵌套小题容器：父 `.subject.analysis` 下的子题节点 */
export const SUB_SUBJECT_SELECTOR = '.sub-subject';

/** 用于判定"父题是综合题（含可作答子题）"的 class */
export const ANALYSIS_PARENT_CLASS = 'analysis';

/** 题目题号文本节点（多选择器兜底，按顺序匹配） */
export const SUBJECT_INDEX_SELECTORS = [
  '.subject-resort-index .ng-binding',
  '.subject-resort-index',
  '.subject-index',
] as const;

/** 题干描述容器（即"阅读材料"区，不能在此区域填答案） */
export const SUBJECT_DESCRIPTION_SELECTOR = '.subject-description';

/** 选择题选项容器 */
export const OPTION_SELECTOR = '.option';

/** 简答题主编辑器（visible Simditor / 答题区可编辑节点） */
export const ESSAY_PRIMARY_EDITOR_SELECTORS = [
  '.simditor-body[contenteditable="true"]',
  '.answer-area-container [contenteditable="true"]',
  '.answer-content [contenteditable="true"]',
] as const;

/** 简答题答题区根容器（fallback 时在此范围内查 contenteditable） */
export const ANSWER_AREA_SELECTOR = '.subject-operate, .subject-answer, .answer-area';

/** 简答题/综合题 fallback 编辑器：visible Simditor 与 textarea 都可能是真正提交字段 */
export const ESSAY_FALLBACK_EDITOR_SELECTOR = 'textarea, .simditor-body[contenteditable="true"]';

/** 填空题用：subject-description 内部的填空空位 */
export const BLANK_IN_DESCRIPTION_SELECTOR =
  '.subject-description [contenteditable="true"], .subject-description .___answer';

/** 填空题专用 contenteditable */
export const BLANK_ANSWER_SELECTOR = '.___answer[contenteditable="true"]';

/** 完形填空/补全对话：题干内嵌的隐藏下拉选择框 */
export const CLOZE_SELECT_SELECTOR = 'select.___select-answer, select[multi-select][ng-model*="answeredOption"]';

/** 判断"contenteditable 是否在题干区域里"——题干区域不应被当作作答编辑器 */
export function isInsideSubjectDescription(el: Element): boolean {
  return !!el.closest(SUBJECT_DESCRIPTION_SELECTOR);
}
