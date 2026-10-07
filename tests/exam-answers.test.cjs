const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { build } = require('tsup');
const { JSDOM, VirtualConsole } = require('jsdom');

test('exam extraction, matching, editor writes and tool stats pass DOM regressions', { timeout: 30000 }, async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ouchn-exam-test-'));
  let dom;
  try {
    await build({
      entry: ['tests/exam-answers.browser.mjs'],
      outDir,
      format: ['iife'],
      platform: 'browser',
      config: false,
      silent: true,
    });
    dom = new JSDOM('<!doctype html><html><body><pre id="result"></pre></body></html>', {
      url: 'https://exam.test/',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole: new VirtualConsole(),
    });
    dom.window.document.execCommand = () => false; // jsdom lacks browser editing commands; exercise the DOM fallback.
    dom.window.eval(await fs.readFile(path.join(outDir, 'exam-answers.browser.global.js'), 'utf8'));
    const deadline = Date.now() + 25000;
    while (!dom.window.examTestResults?.done && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    const result = dom.window.examTestResults;
    assert.equal(result?.done, true, 'browser suite timed out');
    assert.equal(result.error, undefined, `after ${result.passed.length} cases: ${result.error}`);
    assert.equal(result.passed.length, 15);
  } finally {
    dom?.window.close();
    assert.equal(path.dirname(path.resolve(outDir)), path.resolve(os.tmpdir()));
    await fs.rm(outDir, { recursive: true, force: true });
  }
});
