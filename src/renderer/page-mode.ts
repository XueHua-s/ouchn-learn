import type { PageMode } from '@/store/panel-store';

export function isFullScreenLearningActivity(url = window.location.href): boolean {
  return url.includes('/learning-activity/full-screen#/');
}

export function isExamTakePage(url = window.location.href): boolean {
  return /lms\.ouchn\.cn\/exam\/\d+\/subjects/.test(url) && url.includes('#/take');
}

export function detectPageMode(url = window.location.href): PageMode {
  if (isExamTakePage(url)) return 'exam';
  if (isFullScreenLearningActivity(url)) return 'full-screen';
  if (url.includes('lms.ouchn.cn/course/')) return 'course';
  return 'unsupported';
}
