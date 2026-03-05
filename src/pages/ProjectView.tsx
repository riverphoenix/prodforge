import { useState, useEffect } from 'react';
import { Project, Settings, LLMProvider } from '../lib/types';
import { projectsAPI, settingsAPI } from '../lib/ipc';
import ChatInterface from '../components/ChatInterface';
import ConversationHistory from '../components/ConversationHistory';
import ResizableDivider from '../components/ResizableDivider';
import FrameworksHome from './FrameworksHome';
import FrameworkGenerator from '../components/FrameworkGenerator';
import FrameworkManager from '../components/FrameworkManager';
import ContextManager from './ContextManager';
import OutputsLibrary from './OutputsLibrary';
import PromptsLibrary from './PromptsLibrary';
import FileExplorer from './FileExplorer';
import SkillsLibrary from './SkillsLibrary';
import AgentsPage from './AgentsPage';
import AgentTeamsPage from './AgentTeamsPage';
import SchedulesPage from './SchedulesPage';

const MIN_HISTORY_WIDTH = 180;
const MAX_HISTORY_WIDTH = 400;
const DEFAULT_HISTORY_WIDTH = 224;

type Tab = 'documents' | 'chat' | 'frameworks' | 'prompts' | 'context' | 'outputs' | 'editor' | 'skills' | 'agents' | 'teams' | 'schedules';

interface ProjectViewProps {
  projectId: string;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  initialChatMessage?: string | null;
  onInitialChatMessageConsumed?: () => void;
  initialProvider?: LLMProvider;
  initialModel?: string;
}

export default function ProjectView({ projectId, activeTab, onTabChange, initialChatMessage, onInitialChatMessageConsumed, initialProvider, initialModel }: ProjectViewProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(undefined);
  const [historyWidth, setHistoryWidth] = useState<number>(() => {
    const saved = localStorage.getItem('conversationHistoryWidth');
    return saved ? parseInt(saved, 10) : DEFAULT_HISTORY_WIDTH;
  });

  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string | null>(null);
  const [_selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [frameworksView, setFrameworksView] = useState<'home' | 'generator' | 'manager'>('home');
  const [localPendingMessage, setLocalPendingMessage] = useState<string | null>(null);

  useEffect(() => {
    loadProjectAndSettings();
  }, [projectId]);

  const loadProjectAndSettings = async () => {
    setLoading(true);
    try {
      const [proj, sett, key] = await Promise.all([
        projectsAPI.get(projectId),
        settingsAPI.get(),
        settingsAPI.getDecryptedApiKey(),
      ]);
      setProject(proj);
      setSettings(sett);
      setApiKey(key);
    } catch (error) {
      console.error('Failed to load project or settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConversationSelect = (conversationId: string) => {
    setCurrentConversationId(conversationId);
  };

  const handleNewConversation = () => {
    setCurrentConversationId(undefined);
  };

  const handleHistoryResize = (deltaX: number) => {
    setHistoryWidth((prev) => {
      const newWidth = Math.max(MIN_HISTORY_WIDTH, Math.min(MAX_HISTORY_WIDTH, prev + deltaX));
      return newWidth;
    });
  };

  useEffect(() => {
    localStorage.setItem('conversationHistoryWidth', historyWidth.toString());
  }, [historyWidth]);

  const handleSelectFramework = (frameworkId: string, categoryId: string) => {
    setSelectedFrameworkId(frameworkId);
    setSelectedCategoryId(categoryId);
    setFrameworksView('generator');
  };

  const handleBackToFrameworksHome = () => {
    setSelectedFrameworkId(null);
    setSelectedCategoryId(null);
    setFrameworksView('home');
  };

  const handleFrameworkSave = () => {
    onTabChange('outputs');
    handleBackToFrameworksHome();
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-codex-bg">
        <div className="text-codex-text-secondary">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center bg-codex-bg">
        <div className="text-codex-text-secondary">Project not found</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }} className="bg-codex-bg">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }} className="tab-content-stretch">
        <div style={{ display: activeTab === 'chat' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {!apiKey ? (
            <div className="h-full flex items-center justify-center bg-gradient-to-br from-codex-bg via-codex-surface to-codex-accent/5">
              <div className="text-center max-w-md px-8">
                <div className="text-3xl mb-3">🔑</div>
                <h3 className="text-sm text-codex-text-primary mb-1">
                  API Key Required
                </h3>
                <p className="text-xs text-codex-text-muted mb-4">
                  Please set your OpenAI API key in Settings to start chatting with GPT.
                </p>
                <p className="text-[10px] text-codex-text-muted">
                  Click the ⚙️ Settings button in the sidebar
                </p>
              </div>
            </div>
          ) : settings && (
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
              <ConversationHistory
                projectId={projectId}
                currentConversationId={currentConversationId}
                onConversationSelect={handleConversationSelect}
                onNewConversation={handleNewConversation}
                width={historyWidth}
              />
              <ResizableDivider onResize={handleHistoryResize} />
              <ChatInterface
                projectId={projectId}
                conversationId={currentConversationId}
                apiKey={apiKey}
                settings={settings}
                initialMessage={initialChatMessage || localPendingMessage}
                onInitialMessageConsumed={() => { onInitialChatMessageConsumed?.(); setLocalPendingMessage(null); }}
                initialProvider={initialProvider}
                initialModel={initialModel}
              />
            </div>
          )}
        </div>

        {activeTab === 'frameworks' && (
          <>
            {frameworksView === 'home' ? (
              <FrameworksHome
                onSelectFramework={handleSelectFramework}
                onManage={() => setFrameworksView('manager')}
              />
            ) : frameworksView === 'manager' ? (
              <FrameworkManager onClose={handleBackToFrameworksHome} />
            ) : selectedFrameworkId ? (
              <FrameworkGenerator
                projectId={projectId}
                frameworkId={selectedFrameworkId}
                onSave={handleFrameworkSave}
                onCancel={handleBackToFrameworksHome}
              />
            ) : null}
          </>
        )}

        {activeTab === 'prompts' && (
          <PromptsLibrary
            projectId={projectId}
            onUsePrompt={(text) => {
              setLocalPendingMessage(text);
              setCurrentConversationId(undefined);
              onTabChange('chat');
            }}
          />
        )}

        {activeTab === 'context' && (
          <ContextManager projectId={projectId} />
        )}

        {activeTab === 'outputs' && (
          <OutputsLibrary projectId={projectId} />
        )}

        {activeTab === 'editor' && (
          <FileExplorer />
        )}

        {activeTab === 'skills' && (
          <SkillsLibrary projectId={projectId} />
        )}

        {activeTab === 'agents' && (
          <AgentsPage projectId={projectId} />
        )}

        {activeTab === 'teams' && (
          <AgentTeamsPage projectId={projectId} />
        )}

        {activeTab === 'schedules' && (
          <SchedulesPage projectId={projectId} />
        )}

      </div>

    </div>
  );
}
