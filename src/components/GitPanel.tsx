import { useState, useEffect, useCallback } from 'react';
import { gitAPI } from '../lib/ipc';
import { GitFileStatus, GitBranchInfo, GitLogEntry, GitRemoteInfo } from '../lib/types';

interface GitPanelProps {
  repoPath: string | null;
  onRequestRepoConnect?: () => void;
}

type GitTab = 'changes' | 'history' | 'branches';

export default function GitPanel({ repoPath, onRequestRepoConnect }: GitPanelProps) {
  const [activeTab, setActiveTab] = useState<GitTab>('changes');
  const [files, setFiles] = useState<GitFileStatus[]>([]);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [currentBranch, setCurrentBranch] = useState('');
  const [logEntries, setLogEntries] = useState<GitLogEntry[]>([]);
  const [remotes, setRemotes] = useState<GitRemoteInfo[]>([]);
  const [commitMsg, setCommitMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffText, setDiffText] = useState<string | null>(null);
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const [statusResult, branchResult, currentResult, remotesResult] = await Promise.all([
        gitAPI.status(repoPath),
        gitAPI.branches(repoPath),
        gitAPI.currentBranch(repoPath),
        gitAPI.remoteInfo(repoPath),
      ]);
      setFiles(statusResult);
      setBranches(branchResult);
      setCurrentBranch(currentResult);
      setRemotes(remotesResult);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  const loadHistory = useCallback(async () => {
    if (!repoPath) return;
    try {
      const entries = await gitAPI.log(repoPath, 50);
      setLogEntries(entries);
    } catch (err) {
      setError(String(err));
    }
  }, [repoPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab, loadHistory]);

  const handleStageFile = async (path: string) => {
    if (!repoPath) return;
    await gitAPI.stageFiles(repoPath, [path]);
    refresh();
  };

  const handleUnstageFile = async (path: string) => {
    if (!repoPath) return;
    await gitAPI.unstageFiles(repoPath, [path]);
    refresh();
  };

  const handleStageAll = async () => {
    if (!repoPath) return;
    await gitAPI.stageAll(repoPath);
    refresh();
  };

  const handleCommit = async () => {
    if (!repoPath || !commitMsg.trim()) return;
    try {
      await gitAPI.commit(repoPath, commitMsg.trim());
      setCommitMsg('');
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleCheckout = async (branchName: string) => {
    if (!repoPath) return;
    try {
      await gitAPI.checkoutBranch(repoPath, branchName);
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleCreateBranch = async () => {
    if (!repoPath || !newBranchName.trim()) return;
    try {
      await gitAPI.createBranch(repoPath, newBranchName.trim());
      setNewBranchName('');
      setShowNewBranch(false);
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleShowDiff = async (staged: boolean) => {
    if (!repoPath) return;
    try {
      const d = staged ? await gitAPI.diffStaged(repoPath) : await gitAPI.diffWorking(repoPath);
      setDiffText(d || '(no changes)');
    } catch (err) {
      setError(String(err));
    }
  };

  if (!repoPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 bg-codex-bg">
        <svg className="w-8 h-8" style={{ color: '#484f58' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12m0 0c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 0V9m12-6v6m0 0c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 0V3" />
        </svg>
        <span className="text-xs" style={{ color: '#484f58' }}>No repository connected</span>
        {onRequestRepoConnect && (
          <button
            onClick={onRequestRepoConnect}
            className="px-3 py-1.5 rounded text-xs transition-colors"
            style={{ backgroundColor: '#238636', color: '#fff' }}
          >
            Connect Repository
          </button>
        )}
      </div>
    );
  }

  const stagedFiles = files.filter(f => f.staged);
  const unstagedFiles = files.filter(f => !f.staged);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'added': case 'untracked': return { letter: 'A', color: '#3fb950' };
      case 'modified': return { letter: 'M', color: '#d29922' };
      case 'deleted': return { letter: 'D', color: '#f85149' };
      case 'renamed': return { letter: 'R', color: '#a371f7' };
      case 'conflicted': return { letter: 'C', color: '#f85149' };
      default: return { letter: '?', color: '#8b949e' };
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString();
  };

  if (diffText !== null) {
    return (
      <div className="flex flex-col h-full bg-codex-bg">
        <div className="flex items-center px-3 gap-2 flex-shrink-0" style={{ height: '30px', borderBottom: '1px solid #21262d' }}>
          <button
            onClick={() => setDiffText(null)}
            className="text-xs transition-colors"
            style={{ color: '#58a6ff' }}
          >
            Back
          </button>
          <span className="text-xs" style={{ color: '#8b949e' }}>Diff</span>
        </div>
        <div className="flex-1 overflow-auto px-3 py-2" style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: '11px', lineHeight: '1.5' }}>
          {diffText.split('\n').map((line, i) => {
            let color = '#8b949e';
            let bg = 'transparent';
            if (line.startsWith('+')) { color = '#3fb950'; bg = '#12261e'; }
            else if (line.startsWith('-')) { color = '#f85149'; bg = '#2d1215'; }
            else if (line.startsWith('@@')) { color = '#a371f7'; }
            return (
              <div key={i} style={{ color, backgroundColor: bg, paddingLeft: '4px' }}>
                <pre style={{ margin: 0, fontFamily: 'inherit' }}>{line}</pre>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-codex-bg">
      <div className="flex items-center px-3 gap-1 flex-shrink-0" style={{ height: '30px', borderBottom: '1px solid #21262d' }}>
        <button
          onClick={() => setActiveTab('changes')}
          className="px-2.5 py-1 text-xs rounded transition-colors"
          style={{ color: activeTab === 'changes' ? '#c9d1d9' : '#484f58', backgroundColor: activeTab === 'changes' ? '#21262d' : 'transparent', fontSize: '11.5px' }}
        >
          Changes {files.length > 0 && <span style={{ color: '#58a6ff' }}>({files.length})</span>}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className="px-2.5 py-1 text-xs rounded transition-colors"
          style={{ color: activeTab === 'history' ? '#c9d1d9' : '#484f58', backgroundColor: activeTab === 'history' ? '#21262d' : 'transparent', fontSize: '11.5px' }}
        >
          History
        </button>
        <button
          onClick={() => setActiveTab('branches')}
          className="px-2.5 py-1 text-xs rounded transition-colors"
          style={{ color: activeTab === 'branches' ? '#c9d1d9' : '#484f58', backgroundColor: activeTab === 'branches' ? '#21262d' : 'transparent', fontSize: '11.5px' }}
        >
          Branches
        </button>
        <div className="flex-1" />
        <span className="text-[10px] px-2 py-0.5 rounded" style={{ color: '#58a6ff', backgroundColor: '#0d419d30' }}>
          {currentBranch}
        </span>
        {remotes.length > 0 && (
          <span className="text-[10px]" style={{ color: '#484f58' }} title={remotes[0].url}>
            {remotes[0].name}
          </span>
        )}
        <button
          onClick={refresh}
          className="p-0.5 transition-colors"
          style={{ color: '#484f58' }}
          title="Refresh"
        >
          {loading ? (
            <div className="w-3.5 h-3.5 border-2 border-[#58a6ff30] border-t-[#58a6ff] rounded-full animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          )}
        </button>
      </div>

      {error && (
        <div className="px-3 py-1.5 text-xs" style={{ color: '#f85149', backgroundColor: '#2d121530', borderBottom: '1px solid #21262d' }}>
          {error}
          <button onClick={() => setError(null)} className="ml-2" style={{ color: '#484f58' }}>dismiss</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'changes' && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto">
              {stagedFiles.length > 0 && (
                <div>
                  <div className="flex items-center px-3 py-1.5" style={{ borderBottom: '1px solid #21262d' }}>
                    <span className="text-[11px] font-medium" style={{ color: '#8b949e' }}>
                      Staged ({stagedFiles.length})
                    </span>
                    <div className="flex-1" />
                    <button
                      onClick={() => handleShowDiff(true)}
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ color: '#58a6ff' }}
                    >
                      Diff
                    </button>
                  </div>
                  {stagedFiles.map((f, i) => {
                    const si = statusIcon(f.status);
                    return (
                      <div key={`s-${i}`} className="flex items-center px-3 py-1 gap-2 hover:bg-[#161b22]">
                        <span className="text-[10px] font-mono w-3 text-center" style={{ color: si.color }}>{si.letter}</span>
                        <span className="text-xs flex-1 truncate" style={{ color: '#c9d1d9' }}>{f.path}</span>
                        <button
                          onClick={() => handleUnstageFile(f.path)}
                          className="text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100"
                          style={{ color: '#f85149' }}
                          title="Unstage"
                        >
                          -
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {unstagedFiles.length > 0 && (
                <div>
                  <div className="flex items-center px-3 py-1.5" style={{ borderBottom: '1px solid #21262d' }}>
                    <span className="text-[11px] font-medium" style={{ color: '#8b949e' }}>
                      Changes ({unstagedFiles.length})
                    </span>
                    <div className="flex-1" />
                    <button
                      onClick={() => handleShowDiff(false)}
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ color: '#58a6ff' }}
                    >
                      Diff
                    </button>
                    <button
                      onClick={handleStageAll}
                      className="text-[10px] px-1.5 py-0.5 rounded ml-1"
                      style={{ color: '#3fb950' }}
                    >
                      Stage All
                    </button>
                  </div>
                  {unstagedFiles.map((f, i) => {
                    const si = statusIcon(f.status);
                    return (
                      <div key={`u-${i}`} className="flex items-center px-3 py-1 gap-2 hover:bg-[#161b22] group">
                        <span className="text-[10px] font-mono w-3 text-center" style={{ color: si.color }}>{si.letter}</span>
                        <span className="text-xs flex-1 truncate" style={{ color: '#c9d1d9' }}>{f.path}</span>
                        <button
                          onClick={() => handleStageFile(f.path)}
                          className="text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100"
                          style={{ color: '#3fb950' }}
                          title="Stage"
                        >
                          +
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {files.length === 0 && !loading && (
                <div className="flex items-center justify-center h-32">
                  <span className="text-xs" style={{ color: '#484f58' }}>Working tree clean</span>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 px-3 py-2" style={{ borderTop: '1px solid #21262d' }}>
              <textarea
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder="Commit message..."
                className="w-full px-2.5 py-1.5 rounded text-xs resize-none"
                style={{ backgroundColor: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', minHeight: '48px', fontFamily: 'inherit' }}
                rows={2}
              />
              <button
                onClick={handleCommit}
                disabled={!commitMsg.trim() || stagedFiles.length === 0}
                className="w-full mt-1.5 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-40"
                style={{ backgroundColor: '#238636', color: '#fff' }}
              >
                Commit ({stagedFiles.length} staged)
              </button>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            {logEntries.map((entry) => (
              <div
                key={entry.oid}
                className="px-3 py-2 hover:bg-[#161b22] transition-colors"
                style={{ borderBottom: '1px solid #21262d10' }}
              >
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-mono flex-shrink-0 mt-0.5" style={{ color: '#58a6ff' }}>
                    {entry.oid.slice(0, 7)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate" style={{ color: '#c9d1d9' }}>
                      {entry.message.split('\n')[0]}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: '#484f58' }}>
                      {entry.author} · {formatTime(entry.timestamp)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {logEntries.length === 0 && !loading && (
              <div className="flex items-center justify-center h-32">
                <span className="text-xs" style={{ color: '#484f58' }}>No commits yet</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'branches' && (
          <div>
            {showNewBranch && (
              <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid #21262d' }}>
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="New branch name..."
                  className="flex-1 px-2 py-1 rounded text-xs"
                  style={{ backgroundColor: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9' }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBranch(); if (e.key === 'Escape') setShowNewBranch(false); }}
                  autoFocus
                />
                <button onClick={handleCreateBranch} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#238636', color: '#fff' }}>
                  Create
                </button>
                <button onClick={() => setShowNewBranch(false)} className="text-xs" style={{ color: '#484f58' }}>
                  Cancel
                </button>
              </div>
            )}
            <div className="flex items-center px-3 py-1.5" style={{ borderBottom: '1px solid #21262d' }}>
              <span className="text-[11px] font-medium" style={{ color: '#8b949e' }}>Local</span>
              <div className="flex-1" />
              <button
                onClick={() => setShowNewBranch(true)}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ color: '#3fb950' }}
              >
                + New
              </button>
            </div>
            {branches.filter(b => !b.is_remote).map((b) => (
              <div
                key={b.name}
                className="flex items-center px-3 py-1.5 gap-2 hover:bg-[#161b22] cursor-pointer"
                onClick={() => !b.is_current && handleCheckout(b.name)}
              >
                {b.is_current ? (
                  <svg className="w-3 h-3 flex-shrink-0" style={{ color: '#3fb950' }} fill="currentColor" viewBox="0 0 16 16">
                    <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                  </svg>
                ) : (
                  <div className="w-3" />
                )}
                <span className="text-xs" style={{ color: b.is_current ? '#c9d1d9' : '#8b949e' }}>{b.name}</span>
                {b.upstream && (
                  <span className="text-[10px]" style={{ color: '#484f58' }}>{b.upstream}</span>
                )}
              </div>
            ))}
            {branches.some(b => b.is_remote) && (
              <>
                <div className="flex items-center px-3 py-1.5 mt-1" style={{ borderBottom: '1px solid #21262d', borderTop: '1px solid #21262d' }}>
                  <span className="text-[11px] font-medium" style={{ color: '#8b949e' }}>Remote</span>
                </div>
                {branches.filter(b => b.is_remote).map((b) => (
                  <div key={b.name} className="flex items-center px-3 py-1.5 gap-2">
                    <div className="w-3" />
                    <span className="text-xs" style={{ color: '#484f58' }}>{b.name}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
