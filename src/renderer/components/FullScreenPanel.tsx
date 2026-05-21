import { Archive, Save } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useCourseStore } from '@/store/course-store';
import { PanelShell } from './PanelShell';
import { StatusMessage } from './StatusMessage';
import { Button, PanelSection, Pill } from './ui';

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
      <PanelSection
        action={
          <Pill className={state.isSavingResources ? 'border-amber-200 bg-amber-50 text-amber-900' : undefined}>
            {state.isSavingResources ? '保存中' : '待命'}
          </Pill>
        }
        description="当前学习活动内批量保存视频和文档"
        icon={<Archive className="h-4 w-4" />}
        title="学习资源"
      >
        <Button
          className="w-full"
          disabled={state.isSavingResources}
          onClick={() => void state.startSaveAllResources()}
        >
          <Save className="h-4 w-4" />
          {state.isSavingResources ? '保存中...' : '保存所有学习资源'}
        </Button>
        <StatusMessage status={state.saveResourcesStatus} />
      </PanelSection>
    </PanelShell>
  );
}
