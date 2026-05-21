import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import type { PanelPosition } from '@/store/panel-store';

export function useDraggablePanel(
  setPosition: (position: PanelPosition) => void,
): (event: ReactMouseEvent<HTMLElement>) => void {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  return useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const panel = event.currentTarget.closest('.ouchn-panel') as HTMLElement | null;
      if (!panel) return;

      event.preventDefault();

      const startX = event.clientX;
      const startY = event.clientY;
      const rect = panel.getBoundingClientRect();
      const initialLeft = rect.left;
      const initialTop = rect.top;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const nextLeft = initialLeft + moveEvent.clientX - startX;
        const nextTop = initialTop + moveEvent.clientY - startY;
        setPosition({
          left: Math.max(0, nextLeft),
          top: Math.max(0, nextTop),
        });
      };

      const cleanup = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', cleanup);
        cleanupRef.current = null;
      };

      cleanupRef.current?.();
      cleanupRef.current = cleanup;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', cleanup);
    },
    [setPosition],
  );
}
