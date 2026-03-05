import { useState } from 'react';

type Tab = 'documents' | 'chat' | 'frameworks' | 'prompts' | 'context' | 'outputs' | 'editor';

interface ActivityBarProps {
  activeTab: Tab;
  onToggleThreads: () => void;
  onToggleTerminal: () => void;
  onToggleChat: () => void;
  onToggleEditor: () => void;
  onSettingsClick: () => void;
  onHomeClick: () => void;
  threadsOpen: boolean;
  terminalActive: boolean;
  chatActive: boolean;
  editorActive: boolean;
  isSettings: boolean;
  isHome: boolean;
}

export default function ActivityBar({
  onToggleThreads,
  onToggleTerminal,
  onToggleChat,
  onToggleEditor,
  onSettingsClick,
  onHomeClick,
  threadsOpen,
  terminalActive,
  chatActive,
  editorActive,
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

        <IconButton id="terminal" title="Terminal" active={terminalActive} onClick={onToggleTerminal}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
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
