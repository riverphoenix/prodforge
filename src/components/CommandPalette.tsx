import { useState, useEffect, useRef, useMemo } from 'react';
import { Command, searchCommands } from '../lib/commandRegistry';

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

export default function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => searchCommands(commands, query), [commands, query]);

  const grouped = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of filtered) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filtered]);

  const flatList = useMemo(() => filtered, [filtered]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const selected = listRef.current?.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const executeCommand = (cmd: Command) => {
    onClose();
    cmd.action();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatList.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatList[selectedIndex]) {
          executeCommand(flatList[selectedIndex]);
        }
        break;
    }
  };

  let flatIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80" />
      <div
        className="relative border border-codex-border rounded-lg shadow-2xl w-full max-w-lg overflow-hidden bg-codex-surface"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="p-3 border-b border-codex-border flex items-center gap-2">
          <svg className="w-4 h-4 text-codex-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command..."
            className="w-full bg-transparent text-sm text-codex-text-primary placeholder-codex-text-muted outline-none"
          />
          <kbd className="text-[10px] text-codex-text-dimmed bg-codex-bg px-1.5 py-0.5 rounded border border-codex-border flex-shrink-0">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {flatList.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-codex-text-muted">
              No commands found
            </div>
          ) : (
            Object.entries(grouped).map(([category, cmds]) => (
              <div key={category}>
                <div className="px-3 py-1.5 text-[10px] text-codex-text-dimmed uppercase tracking-wider font-medium">
                  {category}
                </div>
                {cmds.map(cmd => {
                  const currentIndex = flatIndex++;
                  const isSelected = currentIndex === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      data-selected={isSelected}
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                        isSelected
                          ? 'bg-codex-accent/15 text-codex-text-primary'
                          : 'text-codex-text-secondary hover:bg-codex-surface-hover'
                      }`}
                      onClick={() => executeCommand(cmd)}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                    >
                      <span className="text-xs flex-1 truncate">{cmd.label}</span>
                      {cmd.description && (
                        <span className="text-[10px] text-codex-text-dimmed truncate max-w-[200px]">{cmd.description}</span>
                      )}
                      {cmd.shortcut && (
                        <kbd className="text-[10px] text-codex-text-dimmed bg-codex-bg px-1.5 py-0.5 rounded border border-codex-border flex-shrink-0 ml-auto">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
