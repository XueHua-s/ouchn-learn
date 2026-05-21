import { create } from 'zustand';

export type PageMode = 'course' | 'full-screen' | 'exam' | 'unsupported';

export interface PanelPosition {
  top: number;
  left?: number;
  right?: number;
}

interface PanelStore {
  collapsed: boolean;
  mounted: boolean;
  pageMode: PageMode;
  position: PanelPosition;
  setCollapsed: (collapsed: boolean) => void;
  setMounted: (mounted: boolean) => void;
  setPageMode: (pageMode: PageMode) => void;
  setPosition: (position: PanelPosition) => void;
  toggleCollapsed: () => void;
}

export const usePanelStore = create<PanelStore>((set) => ({
  collapsed: false,
  mounted: false,
  pageMode: 'unsupported',
  position: { top: 80, right: 20 },

  setCollapsed: (collapsed) => set({ collapsed }),
  setMounted: (mounted) => set({ mounted }),
  setPageMode: (pageMode) => set({ pageMode }),
  setPosition: (position) => set({ position }),
  toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
}));
