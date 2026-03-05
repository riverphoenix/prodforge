import { LayoutMode } from '../lib/layoutEngine';

interface LayoutBarProps {
  currentMode: LayoutMode;
  onModeChange: (mode: LayoutMode) => void;
}

export default function LayoutBar({ currentMode, onModeChange }: LayoutBarProps) {
  const layouts: { mode: LayoutMode; label: string; icon: React.ReactNode }[] = [
    {
      mode: 'single',
      label: 'Single',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="1" width="14" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ),
    },
    {
      mode: 'split-h',
      label: 'Side by Side',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="1" width="14" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ),
    },
    {
      mode: 'split-v',
      label: 'Top Bottom',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="1" width="14" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ),
    },
    {
      mode: 'triple',
      label: 'Three Columns',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="1" width="14" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <line x1="5.5" y1="1" x2="5.5" y2="15" stroke="currentColor" strokeWidth="1.5" />
          <line x1="10.5" y1="1" x2="10.5" y2="15" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ),
    },
    {
      mode: 'quad',
      label: 'Four Panes',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="1" width="14" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" />
          <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex items-center gap-0.5">
      {layouts.map(({ mode, label, icon }) => (
        <button
          key={mode}
          onClick={() => onModeChange(mode)}
          className={`p-1.5 rounded transition-all duration-150 ${
            currentMode === mode
              ? 'text-[#58a6ff] bg-[#0d419d30]'
              : 'text-[#484f58] hover:text-[#8b949e] hover:bg-white/[0.06] active:bg-white/[0.1] active:scale-90'
          }`}
          title={`${label} (${mode === 'single' ? '\u2318\u21e71' : mode === 'split-h' ? '\u2318\u21e72' : mode === 'split-v' ? '\u2318\u21e73' : mode === 'triple' ? '\u2318\u21e74' : '\u2318\u21e75'})`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
