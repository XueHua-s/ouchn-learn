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
    if (pageMode === 'course') {
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
