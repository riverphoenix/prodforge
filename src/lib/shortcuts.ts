export interface Shortcut {
  id: string;
  keys: string;
  label: string;
  description: string;
  category: 'navigation' | 'panel' | 'action';
}

export const SHORTCUTS: Shortcut[] = [
  { id: 'cmd-palette', keys: 'mod+k', label: '\u2318K', description: 'Open command palette', category: 'action' },
  { id: 'tab-chat', keys: 'mod+1', label: '\u23181', description: 'Switch to Chat', category: 'navigation' },
  { id: 'tab-editor', keys: 'mod+2', label: '\u23182', description: 'Switch to Editor', category: 'navigation' },
  { id: 'tab-documents', keys: 'mod+3', label: '\u23183', description: 'Switch to Documents', category: 'navigation' },
  { id: 'tab-frameworks', keys: 'mod+4', label: '\u23184', description: 'Switch to Frameworks', category: 'navigation' },
  { id: 'tab-prompts', keys: 'mod+5', label: '\u23185', description: 'Switch to Prompts', category: 'navigation' },
  { id: 'tab-context', keys: 'mod+6', label: '\u23186', description: 'Switch to Context', category: 'navigation' },
  { id: 'tab-outputs', keys: 'mod+7', label: '\u23187', description: 'Switch to Outputs', category: 'navigation' },
  { id: 'tab-workflows', keys: 'mod+8', label: '\u23188', description: 'Switch to Workflows', category: 'navigation' },
  { id: 'toggle-terminal', keys: 'mod+`', label: '\u2318`', description: 'Toggle terminal panel', category: 'panel' },
  { id: 'toggle-sidebar', keys: 'mod+b', label: '\u2318B', description: 'Toggle sidebar', category: 'panel' },
  { id: 'search', keys: 'mod+f', label: '\u2318F', description: 'Search', category: 'action' },
  { id: 'shortcuts-overlay', keys: 'mod+/', label: '\u2318/', description: 'Keyboard shortcuts', category: 'action' },
  { id: 'quick-switcher', keys: 'mod+p', label: '\u2318P', description: 'Quick switcher', category: 'action' },
  { id: 'toggle-focus', keys: 'mod+shift+f', label: '\u2318\u21e7F', description: 'Toggle focus mode', category: 'panel' },
  { id: 'layout-single', keys: 'mod+shift+1', label: '\u2318\u21e71', description: 'Single panel layout', category: 'panel' },
  { id: 'layout-split-h', keys: 'mod+shift+2', label: '\u2318\u21e72', description: 'Side by side layout', category: 'panel' },
  { id: 'layout-split-v', keys: 'mod+shift+3', label: '\u2318\u21e73', description: 'Top/bottom layout', category: 'panel' },
  { id: 'layout-triple', keys: 'mod+shift+4', label: '\u2318\u21e74', description: 'Three column layout', category: 'panel' },
  { id: 'layout-quad', keys: 'mod+shift+5', label: '\u2318\u21e75', description: 'Four pane layout', category: 'panel' },
];

export function parseShortcut(keys: string): { mod: boolean; shift: boolean; key: string } {
  const parts = keys.split('+');
  const mod = parts.includes('mod');
  const shift = parts.includes('shift');
  const key = parts[parts.length - 1];
  return { mod, shift, key };
}

export function matchesShortcut(e: KeyboardEvent, shortcut: Shortcut): boolean {
  const { mod, shift, key } = parseShortcut(shortcut.keys);
  const modPressed = e.metaKey || e.ctrlKey;
  if (mod && !modPressed) return false;
  if (!mod && modPressed) return false;
  if (shift && !e.shiftKey) return false;
  if (!shift && e.shiftKey) return false;
  return e.key === key || e.key === key.toUpperCase() || e.code === `Digit${key}` || e.code === `Key${key.toUpperCase()}`;
}
