import { useState, useEffect, useRef, useCallback } from 'react';
import { AgentDef, Skill, AgentRun } from '../lib/types';
import { agentRunsAPI } from '../lib/ipc';
import { useAgentRunManager } from '../lib/agentRunManager';

interface AgentRunnerProps {
  agent: AgentDef;
  skills: Skill[];
  projectId: string;
  onBack: () => void;
}

export default function AgentRunner({ agent, skills, projectId, onBack }: AgentRunnerProps) {
  const [prompt, setPrompt] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [viewingOutput, setViewingOutput] = useState<string | null>(null);
  const [viewingTokens, setViewingTokens] = useState(0);
  const [viewingCost, setViewingCost] = useState(0);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const { activeRuns, startRun, cancelRun } = useAgentRunManager();

  const activeRun = activeRuns.get(agent.id);
  const isRunning = activeRun?.status === 'running';
  const output = viewingOutput ?? activeRun?.output ?? '';
  const error = activeRun?.error ?? null;
  const totalTokens = viewingOutput !== null ? viewingTokens : (activeRun?.totalTokens ?? 0);
  const cost = viewingOutput !== null ? viewingCost : (activeRun?.cost ?? 0);

  const agentSkills = (() => {
    try {
      const ids: string[] = JSON.parse(agent.skill_ids || '[]');
      return ids.map(id => skills.find(s => s.id === id)).filter((s): s is Skill => !!s);
    } catch {
      return [];
    }
  })();

  const loadRuns = useCallback(async () => {
    try {
      const allRuns = await agentRunsAPI.list(agent.id, projectId);
      setRuns(allRuns.sort((a, b) => b.created_at - a.created_at).slice(0, 20));
    } catch {}
  }, [agent.id, projectId]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (activeRun && activeRun.status !== 'running') {
      loadRuns();
    }
  }, [activeRun?.status, loadRuns]);

  useEffect(() => {
    if (outputRef.current && viewingOutput === null) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, viewingOutput]);

  const handleRun = async () => {
    if (!prompt.trim() || isRunning) return;
    setViewingOutput(null);
    setViewingTokens(0);
    setViewingCost(0);
    const skillPrompts = agentSkills.map(s => s.system_prompt);
    await startRun(agent, prompt.trim(), projectId, selectedSkillId || undefined, skillPrompts);
  };

  const handleCancel = () => {
    cancelRun(agent.id);
  };

  const handleLoadRun = (run: AgentRun) => {
    setViewingOutput(run.output_content || '');
    setViewingTokens(run.total_tokens);
    setViewingCost(run.cost);
    setPrompt(run.input_prompt);
  };

  const handleShowLive = () => {
    setViewingOutput(null);
    setViewingTokens(0);
    setViewingCost(0);
  };

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isRunning) { setElapsed(0); return; }
    const iv = setInterval(() => {
      if (activeRun) setElapsed(Math.floor((Date.now() - activeRun.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [isRunning, activeRun]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
      <div className="flex items-center gap-3 px-6 pt-4 pb-3 flex-shrink-0 border-b border-codex-border">
        <button onClick={onBack} className="text-codex-text-muted hover:text-codex-text-primary transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <span className="text-lg">{agent.icon}</span>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-codex-text-primary">{agent.name}</h2>
          <p className="text-[10px] text-codex-text-muted">{agent.model} via {agent.provider}</p>
        </div>
        {isRunning && (
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-[10px] text-green-300">Running ({elapsed}s)</span>
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <div className="px-6 pt-4 pb-3 flex-shrink-0 space-y-3">
            {agentSkills.length > 1 && (
              <div>
                <label className="block text-[10px] text-codex-text-muted mb-1">Focus on skill (optional)</label>
                <select
                  value={selectedSkillId || ''}
                  onChange={(e) => setSelectedSkillId(e.target.value || null)}
                  className="w-full px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
                >
                  <option value="">All skills</option>
                  {agentSkills.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What would you like this agent to do?"
                rows={3}
                className="flex-1 px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleRun();
                  }
                }}
              />
              <div className="flex flex-col gap-1">
                {isRunning ? (
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 text-xs text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={handleRun}
                    disabled={!prompt.trim()}
                    className="px-4 py-2 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md transition-colors disabled:opacity-50"
                  >
                    Run
                  </button>
                )}
              </div>
            </div>
          </div>

          {isRunning && viewingOutput !== null && (
            <button
              onClick={handleShowLive}
              className="mx-6 mb-2 px-3 py-1.5 text-[10px] text-green-300 bg-green-500/10 border border-green-500/30 rounded flex items-center gap-2"
            >
              <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Agent is running - click to see live output
            </button>
          )}

          <div ref={outputRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="px-6 pb-4">
            {error && (
              <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
                {error}
              </div>
            )}

            {output ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-xs text-codex-text-primary leading-relaxed font-sans">
                  {output}
                  {isRunning && viewingOutput === null && <span className="inline-block w-2 h-4 bg-codex-accent animate-pulse ml-0.5" />}
                </pre>
              </div>
            ) : isRunning ? (
              <div className="text-center py-16">
                <div className="flex items-center justify-center gap-1 mb-3">
                  <span className="inline-block w-2 h-2 bg-codex-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="inline-block w-2 h-2 bg-codex-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="inline-block w-2 h-2 bg-codex-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <p className="text-xs text-codex-text-muted">
                  Thinking...
                </p>
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="text-3xl mb-2">{agent.icon}</div>
                <p className="text-xs text-codex-text-muted">
                  Enter a prompt and click Run to start
                </p>
                <p className="text-[10px] text-codex-text-muted mt-1">
                  Cmd+Enter to run quickly
                </p>
              </div>
            )}
          </div>

          {(totalTokens > 0 || cost > 0) && (
            <div className="px-6 py-2 flex-shrink-0 border-t border-codex-border flex items-center gap-4 text-[10px] text-codex-text-muted">
              <span>{totalTokens.toLocaleString()} tokens</span>
              {cost > 0 && <span>${cost.toFixed(4)}</span>}
              {activeRun && activeRun.status !== 'running' && (
                <span className={activeRun.status === 'completed' ? 'text-green-300' : activeRun.status === 'failed' ? 'text-red-300' : 'text-yellow-300'}>
                  {activeRun.status}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="w-56 flex-shrink-0 border-l border-codex-border overflow-y-auto bg-codex-sidebar">
          <div className="px-3 py-2 text-[10px] font-semibold text-codex-text-muted uppercase tracking-wider border-b border-codex-border">
            Run History
          </div>
          {activeRun && activeRun.status === 'running' && (
            <button
              onClick={handleShowLive}
              className="w-full px-3 py-2 text-left bg-green-500/5 border-b border-codex-border/30"
            >
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                <span className="text-[10px] text-green-300 font-medium">Live</span>
              </div>
              <div className="text-[10px] text-codex-text-primary truncate mt-0.5">
                {activeRun.prompt.slice(0, 50)}
              </div>
            </button>
          )}
          {runs.length === 0 && !activeRun ? (
            <div className="px-3 py-4 text-[10px] text-codex-text-muted text-center">
              No runs yet
            </div>
          ) : (
            runs.map(run => (
              <button
                key={run.id}
                onClick={() => handleLoadRun(run)}
                className="w-full px-3 py-2 text-left hover:bg-white/[0.04] border-b border-codex-border/30 transition-colors"
              >
                <div className="text-[10px] text-codex-text-primary truncate">
                  {run.input_prompt.slice(0, 50)}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[9px] px-1 py-0.5 rounded ${
                    run.status === 'completed' ? 'bg-green-500/20 text-green-300'
                    : run.status === 'failed' ? 'bg-red-500/20 text-red-300'
                    : run.status === 'running' ? 'bg-blue-500/20 text-blue-300'
                    : 'bg-codex-surface text-codex-text-muted'
                  }`}>
                    {run.status}
                  </span>
                  <span className="text-[9px] text-codex-text-muted">
                    {run.total_tokens.toLocaleString()} tok
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
