const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/modules/video-duration.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

async function harness() {
  const pLimit = (await import('p-limit')).default;
  const requests = [],
    media = [],
    timers = new Map();
  let clock = 1000,
    timerId = 0;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    Date: { now: () => clock },
    console: { warn() {} },
    $: {
      ajax(options) {
        return new Promise((resolve, reject) => requests.push({ options, resolve, reject }));
      },
    },
    window: {
      setTimeout(fn, delay) {
        timers.set(++timerId, { fn, delay });
        return timerId;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
    },
    document: {
      createElement(tag) {
        const listeners = new Map();
        const element = {
          tag,
          src: '',
          duration: NaN,
          loads: [],
          listeners,
          addEventListener(name, callback) {
            listeners.set(name, callback);
          },
          removeEventListener(name, callback) {
            assert.equal(listeners.get(name), callback);
            listeners.delete(name);
          },
          removeAttribute(name) {
            assert.equal(name, 'src');
            this.src = '';
          },
          load() {
            this.loads.push(this.src);
          },
          emit(name) {
            listeners.get(name)?.();
          },
        };
        media.push(element);
        return element;
      },
    },
    require(id) {
      if (id === 'p-limit') return { default: pLimit };
      if (id === '@/constants') return { API_BASE_URL: 'https://lms.ouchn.cn/api' };
      throw new Error(`Unexpected import: ${id}`);
    },
  });
  return {
    ...module.exports,
    requests,
    media,
    timers,
    advance(ms) {
      clock += ms;
    },
    metadata(index, duration) {
      media[index].duration = duration;
      media[index].emit('loadedmetadata');
    },
    respond(index, overrides = {}) {
      requests[index].resolve({
        id: requests[index].options.url.split('/').pop(),
        type: 'online_video',
        uploads: [{ id: 32442008, type: 'video', status: 'processing', videos: [] }],
        ...overrides,
      });
    },
  };
}

test('processing videos use real media metadata; share requests, cache seconds and release media without playback', async () => {
  const h = await harness();
  const first = h.loadVideoDuration('17833735');
  assert.equal(h.loadVideoDuration('17833735'), first);
  assert.equal(h.isVideoDurationLoading('17833735'), true);
  await flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].options.type, 'GET');
  assert.equal(h.requests[0].options.timeout, 15000);
  h.respond(0);
  await flush();
  assert.equal(h.media[0].preload, 'metadata');
  assert.equal(h.media[0].src, 'https://lms.ouchn.cn/api/uploads/32442008/playback?preview=true');
  h.metadata(0, 505.12);
  assert.equal(await first, 506);
  assert.equal(await h.loadVideoDuration('17833735'), 506);
  assert.equal(h.getVideoDuration('17833735'), 506);
  assert.equal(h.isVideoDurationLoading('17833735'), false);
  assert.equal(h.requests.length, 1);
  assert.equal(h.media[0].listeners.size, 0);
  assert.equal(h.media[0].loads.at(-1), '');
  assert.equal(h.timers.size, 0);
});

test('at most two metadata pipelines run concurrently; queued IDs also deduplicate', async () => {
  const h = await harness();
  const pending = ['1', '2', '3'].map((id) => h.loadVideoDuration(id));
  assert.equal(h.loadVideoDuration('3'), pending[2]);
  await flush();
  assert.equal(h.requests.length, 2);
  h.respond(0);
  h.respond(1);
  await flush();
  assert.equal(h.media.length, 2);
  h.metadata(0, 50);
  await flush();
  assert.equal(h.requests.length, 3);
  h.respond(2);
  await flush();
  h.metadata(1, 60);
  h.metadata(2, 70);
  assert.deepEqual(await Promise.all(pending), [50, 60, 70]);
});

test('errors and timeouts clean up, cool down, and allow retry after expiry', async () => {
  for (const failure of ['network', 'media', 'timeout']) {
    const h = await harness();
    const pending = h.loadVideoDuration('1');
    await flush();
    if (failure === 'network') h.requests[0].reject(new Error('offline'));
    else {
      h.respond(0);
      await flush();
      if (failure === 'media') h.media[0].emit('error');
      else {
        const timer = [...h.timers.values()][0];
        assert.equal(timer.delay, 15000);
        timer.fn();
      }
      assert.equal(h.media[0].listeners.size, 0);
      assert.equal(h.media[0].src, '');
      assert.equal(h.timers.size, 0);
    }
    assert.equal(await pending, null);
    assert.equal(h.isVideoDurationLoading('1'), false);
    assert.equal(await h.loadVideoDuration('1'), null);
    assert.equal(h.requests.length, 1);
    h.advance(60000);
    const retry = h.loadVideoDuration('1');
    await flush();
    h.respond(1);
    await flush();
    h.metadata(h.media.length - 1, 120);
    assert.equal(await retry, 120);
  }
});

test('locked activities can retry immediately after prerequisite completion', async () => {
  const h = await harness();
  const first = h.loadVideoDuration('1');
  await flush();
  h.requests[0].reject({ status: 403, responseJSON: { message: '该学习活动尚未解锁' } });
  assert.equal(await first, null);
  assert.equal(h.isVideoDurationLocked('1'), true);
  h.retryUnavailableVideoDurations();
  const second = h.loadVideoDuration('1');
  await flush();
  h.respond(1, { uploads: [{ id: 123, type: 'audio' }] });
  await flush();
  assert.equal(h.media[0].tag, 'audio');
  h.metadata(0, 60);
  assert.equal(await second, 60);
  assert.equal(h.isVideoDurationLocked('1'), false);
});

test('invalid IDs, mismatched activities, multiple files and invalid durations never produce guessed seconds', async () => {
  const invalid = await harness();
  assert.equal(await invalid.loadVideoDuration('../2'), null);
  assert.equal(invalid.requests.length, 0);
  for (const response of [
    { id: 99 },
    { type: 'exam' },
    { uploads: [] },
    { uploads: [{ id: '../2', type: 'video' }] },
    {
      uploads: [
        { id: 1, type: 'video' },
        { id: 2, type: 'video' },
      ],
    },
  ]) {
    const h = await harness();
    const pending = h.loadVideoDuration('1');
    await flush();
    h.respond(0, response);
    assert.equal(await pending, null);
    assert.equal(h.media.length, 0);
  }
  for (const duration of [NaN, Infinity, 0, -10, Number.MAX_SAFE_INTEGER + 1]) {
    const h = await harness();
    const pending = h.loadVideoDuration('1');
    await flush();
    h.respond(0);
    await flush();
    h.metadata(0, duration);
    assert.equal(await pending, null);
    assert.equal(h.getVideoDuration('1'), null);
    assert.equal(h.timers.size, 0);
  }
});
