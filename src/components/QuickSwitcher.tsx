import { useState, useEffect, useRef, useMemo } from 'react';
import { projectsAPI, conversationsAPI, frameworkOutputsAPI } from '../lib/ipc';


interface QuickSwitcherProps {
  onSelectProject: (id: string) => void;
  onSelectConversation: (projectId: string, conversationId: string) => void;
  onSelectOutput: (projectId: string, outputId: string) => void;
  onClose: () => void;
}

interface SwitcherItem {
  id: string;
  type: 'project' | 'conversation' | 'output';
  label: string;
  detail: string;
  projectId: string;
  timestamp: number;
}

export default function QuickSwitcher({ onSelectProject, onSelectConversation, onSelectOutput, onClose }: QuickSwitcherProps) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SwitcherItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      const projects = await projectsAPI.list();
      const allItems: SwitcherItem[] = [];

      for (const p of projects) {
        allItems.push({
          id: p.id,
          type: 'project',
          label: p.name,
          detail: p.description || '',
          projectId: p.id,
          timestamp: p.updated_at,
        });

        try {
          const convos = await conversationsAPI.list(p.id);
          for (const c of convos.slice(0, 5)) {
            allItems.push({
              id: c.id,
              type: 'conversation',
              label: c.title || 'Untitled',
              detail: p.name,
              projectId: p.id,
              timestamp: c.updated_at,
            });
          }
        } catch { /* ignore */ }

        try {
          const outputs = await frameworkOutputsAPI.list(p.id);
          for (const o of outputs.slice(0, 5)) {
            allItems.push({
              id: o.id,
              type: 'output',
              label: o.name,
              detail: p.name,
              projectId: p.id,
              timestamp: o.updated_at,
            });
          }
        } catch { /* ignore */ }
      }

      allItems.sort((a, b) => b.timestamp - a.timestamp);
      setItems(allItems);
    } catch { /* ignore */ }
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 20);
    const q = query.toLowerCase();
    return items
      .filter(item => item.label.toLowerCase().includes(q) || item.detail.toLowerCase().includes(q))
      .slice(0, 20);
  }, [items, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = (item: SwitcherItem) => {
    if (item.type === 'project') onSelectProject(item.projectId);
    else if (item.type === 'conversation') onSelectConversation(item.projectId, item.id);
    else if (item.type === 'output') onSelectOutput(item.projectId, item.id);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) handleSelect(filtered[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement;
      if (selected) selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const typeIcon = (type: string) => {
    switch (type) {
      case 'project': return { bg: '#0d419d30', color: '#58a6ff', label: 'P' };
      case 'conversation': return { bg: '#23863630', color: '#3fb950', label: 'C' };
      case 'output': return { bg: '#9a670030', color: '#d29922', label: 'O' };
      default: return { bg: '#21262d', color: '#8b949e', label: '?' };
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: '#00000060', zIndex: 50 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-[520px] rounded-lg shadow-2xl overflow-hidden"
        style={{ backgroundColor: '#0d1117', border: '1px solid #30363d' }}
      >
        <div className="px-4 pt-3 pb-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, conversations, outputs..."
            className="w-full px-3 py-2 rounded-md text-sm"
            style={{ backgroundColor: '#161b22', border: '1px solid #30363d', color: '#c9d1d9' }}
          />
        </div>
        <div ref={listRef} className="max-h-[350px] overflow-y-auto pb-2">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center">
              <span className="text-xs" style={{ color: '#484f58' }}>No results found</span>
            </div>
          )}
          {filtered.map((item, i) => {
            const ti = typeIcon(item.type);
            return (
              <div
                key={`${item.type}-${item.id}`}
                className="flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors"
                style={{
                  backgroundColor: i === selectedIndex ? '#161b22' : 'transparent',
                }}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span
                  className="w-5 h-5 flex items-center justify-center rounded text-[9px] font-bold flex-shrink-0"
                  style={{ backgroundColor: ti.bg, color: ti.color }}
                >
                  {ti.label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate" style={{ color: '#c9d1d9' }}>{item.label}</div>
                  {item.detail && (
                    <div className="text-[10px] truncate" style={{ color: '#484f58' }}>{item.detail}</div>
                  )}
                </div>
                <span className="text-[9px] flex-shrink-0" style={{ color: '#484f58' }}>
                  {item.type}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 px-4 py-2" style={{ borderTop: '1px solid #21262d' }}>
          <span className="text-[10px]" style={{ color: '#484f58' }}>
            <kbd className="px-1 py-0.5 rounded" style={{ backgroundColor: '#21262d' }}>Enter</kbd> to open
          </span>
          <span className="text-[10px]" style={{ color: '#484f58' }}>
            <kbd className="px-1 py-0.5 rounded" style={{ backgroundColor: '#21262d' }}>Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
