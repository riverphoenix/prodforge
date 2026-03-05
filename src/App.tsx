import { useState, useEffect, useMemo, useRef } from 'react';
import ActivityBar from './components/ActivityBar';
import ThreadsPanel from './components/ThreadsPanel';
import ProjectView from './pages/ProjectView';
import Settings from './pages/Settings';
import ResizableDivider from './components/ResizableDivider';
import { projectsAPI, conversationsAPI, frameworkDefsAPI, savedPromptsAPI, frameworkOutputsAPI, foldersAPI, settingsAPI } from './lib/ipc';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import CommandPalette from './components/CommandPalette';
import BottomPanel from './components/BottomPanel';
import { ToastProvider } from './components/Toast';
import ShortcutOverlay from './components/ShortcutOverlay';
import SetupWizard from './components/SetupWizard';
import { LayoutMode, createDefaultLayout } from './lib/layoutEngine';
import { saveWorkspaceState, loadWorkspaceState } from './lib/workspaceState';
import { THEMES, applyTheme, getThemeById } from './lib/themes';
import FocusMode from './components/FocusMode';
import QuickSwitcher from './components/QuickSwitcher';
import { Command } from './lib/commandRegistry';
import { Project, Conversation, FrameworkDefinition, SavedPrompt, FrameworkOutput, SearchResult, LLMProvider } from './lib/types';
import ModelSelector from './components/ModelSelector';

type View = 'welcome' | 'project' | 'settings';
type Tab = 'documents' | 'chat' | 'frameworks' | 'prompts' | 'context' | 'outputs' | 'editor' | 'skills' | 'agents' | 'teams' | 'schedules';

const MIN_BOTTOM_PANEL_HEIGHT = 100;
const MAX_BOTTOM_PANEL_RATIO = 0.5;
const DEFAULT_BOTTOM_PANEL_HEIGHT = 200;

const TAB_ICONS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'chat', label: 'Chat', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg> },
  { id: 'editor', label: 'Editor', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg> },
  { id: 'frameworks', label: 'Frameworks', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg> },
  { id: 'prompts', label: 'Prompts', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg> },
  { id: 'context', label: 'Context', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg> },
  { id: 'outputs', label: 'Outputs', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" /></svg> },
  { id: 'skills', label: 'Skills', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg> },
  { id: 'agents', label: 'Agents', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg> },
  { id: 'teams', label: 'Teams', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg> },
  { id: 'schedules', label: 'Schedules', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
];

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const ts = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function App() {
  const [currentView, setCurrentView] = useState<View>('welcome');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [bottomPanelVisible, setBottomPanelVisible] = useState(false);
  const [bottomPanelHeight, setBottomPanelHeight] = useState<number>(() => {
    const saved = localStorage.getItem('bottomPanelHeight');
    return saved ? parseInt(saved, 10) : DEFAULT_BOTTOM_PANEL_HEIGHT;
  });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [homeProvider, setHomeProvider] = useState<LLMProvider>('openai');
  const [homeModel, setHomeModel] = useState('gpt-5');
  const [welcomeInput, setWelcomeInput] = useState('');
  const [welcomeLoading, setWelcomeLoading] = useState(false);
  const [pendingChatMessage, setPendingChatMessage] = useState<string | null>(null);
  const welcomeInputRef = useRef<HTMLTextAreaElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    frameworks: FrameworkDefinition[];
    prompts: SavedPrompt[];
    outputs: FrameworkOutput[];
    items: SearchResult[];
  }>({ frameworks: [], prompts: [], outputs: [], items: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const [recentProjects, setRecentProjects] = useState<(Project & { conversations: Conversation[] })[]>([]);
  const [bottomPanelTab, setBottomPanelTab] = useState<string | undefined>(undefined);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('single');
  const [, setLayoutSizes] = useState<number[]>([100]);
  const [focusMode, setFocusMode] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(() => localStorage.getItem('prodforge_theme') || 'midnight');
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);

  const loadRecentProjects = async () => {
    try {
      const projects = await projectsAPI.list();
      if (projects && projects.length > 0) {
        const sorted = [...projects].sort((a, b) => b.updated_at - a.updated_at).slice(0, 1);
        const withConvos = await Promise.all(
          sorted.map(async (p) => {
            const convos = await conversationsAPI.list(p.id).catch(() => []);
            return { ...p, conversations: convos.sort((a: Conversation, b: Conversation) => b.updated_at - a.updated_at).slice(0, 3) };
          })
        );
        setRecentProjects(withConvos);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    applyTheme(getThemeById(currentTheme));
  }, [currentTheme]);

  useEffect(() => {
    loadRecentProjects();
  }, [currentView]);

  useEffect(() => {
    (async () => {
      try {
        if (localStorage.getItem('prodforge_setup_complete')) return;
        const s = await settingsAPI.get();
        if (!s.api_key_encrypted && !s.anthropic_api_key_encrypted && !s.google_api_key_encrypted) {
          const projects = await projectsAPI.list();
          if (!projects || projects.length === 0) {
            setShowSetupWizard(true);
          }
        }
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    if (!currentProjectId) return;
    saveWorkspaceState(currentProjectId, {
      layoutMode,
      layoutSizes: [100],
      activeTab,
      bottomPanelVisible,
      bottomPanelHeight,
      bottomPanelTab,
      threadsOpen,
      showInsights: false,
    });
  }, [currentProjectId, layoutMode, activeTab, bottomPanelVisible, bottomPanelHeight, bottomPanelTab, threadsOpen]);

  const handleProjectSelect = async (projectId: string, tab: Tab = 'chat') => {
    setCurrentProjectId(projectId);
    const ws = await loadWorkspaceState(projectId);
    if (ws) {
      setLayoutMode(ws.layoutMode || 'single');
      setActiveTab((ws.activeTab as Tab) || tab);
      setBottomPanelVisible(ws.bottomPanelVisible ?? false);
      setBottomPanelHeight(ws.bottomPanelHeight || 250);
      setBottomPanelTab(ws.bottomPanelTab);
      setThreadsOpen(ws.threadsOpen ?? false);
    } else {
      setActiveTab(tab);
    }
    setCurrentView('project');
  };

  const handleSettingsClick = () => {
    setCurrentView('settings');
    setThreadsOpen(false);
  };

  const handleHomeClick = () => {
    setCurrentView('welcome');
    setCurrentProjectId(null);
  };

  const handleWelcomeSubmit = async () => {
    if (!welcomeInput.trim() || welcomeLoading) return;
    setWelcomeLoading(true);
    const messageToSend = welcomeInput.trim();
    try {
      let projects = await projectsAPI.list();
      let targetProjectId: string;
      if (!projects || projects.length === 0) {
        const newProject = await projectsAPI.create('My First Project');
        targetProjectId = newProject.id;
      } else {
        targetProjectId = projects[0].id;
      }
      setPendingChatMessage(messageToSend);
      setCurrentProjectId(targetProjectId);
      setActiveTab('chat');
      setCurrentView('project');
      setWelcomeInput('');
    } catch (e) {
      console.error('Failed to start conversation:', e);
    } finally {
      setWelcomeLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults({ frameworks: [], prompts: [], outputs: [], items: [] });
      return;
    }
    setSearchLoading(true);
    try {
      const results = await Promise.all([
        frameworkDefsAPI.search(query).catch(() => []),
        savedPromptsAPI.search(query).catch(() => []),
        currentProjectId ? frameworkOutputsAPI.list(currentProjectId).catch(() => []) : Promise.resolve([]),
        currentProjectId ? foldersAPI.searchItems(currentProjectId, query).catch(() => []) : Promise.resolve([]),
      ]);
      setSearchResults({
        frameworks: results[0].slice(0, 5),
        prompts: results[1].slice(0, 5),
        outputs: (results[2] as FrameworkOutput[]).filter(o =>
          o.name.toLowerCase().includes(query.toLowerCase()) ||
          o.generated_content?.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 5),
        items: results[3].slice(0, 5),
      });
    } catch (e) {
      console.error('Search failed:', e);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchPanelRef.current && !searchPanelRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    if (searchOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [searchOpen]);

  const handleLayoutChange = (mode: LayoutMode) => {
    const layout = createDefaultLayout(mode, 'chat');
    setLayoutMode(mode);
    setLayoutSizes(layout.sizes);
  };

  const handleBottomPanelResize = (delta: number) => {
    setBottomPanelHeight((prev) => {
      const maxHeight = window.innerHeight * MAX_BOTTOM_PANEL_RATIO;
      return Math.max(MIN_BOTTOM_PANEL_HEIGHT, Math.min(maxHeight, prev + delta));
    });
  };

  useEffect(() => {
    localStorage.setItem('bottomPanelHeight', bottomPanelHeight.toString());
  }, [bottomPanelHeight]);

  const shortcutHandlers = useMemo(() => ({
    'cmd-palette': () => setCommandPaletteOpen(v => !v),
    'tab-chat': () => { if (currentProjectId) { setActiveTab('chat'); setCurrentView('project'); } },
    'tab-editor': () => { if (currentProjectId) { setActiveTab('editor'); setCurrentView('project'); } },
    'tab-frameworks': () => { if (currentProjectId) { setActiveTab('frameworks'); setCurrentView('project'); } },
    'tab-prompts': () => { if (currentProjectId) { setActiveTab('prompts'); setCurrentView('project'); } },
    'tab-context': () => { if (currentProjectId) { setActiveTab('context'); setCurrentView('project'); } },
    'tab-outputs': () => { if (currentProjectId) { setActiveTab('outputs'); setCurrentView('project'); } },
    'tab-skills': () => { if (currentProjectId) { setActiveTab('skills'); setCurrentView('project'); } },
    'tab-agents': () => { if (currentProjectId) { setActiveTab('agents'); setCurrentView('project'); } },
    'tab-teams': () => { if (currentProjectId) { setActiveTab('teams'); setCurrentView('project'); } },
    'tab-schedules': () => { if (currentProjectId) { setActiveTab('schedules'); setCurrentView('project'); } },
    'toggle-terminal': () => setBottomPanelVisible(v => !v),
    'toggle-sidebar': () => setThreadsOpen(v => !v),
    'layout-single': () => handleLayoutChange('single'),
    'layout-split-h': () => handleLayoutChange('split-h'),
    'layout-split-v': () => handleLayoutChange('split-v'),
    'layout-triple': () => handleLayoutChange('triple'),
    'layout-quad': () => handleLayoutChange('quad'),
    'toggle-focus': () => setFocusMode(v => !v),
    'quick-switcher': () => setQuickSwitcherOpen(v => !v),
    'search': () => { setSearchOpen(v => !v); setTimeout(() => searchInputRef.current?.focus(), 100); },
    'shortcuts-overlay': () => setShortcutsOpen(v => !v),
  }), [currentProjectId]);

  useKeyboardShortcuts(shortcutHandlers);

  const paletteCommands: Command[] = useMemo(() => [
    { id: 'nav-chat', label: 'Chat', category: 'Navigation', shortcut: '\u23181', keywords: ['conversation', 'ai'], action: () => { if (currentProjectId) { setActiveTab('chat'); setCurrentView('project'); } } },
    { id: 'nav-editor', label: 'Editor', category: 'Navigation', shortcut: '\u23182', keywords: ['files', 'code', 'edit'], action: () => { if (currentProjectId) { setActiveTab('editor'); setCurrentView('project'); } } },
    { id: 'nav-frameworks', label: 'Frameworks', category: 'Navigation', shortcut: '\u23184', keywords: ['rice', 'prd', 'jtbd'], action: () => { if (currentProjectId) { setActiveTab('frameworks'); setCurrentView('project'); } } },
    { id: 'nav-prompts', label: 'Prompts', category: 'Navigation', shortcut: '\u23185', keywords: ['templates', 'saved'], action: () => { if (currentProjectId) { setActiveTab('prompts'); setCurrentView('project'); } } },
    { id: 'nav-context', label: 'Context', category: 'Navigation', shortcut: '\u23186', keywords: ['docs', 'upload'], action: () => { if (currentProjectId) { setActiveTab('context'); setCurrentView('project'); } } },
    { id: 'nav-outputs', label: 'Outputs', category: 'Navigation', shortcut: '\u23187', keywords: ['generated', 'library'], action: () => { if (currentProjectId) { setActiveTab('outputs'); setCurrentView('project'); } } },
    { id: 'nav-skills', label: 'Skills', category: 'Navigation', shortcut: '\u23189', keywords: ['pm', 'abilities', 'lightning'], action: () => { if (currentProjectId) { setActiveTab('skills'); setCurrentView('project'); } } },
    { id: 'nav-agents', label: 'Agents', category: 'Navigation', shortcut: '\u23180', keywords: ['ai', 'assistant', 'automation'], action: () => { if (currentProjectId) { setActiveTab('agents'); setCurrentView('project'); } } },
    { id: 'nav-teams', label: 'Teams', category: 'Navigation', shortcut: '\u2318\u21E7T', keywords: ['multi-agent', 'workflow', 'orchestration', 'group'], action: () => { if (currentProjectId) { setActiveTab('teams'); setCurrentView('project'); } } },
    { id: 'nav-schedules', label: 'Schedules', category: 'Navigation', shortcut: '\u2318\u21E7S', keywords: ['cron', 'interval', 'timer', 'automated'], action: () => { if (currentProjectId) { setActiveTab('schedules'); setCurrentView('project'); } } },
    { id: 'panel-tracing', label: 'Tracing', category: 'Panels', keywords: ['spans', 'observability', 'trace', 'debug'], action: () => { setBottomPanelVisible(true); setBottomPanelTab('tracing'); } },
    { id: 'panel-terminal', label: 'Toggle Terminal', category: 'Panels', shortcut: '\u2318`', action: () => setBottomPanelVisible(v => !v) },
    { id: 'panel-threads', label: 'Toggle Projects', category: 'Panels', shortcut: '\u2318B', action: () => setThreadsOpen(v => !v) },
    { id: 'panel-focus', label: 'Toggle Focus Mode', category: 'Panels', shortcut: '\u2318\u21e7F', keywords: ['distraction', 'zen'], action: () => setFocusMode(v => !v) },
    ...THEMES.map(t => ({
      id: `theme-${t.id}`,
      label: `Theme: ${t.name}`,
      category: 'Appearance' as const,
      keywords: ['theme', 'color', t.name.toLowerCase()],
      action: () => { setCurrentTheme(t.id); localStorage.setItem('prodforge_theme', t.id); },
    })),
    { id: 'action-settings', label: 'Settings', category: 'Actions', keywords: ['preferences', 'api key'], action: handleSettingsClick },
    { id: 'action-home', label: 'Home', category: 'Actions', keywords: ['welcome', 'dashboard'], action: handleHomeClick },
  ], [currentProjectId]);

  const hasProject = currentView === 'project' && !!currentProjectId;

  return (
    <ToastProvider>
    {showSetupWizard && (
      <SetupWizard
        onComplete={() => { localStorage.setItem('prodforge_setup_complete', '1'); setShowSetupWizard(false); }}
        onSkip={() => setShowSetupWizard(false)}
      />
    )}
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }} className="bg-codex-bg text-codex-text-primary">
      {/* Activity Bar */}
      <ActivityBar
        activeTab={activeTab}
        onToggleThreads={() => setThreadsOpen(v => !v)}
        onToggleTerminal={() => setBottomPanelVisible(v => !v)}
        onToggleChat={async () => {
          if (currentProjectId) {
            setActiveTab('chat');
            setCurrentView('project');
          } else {
            try {
              let projects = await projectsAPI.list();
              let targetId: string;
              if (!projects || projects.length === 0) {
                const np = await projectsAPI.create('My First Project');
                targetId = np.id;
              } else {
                targetId = projects[0].id;
              }
              setCurrentProjectId(targetId);
              setActiveTab('chat');
              setCurrentView('project');
            } catch { /* ignore */ }
          }
        }}
        onToggleEditor={async () => {
          if (currentProjectId) {
            setActiveTab('editor');
            setCurrentView('project');
          } else {
            try {
              let projects = await projectsAPI.list();
              let targetId: string;
              if (!projects || projects.length === 0) {
                const np = await projectsAPI.create('My First Project');
                targetId = np.id;
              } else {
                targetId = projects[0].id;
              }
              setCurrentProjectId(targetId);
              setActiveTab('editor');
              setCurrentView('project');
            } catch { /* ignore */ }
          }
        }}
        onToggleSkills={async () => {
          if (currentProjectId) {
            setActiveTab('skills');
            setCurrentView('project');
          } else {
            try {
              let projects = await projectsAPI.list();
              let targetId: string;
              if (!projects || projects.length === 0) {
                const np = await projectsAPI.create('My First Project');
                targetId = np.id;
              } else {
                targetId = projects[0].id;
              }
              setCurrentProjectId(targetId);
              setActiveTab('skills');
              setCurrentView('project');
            } catch { /* ignore */ }
          }
        }}
        onToggleAgents={async () => {
          if (currentProjectId) {
            setActiveTab('agents');
            setCurrentView('project');
          } else {
            try {
              let projects = await projectsAPI.list();
              let targetId: string;
              if (!projects || projects.length === 0) {
                const np = await projectsAPI.create('My First Project');
                targetId = np.id;
              } else {
                targetId = projects[0].id;
              }
              setCurrentProjectId(targetId);
              setActiveTab('agents');
              setCurrentView('project');
            } catch { /* ignore */ }
          }
        }}
        onToggleTeams={async () => {
          if (currentProjectId) {
            setActiveTab('teams');
            setCurrentView('project');
          } else {
            try {
              let projects = await projectsAPI.list();
              let targetId: string;
              if (!projects || projects.length === 0) {
                const np = await projectsAPI.create('My First Project');
                targetId = np.id;
              } else {
                targetId = projects[0].id;
              }
              setCurrentProjectId(targetId);
              setActiveTab('teams');
              setCurrentView('project');
            } catch { /* ignore */ }
          }
        }}
        onToggleSchedules={async () => {
          if (currentProjectId) {
            setActiveTab('schedules');
            setCurrentView('project');
          } else {
            try {
              let projects = await projectsAPI.list();
              let targetId: string;
              if (!projects || projects.length === 0) {
                const np = await projectsAPI.create('My First Project');
                targetId = np.id;
              } else {
                targetId = projects[0].id;
              }
              setCurrentProjectId(targetId);
              setActiveTab('schedules');
              setCurrentView('project');
            } catch { /* ignore */ }
          }
        }}
        onSettingsClick={handleSettingsClick}
        onHomeClick={handleHomeClick}
        threadsOpen={threadsOpen}
        terminalActive={bottomPanelVisible}
        chatActive={activeTab === 'chat' && currentView === 'project'}
        editorActive={activeTab === 'editor' && currentView === 'project'}
        skillsActive={activeTab === 'skills' && currentView === 'project'}
        agentsActive={activeTab === 'agents' && currentView === 'project'}
        teamsActive={activeTab === 'teams' && currentView === 'project'}
        schedulesActive={activeTab === 'schedules' && currentView === 'project'}
        isSettings={currentView === 'settings'}
        isHome={currentView === 'welcome'}
      />

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Top tab bar - centered icons + search */}
        <div
          className="flex items-center justify-center gap-0.5 flex-shrink-0 border-b border-codex-border relative"
          style={{ height: '36px', backgroundColor: '#1e1e1e' }}
        >
          {/* Left: search trigger */}
          <div className="absolute left-3 flex items-center" ref={searchPanelRef}>
            <button
              onClick={() => { setSearchOpen(v => !v); setTimeout(() => searchInputRef.current?.focus(), 100); }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] transition-all duration-150 ${
                searchOpen ? 'bg-codex-surface text-codex-text-primary' : 'text-codex-text-muted hover:text-codex-text-secondary hover:bg-white/[0.04] active:bg-white/[0.08] active:scale-[0.97]'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <span className="hidden sm:inline">Search</span>
            </button>
            {searchOpen && (
              <div className="absolute left-0 top-full mt-1 w-80 rounded-lg shadow-2xl border border-codex-border z-50 overflow-hidden" style={{ backgroundColor: '#252526' }}>
                <div className="flex items-center gap-2 px-3 py-2 border-b border-codex-border">
                  <svg className="w-4 h-4 text-codex-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); } }}
                    placeholder="Search frameworks, prompts, outputs..."
                    className="flex-1 bg-transparent text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none"
                    autoFocus
                  />
                  {searchQuery && (
                    <button onClick={() => { setSearchQuery(''); setSearchResults({ frameworks: [], prompts: [], outputs: [], items: [] }); }} className="text-codex-text-muted hover:text-codex-text-primary">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {searchLoading && <div className="px-3 py-4 text-center text-[10px] text-codex-text-muted">Searching...</div>}
                  {!searchLoading && searchQuery && searchResults.frameworks.length === 0 && searchResults.prompts.length === 0 && searchResults.outputs.length === 0 && searchResults.items.length === 0 && (
                    <div className="px-3 py-4 text-center text-[10px] text-codex-text-muted">No results found</div>
                  )}
                  {searchResults.frameworks.length > 0 && (
                    <div className="py-1">
                      <div className="px-3 py-1 text-[9px] font-semibold text-codex-text-muted uppercase tracking-wider">Frameworks</div>
                      {searchResults.frameworks.map(fw => (
                        <button
                          key={fw.id}
                          onClick={() => {
                            if (currentProjectId) {
                              setActiveTab('frameworks');
                              setCurrentView('project');
                            }
                            setSearchOpen(false);
                            setSearchQuery('');
                          }}
                          className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-codex-surface/50 text-left"
                        >
                          <span className="text-sm">{fw.icon}</span>
                          <div>
                            <div className="text-xs text-codex-text-primary">{fw.name}</div>
                            <div className="text-[9px] text-codex-text-muted truncate">{fw.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.prompts.length > 0 && (
                    <div className="py-1 border-t border-codex-border/50">
                      <div className="px-3 py-1 text-[9px] font-semibold text-codex-text-muted uppercase tracking-wider">Prompts</div>
                      {searchResults.prompts.map(p => (
                        <button
                          key={p.id}
                          onClick={() => {
                            if (currentProjectId) {
                              setActiveTab('prompts');
                              setCurrentView('project');
                            }
                            setSearchOpen(false);
                            setSearchQuery('');
                          }}
                          className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-codex-surface/50 text-left"
                        >
                          <svg className="w-3.5 h-3.5 text-codex-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                          <div>
                            <div className="text-xs text-codex-text-primary">{p.name}</div>
                            <div className="text-[9px] text-codex-text-muted truncate">{p.category}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.outputs.length > 0 && (
                    <div className="py-1 border-t border-codex-border/50">
                      <div className="px-3 py-1 text-[9px] font-semibold text-codex-text-muted uppercase tracking-wider">Outputs</div>
                      {searchResults.outputs.map(o => (
                        <button
                          key={o.id}
                          onClick={() => {
                            if (currentProjectId) {
                              setActiveTab('outputs');
                              setCurrentView('project');
                            }
                            setSearchOpen(false);
                            setSearchQuery('');
                          }}
                          className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-codex-surface/50 text-left"
                        >
                          <svg className="w-3.5 h-3.5 text-codex-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" /></svg>
                          <div>
                            <div className="text-xs text-codex-text-primary">{o.name}</div>
                            <div className="text-[9px] text-codex-text-muted truncate">{o.category}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.items.length > 0 && (
                    <div className="py-1 border-t border-codex-border/50">
                      <div className="px-3 py-1 text-[9px] font-semibold text-codex-text-muted uppercase tracking-wider">Project Items</div>
                      {searchResults.items.map(item => (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (currentProjectId) {
                              setActiveTab(item.item_type === 'context_doc' ? 'context' : 'outputs');
                              setCurrentView('project');
                            }
                            setSearchOpen(false);
                            setSearchQuery('');
                          }}
                          className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-codex-surface/50 text-left"
                        >
                          <span className="text-[10px] text-codex-text-muted">{item.item_type === 'context_doc' ? 'CTX' : 'OUT'}</span>
                          <div className="text-xs text-codex-text-primary truncate">{item.name}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Center: tabs */}
          {hasProject && TAB_ICONS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); setCurrentView('project'); }}
              className={`relative flex items-center gap-1.5 px-2.5 h-full transition-all duration-150 rounded-sm ${
                activeTab === id
                  ? 'text-codex-text-primary bg-white/[0.06]'
                  : 'text-codex-text-muted hover:text-codex-text-secondary hover:bg-white/[0.04] active:bg-white/[0.08] active:scale-[0.97]'
              }`}
              title={label}
            >
              {icon}
              <span className="text-[11px]">{label}</span>
              {activeTab === id && (
                <div className="absolute bottom-0 left-1 right-1 h-[2px] bg-codex-accent rounded-t" />
              )}
            </button>
          ))}
          {!hasProject && (
            <span className="text-xs text-codex-text-muted">
              {currentView === 'settings' ? 'Settings' : 'ProdForge'}
            </span>
          )}

        </div>

        {/* Content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {currentView === 'project' && currentProjectId ? (
            <ProjectView
              key={currentProjectId}
              projectId={currentProjectId}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              initialChatMessage={pendingChatMessage}
              onInitialChatMessageConsumed={() => setPendingChatMessage(null)}
              initialProvider={homeProvider}
              initialModel={homeModel}
            />
          ) : currentView === 'settings' ? (
            <Settings />
          ) : (
            <div className="flex-1 flex flex-col bg-codex-bg overflow-y-auto" style={{ height: '100%' }}>
              <div className="flex-1 flex flex-col items-center px-4 py-8">
                <div className="w-full max-w-2xl mt-12">
                  <h1 className="text-2xl font-semibold text-codex-text-primary mb-1 text-center">
                    What are you working on?
                  </h1>
                  <p className="text-sm text-codex-text-muted mb-6 text-center">
                    Start a conversation or pick a quick action below.
                  </p>

                  {/* Chat input */}
                  <div
                    className="rounded-xl border border-codex-border mb-6"
                    style={{ backgroundColor: '#2d2d30' }}
                  >
                    <textarea
                      ref={welcomeInputRef}
                      value={welcomeInput}
                      onChange={(e) => setWelcomeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleWelcomeSubmit();
                        }
                      }}
                      placeholder="Ask anything about product strategy, frameworks, or start a new project..."
                      rows={8}
                      className="w-full px-4 pt-3 pb-2 bg-transparent text-sm text-codex-text-primary placeholder-codex-text-muted resize-none focus:outline-none"
                    />
                    <div className="flex items-center justify-between px-4 pb-3">
                      <ModelSelector
                        selectedProvider={homeProvider}
                        selectedModel={homeModel}
                        onSelect={(provider, model) => { setHomeProvider(provider); setHomeModel(model); }}
                        compact
                      />
                      <button
                        onClick={handleWelcomeSubmit}
                        disabled={!welcomeInput.trim() || welcomeLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-codex-accent text-white text-xs rounded-lg hover:bg-codex-accent/80 disabled:opacity-40 transition-colors"
                      >
                        {welcomeLoading ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                        )}
                        Start Chat
                      </button>
                    </div>
                  </div>

                  {/* Quick action pills */}
                  <div className="flex flex-wrap justify-center gap-2 mb-8">
                    {[
                      { label: 'Create a PRD', tab: 'frameworks' as Tab },
                      { label: 'RICE Scoring', tab: 'frameworks' as Tab },
                      { label: 'Competitive Analysis', tab: 'frameworks' as Tab },
                      { label: 'Browse Prompts', tab: 'prompts' as Tab },
                      { label: 'Manage Context', tab: 'context' as Tab },
                    ].map(item => (
                      <button
                        key={item.label}
                        onClick={async () => {
                          try {
                            let projects = await projectsAPI.list();
                            if (!projects || projects.length === 0) {
                              const newProject = await projectsAPI.create('My First Project');
                              if (newProject?.id) handleProjectSelect(newProject.id, item.tab);
                            } else {
                              handleProjectSelect(projects[0].id, item.tab);
                            }
                          } catch (e) {
                            console.error('Failed to navigate:', e);
                          }
                        }}
                        className="px-3 py-1.5 rounded-full border border-codex-border text-xs text-codex-text-secondary hover:text-codex-text-primary hover:border-codex-accent/50 hover:bg-codex-accent/10 active:scale-[0.96] transition-all duration-150 cursor-pointer"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  {/* Recent Project */}
                  {recentProjects.length > 0 && (
                    <div className="mb-8">
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-medium text-codex-text-secondary">Recent Project</h2>
                        <button
                          onClick={async () => {
                            try {
                              const newProject = await projectsAPI.create('New Project');
                              if (newProject?.id) handleProjectSelect(newProject.id, 'chat');
                            } catch (e) { console.error(e); }
                          }}
                          className="text-[10px] text-codex-accent hover:text-codex-accent/80 active:scale-[0.96] transition-all duration-150"
                        >
                          + New Project
                        </button>
                      </div>
                      <div className="space-y-2">
                        {recentProjects.map(project => (
                          <button
                            key={project.id}
                            onClick={() => handleProjectSelect(project.id, 'chat')}
                            className="w-full text-left p-3 rounded-lg border border-codex-border/50 hover:border-codex-accent/40 hover:bg-codex-surface/30 active:scale-[0.99] transition-all duration-150 group cursor-pointer"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-codex-text-primary group-hover:text-codex-accent transition-colors">
                                {project.name}
                              </span>
                              <span className="text-[9px] text-codex-text-muted">
                                {formatRelativeTime(project.updated_at)}
                              </span>
                            </div>
                            {project.description && (
                              <div className="text-[10px] text-codex-text-muted truncate mb-1.5">
                                {project.description}
                              </div>
                            )}
                            {project.conversations.length > 0 && (
                              <div className="space-y-0.5">
                                {project.conversations.map(convo => (
                                  <div
                                    key={convo.id}
                                    className="flex items-center gap-2 text-[10px] text-codex-text-muted"
                                  >
                                    <svg className="w-3 h-3 flex-shrink-0 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>
                                    <span className="truncate">{convo.title || 'Untitled conversation'}</span>
                                    <span className="flex-shrink-0 opacity-60">{convo.model}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {project.conversations.length === 0 && (
                              <div className="text-[10px] text-codex-text-muted/50 italic">No conversations yet</div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Feature cards */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>, label: 'AI Chat', desc: 'Strategy conversations with AI', tab: 'chat' as Tab },
                      { icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>, label: '45+ Frameworks', desc: 'PRD, JTBD, SWOT, RICE & more', tab: 'frameworks' as Tab },
                      { icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>, label: 'Prompts', desc: 'Saved templates for any task', tab: 'prompts' as Tab },
                    ].map(item => (
                      <button
                        key={item.tab}
                        onClick={async () => {
                          try {
                            let projects = await projectsAPI.list();
                            if (!projects || projects.length === 0) {
                              const newProject = await projectsAPI.create('My First Project');
                              if (newProject?.id) handleProjectSelect(newProject.id, item.tab);
                            } else {
                              handleProjectSelect(projects[0].id, item.tab);
                            }
                          } catch (e) {
                            console.error('Failed to navigate:', e);
                          }
                        }}
                        className="p-3 rounded-lg border border-codex-border/50 hover:border-codex-accent/40 hover:bg-codex-surface/30 active:scale-[0.97] transition-all duration-150 text-left group cursor-pointer"
                      >
                        <div className="text-codex-text-muted group-hover:text-codex-accent transition-colors mb-2">{item.icon}</div>
                        <div className="text-xs font-medium text-codex-text-primary mb-0.5">{item.label}</div>
                        <div className="text-[10px] text-codex-text-muted leading-relaxed">{item.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom panel */}
        {bottomPanelVisible && (
          <>
            <ResizableDivider orientation="horizontal" onResize={handleBottomPanelResize} />
            <BottomPanel
              height={bottomPanelHeight}
              projectId={currentProjectId}
              onClose={() => { setBottomPanelVisible(false); setBottomPanelTab(undefined); }}
              initialTab={bottomPanelTab as 'terminal' | 'errors' | undefined}
            />
          </>
        )}
      </div>

      {/* Threads slide-out panel */}
      {threadsOpen && (
        <ThreadsPanel
          onProjectSelect={(id) => handleProjectSelect(id)}
          onSettingsClick={handleSettingsClick}
          currentProjectId={currentProjectId}
          onClose={() => setThreadsOpen(false)}
        />
      )}

      {/* Command palette */}
      {commandPaletteOpen && (
        <CommandPalette
          commands={paletteCommands}
          onClose={() => setCommandPaletteOpen(false)}
        />
      )}

      {/* Shortcut overlay */}
      {shortcutsOpen && (
        <ShortcutOverlay onClose={() => setShortcutsOpen(false)} />
      )}

      {/* Quick Switcher */}
      {quickSwitcherOpen && (
        <QuickSwitcher
          onSelectProject={(id) => handleProjectSelect(id)}
          onSelectConversation={(projectId) => handleProjectSelect(projectId, 'chat')}
          onSelectOutput={(projectId) => handleProjectSelect(projectId, 'outputs')}
          onClose={() => setQuickSwitcherOpen(false)}
        />
      )}

      {/* Focus mode */}
      {focusMode && currentView === 'project' && currentProjectId && (
        <FocusMode onExit={() => setFocusMode(false)}>
          <ProjectView
            key={`focus-${currentProjectId}`}
            projectId={currentProjectId}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            initialChatMessage={null}
            initialProvider={homeProvider}
            initialModel={homeModel}
          />
        </FocusMode>
      )}
    </div>
    </ToastProvider>
  );
}

export default App;
