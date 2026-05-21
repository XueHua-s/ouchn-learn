import type { TaskStatusUpdate } from '@/services/task-contracts';

interface StatusMessageProps {
  status: TaskStatusUpdate | null;
}

export function StatusMessage({ status }: StatusMessageProps) {
  if (!status) return null;

  const classType = status.type === 'error' ? 'warning' : status.type;
  return (
    <div className={`ouchn-status ouchn-status-${classType}`}>
      <span>{status.message}</span>
      {status.progress ? (
        <span className="ouchn-status-progress">
          {status.progress.done}/{status.progress.total}
        </span>
      ) : null}
    </div>
  );
}
