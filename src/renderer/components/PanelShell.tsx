import type { ReactNode } from 'react';
import { usePanelStore } from '@/store/panel-store';
import { useDraggablePanel } from '@/renderer/hooks/use-draggable-panel';

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
    <div className="ouchn-panel download-panel ouchn-react-panel" id={id} style={style}>
      <div className="ouchn-panel-header download-header" onMouseDown={handleDragStart}>
        <h3 className="ouchn-panel-title">{title}</h3>
        <button
          aria-label={collapsed ? '展开面板' : '折叠面板'}
          className="ouchn-panel-toggle"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            toggleCollapsed();
          }}
          type="button"
        >
          {collapsed ? '+' : '-'}
        </button>
      </div>
      <div className={`ouchn-panel-body${collapsed ? ' collapsed' : ''}`}>{children}</div>
    </div>
  );
}
