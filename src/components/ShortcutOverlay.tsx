import { useEffect } from 'react';
import { SHORTCUTS, Shortcut } from '../lib/shortcuts';

interface ShortcutOverlayProps {
  onClose: () => void;
}

export default function ShortcutOverlay({ onClose }: ShortcutOverlayProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const categories: Record<string, Shortcut[]> = {};
  for (const s of SHORTCUTS) {
    const cat = s.category.charAt(0).toUpperCase() + s.category.slice(1);
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(s);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/95" />
      <div
        className="relative bg-codex-surface rounded-xl border border-codex-border shadow-2xl p-8 max-w-lg w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-codex-text-primary">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-codex-text-muted hover:text-codex-text-primary text-sm">
            ESC
          </button>
        </div>

        <div className="space-y-5">
          {Object.entries(categories).map(([category, shortcuts]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-codex-text-muted uppercase tracking-wider mb-2">{category}</h3>
              <div className="space-y-1.5">
                {shortcuts.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-1">
                    <span className="text-sm text-codex-text-secondary">{s.description}</span>
                    <kbd className="px-2 py-0.5 bg-codex-bg border border-codex-border rounded text-xs text-codex-text-primary font-mono">
                      {s.label}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
