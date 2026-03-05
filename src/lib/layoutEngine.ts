export type LayoutMode = 'single' | 'split-h' | 'split-v' | 'triple' | 'quad';

export type PanelType =
  | 'chat'
  | 'output'
  | 'framework'
  | 'document'
  | 'workflow'
  | 'editor'
  | 'terminal'
  | 'browser'
  | 'git'
  | 'empty';

export interface PanelSlot {
  id: string;
  type: PanelType;
  meta?: Record<string, string>;
}

export interface LayoutState {
  mode: LayoutMode;
  panels: PanelSlot[];
  sizes: number[];
}

export function createDefaultLayout(mode: LayoutMode, primaryPanel: PanelType = 'chat'): LayoutState {
  switch (mode) {
    case 'single':
      return {
        mode,
        panels: [{ id: 'p1', type: primaryPanel }],
        sizes: [100],
      };
    case 'split-h':
      return {
        mode,
        panels: [
          { id: 'p1', type: primaryPanel },
          { id: 'p2', type: 'output' },
        ],
        sizes: [50, 50],
      };
    case 'split-v':
      return {
        mode,
        panels: [
          { id: 'p1', type: primaryPanel },
          { id: 'p2', type: 'output' },
        ],
        sizes: [50, 50],
      };
    case 'triple':
      return {
        mode,
        panels: [
          { id: 'p1', type: primaryPanel },
          { id: 'p2', type: 'output' },
          { id: 'p3', type: 'browser' },
        ],
        sizes: [40, 30, 30],
      };
    case 'quad':
      return {
        mode,
        panels: [
          { id: 'p1', type: primaryPanel },
          { id: 'p2', type: 'output' },
          { id: 'p3', type: 'browser' },
          { id: 'p4', type: 'terminal' },
        ],
        sizes: [25, 25, 25, 25],
      };
  }
}

export function getLayoutPanelCount(mode: LayoutMode): number {
  switch (mode) {
    case 'single': return 1;
    case 'split-h': case 'split-v': return 2;
    case 'triple': return 3;
    case 'quad': return 4;
  }
}
