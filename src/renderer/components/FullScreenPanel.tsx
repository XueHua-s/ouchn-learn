import { useShallow } from 'zustand/react/shallow';
import { useCourseStore } from '@/store/course-store';
import { PanelShell } from './PanelShell';
import { StatusMessage } from './StatusMessage';

export function FullScreenPanel() {
  const state = useCourseStore(
    useShallow((store) => ({
      isSavingResources: store.isSavingResources,
      saveResourcesStatus: store.saveResourcesStatus,
      startSaveAllResources: store.startSaveAllResources,
    })),
  );

  return (
    <PanelShell title="资源下载">
      <button
        className="ouchn-btn ouchn-btn-primary"
        disabled={state.isSavingResources}
        onClick={() => void state.startSaveAllResources()}
        type="button"
      >
        {state.isSavingResources ? '保存中...' : '保存所有学习资源'}
      </button>
      <StatusMessage status={state.saveResourcesStatus} />
    </PanelShell>
  );
}
