import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { TaskStatusUpdate } from '@/services/task-contracts';
import { cn } from '@/renderer/lib/utils';

interface StatusMessageProps {
  status: TaskStatusUpdate | null;
}

export function StatusMessage({ status }: StatusMessageProps) {
  if (!status) return null;

  const iconClassName = 'h-4 w-4 shrink-0';
  const hasProgress = Boolean(status.progress && status.progress.total > 0);
  const progressPercent =
    hasProgress && status.progress
      ? Math.min(100, Math.max(0, Math.round((status.progress.done / status.progress.total) * 100)))
      : 0;
  const statusConfig = {
    error: {
      className: 'border-rose-200 bg-rose-50 text-rose-800',
      icon: <AlertTriangle className={iconClassName} />,
    },
    info: {
      className: 'border-sky-200 bg-sky-50 text-sky-800',
      icon: <Info className={iconClassName} />,
    },
    success: {
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      icon: <CheckCircle2 className={iconClassName} />,
    },
    warning: {
      className: 'border-amber-200 bg-amber-50 text-amber-900',
      icon: <AlertTriangle className={iconClassName} />,
    },
  }[status.type];

  return (
    <div className={cn('ouchn-status-message rounded-md border px-3 py-2 text-xs font-medium', statusConfig.className)}>
      <div className="ouchn-status-row">
        {statusConfig.icon}
        <span className="ouchn-status-text">{status.message}</span>
        {hasProgress && status.progress ? (
          <span className="ml-auto shrink-0 font-mono">
            {status.progress.done}/{status.progress.total}
          </span>
        ) : null}
      </div>
      {hasProgress ? (
        <div className="ouchn-progress-track" aria-hidden="true">
          <div className="ouchn-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      ) : null}
    </div>
  );
}
