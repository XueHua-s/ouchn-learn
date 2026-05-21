import { useEffect } from 'react';
import { usePanelStore } from '@/store/panel-store';
import { useCourseStore } from '@/store/course-store';
import { CoursePanel } from './components/CoursePanel';
import { ExamPanel } from './components/ExamPanel';
import { FullScreenPanel } from './components/FullScreenPanel';

export function App() {
  const pageMode = usePanelStore((state) => state.pageMode);
  const checkAndResumeAutoView = useCourseStore((state) => state.checkAndResumeAutoView);

  useEffect(() => {
    // FIXED: 自动查看会短暂进入 full-screen 学习活动页；这里必须在 course/full-screen 都恢复，
    //        否则 React 迁移后只渲染保存资源面板，流程不会跳回课程页继续处理下一项。
    if (pageMode === 'course' || pageMode === 'full-screen') {
      const timer = window.setTimeout(() => {
        void checkAndResumeAutoView();
      }, 500);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [checkAndResumeAutoView, pageMode]);

  if (pageMode === 'exam') return <ExamPanel />;
  if (pageMode === 'full-screen') return <FullScreenPanel />;
  if (pageMode === 'course') return <CoursePanel />;
  return null;
}
