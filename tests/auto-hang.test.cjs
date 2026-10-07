// Browser business modules are exercised in a VM; Node APIs are only used by this test harness.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

function activity(id, duration, video = true, complete = false) {
  return {
    id: `learning-activity-${id}`,
    duration,
    complete,
    button: null,
    querySelector(selector) {
      if (selector.includes('ng-switch-when')) return video ? {} : null;
      if (selector.includes('attribute-value')) return this.duration ? { textContent: this.duration } : null;
      if (selector === '.completeness.full') return this.complete ? {} : null;
      if (selector === '.auto-button') return this.button;
      if (selector.includes('.title')) return { textContent: `Video ${id}` };
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
    running = [];
  let timerId = 0;
  const expand = deferred();
  const document = {
    querySelectorAll(selector) {
      if (selector === '.learning-activity') return rows;
      return rows
        .map((row) => row.button)
        .filter(Boolean)
        .filter((button) => !selector.includes(':not') || !button.dataset.time);
    },
    createElement() {
      return {
        dataset: {},
        style: {},
        attributes: {},
        textContent: '',
        setAttribute(key, value) {
          this.attributes[key] = value;
        },
        getAttribute(key) {
          return this.attributes[key];
        },
      };
    },
  };
  const $ = (button) => ({
    length: 0,
    text(value) {
      if (value === undefined) return button.textContent;
      button.textContent = value;
      return this;
    },
    attr(key, value) {
      button.setAttribute(key, value);
      if (key === 'data-pending') button.dataset.pending = value;
      return this;
    },
    removeAttr(key) {
      delete button.attributes[key];
      if (key === 'data-pending') delete button.dataset.pending;
      return this;
    },
    val() {
      return 30;
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
        setTimeout(fn) {
          timers.set(++timerId, fn);
          return timerId;
        },
        clearTimeout(id) {
          timers.delete(id);
        },
      },
      require(id) {
        if (id === '@/utils/helper')
          return {
            extractNumber: (value) => value.split('-').pop(),
            timeStringToSeconds: (value) => value.split(':').reduce((sum, part) => sum * 60 + Number(part), 0),
          };
        if (id === '@/constants') return { API_BASE_URL: '/api', DEFAULT_HANG_INTERVAL: 30 };
        if (id === '@/utils/dom') return { ensureAllSectionsExpanded: () => expand.promise };
        return load(id.replace('./', ''));
      },
    });
    return module.exports;
  }
  return {
    rows,
    ...load('hang-buttons'),
    ...load('auto-hang'),
    requests,
    timers,
    expand,
    statuses,
    running,
    callbacks: { onStatus: (status) => statuses.push(status), onRunningChange: (value) => running.push(value) },
    $,
  };
}

test('processing videos remain visible, recover when duration arrives, and non-video numbers stay out of queue', () => {
  const h = harness([
    activity(17833735, null),
    activity(17834223, null),
    activity(3, '4', false),
    activity(4, '00:08:52'),
    activity(5, '00:07:20', true, true),
    activity(6, '00:99:99'),
  ]);
  h.syncHangButtons();
  assert.equal(h.rows[0].button.textContent, '时长未就绪');
  assert.equal(h.rows[1].button.getAttribute('aria-disabled'), 'true');
  assert.equal(h.rows[2].button, null);
  assert.equal(h.scanHangButtons().length, 1);
  assert.equal(h.rows[3].button.dataset.time, '532');
  h.rows[0].duration = '00:10:00';
  h.syncHangButtons();
  h.syncHangButtons();
  assert.equal(h.rows[0].button.textContent, '点击挂机');
  assert.equal(h.scanHangButtons().length, 2);
});

test('overlapping manual/batch reads share one request; only confirmed completion disables the button', async () => {
  const h = harness([activity(1, '00:10:00')]);
  h.syncHangButtons();
  const button = h.rows[0].button;
  const first = h.requestActivitiesRead('1', '600', h.$(button));
  const second = h.requestActivitiesRead('1', '600', h.$(button));
  h.syncHangButtons();
  assert.equal(button.getAttribute('aria-disabled'), 'true');
  assert.equal(h.requests.length, 1);
  assert.equal(JSON.parse(h.requests[0].options.data).end, 600);
  h.requests[0].resolve({ completeness: 'full' });
  await Promise.all([first, second]);
  h.syncHangButtons();
  assert.equal(button.textContent, '已完成');
  assert.equal(button.getAttribute('aria-disabled'), 'true');
  await h.requestActivitiesRead('1', '600', h.$(button));
  assert.equal(h.requests.length, 1);
});

test('invalid inputs and partial/network responses never report completion and permit retry', async () => {
  const h = harness([activity(1, '00:10:00')]);
  h.syncHangButtons();
  for (const time of ['NaN', '0', '-1', '0.5', 'Infinity'])
    await assert.rejects(h.requestActivitiesRead('1', time, h.$(h.rows[0].button)));
  assert.equal(h.requests.length, 0);
  for (const response of [{ completeness: 'partial' }, null, new Error('offline')]) {
    const request = h.requestActivitiesRead('1', '600', h.$(h.rows[0].button));
    if (response instanceof Error) h.requests.at(-1).reject(response);
    else h.requests.at(-1).resolve(response);
    await assert.rejects(request);
    assert.equal(h.rows[0].button.textContent, '点击挂机');
    assert.equal(h.rows[0].button.getAttribute('aria-disabled'), 'false');
  }
});

test('batch waits for response, stops on failure, and restart ignores the previous run completion', async () => {
  const h = harness([activity(1, '00:10:00'), activity(2, '00:08:00')]);
  h.expand.resolve();
  await h.startAutoHangAllWithCallbacks({ intervalSeconds: 30 }, h.callbacks);
  assert.equal(h.requests.length, 1);
  assert.equal(h.timers.size, 0);
  h.stopAutoHanging();
  await h.startAutoHangAllWithCallbacks({ intervalSeconds: 30 }, h.callbacks);
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ completeness: 'full' });
  await flush();
  assert.equal(h.timers.size, 1);
  const next = h.timers.values().next().value;
  h.timers.clear();
  next();
  await flush();
  assert.equal(h.requests.length, 2);
  h.requests[1].reject(new Error('offline'));
  await flush();
  assert.equal(h.running.at(-1), false);
  assert.equal(h.statuses.at(-1).type, 'error');
  assert.equal(h.timers.size, 0);
});

test('chapter expansion rejection clears running state; unavailable videos cannot report all completed', async () => {
  const failed = harness([]);
  const start = failed.startAutoHangAllWithCallbacks({ intervalSeconds: 30 }, failed.callbacks);
  failed.expand.reject(new Error('expand failed'));
  await start;
  assert.equal(failed.running.at(-1), false);
  assert.equal(failed.statuses.at(-1).type, 'error');
  const pending = harness([activity(17833735, null), activity(17834223, null)]);
  pending.expand.resolve();
  await pending.startAutoHangAllWithCallbacks({ intervalSeconds: 30 }, pending.callbacks);
  assert.equal(pending.requests.length, 0);
  assert.equal(pending.statuses.at(-1).type, 'warning');
  assert.match(pending.statuses.at(-1).message, /2 个视频时长未就绪/);
  assert.equal(pending.running.at(-1), false);
});
