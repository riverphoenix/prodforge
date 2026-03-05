import { useState, useEffect } from 'react';
import { TraceSpan, SpanKind } from '../lib/types';
import { traceSpansAPI } from '../lib/ipc';

interface TracingViewProps {
  runId?: string | null;
  runType?: 'agent' | 'team';
}

const KIND_COLORS: Record<SpanKind, string> = {
  agent: '#6366f1',
  llm: '#22c55e',
  tool: '#f59e0b',
  chain: '#a855f7',
};

const KIND_BG: Record<SpanKind, string> = {
  agent: 'bg-indigo-500/20 text-indigo-300',
  llm: 'bg-green-500/20 text-green-300',
  tool: 'bg-amber-500/20 text-amber-300',
  chain: 'bg-purple-500/20 text-purple-300',
};

export default function TracingView({ runId, runType: _runType }: TracingViewProps) {
  const [spans, setSpans] = useState<TraceSpan[]>([]);
  const [selectedSpan, setSelectedSpan] = useState<TraceSpan | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!runId) { setSpans([]); return; }
    setLoading(true);
    traceSpansAPI.listForRun(runId).then(s => {
      setSpans(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [runId]);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(spans, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `traces-${runId || 'unknown'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!runId) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: '#0d1117' }}>
        <span style={{ color: '#484f58', fontSize: '12px' }}>Select an agent or team run to view traces</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: '#0d1117' }}>
        <span style={{ color: '#484f58', fontSize: '12px' }}>Loading traces...</span>
      </div>
    );
  }

  const minStart = spans.length > 0 ? Math.min(...spans.map(s => s.started_at)) : 0;
  const maxEnd = spans.length > 0 ? Math.max(...spans.map(s => s.ended_at || s.started_at + 1)) : 1;
  const totalRange = Math.max(maxEnd - minStart, 1);

  return (
    <div className="h-full flex" style={{ backgroundColor: '#0d1117' }}>
      <div className="flex-1 overflow-auto px-3 py-2">
        <div className="flex items-center justify-between mb-2">
          <span style={{ color: '#8b949e', fontSize: '11px' }}>{spans.length} spans</span>
          {spans.length > 0 && (
            <button
              onClick={handleExport}
              className="px-2 py-0.5 text-[10px] rounded transition-all duration-150 hover:bg-white/[0.06]"
              style={{ color: '#484f58' }}
            >
              Export JSON
            </button>
          )}
        </div>
        {spans.length === 0 ? (
          <div className="flex items-center justify-center h-20">
            <span style={{ color: '#484f58', fontSize: '12px' }}>No trace spans for this run</span>
          </div>
        ) : (
          <div className="space-y-1">
            {spans.map(span => {
              const start = span.started_at - minStart;
              const duration = (span.ended_at || span.started_at + 1) - span.started_at;
              const leftPct = (start / totalRange) * 100;
              const widthPct = Math.max((duration / totalRange) * 100, 2);

              return (
                <div
                  key={span.id}
                  className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors ${
                    selectedSpan?.id === span.id ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                  }`}
                  onClick={() => setSelectedSpan(span)}
                >
                  <span className={`text-[9px] px-1 py-0.5 rounded ${KIND_BG[span.span_kind] || 'bg-codex-surface text-codex-text-muted'}`}>
                    {span.span_kind}
                  </span>
                  <span className="text-[10px] text-codex-text-secondary w-32 truncate">{span.span_name}</span>
                  <div className="flex-1 h-4 relative rounded" style={{ backgroundColor: '#161b22' }}>
                    <div
                      className="absolute top-0.5 h-3 rounded"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        backgroundColor: KIND_COLORS[span.span_kind] || '#6b7280',
                        opacity: span.status === 'failed' ? 0.5 : 0.8,
                      }}
                    />
                  </div>
                  <span className="text-[9px] text-codex-text-muted w-12 text-right">{duration}s</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedSpan && (
        <div className="w-64 flex-shrink-0 border-l overflow-y-auto px-3 py-2" style={{ borderColor: '#21262d', backgroundColor: '#0d1117' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-codex-text-primary">Span Details</span>
            <button onClick={() => setSelectedSpan(null)} className="text-codex-text-muted hover:text-codex-text-primary text-xs">x</button>
          </div>
          <div className="space-y-2 text-[10px]">
            <div>
              <span className="text-codex-text-muted block">Name</span>
              <span className="text-codex-text-primary">{selectedSpan.span_name}</span>
            </div>
            <div>
              <span className="text-codex-text-muted block">Kind</span>
              <span className={`px-1 py-0.5 rounded ${KIND_BG[selectedSpan.span_kind]}`}>{selectedSpan.span_kind}</span>
            </div>
            <div>
              <span className="text-codex-text-muted block">Status</span>
              <span className={selectedSpan.status === 'completed' ? 'text-green-400' : selectedSpan.status === 'failed' ? 'text-red-400' : 'text-blue-400'}>
                {selectedSpan.status}
              </span>
            </div>
            {selectedSpan.tokens != null && (
              <div>
                <span className="text-codex-text-muted block">Tokens</span>
                <span className="text-codex-text-primary">{selectedSpan.tokens.toLocaleString()}</span>
              </div>
            )}
            {selectedSpan.cost != null && selectedSpan.cost > 0 && (
              <div>
                <span className="text-codex-text-muted block">Cost</span>
                <span className="text-codex-text-primary">${selectedSpan.cost.toFixed(4)}</span>
              </div>
            )}
            {selectedSpan.input && (
              <div>
                <span className="text-codex-text-muted block">Input</span>
                <pre className="text-codex-text-secondary whitespace-pre-wrap text-[9px] mt-0.5 max-h-24 overflow-y-auto" style={{ fontFamily: 'inherit' }}>
                  {selectedSpan.input.slice(0, 500)}
                </pre>
              </div>
            )}
            {selectedSpan.output && (
              <div>
                <span className="text-codex-text-muted block">Output</span>
                <pre className="text-codex-text-secondary whitespace-pre-wrap text-[9px] mt-0.5 max-h-24 overflow-y-auto" style={{ fontFamily: 'inherit' }}>
                  {selectedSpan.output.slice(0, 500)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
