import { useState } from 'react';
import { integrationsAPI } from '../lib/ipc';

interface ExportToNotionDialogProps {
  outputId: string;
  outputName: string;
  defaultParentPageId?: string;
  onClose: () => void;
}

export default function ExportToNotionDialog({ outputId, outputName, defaultParentPageId, onClose }: ExportToNotionDialogProps) {
  const [title, setTitle] = useState(outputName);
  const [parentPageId, setParentPageId] = useState(defaultParentPageId || '');
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; url?: string; error?: string } | null>(null);

  const handleExport = async () => {
    if (!parentPageId.trim() || !title.trim()) return;
    setExporting(true);
    try {
      const res = await integrationsAPI.exportToNotion(outputId, parentPageId, title);
      setResult({
        success: res.success,
        url: res.page_url || undefined,
        error: res.error || undefined,
      });
    } catch (err) {
      setResult({ success: false, error: String(err) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-codex-bg border border-codex-border rounded-lg shadow-xl w-[480px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-codex-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-codex-text-primary">Export to Notion</h2>
          <button onClick={onClose} className="text-codex-text-secondary hover:text-codex-text-primary text-lg">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {result ? (
            <div className={`p-4 rounded-lg ${result.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
              {result.success ? (
                <div>
                  <p className="text-sm text-green-400 font-medium mb-2">Page created successfully!</p>
                  {result.url && (
                    <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-xs text-codex-accent hover:underline">
                      Open in Notion
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm text-red-400">{result.error || 'Export failed'}</p>
              )}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs text-codex-text-muted mb-1">Page Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-codex-accent"
                />
              </div>

              <div>
                <label className="block text-xs text-codex-text-muted mb-1">Parent Page ID</label>
                <input
                  type="text"
                  value={parentPageId}
                  onChange={e => setParentPageId(e.target.value)}
                  placeholder="Enter Notion page ID"
                  className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                />
                <p className="text-[10px] text-codex-text-muted mt-1">
                  The exported page will be created as a child of this page.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-codex-border flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleExport}
              disabled={exporting || !parentPageId.trim() || !title.trim()}
              className="px-3 py-1.5 text-xs bg-codex-accent text-white rounded hover:bg-codex-accent/80 disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
