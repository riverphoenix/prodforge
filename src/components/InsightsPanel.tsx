import { useState, useEffect } from 'react';
import { ProjectInsight } from '../lib/types';
import { insightsAPI, frameworkOutputsAPI, contextDocumentsAPI, conversationsAPI } from '../lib/ipc';

interface InsightsPanelProps {
  projectId: string;
  apiKey: string | null;
  onNavigateToFramework?: (frameworkId: string) => void;
  onClose: () => void;
}

export default function InsightsPanel({ projectId, apiKey, onNavigateToFramework, onClose }: InsightsPanelProps) {
  const [insights, setInsights] = useState<ProjectInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadInsights();
  }, [projectId]);

  const loadInsights = async () => {
    setLoading(true);
    try {
      const data = await insightsAPI.list(projectId);
      setInsights(data);
    } catch (err) {
      console.error('Failed to load insights:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!apiKey) return;
    setGenerating(true);
    try {
      const [outputs, docs, conversations] = await Promise.all([
        frameworkOutputsAPI.list(projectId),
        contextDocumentsAPI.list(projectId),
        conversationsAPI.list(projectId),
      ]);

      const response = await fetch('http://127.0.0.1:8001/insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          project_name: 'Project',
          framework_outputs: outputs.map(o => ({
            name: o.name,
            category: o.category,
            framework_id: o.framework_id,
            created_at: o.created_at,
          })),
          context_documents: docs.map(d => ({
            name: d.name,
            type: d.type,
          })),
          conversation_count: conversations.length,
          total_tokens_used: 0,
          api_key: apiKey,
          model: 'gpt-5-mini',
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      await insightsAPI.clear(projectId);
      if (data.insights && data.insights.length > 0) {
        await insightsAPI.save(projectId, JSON.stringify(data.insights));
      }
      await loadInsights();
    } catch (err) {
      console.error('Failed to generate insights:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await insightsAPI.dismiss(id);
      setInsights(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      console.error('Failed to dismiss:', err);
    }
  };

  const priorityColor = (p: string) => {
    switch (p) {
      case 'high': return 'border-red-500/30 bg-red-500/5';
      case 'medium': return 'border-yellow-500/30 bg-yellow-500/5';
      default: return 'border-codex-border bg-codex-surface/20';
    }
  };

  const typeIcon = (t: string) => {
    switch (t) {
      case 'suggestion': return '💡';
      case 'pattern': return '📊';
      case 'next_step': return '➡️';
      default: return '💡';
    }
  };

  return (
    <div className="fixed right-0 top-0 bottom-0 w-80 border-l border-codex-border shadow-xl z-40 flex flex-col" style={{ backgroundColor: '#1e1e1e' }}>
      <div className="px-4 py-3 border-b border-codex-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-codex-text-primary">AI Insights</h3>
        <button onClick={onClose} className="text-codex-text-secondary hover:text-codex-text-primary text-lg">&times;</button>
      </div>

      <div className="px-4 py-3 border-b border-codex-border">
        <button
          onClick={handleGenerate}
          disabled={generating || !apiKey}
          className="w-full px-3 py-2 bg-codex-accent text-white rounded-lg text-xs hover:bg-codex-accent/80 disabled:opacity-50"
        >
          {generating ? 'Analyzing project...' : 'Generate Insights'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <p className="text-xs text-codex-text-muted text-center py-4">Loading...</p>
        ) : insights.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-2xl mb-2">💡</div>
            <p className="text-xs text-codex-text-muted">No insights yet. Generate insights to get AI-powered suggestions for your project.</p>
          </div>
        ) : (
          insights.map(insight => (
            <div key={insight.id} className={`p-3 rounded-lg border ${priorityColor(insight.priority)}`}>
              <div className="flex items-start gap-2">
                <span className="text-sm flex-shrink-0">{typeIcon(insight.insight_type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <h4 className="text-xs font-medium text-codex-text-primary truncate">{insight.title}</h4>
                    <span className={`text-[8px] px-1 py-0.5 rounded ${
                      insight.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                      insight.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-codex-surface text-codex-text-muted'
                    }`}>{insight.priority}</span>
                  </div>
                  <p className="text-[10px] text-codex-text-secondary leading-relaxed">{insight.description}</p>
                  <div className="flex gap-1 mt-2">
                    {insight.framework_id && onNavigateToFramework && (
                      <button
                        onClick={() => onNavigateToFramework(insight.framework_id!)}
                        className="px-1.5 py-0.5 text-[9px] bg-codex-accent/20 text-codex-accent rounded hover:bg-codex-accent/30"
                      >
                        Open Framework
                      </button>
                    )}
                    <button
                      onClick={() => handleDismiss(insight.id)}
                      className="px-1.5 py-0.5 text-[9px] text-codex-text-muted hover:text-codex-text-secondary"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
