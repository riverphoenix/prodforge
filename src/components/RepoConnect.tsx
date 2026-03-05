import { useState } from 'react';
import { gitAPI } from '../lib/ipc';

interface RepoConnectProps {
  onConnect: (repoPath: string) => void;
  onClose: () => void;
}

type ConnectMode = 'open' | 'clone' | 'init';

export default function RepoConnect({ onConnect, onClose }: RepoConnectProps) {
  const [mode, setMode] = useState<ConnectMode>('open');
  const [repoPath, setRepoPath] = useState('');
  const [cloneUrl, setCloneUrl] = useState('');
  const [clonePath, setClonePath] = useState('');
  const [initPath, setInitPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setError(null);
    setLoading(true);
    try {
      if (mode === 'open') {
        if (!repoPath.trim()) { setError('Enter a repository path'); return; }
        await gitAPI.status(repoPath.trim());
        onConnect(repoPath.trim());
      } else if (mode === 'clone') {
        if (!cloneUrl.trim() || !clonePath.trim()) { setError('Enter both URL and destination path'); return; }
        await gitAPI.cloneRepo(cloneUrl.trim(), clonePath.trim());
        onConnect(clonePath.trim());
      } else if (mode === 'init') {
        if (!initPath.trim()) { setError('Enter a directory path'); return; }
        await gitAPI.initNewRepo(initPath.trim());
        onConnect(initPath.trim());
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const tabStyle = (m: ConnectMode) => ({
    color: mode === m ? '#c9d1d9' : '#484f58',
    backgroundColor: mode === m ? '#21262d' : 'transparent',
    fontSize: '11.5px',
  });

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: '#00000080', zIndex: 50 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rounded-lg shadow-xl w-[440px]" style={{ backgroundColor: '#0d1117', border: '1px solid #30363d' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #21262d' }}>
          <h3 className="text-sm font-medium" style={{ color: '#c9d1d9' }}>Connect Repository</h3>
          <button onClick={onClose} style={{ color: '#484f58' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1 px-4 pt-3">
          {(['open', 'clone', 'init'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              className="px-3 py-1.5 rounded text-xs transition-colors"
              style={tabStyle(m)}
            >
              {m === 'open' ? 'Open Existing' : m === 'clone' ? 'Clone URL' : 'Init New'}
            </button>
          ))}
        </div>

        <div className="px-4 py-4 space-y-3">
          {mode === 'open' && (
            <div>
              <label className="block text-[11px] mb-1" style={{ color: '#8b949e' }}>Repository Path</label>
              <input
                type="text"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="/path/to/repo"
                className="w-full px-3 py-2 rounded text-xs"
                style={{ backgroundColor: '#161b22', border: '1px solid #30363d', color: '#c9d1d9' }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
                autoFocus
              />
            </div>
          )}

          {mode === 'clone' && (
            <>
              <div>
                <label className="block text-[11px] mb-1" style={{ color: '#8b949e' }}>Repository URL</label>
                <input
                  type="text"
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  className="w-full px-3 py-2 rounded text-xs"
                  style={{ backgroundColor: '#161b22', border: '1px solid #30363d', color: '#c9d1d9' }}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] mb-1" style={{ color: '#8b949e' }}>Destination Path</label>
                <input
                  type="text"
                  value={clonePath}
                  onChange={(e) => setClonePath(e.target.value)}
                  placeholder="/path/to/destination"
                  className="w-full px-3 py-2 rounded text-xs"
                  style={{ backgroundColor: '#161b22', border: '1px solid #30363d', color: '#c9d1d9' }}
                />
              </div>
            </>
          )}

          {mode === 'init' && (
            <div>
              <label className="block text-[11px] mb-1" style={{ color: '#8b949e' }}>Directory Path</label>
              <input
                type="text"
                value={initPath}
                onChange={(e) => setInitPath(e.target.value)}
                placeholder="/path/to/new/repo"
                className="w-full px-3 py-2 rounded text-xs"
                style={{ backgroundColor: '#161b22', border: '1px solid #30363d', color: '#c9d1d9' }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
                autoFocus
              />
            </div>
          )}

          {error && (
            <div className="text-xs px-2 py-1.5 rounded" style={{ color: '#f85149', backgroundColor: '#2d121530' }}>
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: '1px solid #21262d' }}>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs transition-colors"
            style={{ color: '#8b949e', border: '1px solid #30363d' }}
          >
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#238636', color: '#fff' }}
          >
            {loading ? 'Connecting...' : mode === 'clone' ? 'Clone & Connect' : mode === 'init' ? 'Initialize' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
