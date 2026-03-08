import { useState, useEffect } from 'react';
import { integrationsAPI } from '../lib/ipc';
import { JiraProject } from '../lib/types';

interface ExportToJiraDialogProps {
  outputId: string;
  outputName: string;
  onClose: () => void;
}

export default function ExportToJiraDialog({ outputId, outputName, onClose }: ExportToJiraDialogProps) {
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [issueType, setIssueType] = useState('Story');
  const [summary, setSummary] = useState(outputName);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; url?: string; error?: string } | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await integrationsAPI.listJiraProjects();
      setProjects(data);
      if (data.length > 0) setSelectedProject(data[0].key);
    } catch (err) {
      console.error('Failed to load Jira projects:', err);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleExport = async () => {
    if (!selectedProject || !summary.trim()) return;
    setExporting(true);
    try {
      const res = await integrationsAPI.exportToJira(outputId, selectedProject, issueType, summary);
      setResult({
        success: res.success,
        url: res.issue_url || undefined,
        error: res.error || undefined,
      });
    } catch (err) {
      setResult({ success: false, error: String(err) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-codex-bg border border-codex-border rounded-lg shadow-xl w-[480px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-codex-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-codex-text-primary">Export to Jira</h2>
          <button onClick={onClose} className="text-codex-text-secondary hover:text-codex-text-primary text-lg">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {result ? (
            <div className={`p-4 rounded-lg ${result.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
              {result.success ? (
                <div>
                  <p className="text-sm text-green-400 font-medium mb-2">Issue created successfully!</p>
                  {result.url && (
                    <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-xs text-codex-accent hover:underline">
                      Open in Jira
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
                <label className="block text-xs text-codex-text-muted mb-1">Summary</label>
                <input
                  type="text"
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-codex-accent"
                />
              </div>

              <div>
                <label className="block text-xs text-codex-text-muted mb-1">Project</label>
                {loadingProjects ? (
                  <p className="text-xs text-codex-text-muted">Loading projects...</p>
                ) : (
                  <select
                    value={selectedProject}
                    onChange={e => setSelectedProject(e.target.value)}
                    className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  >
                    {projects.map(p => (
                      <option key={p.key} value={p.key}>{p.key} - {p.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs text-codex-text-muted mb-1">Issue Type</label>
                <select
                  value={issueType}
                  onChange={e => setIssueType(e.target.value)}
                  className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-codex-accent"
                >
                  <option value="Story">Story</option>
                  <option value="Task">Task</option>
                  <option value="Bug">Bug</option>
                </select>
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
              disabled={exporting || !selectedProject || !summary.trim()}
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
