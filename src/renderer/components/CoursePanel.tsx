import { BookOpenCheck, Download, PlayCircle, Square, TimerReset } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useCourseStore } from '@/store/course-store';
import { DEFAULT_HANG_INTERVAL } from '@/constants';
import { PanelShell } from './PanelShell';
import { StatusMessage } from './StatusMessage';
import { Button, FieldRow, Input, PanelSection, Pill } from './ui';

export function CoursePanel() {
  const state = useCourseStore(
    useShallow((store) => ({
      autoHangStatus: store.autoHangStatus,
      autoViewStatus: store.autoViewStatus,
      hangIntervalSeconds: store.hangIntervalSeconds,
      isAutoHanging: store.isAutoHanging,
      isAutoViewing: store.isAutoViewing,
      isMaterialDownloading: store.isMaterialDownloading,
      materialDownloadStatus: store.materialDownloadStatus,
      materialIntervalSeconds: store.materialIntervalSeconds,
      setHangIntervalSeconds: store.setHangIntervalSeconds,
      setMaterialIntervalSeconds: store.setMaterialIntervalSeconds,
      startAutoHang: store.startAutoHang,
      startAutoView: store.startAutoView,
      startMaterialDownload: store.startMaterialDownload,
    })),
  );

  return (
    <PanelShell title="资源下载">
      <PanelSection
        action={
          <Pill className={state.isAutoViewing ? 'border-amber-200 bg-amber-50 text-amber-900' : undefined}>
            {state.isAutoViewing ? '运行中' : '待命'}
          </Pill>
        }
        description="自动打开未完成的查看页面"
        icon={<BookOpenCheck className="h-4 w-4" />}
        title="一键查看"
      >
        <Button onClick={() => void state.startAutoView()} variant={state.isAutoViewing ? 'warning' : 'default'}>
          {state.isAutoViewing ? <Square className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
          {state.isAutoViewing ? '停止查看' : '查看所有页面'}
        </Button>
        <StatusMessage status={state.autoViewStatus} />
      </PanelSection>

      <PanelSection
        action={<Pill>{state.materialIntervalSeconds}s</Pill>}
        description="批量保存参考资料附件"
        icon={<Download className="h-4 w-4" />}
        title="参考资料"
      >
        <FieldRow label="下载间隔">
          <Input
            className="w-20 text-center"
            id="material-download-interval"
            max={60}
            min={5}
            onChange={(event) => state.setMaterialIntervalSeconds(Number(event.currentTarget.value))}
            type="number"
            value={state.materialIntervalSeconds}
          />
        </FieldRow>
        <Button
          disabled={state.isMaterialDownloading}
          onClick={() => void state.startMaterialDownload()}
          variant="secondary"
        >
          <Download className="h-4 w-4" />
          {state.isMaterialDownloading ? '下载中...' : '批量下载参考资料'}
        </Button>
        <StatusMessage status={state.materialDownloadStatus} />
      </PanelSection>

      <PanelSection
        action={
          <Pill className={state.isAutoHanging ? 'border-amber-200 bg-amber-50 text-amber-900' : undefined}>
            {state.isAutoHanging ? '运行中' : `${state.hangIntervalSeconds || DEFAULT_HANG_INTERVAL}s`}
          </Pill>
        }
        description="按设定间隔标记视频学习进度"
        icon={<TimerReset className="h-4 w-4" />}
        title="视频挂机"
      >
        <FieldRow label="挂机间隔">
          <Input
            className="w-20 text-center"
            id="auto-hang-interval"
            max={300}
            min={10}
            onChange={(event) => state.setHangIntervalSeconds(Number(event.currentTarget.value))}
            type="number"
            value={state.hangIntervalSeconds || DEFAULT_HANG_INTERVAL}
          />
        </FieldRow>
        <Button onClick={() => void state.startAutoHang()} variant={state.isAutoHanging ? 'warning' : 'success'}>
          {state.isAutoHanging ? <Square className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
          {state.isAutoHanging ? '停止挂机' : '一键全部挂机'}
        </Button>
        <StatusMessage status={state.autoHangStatus} />
      </PanelSection>
    </PanelShell>
  );
}
