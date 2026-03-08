import { useState, useMemo } from 'react';
import { FrameworkDefinition, SavedPrompt, BatchExportResult } from '../lib/types';

interface BatchExportDialogProps {
  mode: 'frameworks' | 'prompts';
  items: (FrameworkDefinition | SavedPrompt)[];
  onExport: (ids: string[]) => Promise<BatchExportResult[]>;
  onSaveFiles: (results: BatchExportResult[]) => Promise<void>;
  onClose: () => void;
}

export default function BatchExportDialog({ mode, items, onExport, onSaveFiles, onClose }: BatchExportDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(items.map(i => i.id)));
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportedCount, setExportedCount] = useState(0);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const cat = item.category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return map;
  }, [items]);

  const allSelected = selected.size === items.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map(i => i.id)));
    }
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleExport = async () => {
    if (selected.size === 0) return;
    setExporting(true);
    setError(null);
    try {
      const ids = Array.from(selected);
      const results = await onExport(ids);
      await onSaveFiles(results);
      setExportedCount(results.length);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const label = mode === 'frameworks' ? 'Frameworks' : 'Prompts';

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-codex-bg border border-codex-border rounded-lg shadow-xl w-[550px] max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-codex-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-codex-text-primary">Export {label}</h2>
          <button onClick={onClose} className="text-codex-text-secondary hover:text-codex-text-primary text-lg">
            &times;
          </button>
        </div>

        {done ? (
          <div className="p-5 space-y-4">
            <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/10">
              <p className="text-sm text-codex-text-primary">
                Successfully exported {exportedCount} {mode}.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-codex-accent text-white rounded-lg text-sm hover:bg-codex-accent/80"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <button
                onClick={toggleAll}
                className="text-xs text-codex-accent hover:text-codex-accent/80"
              >
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-xs text-codex-text-secondary">
                {selected.size} of {items.length} selected
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-3 max-h-[50vh]">
              {Array.from(grouped.entries()).map(([category, catItems]) => (
                <div key={category}>
                  <h3 className="text-xs uppercase tracking-wider text-codex-text-secondary mb-1.5">
                    {category}
                  </h3>
                  <div className="space-y-1">
                    {catItems.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-codex-surface cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggle(item.id)}
                          className="rounded border-codex-border text-codex-accent focus:ring-codex-accent/50"
                        />
                        <span className="text-sm text-codex-text-primary">
                          {'icon' in item ? (item as FrameworkDefinition).icon + ' ' : ''}
                          {item.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <div className="px-5 pb-3">
                <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              </div>
            )}

            <div className="px-5 py-4 border-t border-codex-border flex justify-end gap-2">
              <button
                onClick={onClose}
                disabled={exporting}
                className="px-4 py-2 border border-codex-border rounded-lg text-sm text-codex-text-secondary hover:bg-codex-surface"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exporting || selected.size === 0}
                className="px-4 py-2 bg-codex-accent text-white rounded-lg text-sm hover:bg-codex-accent/80 disabled:opacity-50"
              >
                {exporting ? 'Exporting...' : `Export ${selected.size} ${label}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
