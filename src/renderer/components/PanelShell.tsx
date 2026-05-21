import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { usePanelStore } from '@/store/panel-store';
import { useDraggablePanel } from '@/renderer/hooks/use-draggable-panel';
import { Button, Pill } from './ui';

interface PanelShellProps {
  children: ReactNode;
  id?: string;
  title: string;
}

export function PanelShell({ children, id, title }: PanelShellProps) {
  const collapsed = usePanelStore((state) => state.collapsed);
  const position = usePanelStore((state) => state.position);
  const setPosition = usePanelStore((state) => state.setPosition);
  const toggleCollapsed = usePanelStore((state) => state.toggleCollapsed);
  const handleDragStart = useDraggablePanel(setPosition);

  const style = {
    left: position.left === undefined ? undefined : `${position.left}px`,
    right: position.right === undefined ? undefined : `${position.right}px`,
    top: `${position.top}px`,
  };

  return (
    <div
      className="ouchn-panel download-panel ouchn-react-panel rounded-xl border border-slate-200 bg-white text-slate-950 shadow-2xl"
      id={id}
      style={style}
    >
      <div
        className="download-header flex cursor-move items-center justify-between gap-3 rounded-t-xl border-b border-slate-200 bg-slate-50 px-4 py-3 select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-white shadow-sm">
            <GripVertical className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="m-0 truncate text-sm font-semibold text-slate-950">{title}</h3>
            <p className="m-0 mt-0.5 text-xs text-slate-500">React 19 + Zustand 控制台</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill>OUCHN</Pill>
          <Button
            aria-label={collapsed ? '展开面板' : '折叠面板'}
            className="w-8"
            size="icon"
            variant="ghost"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              toggleCollapsed();
            }}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <div className={`ouchn-panel-body space-y-3 p-4${collapsed ? ' collapsed' : ''}`}>{children}</div>
    </div>
  );
}
