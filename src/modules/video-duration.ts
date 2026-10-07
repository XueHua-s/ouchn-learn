import pLimit from 'p-limit';
import { API_BASE_URL } from '@/constants';

interface ActivityMedia {
  id: number | string;
  type: string;
  uploads?: { id: number | string; type: string }[];
}

interface DurationEntry {
  seconds?: number;
  pending?: Promise<number | null>;
  locked?: boolean;
  retryAfter: number;
}

const durations = new Map<string, DurationEntry>();
const limit = pLimit(2);
const RETRY_DELAY = 60000;
const METADATA_TIMEOUT = 15000;

/** 目录未提供时长时，读取已经确认的媒体秒数；未知时返回 null，不猜测观看时长。 */
export function getVideoDuration(activityId: string): number | null {
  return durations.get(activityId)?.seconds ?? null;
}

export function isVideoDurationLoading(activityId: string): boolean {
  return Boolean(durations.get(activityId)?.pending);
}

export function isVideoDurationLocked(activityId: string): boolean {
  return Boolean(durations.get(activityId)?.locked);
}

/** 完成前置视频后允许重新读取；普通轮询仍遵守失败冷却，避免每 500ms 重发失败请求。 */
export function retryUnavailableVideoDurations(): void {
  for (const entry of durations.values()) {
    if (!entry.seconds) entry.retryAfter = 0;
  }
}

function readMediaDuration(upload: { id: number | string; type: string }): Promise<number | null> {
  return new Promise((resolve) => {
    const media = document.createElement(upload.type === 'audio' ? 'audio' : 'video');
    let settled = false;
    const finish = (seconds: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      media.removeEventListener('loadedmetadata', onMetadata);
      media.removeEventListener('error', onError);
      // FIXED: metadata 读取完成即释放媒体连接；不播放、不插入页面，也不留下后台下载。
      media.removeAttribute('src');
      media.load();
      resolve(seconds);
    };
    const onMetadata = () => {
      const seconds = Math.ceil(media.duration);
      finish(Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null);
    };
    const onError = () => finish(null);
    const timer = window.setTimeout(() => finish(null), METADATA_TIMEOUT);
    media.addEventListener('loadedmetadata', onMetadata);
    media.addEventListener('error', onError);
    media.preload = 'metadata';
    media.src = `${API_BASE_URL}/uploads/${upload.id}/playback?preview=true`;
    media.load();
  });
}

/** 限制并发、复用在途读取并缓存成功结果；失败冷却后可重试，不提交学习进度。 */
export function loadVideoDuration(activityId: string): Promise<number | null> {
  if (!/^\d+$/.test(activityId)) return Promise.resolve(null);
  const cached = durations.get(activityId);
  if (cached?.seconds) return Promise.resolve(cached.seconds);
  if (cached?.pending) return cached.pending;
  if (cached && cached.retryAfter > Date.now()) return Promise.resolve(null);
  const entry: DurationEntry = { retryAfter: 0 };
  durations.set(activityId, entry);
  entry.pending = limit(async () => {
    try {
      const activity: ActivityMedia = await $.ajax({
        type: 'GET',
        url: `${API_BASE_URL}/activities/${activityId}`,
        dataType: 'json',
        timeout: METADATA_TIMEOUT,
      });
      if (String(activity?.id) !== activityId || activity.type !== 'online_video') return null;
      const uploads = activity.uploads?.filter((upload) => ['video', 'audio'].includes(upload.type));
      // 多资源活动的进度口径尚未确认，不能把单个文件的长度当作整个活动长度。
      if (uploads?.length !== 1 || !/^\d+$/.test(String(uploads[0].id))) return null;
      const seconds = await readMediaDuration(uploads[0]);
      if (seconds !== null) entry.seconds = seconds;
      return seconds;
    } catch (error) {
      const response = error as { status?: number; responseJSON?: { message?: string } } | null;
      entry.locked = response?.status === 403 && response.responseJSON?.message === '该学习活动尚未解锁';
      console.warn('[视频挂机] 读取媒体时长失败', activityId, error);
      return null;
    } finally {
      entry.pending = undefined;
      entry.retryAfter = Date.now() + RETRY_DELAY;
    }
  });
  return entry.pending;
}
