// Node is used only by this harness; application modules execute with browser adapters.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function activity(id, duration, video = true, complete = false) {
  return {
    id: `learning-activity-${id}`,
    duration,
    complete,
    button: null,
    querySelector(selector) {
      if (selector === '[ng-switch-when="online_video"]') return video ? {} : null;
      if (selector === '.video-duration .attribute-value, .activity-attribute .attribute-value.number')
        return this.duration ? { textContent: this.duration } : null;
      if (selector === '.completeness.full') return this.complete ? {} : null;
      if (selector === '.auto-button') return this.button;
      if (selector === '.activity-header > .activity-title .title') return { textContent: `Video ${id}` };
      throw new Error(`Unexpected selector: ${selector}`);
    },
    prepend(button) {
      this.button = button;
      button.closest = () => this;
    },
  };
}

function harness(rows) {
  const modules = {},
    timers = new Map(),
    requests = [],
    statuses = [],
    running = [],
    expansions = [],
    events = [],
    intervals = [];
  let timerId = 0,
    writes = 0;
  const document = {
    querySelectorAll(selector) {
      assert.equal(selector, '.learning-activity');
      return rows;
    },
    createElement(tag) {
      const attrs = {};
      let text = '';
      return {
        tagName: tag.toUpperCase(),
        style: {},
        get textContent() {
          return text;
        },
        set textContent(value) {
          writes++;
          text = value;
        },
        setAttribute(key, value) {
          writes++;
          attrs[key] = value;
        },
        getAttribute(key) {
          return attrs[key] ?? null;
        },
        hasAttribute(key) {
          return key in attrs;
        },
        removeAttribute(key) {
          writes++;
          delete attrs[key];
        },
      };
    },
  };
  const $ = () => ({
    on(...args) {
      events.push(args);
    },
  });
  $.ajax = (options) => {
    const result = deferred();
    requests.push({ ...result, options });
    return result.promise;
  };
  function load(name) {
    if (modules[name]) return modules[name].exports;
    const module = { exports: {} };
    modules[name] = module;
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', `${name}.ts`), 'utf8');
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInNewContext(code, {
      module,
      exports: module.exports,
      document,
      $,
      console: { log() {}, error() {} },
      window: {
        setTimeout(fn, delay) {
          timers.set(++timerId, { fn, delay });
          return timerId;
        },
        clearTimeout(id) {
          timers.delete(id);
        },
        setInterval(fn, delay) {
          intervals.push({ fn, delay });
          return intervals.length;
        },
      },
      require(id) {
        if (id.startsWith('./')) return load(id.slice(2));
        if (id === '@/constants') return { API_BASE_URL: '/api', DEFAULT_HANG_INTERVAL: 30 };
        if (id === '@/utils/dom')
          return {
            ensureAllSectionsExpanded() {
              const expand = deferred();
              expansions.push(expand);
              return expand.promise;
            },
          };
        if (id === '@/utils/helper')
          return {
            extractNumber: (value) => value.split('-').pop(),
            timeStringToSeconds: (value) => value.split(':').reduce((total, part) => total * 60 + Number(part), 0),
          };
        throw new Error(`Unexpected import: ${id}`);
      },
    });
    return module.exports;
  }
  const h = {
    rows,
    ...load('hang-buttons'),
    ...load('auto-hang'),
    ...load('legacy-hang'),
    requests,
    timers,
    expansions,
    statuses,
    running,
    events,
    intervals,
    callbacks: { onStatus: (value) => statuses.push(value), onRunningChange: (value) => running.push(value) },
    writes: () => writes,
    nextTimer() {
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      timer.fn();
      return timer.delay;
    },
    async start(callbacks = this.callbacks, input = { intervalSeconds: 30 }) {
      const result = this.startAutoHangAllWithCallbacks(input, callbacks);
      expansions.at(-1).resolve();
      await result;
      await flush();
    },
  };
  return h;
}

test('only videos with valid duration enter queue; missing duration recovers without duplicate buttons', () => {
  const h = harness([
    activity(17833735, null),
    activity(17834223, null),
    activity(3, '4', false),
    activity(4, '00:08:52'),
    activity(5, null, true, true),
    activity(6, '00:99:99'),
  ]);
  h.syncHangButtons();
  const original = h.rows[0].button;
  assert.equal(original.textContent, '时长未就绪');
  assert.equal(original.hasAttribute('disabled'), true);
  assert.equal(h.rows[2].button, null);
  assert.equal(h.rows[4].button.textContent, '已完成');
  assert.equal(h.scanHangActivities().tasks.length, 1);
  assert.equal(h.scanHangActivities().unavailableCount, 3);
  h.rows[0].duration = '00:10:00';
  h.syncHangButtons();
  assert.equal(h.rows[0].button, original);
  assert.equal(original.textContent, '点击挂机');
  assert.equal(original.hasAttribute('disabled'), false);
  assert.equal(h.scanHangActivities().tasks.length, 2);
});

test('stable ready, unavailable, completed and failed activities cause zero repeated DOM writes', async () => {
  const h = harness([activity(1, null), activity(2, '00:10:00'), activity(3, null, true, true)]);
  h.syncHangButtons();
  let writes = h.writes();
  for (let i = 0; i < 5; i++) {
    h.syncHangButtons();
    h.scanHangActivities();
  }
  assert.equal(h.writes(), writes);
  const request = h.completeHangActivity('2');
  await flush();
  writes = h.writes();
  h.syncHangButtons();
  assert.equal(h.writes(), writes);
  h.requests[0].reject(new Error('offline'));
  await assert.rejects(request);
  writes = h.writes();
  h.syncHangButtons();
  assert.equal(h.writes(), writes);
  assert.equal(h.rows[1].button.textContent, '重试挂机');
});

test('request ownership survives DOM replacement; completion is independent of button text and attributes', async () => {
  const h = harness([activity(1, '00:10:00')]);
  h.syncHangButtons();
  h.rows[0].button.textContent = '已完成';
  const first = h.completeHangActivity('1');
  await flush();
  assert.equal(h.requests.length, 1);
  h.rows[0] = activity(1, '00:10:00');
  h.syncHangButtons();
  assert.equal(h.rows[0].button.textContent, '挂机中');
  const second = h.hangActivityForButton(h.rows[0].button);
  await flush();
  assert.equal(h.requests.length, 1);
  assert.equal(JSON.parse(h.requests[0].options.data).end, 600);
  h.requests[0].resolve({ completeness: 'full' });
  await Promise.all([first, second]);
  assert.equal(h.rows[0].button.textContent, '已完成');
  assert.equal(h.rows[0].button.hasAttribute('disabled'), true);
  h.rows.length = 0;
  h.syncHangButtons();
  h.rows.push(activity(1, '00:10:00'));
  h.syncHangButtons();
  assert.equal(h.rows[0].button.textContent, '已完成');
  await h.completeHangActivity('1');
  assert.equal(h.requests.length, 1);
  assert.equal(h.scanHangActivities().tasks.length, 0);
});

test('invalid/missing durations and missing activities cannot submit; responses must confirm completion', async () => {
  const h = harness([activity(1, null), activity(2, '00:00:00'), activity(3, '00:99:99'), activity(4, '00:10:00')]);
  for (const id of ['bad', '1', '2', '3', '99']) await assert.rejects(h.completeHangActivity(id));
  assert.equal(h.requests.length, 0);
  for (const response of [{ completeness: 'partial' }, null, new Error('offline')]) {
    const result = h.completeHangActivity('4');
    await flush();
    if (response instanceof Error) h.requests.at(-1).reject(response);
    else h.requests.at(-1).resolve(response);
    await assert.rejects(result);
    assert.equal(h.rows[3].button.textContent, '重试挂机');
    assert.equal(h.rows[3].button.hasAttribute('disabled'), false);
  }
  assert.equal(h.requests.at(-1).options.timeout, 30000);
});

test('queue waits for responses, deduplicates manual requests, and completes last item immediately', async () => {
  const h = harness([activity(1, '00:10:00'), activity(2, '00:08:00')]);
  h.syncHangButtons();
  const manual = h.hangActivityForButton(h.rows[0].button);
  await flush();
  await h.start();
  assert.equal(h.requests.length, 1);
  assert.equal(h.timers.size, 0);
  h.requests[0].resolve({ completeness: 'full' });
  await manual;
  await flush();
  assert.equal(h.timers.size, 1);
  assert.equal(h.nextTimer(), 30000);
  await flush();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve({ completeness: 'full' });
  await flush();
  assert.equal(h.timers.size, 0);
  assert.equal(h.running.at(-1), false);
  assert.match(h.statuses.at(-1).message, /所有视频已挂机完成/);
});

test('stop/restart during request isolates callback owners and does not duplicate requests or timers', async () => {
  const h = harness([activity(1, '00:10:00'), activity(2, '00:08:00')]);
  await h.start();
  h.stopAutoHanging();
  const oldStatuses = h.statuses.length,
    newStatuses = [],
    newRunning = [];
  await h.start({ onStatus: (value) => newStatuses.push(value), onRunningChange: (value) => newRunning.push(value) });
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ completeness: 'full' });
  await flush();
  assert.equal(h.statuses.length, oldStatuses);
  assert.equal(h.timers.size, 1);
  h.nextTimer();
  await flush();
  h.requests[1].reject(new Error('offline'));
  await flush();
  assert.equal(newRunning.at(-1), false);
  assert.equal(newStatuses.at(-1).type, 'error');
  assert.equal(h.timers.size, 0);
});

test('startup stop/restart ignores old expansion; failures and abort release the running state', async () => {
  const h = harness([activity(1, '00:10:00')]);
  const old = h.startAutoHangAllWithCallbacks({ intervalSeconds: 30 }, h.callbacks);
  h.stopAutoHanging();
  const newer = h.startAutoHangAllWithCallbacks({ intervalSeconds: 30 }, h.callbacks);
  h.expansions[0].reject(new Error('old expansion'));
  await old;
  assert.equal(h.running.at(-1), true);
  h.expansions[1].reject(new Error('new expansion'));
  await newer;
  assert.equal(h.running.at(-1), false);
  assert.equal(h.statuses.at(-1).type, 'error');
  const controller = new AbortController();
  await h.start({ ...h.callbacks, signal: controller.signal });
  controller.abort();
  h.requests[0].resolve({ completeness: 'full' });
  await flush();
  assert.equal(h.running.at(-1), false);
  assert.equal(h.timers.size, 0);
  const count = h.expansions.length;
  await h.startAutoHangAllWithCallbacks({ intervalSeconds: 30 }, { ...h.callbacks, signal: controller.signal });
  assert.equal(h.expansions.length, count);
});

test('empty/unavailable queues stop, and newly ready videos prevent false all-completed status', async () => {
  const empty = harness([]);
  await empty.start();
  assert.equal(empty.running.at(-1), false);
  const h = harness([activity(1, '00:10:00'), activity(2, null)]);
  await h.start();
  h.rows[1].duration = '00:09:00';
  h.requests[0].resolve({ completeness: 'full' });
  await flush();
  assert.equal(h.statuses.at(-1).type, 'warning');
  assert.match(h.statuses.at(-1).message, /仍有 1 个视频未完成/);
  const unavailable = harness([activity(1, null), activity(2, null)]);
  await unavailable.start();
  assert.equal(unavailable.requests.length, 0);
  assert.match(unavailable.statuses.at(-1).message, /2 个视频时长未就绪/);
});

test('queued videos use latest metadata and missing videos stop with an actionable error', async () => {
  const h = harness([activity(1, '00:10:00'), activity(2, '00:08:00')]);
  await h.start();
  h.requests[0].resolve({ completeness: 'full' });
  await flush();
  h.rows[1].duration = '00:09:00';
  h.nextTimer();
  await flush();
  assert.equal(JSON.parse(h.requests[1].options.data).end, 540);
  h.requests[1].resolve({ completeness: 'full' });
  await flush();
  const removed = harness([activity(1, '00:10:00'), activity(2, '00:08:00')]);
  await removed.start();
  removed.requests[0].resolve({ completeness: 'full' });
  await flush();
  removed.rows.pop();
  removed.nextTimer();
  await flush();
  assert.equal(removed.requests.length, 1);
  assert.equal(removed.running.at(-1), false);
  assert.equal(removed.statuses.at(-1).type, 'error');
});

test('legacy initialization is idempotent and delegated clicks do not propagate into activity navigation', async () => {
  const h = harness([activity(1, '00:10:00')]);
  h.initLegacyHangEvents();
  h.initLegacyHangEvents();
  h.startAutoButtonScanning();
  h.startAutoButtonScanning();
  assert.equal(h.events.length, 1);
  assert.equal(h.intervals.length, 1);
  let prevented = false,
    stopped = false;
  h.events[0][2].call(h.rows[0].button, {
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {
      stopped = true;
    },
  });
  await flush();
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ completeness: 'full' });
  await flush();
});
