import { useState, useCallback, useRef } from 'react';
import TerminalView from './TerminalView';
import { ptyAPI } from '../lib/ipc';

interface TerminalTab {
  id: string;
  label: string;
  num: number;
  sessionId?: string;
}

interface TerminalTabsProps {
  projectId: string | null;
}

function getNextNum(tabs: TerminalTab[]): number {
  const used = new Set(tabs.map(t => t.num));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

export default function TerminalTabs({ projectId }: TerminalTabsProps) {
  const idCounter = useRef(0);
  const [tabs, setTabs] = useState<TerminalTab[]>(() => {
    const id = `tab-${++idCounter.current}`;
    return [{ id, label: 'Terminal 1', num: 1 }];
  });
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);

  const addTab = useCallback(() => {
    setTabs(prev => {
      const num = getNextNum(prev);
      const newTab: TerminalTab = {
        id: `tab-${++idCounter.current}`,
        label: `Terminal ${num}`,
        num,
      };
      setTimeout(() => setActiveTabId(newTab.id), 0);
      return [...prev, newTab];
    });
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      const tab = prev[idx];
      if (tab?.sessionId) {
        ptyAPI.close(tab.sessionId).catch(() => {});
      }
      const next = prev.filter(t => t.id !== tabId);
      if (next.length === 0) {
        const newTab: TerminalTab = { id: `tab-${++idCounter.current}`, label: 'Terminal 1', num: 1 };
        setTimeout(() => setActiveTabId(newTab.id), 0);
        return [newTab];
      }
      if (tabId === activeTabId) {
        const newIdx = Math.min(idx, next.length - 1);
        setTimeout(() => setActiveTabId(next[newIdx].id), 0);
      }
      return next;
    });
  }, [activeTabId]);

  const handleSessionCreated = useCallback((tabId: string, sessionId: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, sessionId } : t));
  }, []);

  return (
    <div className="flex flex-col h-full bg-codex-bg">
      <div className="flex items-center gap-0 border-b border-codex-border/30 flex-shrink-0" style={{ height: '28px' }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`flex items-center gap-1.5 px-3 h-full cursor-pointer text-[11px] border-r border-codex-border/20 ${
              tab.id === activeTabId
                ? 'text-codex-text-primary bg-codex-bg'
                : 'text-codex-text-muted bg-codex-sidebar hover:bg-codex-bg'
            }`}
            onClick={() => setActiveTabId(tab.id)}
          >
            <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3M5.25 20.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <span>{tab.label}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                className="ml-1 text-codex-text-muted hover:text-codex-text-primary opacity-0 group-hover:opacity-100 hover:opacity-100"
                style={{ opacity: tab.id === activeTabId ? 0.6 : 0 }}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addTab}
          className="px-2 h-full text-codex-text-muted hover:text-codex-text-primary transition-colors"
          title="New Terminal"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className="h-full"
            style={{ display: tab.id === activeTabId ? 'block' : 'none' }}
          >
            <TerminalView
              projectId={projectId}
              onSessionCreated={(sid) => handleSessionCreated(tab.id, sid)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}