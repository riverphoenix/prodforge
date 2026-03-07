import { useState, useEffect, useRef, useCallback } from 'react';
import { AgentTeam, AgentTeamNode, AgentTeamEdge, AgentDef, TeamRun, TeamStreamEvent } from '../lib/types';
import { agentTeamsAPI, teamNodesAPI, teamEdgesAPI, teamRunsAPI, teamExecutionAPI, settingsAPI, traceSpansAPI } from '../lib/ipc';

interface TeamRunnerProps {
  team: AgentTeam;
  agents: AgentDef[];
  projectId: string;
  onBack: () => void;
}

interface NodeStatus {
  nodeId: string;
  agentName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output: string;
}

export default function TeamRunner({ team, agents: _agents, projectId, onBack }: TeamRunnerProps) {
  const [prompt, setPrompt] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [nodeStatuses, setNodeStatuses] = useState<NodeStatus[]>([]);
  const [finalOutput, setFinalOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [runs, setRuns] = useState<TeamRun[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [teamNodes, setTeamNodes] = useState<AgentTeamNode[]>([]);
  const [teamEdges, setTeamEdges] = useState<AgentTeamEdge[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [nodes, edges, allRuns] = await Promise.all([
        teamNodesAPI.list(team.id),
        teamEdgesAPI.list(team.id),
        teamRunsAPI.list(team.id, projectId),
      ]);
      setTeamNodes(nodes);
      setTeamEdges(edges);
      setRuns(allRuns.sort((a, b) => b.created_at - a.created_at).slice(0, 20));
    } catch {}
  }, [team.id, projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [finalOutput, nodeStatuses]);

  const handleRun = async () => {
    if (!prompt.trim() || isRunning) return;
    setIsRunning(true);
    setNodeStatuses([]);
    setFinalOutput('');
    setError(null);
    setTotalTokens(0);
    setTotalCost(0);
    setDurationMs(0);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      await agentTeamsAPI.incrementUsage(team.id);

      const apiKeys: Record<string, string> = {};
      apiKeys.anthropic = await settingsAPI.getDecryptedAnthropicKey() || '';
      apiKeys.openai = await settingsAPI.getDecryptedApiKey() || '';
      apiKeys.google = await settingsAPI.getDecryptedGoogleKey() || '';

      const nodePayload = teamNodes.map(n => ({
        id: n.id,
        agentId: n.agent_id,
        nodeType: n.node_type,
        role: n.role,
        config: n.config,
        sortOrder: n.sort_order,
      }));
      const edgePayload = teamEdges.map(e => ({
        id: e.id,
        sourceNodeId: e.source_node_id,
        targetNodeId: e.target_node_id,
        edgeType: e.edge_type,
        condition: e.condition,
        dataMapping: e.data_mapping,
      }));

      const response = await teamExecutionAPI.runStream({
        teamId: team.id,
        projectId,
        input: prompt.trim(),
        executionMode: team.execution_mode,
        nodes: nodePayload,
        edges: edgePayload,
        apiKeys,
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
            const event: TeamStreamEvent = JSON.parse(data);
            if (event.type === 'team_run_id' && event.team_run_id) {
              setCurrentRunId(event.team_run_id);
            } else if (event.type === 'node_start' && event.node_id) {
              setNodeStatuses(prev => {
                const existing = prev.find(ns => ns.nodeId === event.node_id);
                if (existing) {
                  return prev.map(ns => ns.nodeId === event.node_id ? { ...ns, status: 'running' as const } : ns);
                }
                return [...prev, { nodeId: event.node_id!, agentName: event.agent_name || 'Agent', status: 'running', output: '' }];
              });
            } else if (event.type === 'node_content' && event.node_id && event.delta?.text) {
              setNodeStatuses(prev => prev.map(ns =>
                ns.nodeId === event.node_id ? { ...ns, output: ns.output + event.delta!.text } : ns
              ));
            } else if (event.type === 'node_complete' && event.node_id) {
              setNodeStatuses(prev => prev.map(ns =>
                ns.nodeId === event.node_id ? { ...ns, status: 'completed' as const, output: event.output || ns.output } : ns
              ));
              if (event.usage) {
                setTotalTokens(t => t + event.usage!.input_tokens + event.usage!.output_tokens);
              }
              if (event.cost) setTotalCost(c => c + event.cost!);
            } else if (event.type === 'node_error' && event.node_id) {
              setNodeStatuses(prev => prev.map(ns =>
                ns.nodeId === event.node_id ? { ...ns, status: 'failed' as const } : ns
              ));
            } else if (event.type === 'team_complete') {
              if (event.duration_ms) setDurationMs(event.duration_ms);
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

      const lastCompleted = nodeStatuses.find(ns => ns.status === 'completed' && ns.output);
      if (lastCompleted) setFinalOutput(lastCompleted.output);

      await loadData();
    } catch (err) {
      if (!abort.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Failed to run team');
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const handleCancel = async () => {
    abortRef.current?.abort();
    if (currentRunId) {
      try { await teamExecutionAPI.cancel(currentRunId); } catch {}
    }
    setIsRunning(false);
  };

  const handleLoadRun = (run: TeamRun) => {
    setFinalOutput(run.output || '');
    setTotalTokens(run.total_tokens);
    setTotalCost(run.total_cost);
    setDurationMs(run.duration_ms || 0);
    setPrompt(run.input);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
      <div className="flex items-center gap-3 px-6 pt-4 pb-3 flex-shrink-0 border-b border-codex-border">
        <button onClick={onBack} className="text-codex-text-muted hover:text-codex-text-primary transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <span className="text-lg">{team.icon || '👥'}</span>
        <div>
          <h2 className="text-sm font-semibold text-codex-text-primary">{team.name}</h2>
          <p className="text-[10px] text-codex-text-muted">{team.execution_mode} mode</p>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <div className="px-6 pt-4 pb-3 flex-shrink-0">
            <div className="flex gap-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What should this team work on?"
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
                  <button onClick={handleCancel} className="px-4 py-2 text-xs text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors">
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

          <div ref={outputRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="px-6 pb-4 space-y-3">
            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
                {error}
              </div>
            )}

            {nodeStatuses.length > 0 ? (
              nodeStatuses.map(ns => (
                <div key={ns.nodeId} className={`border rounded-lg overflow-hidden ${
                  ns.status === 'running' ? 'border-blue-500/50' : ns.status === 'completed' ? 'border-green-500/30' : ns.status === 'failed' ? 'border-red-500/30' : 'border-codex-border'
                }`}>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-codex-surface/50">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      ns.status === 'running' ? 'bg-blue-500 animate-pulse' : ns.status === 'completed' ? 'bg-green-500' : ns.status === 'failed' ? 'bg-red-500' : 'bg-codex-text-muted'
                    }`} />
                    <span className="text-[10px] font-medium text-codex-text-primary">{ns.agentName}</span>
                    <span className="text-[9px] text-codex-text-muted">{ns.status}</span>
                  </div>
                  {ns.output && (
                    <pre className="px-3 py-2 text-xs text-codex-text-primary leading-relaxed font-sans whitespace-pre-wrap">
                      {ns.output}
                      {ns.status === 'running' && <span className="inline-block w-2 h-4 bg-codex-accent animate-pulse ml-0.5" />}
                    </pre>
                  )}
                </div>
              ))
            ) : !isRunning && (
              <div className="text-center py-16">
                <div className="text-3xl mb-2">{team.icon || '👥'}</div>
                <p className="text-xs text-codex-text-muted">Enter a prompt and click Run to start the team</p>
                <p className="text-[10px] text-codex-text-muted mt-1">Cmd+Enter to run quickly</p>
              </div>
            )}
          </div>

          {(totalTokens > 0 || totalCost > 0 || durationMs > 0) && (
            <div className="px-6 py-2 flex-shrink-0 border-t border-codex-border flex items-center gap-4 text-[10px] text-codex-text-muted">
              <span>{totalTokens.toLocaleString()} tokens</span>
              {totalCost > 0 && <span>${totalCost.toFixed(4)}</span>}
              {durationMs > 0 && <span>{(durationMs / 1000).toFixed(1)}s</span>}
            </div>
          )}
        </div>

        <div className="w-56 flex-shrink-0 border-l border-codex-border overflow-y-auto bg-codex-sidebar">
          <div className="px-3 py-2 text-[10px] font-semibold text-codex-text-muted uppercase tracking-wider border-b border-codex-border">
            Run History
          </div>
          {runs.length === 0 ? (
            <div className="px-3 py-4 text-[10px] text-codex-text-muted text-center">No runs yet</div>
          ) : (
            runs.map(run => (
              <button
                key={run.id}
                onClick={() => handleLoadRun(run)}
                className="w-full px-3 py-2 text-left hover:bg-white/[0.04] border-b border-codex-border/30 transition-colors"
              >
                <div className="text-[10px] text-codex-text-primary truncate">
                  {run.input.slice(0, 50)}
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
