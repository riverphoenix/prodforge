import { useState, useCallback, useRef, useMemo } from 'react';
import { AgentDef } from '../lib/types';
import { agentsAPI, agentExecutionAPI, agentRunsAPI, settingsAPI, traceSpansAPI } from '../lib/ipc';
import { AgentRunManagerContext, ActiveRun, parseSSEStream } from '../lib/agentRunManager';

interface Props {
  children: React.ReactNode;
}

export default function AgentRunProvider({ children }: Props) {
  const [activeRuns, setActiveRuns] = useState<Map<string, ActiveRun>>(new Map());
  const runsRef = useRef(activeRuns);
  runsRef.current = activeRuns;

  const updateRun = useCallback((agentId: string, update: Partial<ActiveRun>) => {
    setActiveRuns(prev => {
      const next = new Map(prev);
      const existing = next.get(agentId);
      if (existing) {
        next.set(agentId, { ...existing, ...update });
      }
      return next;
    });
  }, []);

  const startRun = useCallback(async (agent: AgentDef, prompt: string, projectId: string, skillId?: string, skillPrompts?: string[]): Promise<string> => {
    const abort = new AbortController();

    const run: ActiveRun = {
      runId: null,
      agentId: agent.id,
      agent,
      prompt,
      output: '',
      status: 'running',
      error: null,
      totalTokens: 0,
      cost: 0,
      startedAt: Date.now(),
      abort,
    };

    setActiveRuns(prev => {
      const next = new Map(prev);
      next.set(agent.id, run);
      return next;
    });

    (async () => {
      try {
        await agentsAPI.incrementUsage(agent.id);

        // Create DB record for run history
        try {
          const dbRun = await agentRunsAPI.create(agent.id, projectId, skillId || null, prompt, agent.model, agent.provider);
          updateRun(agent.id, { runId: dbRun.id });
        } catch {}

        let apiKey = '';
        if (agent.provider === 'anthropic') {
          apiKey = await settingsAPI.getDecryptedAnthropicKey() || '';
        } else if (agent.provider === 'google') {
          apiKey = await settingsAPI.getDecryptedGoogleKey() || '';
        } else if (agent.provider === 'openai') {
          apiKey = await settingsAPI.getDecryptedApiKey() || '';
        }

        if (!apiKey && agent.provider !== 'ollama') {
          throw new Error(`No API key configured for ${agent.provider}. Go to Settings to add one.`);
        }

        let response: Response;
        try {
          response = await agentExecutionAPI.runStream({
            agentId: agent.id,
            projectId,
            prompt: prompt.trim(),
            skillId: skillId || undefined,
            model: agent.model,
            provider: agent.provider,
            apiKey,
            maxTokens: agent.max_tokens,
            temperature: agent.temperature,
            systemPrompt: agent.system_instructions,
            skillPrompts,
          });
        } catch (fetchErr) {
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          if (msg === 'Load failed' || msg === 'Failed to fetch' || msg.includes('NetworkError')) {
            throw new Error('Cannot connect to the ProdForge sidecar server. It may not be running. Try restarting the app.');
          }
          throw fetchErr;
        }

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        let accOutput = '';

        await parseSSEStream(reader, abort.signal, {
          onRunId: (id) => {
            updateRun(agent.id, { runId: id });
          },
          onDelta: (text) => {
            accOutput += text;
            updateRun(agent.id, { output: accOutput });
          },
          onStop: (usage, cost) => {
            const tokens = usage ? usage.input_tokens + usage.output_tokens : 0;
            updateRun(agent.id, {
              status: 'completed',
              totalTokens: tokens,
              cost: cost || 0,
            });
          },
          onError: (msg) => {
            updateRun(agent.id, { status: 'failed', error: msg });
          },
          onFallback: (message) => {
            accOutput += `\n[${message}]\n`;
            updateRun(agent.id, { output: accOutput });
          },
          onTraceSpans: async (spans) => {
            if (!spans) return;
            for (const span of spans) {
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
          },
        });

        const currentRun = runsRef.current.get(agent.id);
        if (currentRun && currentRun.status === 'running') {
          updateRun(agent.id, { status: 'completed' });
        }

        const finalRun = runsRef.current.get(agent.id);
        if (finalRun?.runId) {
          try {
            await agentRunsAPI.updateStatus(finalRun.runId, finalRun.status, {
              outputContent: finalRun.output,
              totalTokens: finalRun.totalTokens,
              cost: finalRun.cost,
              durationMs: Date.now() - finalRun.startedAt,
            });
          } catch {}
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          updateRun(agent.id, {
            status: 'failed',
            error: err instanceof Error ? err.message : 'Failed to run agent',
          });
        }
      }
    })();

    return agent.id;
  }, [updateRun]);

  const cancelRun = useCallback((agentId: string) => {
    const run = runsRef.current.get(agentId);
    if (run) {
      run.abort.abort();
      updateRun(agentId, { status: 'cancelled' });
      if (run.runId) {
        agentExecutionAPI.cancel(run.runId).catch(() => {});
      }
    }
  }, [updateRun]);

  const getRunForAgent = useCallback((agentId: string) => {
    return runsRef.current.get(agentId);
  }, []);

  const clearCompletedRun = useCallback((agentId: string) => {
    setActiveRuns(prev => {
      const run = prev.get(agentId);
      if (run && run.status !== 'running') {
        const next = new Map(prev);
        next.delete(agentId);
        return next;
      }
      return prev;
    });
  }, []);

  const value = useMemo(() => ({
    activeRuns,
    startRun,
    cancelRun,
    getRunForAgent,
    clearCompletedRun,
  }), [activeRuns, startRun, cancelRun, getRunForAgent, clearCompletedRun]);

  return (
    <AgentRunManagerContext.Provider value={value}>
      {children}
    </AgentRunManagerContext.Provider>
  );
}
