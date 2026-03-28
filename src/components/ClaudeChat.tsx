import { useState, useEffect, useRef } from 'react';
import TerminalView from './TerminalView';
import { settingsAPI } from '../lib/ipc';
import { open } from '@tauri-apps/plugin-dialog';

interface ClaudeChatProps {
  projectId: string | null;
  visible?: boolean;
}

export default function ClaudeChat({ projectId, visible = true }: ClaudeChatProps) {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [launched, setLaunched] = useState(false);
  const prevProjectId = useRef(projectId);

  useEffect(() => {
    (async () => {
      try {
        const key = await settingsAPI.getDecryptedAnthropicKey();
        setHasApiKey(!!key);
      } catch {
        setHasApiKey(false);
      }
    })();
  }, []);

  // Reset when project changes
  useEffect(() => {
    if (prevProjectId.current !== projectId) {
      prevProjectId.current = projectId;
      setLaunched(false);
      setSelectedFolder(null);
    }
  }, [projectId]);

  const handlePickFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        setSelectedFolder(selected);
      }
    } catch {}
  };

  const handleLaunch = () => {
    setLaunched(true);
  };

  const handleRestart = () => {
    setLaunched(false);
  };

  if (hasApiKey === null) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="bg-codex-bg">
        <div className="text-codex-text-secondary text-sm">Loading...</div>
      </div>
    );
  }

  if (!hasApiKey) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="bg-codex-bg">
        <div className="text-center max-w-md px-6">
          <div className="mb-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" className="text-codex-text-muted mx-auto">
              <path d="M13.83 1.5h3.84L24 22.5h-3.84l-6.33-21zm-7.5 0H2.49L8.82 22.5h3.84L6.33 1.5z"/>
            </svg>
          </div>
          <h2 className="text-lg font-medium text-codex-text-primary mb-2">Anthropic API Key Required</h2>
          <p className="text-sm text-codex-text-secondary mb-4">
            To use Claude CLI, add your Anthropic API key in Settings and ensure the <code className="text-codex-accent">claude</code> CLI is installed.
          </p>
          <p className="text-xs text-codex-text-muted">
            Install Claude Code: <code className="text-codex-accent">npm install -g @anthropic-ai/claude-code</code>
          </p>
        </div>
      </div>
    );
  }

  if (!launched) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="bg-codex-bg">
        <div className="text-center max-w-md px-6">
          <div className="mb-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" className="text-[#d4a27f] mx-auto">
              <path d="M13.83 1.5h3.84L24 22.5h-3.84l-6.33-21zm-7.5 0H2.49L8.82 22.5h3.84L6.33 1.5z"/>
            </svg>
          </div>
          <h2 className="text-base font-medium text-codex-text-primary mb-3">Launch Claude Code</h2>

          <div className="mb-4">
            <label className="block text-[10px] text-codex-text-muted mb-1.5 text-left">Working Directory</label>
            <button
              onClick={handlePickFolder}
              className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-xs text-left hover:bg-codex-surface-hover transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 text-codex-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
              </svg>
              <span className={selectedFolder ? 'text-codex-text-primary' : 'text-codex-text-muted'}>
                {selectedFolder || 'Choose folder...'}
              </span>
            </button>
          </div>

          <button
            onClick={handleLaunch}
            disabled={!selectedFolder}
            className="px-6 py-2 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md transition-colors disabled:opacity-40"
          >
            Start Session
          </button>

          <p className="text-[10px] text-codex-text-muted mt-3">
            Opens an interactive Claude Code session in the selected directory
          </p>
        </div>
      </div>
    );
  }

  // Launched state — position:absolute fills the nearest positioned ancestor (App.tsx main area),
  // giving xterm.js real pixel dimensions immediately. The inner wrapper is position:relative
  // so TerminalView's own position:absolute;inset:0 resolves correctly.
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', zIndex: 10 }} className="bg-codex-bg">
      <div className="flex items-center gap-2 px-3 flex-shrink-0" style={{ height: '28px', borderBottom: '1px solid #21262d', backgroundColor: '#181818' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-[#d4a27f]">
          <path d="M13.83 1.5h3.84L24 22.5h-3.84l-6.33-21zm-7.5 0H2.49L8.82 22.5h3.84L6.33 1.5z"/>
        </svg>
        <span className="text-[11px] text-codex-text-primary font-medium">Claude Code</span>
        <span className="text-[10px] text-codex-text-muted truncate flex-1">{selectedFolder}</span>
        <button
          onClick={handleRestart}
          className="text-[10px] text-codex-text-muted hover:text-codex-text-secondary transition-colors px-1.5 py-0.5 rounded hover:bg-codex-surface"
          title="New session"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
        </button>
      </div>
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <TerminalView
          projectId={projectId}
          cwd={selectedFolder || undefined}
          command="claude"
          visible={visible}
        />
      </div>
    </div>
  );
}
