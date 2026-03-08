import { useState } from 'react';
import { ImportPreview, ImportResult, ConflictAction } from '../lib/types';

interface BatchImportItem {
  filename: string;
  mdContent: string;
  preview: ImportPreview | null;
  error: string | null;
  action: ConflictAction;
  result: ImportResult | null;
}

interface BatchImportDialogProps {
  items: BatchImportItem[];
  onConfirm: (mdContent: string, action: ConflictAction) => Promise<ImportResult>;
  onClose: () => void;
  onDone: () => void;
}

export default function BatchImportDialog({ items: initialItems, onConfirm, onClose, onDone }: BatchImportDialogProps) {
  const [items, setItems] = useState<BatchImportItem[]>(initialItems);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  const updateAction = (index: number, action: ConflictAction) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, action } : item));
  };

  const validItems = items.filter(i => i.preview && !i.error);
  const errorItems = items.filter(i => i.error);

  const handleImportAll = async () => {
    setImporting(true);
    const updated = [...items];
    for (let i = 0; i < updated.length; i++) {
      const item = updated[i];
      if (!item.preview || item.error) continue;
      if (item.preview.already_exists && item.action === 'skip') {
        updated[i] = { ...item, result: { success: true, item_type: item.preview.item_type, id: item.preview.id, name: item.preview.name, action: 'skipped', error: undefined } };
        continue;
      }
      try {
        const result = await onConfirm(item.mdContent, item.action);
        updated[i] = { ...item, result };
      } catch (err) {
        updated[i] = { ...item, result: { success: false, item_type: item.preview.item_type, id: item.preview.id, name: item.preview.name, action: 'created', error: err instanceof Error ? err.message : String(err) } };
      }
    }
    setItems(updated);
    setDone(true);
    setImporting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-codex-bg border border-codex-border rounded-lg shadow-xl w-[600px] max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-codex-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-codex-text-primary">
            Import {items.length} File{items.length !== 1 ? 's' : ''}
          </h2>
          <button onClick={onClose} className="text-codex-text-secondary hover:text-codex-text-primary text-lg">
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2 max-h-[50vh]">
          {errorItems.length > 0 && (
            <div className="mb-3">
              <h3 className="text-xs text-red-400 mb-1">Failed to parse ({errorItems.length})</h3>
              {errorItems.map((item, i) => (
                <div key={i} className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-300 mb-1">
                  <span className="font-medium">{item.filename}</span>: {item.error}
                </div>
              ))}
            </div>
          )}

          {validItems.map((item, idx) => {
            const itemIndex = items.indexOf(item);
            return (
              <div
                key={idx}
                className="flex items-center gap-3 px-3 py-2.5 bg-codex-surface/40 border border-codex-border rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-codex-text-primary truncate">
                    {item.preview!.name}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-codex-text-muted">{item.preview!.category}</span>
                    {item.preview!.already_exists && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.preview!.is_builtin_conflict ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                        Exists
                      </span>
                    )}
                    {done && item.result && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.result.success ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                        {item.result.success ? item.result.action : 'Failed'}
                      </span>
                    )}
                  </div>
                </div>
                {!done && item.preview!.already_exists && (
                  <select
                    value={item.action}
                    onChange={(e) => updateAction(itemIndex, e.target.value as ConflictAction)}
                    className="px-2 py-1 bg-codex-surface border border-codex-border rounded text-[10px] text-codex-text-primary focus:outline-none"
                  >
                    <option value="copy">Import as Copy</option>
                    <option value="overwrite">Overwrite</option>
                    <option value="skip">Skip</option>
                  </select>
                )}
                {!done && !item.preview!.already_exists && (
                  <span className="text-[10px] text-green-400">New</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-codex-border flex justify-between items-center">
          <span className="text-xs text-codex-text-muted">
            {done
              ? `${validItems.filter(i => i.result?.success).length} imported successfully`
              : `${validItems.length} valid, ${errorItems.length} errors`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={done ? () => { onDone(); onClose(); } : onClose}
              className="px-4 py-2 border border-codex-border rounded-lg text-sm text-codex-text-secondary hover:bg-codex-surface"
            >
              {done ? 'Done' : 'Cancel'}
            </button>
            {!done && (
              <button
                onClick={handleImportAll}
                disabled={importing || validItems.length === 0}
                className="px-4 py-2 bg-codex-accent text-white rounded-lg text-sm hover:bg-codex-accent/80 disabled:opacity-50"
              >
                {importing ? 'Importing...' : `Import ${validItems.length} Items`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type { BatchImportItem };
