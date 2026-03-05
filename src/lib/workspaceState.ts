import { workspaceAPI } from './ipc';
import { LayoutMode } from './layoutEngine';

export interface WorkspaceState {
  layoutMode: LayoutMode;
  layoutSizes: number[];
  activeTab: string;
  bottomPanelVisible: boolean;
  bottomPanelHeight: number;
  bottomPanelTab?: string;
  repoPath?: string;
  threadsOpen: boolean;
  showInsights?: boolean;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export async function saveWorkspaceState(projectId: string, state: WorkspaceState): Promise<void> {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await workspaceAPI.saveState(projectId, JSON.stringify(state));
    } catch { /* ignore save errors */ }
  }, 1000);
}

export async function loadWorkspaceState(projectId: string): Promise<WorkspaceState | null> {
  try {
    const json = await workspaceAPI.getState(projectId);
    if (!json) return null;
    return JSON.parse(json) as WorkspaceState;
  } catch {
    return null;
  }
}

export const DEFAULT_WORKSPACE: WorkspaceState = {
  layoutMode: 'single',
  layoutSizes: [100],
  activeTab: 'chat',
  bottomPanelVisible: false,
  bottomPanelHeight: 250,
  threadsOpen: false,
  showInsights: false,
};
