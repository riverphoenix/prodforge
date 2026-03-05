import { useState, useEffect, useRef, useCallback } from 'react';
import { AgentDef, Skill, AgentRun, AgentStreamEvent } from '../lib/types';
import { agentsAPI, agentRunsAPI, agentExecutionAPI, settingsAPI, traceSpansAPI } from '../lib/ipc';

interface AgentRunnerProps {
  agent: AgentDef;
  skills: Skill[];
  projectId: string;
  onBack: () => void;
}

export default function AgentRunner({ agent, skills, projectId, onBack }: AgentRunnerProps) {
  const [prompt, setPrompt] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [totalTokens, setTotalTokens] = useState(0);
  const [cost, setCost] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleRun = async () => {
    if (!prompt.trim() || isRunning) return;

    setIsRunning(true);
    setOutput('');
    setError(null);
    setTotalTokens(0);
    setCost(0);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      await agentsAPI_incrementUsage();

      let apiKey = '';
      if (agent.provider === 'anthropic') {
        apiKey = await settingsAPI.getDecryptedAnthropicKey() || '';
      } else if (agent.provider === 'google') {
        apiKey = await settingsAPI.getDecryptedGoogleKey() || '';
      } else {
        apiKey = await settingsAPI.getDecryptedApiKey() || '';
      }

      const skillPrompts = agentSkills.map(s => s.system_prompt);

      const response = await agentExecutionAPI.runStream({
        agentId: agent.id,
        projectId,
        prompt: prompt.trim(),
        skillId: selectedSkillId || undefined,
        model: agent.model,
        provider: agent.provider,
        apiKey,
        maxTokens: agent.max_tokens,
        temperature: agent.temperature,
        systemPrompt: agent.system_instructions,
        skillPrompts,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (abort.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event: AgentStreamEvent = JSON.parse(data);
            if (event.type === 'run_id' && event.run_id) {
              setCurrentRunId(event.run_id);
            } else if (event.type === 'content_block_delta' && event.delta?.text) {
              setOutput(prev => prev + event.delta!.text);
            } else if (event.type === 'message_stop') {
              if (event.usage) {
                setTotalTokens(event.usage.input_tokens + event.usage.output_tokens);
              }
              if (event.cost) {
                setCost(event.cost);
              }
            } else if (event.type === 'fallback' && event.message) {
              setOutput(prev => prev + `\n[${event.message}]\n`);
            } else if (event.type === 'trace_spans' && event.spans) {
              for (const span of event.spans) {
                try {
                  await traceSpansAPI.create({
                    id: span.id,
                    parentSpanId: span.parent_span_id,
                    runId: span.run_id,
                    runType: span.run_type,
                    spanName: span.span_name,
                    spanKind: span.span_kind,
                    input: span.input || '',
                    metadata: typeof span.metadata === 'string' ? span.metadata : JSON.stringify(span.metadata || {}),
                    startedAt: span.started_at,
                  });
                  if (span.status === 'completed' || span.status === 'failed') {
                    await traceSpansAPI.update(span.id, {
                      output: span.output || '',
                      status: span.status,
                      tokens: span.tokens ?? undefined,
                      cost: span.cost ?? undefined,
                      endedAt: span.ended_at ?? undefined,
                    });
                  }
                } catch {}
              }
            } else if (event.type === 'error') {
              setError(event.error || 'Unknown error');
            }
          } catch {}
        }
      }

      await loadRuns();
    } catch (err) {
      if (!abort.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Failed to run agent');
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const agentsAPI_incrementUsage = async () => {
    try {
      await agentsAPI.incrementUsage(agent.id);
    } catch {}
  };

  const handleCancel = async () => {
    abortRef.current?.abort();
    if (currentRunId) {
      try {
        await agentExecutionAPI.cancel(currentRunId);
      } catch {}
    }
    setIsRunning(false);
  };

  const handleLoadRun = (run: AgentRun) => {
    setOutput(run.output_content || '');
    setTotalTokens(run.total_tokens);
    setCost(run.cost);
    setPrompt(run.input_prompt);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
      <div className="flex items-center gap-3 px-6 pt-4 pb-3 flex-shrink-0 border-b border-codex-border">
        <button onClick={onBack} className="text-codex-text-muted hover:text-codex-text-primary transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <span className="text-lg">{agent.icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-codex-text-primary">{agent.name}</h2>
          <p className="text-[10px] text-codex-text-muted">{agent.model} via {agent.provider}</p>
        </div>
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
                    Cancel
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
                  {isRunning && <span className="inline-block w-2 h-4 bg-codex-accent animate-pulse ml-0.5" />}
                </pre>
              </div>
            ) : !isRunning && (
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
            </div>
          )}
        </div>

        <div className="w-56 flex-shrink-0 border-l border-codex-border overflow-y-auto" style={{ backgroundColor: '#1a1a1a' }}>
          <div className="px-3 py-2 text-[10px] font-semibold text-codex-text-muted uppercase tracking-wider border-b border-codex-border">
            Run History
          </div>
          {runs.length === 0 ? (
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
