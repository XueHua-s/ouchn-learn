// Shared regression suite: run against native Chrome or jsdom via exam-answers.test.cjs.
import { extractQuestions, findQuestionElement } from '../src/modules/exam/question-extract';
import { buildMatchingPlan } from '../src/modules/exam/matching-answer';
import { fillMatchingQuestion } from '../src/modules/exam/answer-match';
import { fillAnswerForQuestion } from '../src/modules/exam/answer-fill';
import { writeWithVerify } from '../src/modules/exam/answer-write';
import { fillAnswersWithTools } from '../src/modules/exam/tool-executor';

const check = (value, message) => {
  if (!value) throw new Error(message);
};
const equal = (actual, expected) =>
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
  );
const fixture = document.createElement('div');
document.body.append(fixture);
const passed = [];
const cases = [];
const test = (name, run) => cases.push({ name, run });
const index = (n) => `<span class="subject-index">${n}</span>`;
const rich = (text) => `<div class="content-center"><div>${text}</div><div class="pswp">图库按钮</div></div>`;
const pool = ['<p>a.项目号=b.项目号</p>', '<p>项目</p>', '<p>工资 decimal(10,2),</p><p>类别 n char( 1 )</p>'];
const matching = (n, slots = 2, contents = pool, root = 'sub-subject') => `<div class="${root} matching">${index(n)}
  <div class="subject-description">选择匹配项</div>
  <div class="matching-answer-box"><ul><li class="header">题目 / 答案</li>${Array.from(
    { length: slots },
    (_, i) => `<li>
  <div class="list-panel">${rich(`槽位${i + 1}`)}</div><div class="list-panel option" drag-type="to"></div></li>`,
  ).join('')}</ul></div>
  <div class="answer-pool">${contents.map((text, i) => `<div class="clone-area drag-area" id="drag-node-${101 + i}">${rich(text)}</div>`).join('')}</div></div>`;
const choices = (n, root = 'subject', type = 'multiple_selection') => `<div class="${root} ${type}">${index(n)}
  <div class="subject-description">测试选择题</div>${['A', 'B', 'C']
    .map(
      (label, i) => `<div class="option">
  <span class="option-index">${label}.</span><span class="option-content">选项${label}</span>
  <input type="${type === 'multiple_selection' ? 'checkbox' : 'radio'}" name="q${root}${n}" value="${i + 1}"></div>`,
    )
    .join('')}</div>`;
const blank = (
  n,
  root = 'subject',
) => `<div class="${root} fill_in_blank">${index(n)}<div class="subject-description">空位
  <span class="___answer" contenteditable="true"></span><span class="___answer" contenteditable="true"></span></div></div>`;
const mountMatching = () => {
  fixture.innerHTML = matching(1, 2, pool, 'subject');
  return { el: fixture.firstElementChild, question: extractQuestions()[0] };
};
function angularMatching(el, { render = true, notify = true, resetSubmission = false } = {}) {
  const calls = [];
  const subject = { id: 999, type: 'matching', options: pool.map((_, i) => ({ id: 101 + i })), sub_subjects: [{}, {}] };
  const scope = {
    subject,
    $apply() {
      if (!render) return;
      [...el.querySelectorAll('[drag-type="to"]')].forEach((target, i) => {
        target.replaceChildren();
        if (subject.sub_subjects[i].note)
          target.append(el.querySelector(`#drag-node-${subject.sub_subjects[i].note.id}`).cloneNode(true));
      });
    },
    $parent: {
      dragAddCallback() {
        throw new Error('stale drag DOM callback must not run');
      },
    },
  };
  if (notify)
    scope.$parent.onChangeSubmission = (value) => {
      check(value === subject, 'save callback must receive the matching subject, not slots');
      calls.push(value.id);
      if (resetSubmission) subject.sub_subjects[1].answeredOption = null;
    };
  window.angular = {
    element(node) {
      return { scope: () => (node === el ? scope : undefined) };
    },
  };
  return { subject, calls };
}
const stats = () => ({
  filledCount: 0,
  toolCallCount: 0,
  toolSucceededCount: 0,
  toolFailedCount: 0,
  toolFailuresByCode: {},
  toolErrors: [],
  skippedQuestions: [],
  fillFailedQuestions: [],
});

test('31 top-level questions expand into 36 unique answer items, including complete matching subquestion metadata', () => {
  fixture.innerHTML =
    Array.from({ length: 30 }, (_, i) => choices(i + 1)).join('') +
    `<div class="subject analysis">${index(31)}
    <div class="subject-description">综合材料</div>${matching(1, 5, [...pool, '其它甲', '其它乙'])}${matching(
      2,
      10,
      Array.from({ length: 11 }, (_, i) => `选项${i}`),
    )}
    ${[3, 4, 5, 6].map((n) => choices(n, 'sub-subject')).join('')}</div>`;
  const questions = extractQuestions();
  equal(document.querySelectorAll('.subject').length, 31);
  equal(questions.length, 36);
  equal(new Set(questions.map((q) => q.index)).size, 36);
  equal(new Set(questions.map((q) => q.parentIndex ?? q.index)).size, 31);
  const first = questions.find((q) => q.displayIndex === '31.1');
  equal(first.matchingItems.length, 5);
  equal(first.matchingOptions.length, 5);
  equal(first.matchingOptions[1].value, '102');
  check(first.matchingOptions[2].content.includes('n char( 1 )'), 'multi-paragraph SQL was truncated');
  check(!first.matchingOptions[2].content.includes('图库'), 'photo UI polluted option text');
  equal(questions.find((q) => q.displayIndex === '31.2').matchingOptions.length, 11);
  equal(findQuestionElement(first), fixture.querySelector('.sub-subject'));
});
test('subquestions retain multi-blank and cloze metadata', () => {
  fixture.innerHTML = `<div class="subject analysis">${index(31)}<div class="subject-description">材料</div>${blank(1, 'sub-subject')}
  <div class="sub-subject cloze">${index(2)}<div class="subject-description">A. one B. two <select class="___select-answer"><option value="">请选择</option><option value="1">A. one</option><option value="2">B. two</option></select></div></div></div>`;
  const questions = extractQuestions();
  equal(questions[0].blankCount, 2);
  equal(questions[1].blankCount, 1);
  check(
    questions[1].modelHints.some((h) => h.includes('完形填空')),
    'cloze metadata missing',
  );
});
test('matching resolves exact short text, IDs, arrays and legacy SQL with commas without substring collisions', () => {
  const { question } = mountMatching();
  for (const answer of [
    { 1: '项目', 2: '101' },
    ['102', '101'],
    '{"1":"102","2":"101"}',
    '①:项目,②:a.项目号=b.项目号',
  ]) {
    const plan = buildMatchingPlan(question, answer);
    check(plan.ok, plan.message);
    equal(
      plan.pairs.map((p) => p.option.value),
      ['102', '101'],
    );
  }
  const sql = question.matchingOptions[2].content;
  check(buildMatchingPlan(question, `1:${sql},2:项目`).ok, 'SQL comma split into extra pairs');
});
test('partial, duplicate, unknown and ambiguous matching answers fail before writes', async () => {
  const { el, question } = mountMatching();
  const { subject, calls } = angularMatching(el);
  for (const answer of [{ 1: '项目' }, { 1: '项目', '①': '101' }, { 1: '项目', 2: '项目号' }, { 1: '101', 3: '102' }]) {
    check(!buildMatchingPlan(question, answer).ok, 'invalid plan accepted');
    check(!(await fillMatchingQuestion(el, question, answer)), 'invalid answer wrote DOM');
  }
  equal(subject.sub_subjects, [{}, {}]);
  equal(calls, []);
  fixture.innerHTML = matching(1, 2, ['重复', '重复'], 'subject');
  const duplicate = extractQuestions()[0];
  equal(duplicate.matchingOptions.length, 2);
  check(!buildMatchingPlan(duplicate, ['重复', '重复']).ok, 'same-text options lost identity');
  check(buildMatchingPlan(duplicate, ['101', '102']).ok, 'explicit duplicate-text IDs rejected');
});
test('matching writes every slot and the platform serialization field, then notifies its save callback once', async () => {
  const { el, question } = mountMatching();
  const { subject, calls } = angularMatching(el);
  check(await fillMatchingQuestion(el, question, ['102', '101']), 'matching write failed');
  equal(
    subject.sub_subjects.map((s) => [s.note.id, s.answer_number, s.answeredOption]),
    [
      [102, 102, 102],
      [101, 101, 101],
    ],
  );
  equal(calls, [999]);
});
test('missing save callback refuses model mutation', async () => {
  const { el, question } = mountMatching();
  const { subject } = angularMatching(el, { notify: false });
  check(!(await fillMatchingQuestion(el, question, ['102', '101'])), 'missing callback reported success');
  equal(subject.sub_subjects, [{}, {}]);
});
test('extra model slots reject before writes; detached matching nodes cannot report success', async () => {
  const { el, question } = mountMatching();
  const { subject } = angularMatching(el);
  subject.sub_subjects.push({});
  check(!(await fillMatchingQuestion(el, question, ['102', '101'])), 'extra model slot ignored');
  equal(subject.sub_subjects, [{}, {}, {}]);
  subject.sub_subjects.pop();
  el.remove();
  check(!(await fillMatchingQuestion(el, question, ['102', '101'])), 'detached matching node accepted');
  equal(subject.sub_subjects, [{}, {}]);
});
test('model-only writes without rendered slots and visible slots without submission values both fail', async () => {
  for (const options of [{ render: false }, { resetSubmission: true }]) {
    const { el, question } = mountMatching();
    angularMatching(el, options);
    check(!(await fillMatchingQuestion(el, question, ['102', '101'])), 'unverified match reported success');
  }
});
test('no-op drag events never count as a successful matching answer', async () => {
  const { el, question } = mountMatching();
  delete window.angular;
  check(!(await fillMatchingQuestion(el, question, ['102', '101'])), 'dispatch counted as success');
});
test('multiple-choice reruns remove stale checked options and verify the complete set', async () => {
  fixture.innerHTML = choices(1);
  const question = extractQuestions()[0];
  fixture.querySelectorAll('input')[0].checked = true;
  check(await fillAnswerForQuestion(question, ['B', 'C']), 'valid multi-choice failed');
  equal(
    [...fixture.querySelectorAll('input')].map((i) => i.checked),
    [false, true, true],
  );
  check(await fillAnswerForQuestion(question, ['B', 'C']), 'idempotent multi-choice failed');
  fixture.querySelectorAll('input')[0].addEventListener('click', (e) => e.preventDefault());
  check(!(await fillAnswerForQuestion(question, ['A'])), 'cancelled checkbox click reported success');
});
test('single-choice verifies checked state after a cancelled click', async () => {
  fixture.innerHTML = choices(1, 'subject', 'single_selection');
  const question = extractQuestions()[0];
  fixture.querySelector('input').addEventListener('click', (e) => e.preventDefault());
  check(!(await fillAnswerForQuestion(question, 'A')), 'cancelled radio click reported success');
  check(await fillAnswerForQuestion(question, 'B'), 'valid radio click failed');
});
test('text verification rejects old, empty and detached content without repeated writes', async () => {
  fixture.innerHTML = '<textarea>old</textarea>';
  const editor = fixture.firstElementChild;
  let writes = 0;
  check(!(await writeWithVerify(editor, 'new', () => writes++)), 'old nonempty text accepted');
  equal(writes, 1);
  check(
    !(await writeWithVerify(editor, 'new', () => {
      editor.value = '';
    })),
    'empty text accepted',
  );
  check(
    await writeWithVerify(editor, 'new', () => {
      setTimeout(() => (editor.value = 'new'), 20);
    }),
    'delayed text rejected',
  );
  editor.remove();
  check(!(await writeWithVerify(editor, 'new', () => {})), 'detached editor accepted');
});
test('all blanks must be provided and each write must verify', async () => {
  fixture.innerHTML = blank(1);
  const question = extractQuestions()[0];
  check(!(await fillAnswerForQuestion(question, ['first'])), 'single answer repeated across blanks');
  check(await fillAnswerForQuestion(question, ['first', 'second']), 'valid multi-blank failed');
  fixture.querySelectorAll('[contenteditable]')[1].addEventListener('input', (e) => {
    e.target.textContent = 'old';
  });
  check(!(await fillAnswerForQuestion(question, ['first', 'second'])), 'partial blank write reported success');
});
test('essay reports failed visible or hidden submission fields', async () => {
  fixture.innerHTML = `<div class="subject short_answer">${index(1)}<div class="subject-description">题干</div><textarea></textarea><textarea hidden></textarea></div>`;
  const question = extractQuestions()[0];
  check(await fillAnswerForQuestion(question, 'first answer'), 'valid essay failed');
  fixture.querySelectorAll('textarea')[1].addEventListener('input', (e) => {
    e.target.value = 'old';
  });
  check(!(await fillAnswerForQuestion(question, 'new answer')), 'hidden submission failure accepted');
});
test('tool stats reflect failed matching, multi-choice and blank writes instead of all-success', async () => {
  const { el } = mountMatching();
  angularMatching(el, { render: false });
  fixture.insertAdjacentHTML('beforeend', choices(2) + blank(3));
  const questions = extractQuestions();
  const totals = stats();
  const result = await fillAnswersWithTools(
    questions,
    {
      questions: [
        { index: 1, answer: ['102', '101'] },
        { index: 2, answer: ['A'] },
        { index: 3, answer: ['one'] },
      ],
    },
    totals,
  );
  equal(
    result.map((r) => r.ok),
    [false, true, false],
  );
  equal(totals.filledCount, 1);
  equal(totals.toolFailedCount, 2);
  equal(totals.fillFailedQuestions, [1, 3]);
  equal(totals.toolFailuresByCode, { dom_write_failed: 1, blank_count_mismatch: 1 });
});

window.examTestResults = { done: false, passed };
void (async () => {
  for (const { name, run } of cases) {
    delete window.angular;
    await run();
    passed.push(name);
  }
  fixture.remove();
  window.examTestResults = { done: true, passed };
  document.querySelector('#result').textContent = `PASS: ${passed.length} exam regression cases\n${passed.join('\n')}`;
})().catch((error) => {
  window.examTestResults = { done: true, passed, error: error.stack };
  document.querySelector('#result').textContent = `FAIL after ${passed.length}: ${error.stack}`;
});
