import { useState } from 'react';
import { ImportPreview, ImportResult, ConflictAction } from '../lib/types';

interface ImportPreviewDialogProps {
  preview: ImportPreview;
  onConfirm: (action: ConflictAction) => Promise<ImportResult>;
  onClose: () => void;
}

export default function ImportPreviewDialog({ preview, onConfirm, onClose }: ImportPreviewDialogProps) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async (action: ConflictAction) => {
    setImporting(true);
    setError(null);
    try {
      const res = await onConfirm(action);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-codex-bg border border-codex-border rounded-lg shadow-xl w-[500px] max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-codex-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-codex-text-primary">
            Import {preview.item_type === 'framework' ? 'Framework' : 'Prompt'}
          </h2>
          <button onClick={onClose} className="text-codex-text-secondary hover:text-codex-text-primary text-lg">
            &times;
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {result ? (
            <div className="space-y-3">
              <div className={`p-3 rounded-lg border ${result.success ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                <p className="text-sm text-codex-text-primary">
                  {result.success
                    ? `Successfully ${result.action}: ${result.name}`
                    : `Failed: ${result.error}`}
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
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-codex-text-secondary">
                    {preview.item_type}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-codex-surface border border-codex-border text-codex-text-secondary">
                    {preview.category}
                  </span>
                </div>
                <h3 className="text-base font-medium text-codex-text-primary">{preview.name}</h3>
                <p className="text-sm text-codex-text-secondary">{preview.description}</p>
              </div>

              {preview.already_exists && (
                <div className={`p-3 rounded-lg border ${preview.is_builtin_conflict ? 'border-red-500/30 bg-red-500/10' : 'border-yellow-500/30 bg-yellow-500/10'}`}>
                  <p className="text-sm text-codex-text-primary">
                    {preview.is_builtin_conflict
                      ? 'This conflicts with a built-in item. Overwriting will modify the original.'
                      : 'An item with this ID already exists.'}
                  </p>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={onClose}
                  disabled={importing}
                  className="px-4 py-2 border border-codex-border rounded-lg text-sm text-codex-text-secondary hover:bg-codex-surface"
                >
                  Cancel
                </button>
                {preview.already_exists && (
                  <>
                    <button
                      onClick={() => handleImport('copy')}
                      disabled={importing}
                      className="px-4 py-2 border border-codex-border rounded-lg text-sm text-codex-text-primary hover:bg-codex-surface"
                    >
                      {importing ? 'Importing...' : 'Import as Copy'}
                    </button>
                    <button
                      onClick={() => handleImport('overwrite')}
                      disabled={importing}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                    >
                      {importing ? 'Importing...' : 'Overwrite'}
                    </button>
                  </>
                )}
                {!preview.already_exists && (
                  <button
                    onClick={() => handleImport('copy')}
                    disabled={importing}
                    className="px-4 py-2 bg-codex-accent text-white rounded-lg text-sm hover:bg-codex-accent/80"
                  >
                    {importing ? 'Importing...' : 'Import'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
