import { createContext, useContext } from 'react';
import { AgentDef, AgentStreamEvent } from './types';

export interface ActiveRun {
  runId: string | null;
  agentId: string;
  agent: AgentDef;
  prompt: string;
  output: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  error: string | null;
  totalTokens: number;
  cost: number;
  startedAt: number;
  abort: AbortController;
}

export interface AgentRunManager {
  activeRuns: Map<string, ActiveRun>;
  startRun: (agent: AgentDef, prompt: string, projectId: string, skillId?: string, skillPrompts?: string[]) => Promise<string>;
  cancelRun: (agentId: string) => void;
  getRunForAgent: (agentId: string) => ActiveRun | undefined;
  clearCompletedRun: (agentId: string) => void;
}

export const AgentRunManagerContext = createContext<AgentRunManager>({
  activeRuns: new Map(),
  startRun: async () => '',
  cancelRun: () => {},
  getRunForAgent: () => undefined,
  clearCompletedRun: () => {},
});

export function useAgentRunManager() {
  return useContext(AgentRunManagerContext);
}

export function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  abort: AbortSignal,
  callbacks: {
    onRunId: (id: string) => void;
    onDelta: (text: string) => void;
    onStop: (usage?: { input_tokens: number; output_tokens: number }, cost?: number) => void;
    onError: (msg: string) => void;
    onTraceSpans?: (spans: AgentStreamEvent['spans']) => void;
    onFallback?: (message: string) => void;
  },
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  return (async () => {
    while (true) {
      if (abort.aborted) break;
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
            callbacks.onRunId(event.run_id);
          } else if (event.type === 'content_block_delta' && event.delta?.text) {
            callbacks.onDelta(event.delta.text);
          } else if (event.type === 'message_stop') {
            callbacks.onStop(event.usage, event.cost);
          } else if (event.type === 'fallback' && event.message) {
            callbacks.onFallback?.(event.message);
          } else if (event.type === 'error') {
            callbacks.onError(event.error || 'Unknown error');
          }
        } catch {}
      }
    }
  })();
}
