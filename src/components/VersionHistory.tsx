import { useState, useEffect } from 'react';
import { CommitInfo } from '../lib/types';
import { gitAPI } from '../lib/ipc';
import DiffViewer from './DiffViewer';

interface VersionHistoryProps {
  projectId: string;
  outputId: string;
  currentContent: string;
  onRestore: (content: string) => void;
  onClose: () => void;
}

export default function VersionHistory({ projectId, outputId, currentContent: _currentContent, onRestore, onClose }: VersionHistoryProps) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [commitContent, setCommitContent] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'diff' | 'content'>('diff');
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    loadCommits();
  }, [projectId, outputId]);

  const loadCommits = async () => {
    setLoading(true);
    try {
      const data = await gitAPI.listOutputCommits(projectId, outputId);
      setCommits(data);
    } catch (err) {
      console.error('Failed to load commits:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCommit = async (oid: string) => {
    setSelectedCommit(oid);
    try {
      const [diff, content] = await Promise.all([
        gitAPI.getCommitDiff(projectId, oid),
        gitAPI.getOutputAtCommit(projectId, outputId, oid),
      ]);
      setDiffContent(diff);
      setCommitContent(content);
    } catch (err) {
      console.error('Failed to load commit details:', err);
    }
  };

  const handleRestore = async () => {
    if (!selectedCommit) return;
    setRestoring(true);
    try {
      const content = await gitAPI.rollbackOutput(projectId, outputId, selectedCommit);
      onRestore(content);
    } catch (err) {
      console.error('Failed to restore:', err);
    } finally {
      setRestoring(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-codex-bg border border-codex-border rounded-lg shadow-xl w-[800px] max-h-[80vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-codex-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-codex-text-primary">Version History</h2>
          <button onClick={onClose} className="text-codex-text-secondary hover:text-codex-text-primary text-lg">&times;</button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-56 flex-shrink-0 border-r border-codex-border overflow-y-auto">
            {loading ? (
              <p className="text-xs text-codex-text-muted p-4 text-center">Loading...</p>
            ) : commits.length === 0 ? (
              <p className="text-xs text-codex-text-muted p-4 text-center">No version history available.</p>
            ) : (
              commits.map((commit, i) => (
                <button
                  key={commit.oid}
                  onClick={() => handleSelectCommit(commit.oid)}
                  className={`w-full text-left px-3 py-2.5 border-b border-codex-border transition-all ${
                    selectedCommit === commit.oid
                      ? 'bg-codex-accent/10'
                      : 'hover:bg-codex-surface/60'
                  }`}
                >
                  <div className="text-xs font-medium text-codex-text-primary truncate">{commit.message}</div>
                  <div className="text-[10px] text-codex-text-muted mt-0.5">{formatDate(commit.timestamp)}</div>
                  {i === 0 && (
                    <span className="text-[8px] px-1 py-0.5 bg-green-500/20 text-green-400 rounded mt-1 inline-block">Latest</span>
                  )}
                </button>
              ))
            )}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedCommit ? (
              <>
                <div className="px-4 py-2 border-b border-codex-border flex items-center justify-between">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setViewMode('diff')}
                      className={`px-2 py-1 text-[10px] rounded ${viewMode === 'diff' ? 'bg-codex-accent/20 text-codex-accent' : 'text-codex-text-secondary hover:text-codex-text-primary'}`}
                    >
                      Diff
                    </button>
                    <button
                      onClick={() => setViewMode('content')}
                      className={`px-2 py-1 text-[10px] rounded ${viewMode === 'content' ? 'bg-codex-accent/20 text-codex-accent' : 'text-codex-text-secondary hover:text-codex-text-primary'}`}
                    >
                      Full Content
                    </button>
                  </div>
                  <button
                    onClick={handleRestore}
                    disabled={restoring}
                    className="px-2 py-1 text-[10px] bg-codex-accent text-white rounded hover:bg-codex-accent/80 disabled:opacity-50"
                  >
                    {restoring ? 'Restoring...' : 'Restore This Version'}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {viewMode === 'diff' && diffContent !== null ? (
                    <DiffViewer diff={diffContent} />
                  ) : commitContent !== null ? (
                    <pre className="text-xs text-codex-text-primary whitespace-pre-wrap font-mono">{commitContent}</pre>
                  ) : (
                    <p className="text-xs text-codex-text-muted">Loading...</p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-codex-text-muted">Select a commit to view changes</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
