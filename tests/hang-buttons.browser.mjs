// Browser regression fixture: bundle with tsup (IIFE/browser), then load in an empty HTML page.
import {
  completeHangActivity,
  hangActivityForButton,
  scanHangActivities,
  syncHangButtons,
} from '../src/modules/hang-buttons';

function check(value, message) {
  if (!value) throw new Error(message);
}

const prerequisite = `<div class="activity-prerequisites"><span ng-switch-when="online_video">音视频教材</span>
  <div class="activity-title"><span>前置视频标题</span></div><div class="completeness full"></div></div>`;
const video = (id) => `<div class="learning-activity" id="learning-activity-${id}"><div class="clickable-area">
  <div class="activity-summary" ng-switch-when="online_video"><div class="activity-container">
    <div class="activity-icon">${prerequisite}</div>
    <div class="activity-header"><div class="activity-title"><a class="title">真实视频 ${id}</a></div>
    <span class="activity-attribute"><span class="attribute-value number">00:08:25</span></span></div>
    <div class="activity-operations-container"><div class="completeness none"></div></div>
  </div></div></div></div>`;

async function run() {
  const fixture = document.createElement('div');
  document.body.append(fixture);
  fixture.innerHTML =
    video(1) +
    `<div class="learning-activity" id="learning-activity-2"><div class="clickable-area">
    <div class="activity-summary" ng-switch-when="exam">${prerequisite}</div></div></div>`;
  syncHangButtons();
  const scan = scanHangActivities();
  check(scan.tasks.length === 1 && scan.tasks[0].title === '真实视频 1', '前置节点污染了类型、标题或完成状态');
  check(fixture.querySelectorAll('.auto-button').length === 1, '测试条目被错误注入了视频按钮');

  let mutations = 0;
  const observer = new MutationObserver((records) => {
    mutations += records.length;
  });
  observer.observe(fixture, { attributes: true, childList: true, subtree: true, characterData: true });
  for (let i = 0; i < 5; i++) {
    syncHangButtons();
    scanHangActivities();
  }
  await Promise.resolve();
  check(mutations === 0, '稳定目录重复扫描产生 DOM 写入');

  let requests = 0;
  let resolveRead;
  Object.assign(window, {
    $: {
      ajax: () => {
        requests++;
        return new Promise((resolve) => {
          resolveRead = resolve;
        });
      },
    },
  });
  const first = completeHangActivity('1');
  await Promise.resolve();
  fixture.querySelector('#learning-activity-1').outerHTML = video(1);
  syncHangButtons();
  const button = fixture.querySelector('.auto-button');
  check(button.disabled && button.textContent === '挂机中', '重建 DOM 丢失在途状态');
  const second = hangActivityForButton(button);
  resolveRead({ completeness: 'full' });
  await Promise.all([first, second]);
  check(requests === 1 && button.disabled && button.textContent === '已完成', '重建 DOM 重复请求或丢失完成状态');
  observer.disconnect();
  document.querySelector('#result').textContent =
    'PASS: 原生 DOM 隔离前置节点、测试不注入按钮、重复扫描零写入、DOM 重建共享请求';
}

void run().catch((error) => {
  document.querySelector('#result').textContent = `FAIL: ${error.stack}`;
});
