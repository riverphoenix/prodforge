import { useState, useEffect } from 'react';
import TerminalView from './TerminalView';
import { settingsAPI } from '../lib/ipc';

interface ClaudeChatProps {
  projectId: string | null;
}

export default function ClaudeChat({ projectId }: ClaudeChatProps) {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

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

  if (hasApiKey === null) {
    return (
      <div className="flex-1 flex items-center justify-center bg-codex-bg">
        <div className="text-codex-text-secondary text-sm">Loading...</div>
      </div>
    );
  }

  if (!hasApiKey) {
    return (
      <div className="flex-1 flex items-center justify-center bg-codex-bg">
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

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: '#1e1e1e' }}>
      <div className="flex items-center gap-2 px-3 flex-shrink-0" style={{ height: '28px', borderBottom: '1px solid #21262d', backgroundColor: '#181818' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-[#d4a27f]">
          <path d="M13.83 1.5h3.84L24 22.5h-3.84l-6.33-21zm-7.5 0H2.49L8.82 22.5h3.84L6.33 1.5z"/>
        </svg>
        <span className="text-[11px] text-codex-text-primary font-medium">Claude Code</span>
        <span className="text-[10px] text-codex-text-muted">Interactive CLI Session</span>
      </div>
      <div className="flex-1 min-h-0">
        <TerminalView
          projectId={projectId}
          command="claude"
        />
      </div>
    </div>
  );
}
