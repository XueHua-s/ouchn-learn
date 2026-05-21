import { useShallow } from 'zustand/react/shallow';
import { useCourseStore } from '@/store/course-store';
import { DEFAULT_HANG_INTERVAL } from '@/constants';
import { PanelShell } from './PanelShell';
import { StatusMessage } from './StatusMessage';

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
      <button
        className={`ouchn-btn ${state.isAutoViewing ? 'ouchn-btn-warning' : 'ouchn-btn-primary'}`}
        onClick={() => void state.startAutoView()}
        type="button"
      >
        {state.isAutoViewing ? '停止查看' : '一键查看所有页面'}
      </button>
      <StatusMessage status={state.autoViewStatus} />

      <hr className="ouchn-divider" />

      <div className="ouchn-input-row">
        <label className="ouchn-label" htmlFor="material-download-interval">
          下载间隔(秒)
        </label>
        <input
          className="ouchn-input ouchn-input-sm"
          id="material-download-interval"
          max={60}
          min={5}
          onChange={(event) => state.setMaterialIntervalSeconds(Number(event.currentTarget.value))}
          type="number"
          value={state.materialIntervalSeconds}
        />
      </div>
      <button
        className="ouchn-btn ouchn-btn-secondary"
        disabled={state.isMaterialDownloading}
        onClick={() => void state.startMaterialDownload()}
        type="button"
      >
        {state.isMaterialDownloading ? '下载中...' : '批量下载参考资料'}
      </button>
      <StatusMessage status={state.materialDownloadStatus} />

      <hr className="ouchn-divider" />

      <div className="ouchn-input-row">
        <label className="ouchn-label" htmlFor="auto-hang-interval">
          挂机间隔(秒)
        </label>
        <input
          className="ouchn-input ouchn-input-sm"
          id="auto-hang-interval"
          max={300}
          min={10}
          onChange={(event) => state.setHangIntervalSeconds(Number(event.currentTarget.value))}
          type="number"
          value={state.hangIntervalSeconds || DEFAULT_HANG_INTERVAL}
        />
      </div>
      <button
        className={`ouchn-btn ${state.isAutoHanging ? 'ouchn-btn-warning' : 'ouchn-btn-success'}`}
        onClick={() => void state.startAutoHang()}
        type="button"
      >
        {state.isAutoHanging ? '停止挂机' : '一键全部挂机'}
      </button>
      <StatusMessage status={state.autoHangStatus} />
    </PanelShell>
  );
}
