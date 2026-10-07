import type { AnswerValue, Question } from '@/types/exam';

type MatchingOption = NonNullable<Question['matchingOptions']>[number];
export type MatchingPlan = Array<{ key: string; option: MatchingOption }>;
type PlanResult = { ok: true; pairs: MatchingPlan } | { ok: false; message: string };

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩';

/** 保留 SQL 运算符、标点和长度参数；不能把短选项当成长选项的子串来匹配。 */
export function normalizeMatchingText(value: string): string {
  return value.replace(/[\s\u00a0]+/g, '').toLowerCase();
}

function normalizeKey(value: string): string {
  const key = value.trim();
  const circled = CIRCLED.indexOf(key);
  if (key.length === 1 && circled >= 0) return String(circled + 1);
  return key.replace(/[.、．:：\s]/g, '');
}

function parseEntries(answer: AnswerValue): Array<[string, string]> {
  if (Array.isArray(answer)) return answer.map((value, index) => [String(index + 1), String(value)]);
  if (answer && typeof answer === 'object') return Object.entries(answer);
  const text = String(answer).trim();
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')) return parseEntries(parsed);
    if (parsed && typeof parsed === 'object' && Object.values(parsed).every((value) => typeof value === 'string')) {
      return Object.entries(parsed) as Array<[string, string]>;
    }
  } catch {
    // 兼容旧版编号-选项文本；内容里的 SQL 逗号不应被当作另一组答案的分隔符。
  }
  return text
    .split(/\s*(?:\r?\n|[;；]|[,，](?=\s*(?:\d+|[①②③④⑤⑥⑦⑧⑨⑩])\s*[-=→>:：]))\s*/)
    .map((line) => line.match(/^(.+?)\s*[-=→>:：]+\s*(.+)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => [match[1], match[2]]);
}

/** 校验与执行共享同一份完整计划；缺项、重复槽位和不明确的选项在任何 DOM 写入前失败。 */
export function buildMatchingPlan(question: Question, answer: AnswerValue): PlanResult {
  const items = question.matchingItems || [];
  const options = question.matchingOptions || [];
  if (!items.length || !options.length) return { ok: false, message: '未提取到完整的匹配槽位和答案池，请重新提取题目' };
  const entries = parseEntries(answer);
  if (entries.length !== items.length) {
    return { ok: false, message: `需要 ${items.length} 个匹配答案，实际 ${entries.length} 个` };
  }
  const pairs: MatchingPlan = [];
  const seen = new Set<string>();
  for (const [key, value] of entries) {
    const item =
      items.find((candidate) => normalizeKey(candidate.key) === normalizeKey(key)) ||
      items.find((candidate) => normalizeMatchingText(candidate.stem) === normalizeMatchingText(key));
    if (!item || seen.has(item.key)) return { ok: false, message: `未识别或重复的匹配槽位：${key}` };
    const byId = options.filter(
      (option) =>
        option.value === value.trim() || normalizeKey(option.label).toUpperCase() === normalizeKey(value).toUpperCase(),
    );
    const candidates = byId.length
      ? byId
      : options.filter((option) => normalizeMatchingText(option.content) === normalizeMatchingText(value));
    if (candidates.length !== 1) return { ok: false, message: `未识别或不明确的匹配选项：${value}` };
    seen.add(item.key);
    pairs.push({ key: item.key, option: candidates[0] });
  }
  return { ok: true, pairs };
}
