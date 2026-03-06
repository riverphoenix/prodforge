import { useState } from 'react';

type Tab = 'documents' | 'chat' | 'frameworks' | 'prompts' | 'context' | 'outputs' | 'editor' | 'skills' | 'agents' | 'teams' | 'schedules' | 'claude';

interface ActivityBarProps {
  activeTab: Tab;
  onToggleThreads: () => void;
  onToggleTerminal: () => void;
  onToggleClaude: () => void;
  onToggleChat: () => void;
  onToggleEditor: () => void;
  onToggleFrameworks: () => void;
  onTogglePrompts: () => void;
  onToggleContext: () => void;
  onToggleOutputs: () => void;
  onToggleSkills: () => void;
  onToggleAgents: () => void;
  onToggleTeams: () => void;
  onToggleSchedules: () => void;
  onSettingsClick: () => void;
  onHomeClick: () => void;
  threadsOpen: boolean;
  terminalActive: boolean;
  claudeActive: boolean;
  chatActive: boolean;
  editorActive: boolean;
  frameworksActive: boolean;
  promptsActive: boolean;
  contextActive: boolean;
  outputsActive: boolean;
  skillsActive: boolean;
  agentsActive: boolean;
  teamsActive: boolean;
  schedulesActive: boolean;
  isSettings: boolean;
  isHome: boolean;
}

export default function ActivityBar({
  onToggleThreads,
  onToggleTerminal,
  onToggleClaude,
  onToggleChat,
  onToggleEditor,
  onToggleFrameworks,
  onTogglePrompts,
  onToggleContext,
  onToggleOutputs,
  onToggleSkills,
  onToggleAgents,
  onToggleTeams,
  onToggleSchedules,
  onSettingsClick,
  onHomeClick,
  threadsOpen,
  terminalActive,
  claudeActive,
  chatActive,
  editorActive,
  frameworksActive,
  promptsActive,
  contextActive,
  outputsActive,
  skillsActive,
  agentsActive,
  teamsActive,
  schedulesActive,
  isSettings,
  isHome,
}: ActivityBarProps) {
  const [hoveredIcon, setHoveredIcon] = useState<string | null>(null);

  const IconButton = ({ id, title, active, onClick, children }: {
    id: string;
    title: string;
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <div className="relative flex items-center justify-center">
      {active && (
        <div className="absolute left-0 w-[2px] h-5 bg-codex-text-primary rounded-r" />
      )}
      <button
        onClick={onClick}
        onMouseEnter={() => setHoveredIcon(id)}
        onMouseLeave={() => setHoveredIcon(null)}
        className={`w-10 h-10 flex items-center justify-center rounded-md transition-all duration-150 ${
          active
            ? 'text-codex-text-primary bg-white/[0.08]'
            : 'text-codex-text-muted hover:text-codex-text-primary hover:bg-white/[0.06] active:bg-white/[0.12] active:scale-[0.92]'
        }`}
        title={title}
      >
        {children}
      </button>
      {hoveredIcon === id && (
        <div
          className="absolute left-12 border border-codex-border px-2 py-1 rounded text-[10px] text-codex-text-primary whitespace-nowrap z-50 shadow-lg pointer-events-none"
          style={{ backgroundColor: '#3c3c3c' }}
        >
          {title}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="flex flex-col items-center flex-shrink-0 border-r border-codex-border"
      style={{ width: '48px', backgroundColor: '#181818' }}
    >
      {/* Top icons */}
      <div className="flex flex-col items-center gap-0.5 pt-1">
        <IconButton id="threads" title="Projects" active={threadsOpen} onClick={onToggleThreads}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
          </svg>
        </IconButton>
      </div>

      <div className="w-6 border-t border-codex-border my-1.5" />

      {/* Utility icons */}
      <div className="flex flex-col items-center gap-0.5">
        <IconButton id="home" title="Home" active={isHome} onClick={onHomeClick}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        </IconButton>

        <IconButton id="chat" title="Chat" active={chatActive} onClick={onToggleChat}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
        </IconButton>

        <IconButton id="editor" title="Editor" active={editorActive} onClick={onToggleEditor}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
          </svg>
        </IconButton>

        <IconButton id="frameworks" title="Frameworks" active={frameworksActive} onClick={onToggleFrameworks}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
        </IconButton>

        <IconButton id="prompts" title="Prompts" active={promptsActive} onClick={onTogglePrompts}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </IconButton>

        <IconButton id="context" title="Context" active={contextActive} onClick={onToggleContext}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </IconButton>

        <IconButton id="outputs" title="Outputs" active={outputsActive} onClick={onToggleOutputs}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
          </svg>
        </IconButton>

        <IconButton id="claude" title="Claude" active={claudeActive} onClick={onToggleClaude}>
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.83 1.5h3.84L24 22.5h-3.84l-6.33-21zm-7.5 0H2.49L8.82 22.5h3.84L6.33 1.5z"/>
          </svg>
        </IconButton>

        <IconButton id="terminal" title="Terminal" active={terminalActive} onClick={onToggleTerminal}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </IconButton>

        <div className="w-6 border-t border-codex-border my-1" />

        <IconButton id="skills" title="Skills" active={skillsActive} onClick={onToggleSkills}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
        </IconButton>

        <IconButton id="agents" title="Agents" active={agentsActive} onClick={onToggleAgents}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
        </IconButton>

        <IconButton id="teams" title="Teams" active={teamsActive} onClick={onToggleTeams}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
        </IconButton>

        <IconButton id="schedules" title="Schedules" active={schedulesActive} onClick={onToggleSchedules}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </IconButton>

      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom icons */}
      <div className="flex flex-col items-center gap-0.5 pb-2">
        <IconButton id="settings" title="Settings" active={isSettings} onClick={onSettingsClick}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </IconButton>
      </div>
    </div>
  );
}
