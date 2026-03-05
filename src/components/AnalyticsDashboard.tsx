import { useState, useEffect, Component, ReactNode } from 'react';
import { tokenUsageAPI } from '../lib/ipc';
import { TokenUsageAggregate, TokenUsage } from '../lib/types';
import LineChart from './charts/LineChart';
import PieChart from './charts/PieChart';
import BarChart from './charts/BarChart';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="text-codex-text-secondary text-sm">Usage analytics failed to load</div>
          <div className="text-codex-text-muted text-xs">{this.state.error}</div>
          <button
            onClick={() => this.setState({ hasError: false, error: '' })}
            className="px-3 py-1.5 text-xs bg-codex-surface border border-codex-border rounded-md text-codex-text-secondary hover:text-codex-text-primary"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type DateRange = '7d' | '30d' | '90d' | 'custom';

function AnalyticsDashboardInner() {
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dailyData, setDailyData] = useState<TokenUsageAggregate[]>([]);
  const [allUsage, setAllUsage] = useState<TokenUsage[]>([]);
  const [providerData, setProviderData] = useState<Array<{ provider: string; cost: number; total_tokens: number }>>([]);
  const [modelData, setModelData] = useState<Array<{ model: string; cost: number; total_tokens: number }>>([]);

  const getDateRange = (): { start: string; end: string } => {
    const end = customEnd || new Date().toISOString().split('T')[0];
    if (dateRange === 'custom' && customStart) return { start: customStart, end };
    const days = dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30;
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return { start, end };
  };

  useEffect(() => {
    loadData();
  }, [dateRange, customStart, customEnd]);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { start, end } = getDateRange();
      const results = await Promise.allSettled([
        tokenUsageAPI.getByDateRange(start, end, 'daily'),
        tokenUsageAPI.getAll(),
        tokenUsageAPI.getByProvider(start, end),
        tokenUsageAPI.getByModel(start, end),
      ]);
      const safe = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
        r.status === 'fulfilled' && r.value ? r.value : fallback;
      setDailyData(safe(results[0], []) as TokenUsageAggregate[]);
      setAllUsage(safe(results[1], []) as TokenUsage[]);
      setProviderData(safe(results[2], []) as Array<{ provider: string; cost: number; total_tokens: number }>);
      setModelData(safe(results[3], []) as Array<{ model: string; cost: number; total_tokens: number }>);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const { start, end } = getDateRange();
      const csv = await tokenUsageAPI.exportCSV(start, end);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `usage-${start}-to-${end}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export CSV:', err);
    }
  };

  const totalTokens = Array.isArray(dailyData) ? dailyData.reduce((s, d) => s + (d?.total_tokens || 0), 0) : 0;
  const totalCost = Array.isArray(dailyData) ? dailyData.reduce((s, d) => s + (d?.cost || 0), 0) : 0;
  const activeDays = Array.isArray(dailyData) ? dailyData.filter(d => d?.total_tokens > 0).length : 0;
  const avgCostPerDay = activeDays > 0 ? totalCost / activeDays : 0;

  const providerColors: Record<string, string> = {
    openai: '#10b981',
    anthropic: '#f59e0b',
    google: '#4f46e5',
    ollama: '#8b5cf6',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-codex-text-secondary text-sm">Loading analytics...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="text-codex-text-secondary text-sm">Failed to load analytics</div>
        <div className="text-codex-text-muted text-xs">{loadError}</div>
        <button
          onClick={loadData}
          className="px-3 py-1.5 text-xs bg-codex-surface border border-codex-border rounded-md text-codex-text-secondary hover:text-codex-text-primary"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with date range + export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(['7d', '30d', '90d', 'custom'] as DateRange[]).map(range => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                dateRange === range
                  ? 'bg-codex-accent text-white'
                  : 'bg-codex-surface text-codex-text-secondary hover:text-codex-text-primary'
              }`}
            >
              {range === 'custom' ? 'Custom' : range}
            </button>
          ))}
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2 py-1 bg-codex-surface border border-codex-border rounded text-codex-text-primary text-xs"
              />
              <span className="text-codex-text-muted text-xs">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2 py-1 bg-codex-surface border border-codex-border rounded text-codex-text-primary text-xs"
              />
            </div>
          )}
        </div>
        <button
          onClick={handleExportCSV}
          className="px-3 py-1.5 text-xs bg-codex-surface border border-codex-border rounded-md text-codex-text-secondary hover:text-codex-text-primary transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-codex-surface/50 rounded-lg p-4 border border-codex-border">
          <div className="text-xs text-codex-text-muted mb-1">Total Tokens</div>
          <div className="text-xl font-semibold text-codex-text-primary">{totalTokens.toLocaleString()}</div>
        </div>
        <div className="bg-codex-surface/50 rounded-lg p-4 border border-codex-border">
          <div className="text-xs text-codex-text-muted mb-1">Total Cost</div>
          <div className="text-xl font-semibold text-codex-text-primary">${totalCost.toFixed(4)}</div>
        </div>
        <div className="bg-codex-surface/50 rounded-lg p-4 border border-codex-border">
          <div className="text-xs text-codex-text-muted mb-1">Active Days</div>
          <div className="text-xl font-semibold text-codex-text-primary">{activeDays}</div>
        </div>
        <div className="bg-codex-surface/50 rounded-lg p-4 border border-codex-border">
          <div className="text-xs text-codex-text-muted mb-1">Avg Cost/Day</div>
          <div className="text-xl font-semibold text-codex-text-primary">${avgCostPerDay.toFixed(4)}</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-codex-surface/50 rounded-lg p-4 border border-codex-border">
          <h3 className="text-sm font-medium text-codex-text-primary mb-3">Token Usage Trend</h3>
          <LineChart
            data={(dailyData || []).map(d => ({ label: d?.date || '', value: d?.total_tokens || 0 }))}
            height={180}
            color="#4f46e5"
          />
        </div>
        <div className="bg-codex-surface/50 rounded-lg p-4 border border-codex-border">
          <h3 className="text-sm font-medium text-codex-text-primary mb-3">Cost by Provider</h3>
          <PieChart
            data={(providerData || []).map(d => ({
              label: (d?.provider || 'unknown').charAt(0).toUpperCase() + (d?.provider || 'unknown').slice(1),
              value: d?.cost || 0,
              color: providerColors[d?.provider] || '#71717a',
            }))}
            size={160}
            formatValue={(v) => `$${(v || 0).toFixed(2)}`}
          />
        </div>
      </div>

      {/* Cost by model */}
      <div className="bg-codex-surface/50 rounded-lg p-4 border border-codex-border">
        <h3 className="text-sm font-medium text-codex-text-primary mb-3">Cost by Model</h3>
        <BarChart
          data={(modelData || [])
            .sort((a, b) => (b?.cost || 0) - (a?.cost || 0))
            .map(d => ({ label: d?.model || 'unknown', value: d?.cost || 0 }))}
          height={Math.max(140, (modelData || []).length * 34)}
          formatValue={(v) => `$${(v || 0).toFixed(4)}`}
        />
      </div>

      {/* Generation history */}
      <div className="bg-codex-surface/50 rounded-lg p-4 border border-codex-border">
        <h3 className="text-sm font-medium text-codex-text-primary mb-3">Generation History</h3>
        {!allUsage || allUsage.length === 0 ? (
          <div className="text-center py-6 text-codex-text-muted text-sm">No usage records</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-codex-border">
                  <th className="text-left py-2 px-3 text-codex-text-muted text-xs font-medium">Date</th>
                  <th className="text-left py-2 px-3 text-codex-text-muted text-xs font-medium">Provider</th>
                  <th className="text-left py-2 px-3 text-codex-text-muted text-xs font-medium">Model</th>
                  <th className="text-right py-2 px-3 text-codex-text-muted text-xs font-medium">Input</th>
                  <th className="text-right py-2 px-3 text-codex-text-muted text-xs font-medium">Output</th>
                  <th className="text-right py-2 px-3 text-codex-text-muted text-xs font-medium">Total</th>
                  <th className="text-right py-2 px-3 text-codex-text-muted text-xs font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {allUsage.slice(0, 50).map((usage) => (
                  <tr key={usage?.id || Math.random()} className="border-b border-codex-border/30 hover:bg-codex-surface/30">
                    <td className="py-2 px-3 text-codex-text-secondary text-xs">
                      {usage?.created_at ? new Date(usage.created_at * 1000).toLocaleDateString() : '-'}
                    </td>
                    <td className="py-2 px-3 text-xs">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: providerColors[usage?.provider] || '#71717a' }} />
                      <span className="text-codex-text-secondary">{usage?.provider || '-'}</span>
                    </td>
                    <td className="py-2 px-3 text-codex-text-secondary text-xs">{usage?.model || '-'}</td>
                    <td className="py-2 px-3 text-right text-codex-text-secondary text-xs">{(usage?.input_tokens || 0).toLocaleString()}</td>
                    <td className="py-2 px-3 text-right text-codex-text-secondary text-xs">{(usage?.output_tokens || 0).toLocaleString()}</td>
                    <td className="py-2 px-3 text-right text-codex-text-primary text-xs">{(usage?.total_tokens || 0).toLocaleString()}</td>
                    <td className="py-2 px-3 text-right text-codex-accent text-xs">${(usage?.cost || 0).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allUsage.length > 50 && (
              <div className="text-center py-3 text-xs text-codex-text-muted">
                Showing 50 of {allUsage.length} records
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnalyticsDashboard() {
  return (
    <ErrorBoundary>
      <AnalyticsDashboardInner />
    </ErrorBoundary>
  );
}
