import { useState, useEffect, useCallback, useMemo } from 'react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { AgentDef, Skill, SkillCategory, AgentRun, ImportPreview, ConflictAction, BatchExportResult } from '../lib/types';
import { agentsAPI, skillsAPI, skillCategoriesAPI, agentRunsAPI, marketplaceAPI } from '../lib/ipc';
import AgentEditor from '../components/AgentEditor';
import AgentRunner from '../components/AgentRunner';
import ImportPreviewDialog from '../components/ImportPreviewDialog';
import BatchExportDialog from '../components/BatchExportDialog';
import BatchImportDialog, { BatchImportItem } from '../components/BatchImportDialog';
import { useAgentRunManager } from '../lib/agentRunManager';

type SubView = 'list' | 'editor' | 'runner' | 'run-history' | 'manage';

interface AgentsPageProps {
  projectId: string;
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - (ts < 1e12 ? ts * 1000 : ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AgentsPage({ projectId }: AgentsPageProps) {
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AgentDef[] | null>(null);
  const [subView, setSubView] = useState<SubView>('list');
  const [selectedAgent, setSelectedAgent] = useState<AgentDef | null>(null);
  const [allRuns, setAllRuns] = useState<AgentRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);
  const { activeRuns, cancelRun } = useAgentRunManager();

  const [showImportPreview, setShowImportPreview] = useState(false);
  const [showBatchExport, setShowBatchExport] = useState(false);
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [batchImportItems, setBatchImportItems] = useState<BatchImportItem[]>([]);
  const [importMdContent, setImportMdContent] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [allAgents, allSkills, allCategories] = await Promise.all([
        agentsAPI.list(),
        skillsAPI.list(),
        skillCategoriesAPI.list(),
      ]);
      setAgents(allAgents);
      setSkills(allSkills);
      setCategories(allCategories);
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      const runs = await agentRunsAPI.list(undefined, projectId);
      setAllRuns(runs.sort((a, b) => b.created_at - a.created_at).slice(0, 50));
    } catch {}
  }, [projectId]);

  useEffect(() => {
    loadData();
    loadRuns();
  }, [loadData, loadRuns]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    agentsAPI.search(searchQuery).then(results => {
      if (!cancelled) setSearchResults(results);
    });
    return () => { cancelled = true; };
  }, [searchQuery]);

  const displayedAgents = useMemo(() => {
    return searchResults ?? agents;
  }, [agents, searchResults]);

  const getAgentSkills = (agent: AgentDef): Skill[] => {
    try {
      const ids: string[] = JSON.parse(agent.skill_ids || '[]');
      return ids.map(id => skills.find(s => s.id === id)).filter((s): s is Skill => !!s);
    } catch {
      return [];
    }
  };

  const handleToggleFavorite = async (agent: AgentDef) => {
    try {
      await agentsAPI.update(agent.id, { isFavorite: !agent.is_favorite });
      await loadData();
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handleDuplicate = async (agent: AgentDef) => {
    try {
      await agentsAPI.duplicate(agent.id, `${agent.name} (Copy)`);
      await loadData();
    } catch (err) {
      console.error('Failed to duplicate agent:', err);
    }
  };

  const handleDelete = async (agent: AgentDef) => {
    if (agent.is_builtin) return;
    try {
      await agentsAPI.delete(agent.id);
      if (selectedAgent?.id === agent.id) setSelectedAgent(null);
      await loadData();
    } catch (err) {
      console.error('Failed to delete agent:', err);
    }
  };

  const handleNewAgent = () => {
    setSelectedAgent(null);
    setSubView('editor');
  };

  const handleEditAgent = (agent: AgentDef) => {
    setSelectedAgent(agent);
    setSubView('editor');
  };

  const handleRunAgent = (agent: AgentDef) => {
    setSelectedAgent(agent);
    setSubView('runner');
  };

  const handleEditorSave = async () => {
    setSubView('list');
    setSelectedAgent(null);
    await loadData();
  };

  const handleBack = () => {
    setSubView('list');
    setSelectedAgent(null);
    setSelectedRun(null);
    loadRuns();
  };

  const handleViewRunHistory = () => {
    loadRuns();
    setSubView('run-history');
  };

  const handleViewRun = (run: AgentRun) => {
    setSelectedRun(run);
  };

  const handleExportSingle = async (agent: AgentDef) => {
    try {
      const content = await marketplaceAPI.exportAgent(agent.id);
      const filePath = await save({
        defaultPath: `${agent.name.toLowerCase().replace(/\s+/g, '-')}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (filePath) {
        await writeTextFile(filePath, content);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleImport = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];

      if (paths.length === 1) {
        const content = await readTextFile(paths[0] as string);
        setImportMdContent(content);
        const preview = await marketplaceAPI.previewImportAgent(content);
        setImportPreview(preview);
        setShowImportPreview(true);
      } else {
        const items: BatchImportItem[] = [];
        for (const path of paths) {
          const filename = (path as string).split('/').pop() || 'unknown.md';
          try {
            const content = await readTextFile(path as string);
            const preview = await marketplaceAPI.previewImportAgent(content);
            items.push({ filename, mdContent: content, preview, error: null, action: preview.already_exists ? 'copy' : 'copy', result: null });
          } catch (err) {
            items.push({ filename, mdContent: '', preview: null, error: err instanceof Error ? err.message : String(err), action: 'copy', result: null });
          }
        }
        setBatchImportItems(items);
        setShowBatchImport(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  };

  const handleBatchExportSave = async (results: BatchExportResult[]) => {
    const dir = await open({ directory: true });
    if (!dir) throw new Error('No directory selected');
    for (const item of results) {
      await writeTextFile(`${dir}/${item.filename}`, item.content);
    }
  };

  const runningCount = Array.from(activeRuns.values()).filter(r => r.status === 'running').length;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
        <div className="h-full flex items-center justify-center">
          <div className="text-codex-text-secondary">Loading agents...</div>
        </div>
      </div>
    );
  }

  if (subView === 'editor') {
    return (
      <AgentEditor
        agent={selectedAgent}
        skills={skills}
        categories={categories}
        onSave={handleEditorSave}
        onCancel={handleBack}
      />
    );
  }

  if (subView === 'runner' && selectedAgent) {
    return (
      <AgentRunner
        agent={selectedAgent}
        skills={skills}
        projectId={projectId}
        onBack={handleBack}
      />
    );
  }

  if (subView === 'run-history') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
        <div className="flex items-center gap-3 px-8 pt-6 pb-4 flex-shrink-0 border-b border-codex-border">
          <button onClick={handleBack} className="text-codex-text-muted hover:text-codex-text-primary transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-codex-text-primary">Run History</h1>
          <span className="text-xs text-codex-text-muted">{allRuns.length} runs</span>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          <div className="w-80 flex-shrink-0 border-r border-codex-border overflow-y-auto">
            {allRuns.length === 0 ? (
              <div className="px-4 py-8 text-xs text-codex-text-muted text-center">
                No agent runs yet
              </div>
            ) : (
              allRuns.map(run => {
                const agentName = agents.find(a => a.id === run.agent_id)?.name || 'Unknown';
                const agentIcon = agents.find(a => a.id === run.agent_id)?.icon || '?';
                return (
                  <button
                    key={run.id}
                    onClick={() => handleViewRun(run)}
                    className={`w-full px-4 py-3 text-left border-b border-codex-border/30 transition-colors ${
                      selectedRun?.id === run.id ? 'bg-codex-accent/10 border-l-2 border-l-codex-accent' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{agentIcon}</span>
                      <span className="text-xs font-medium text-codex-text-primary">{agentName}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ml-auto ${
                        run.status === 'completed' ? 'bg-green-500/20 text-green-300'
                        : run.status === 'failed' ? 'bg-red-500/20 text-red-300'
                        : run.status === 'running' ? 'bg-blue-500/20 text-blue-300'
                        : 'bg-codex-surface text-codex-text-muted'
                      }`}>
                        {run.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-codex-text-muted truncate">
                      {run.input_prompt.slice(0, 80)}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[9px] text-codex-text-muted">
                      <span>{formatTimeAgo(run.created_at)}</span>
                      <span>{run.total_tokens.toLocaleString()} tok</span>
                      {run.cost > 0 && <span>${run.cost.toFixed(4)}</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="p-6">
            {selectedRun ? (
              <div>
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{agents.find(a => a.id === selectedRun.agent_id)?.icon || '?'}</span>
                    <h2 className="text-sm font-semibold text-codex-text-primary">
                      {agents.find(a => a.id === selectedRun.agent_id)?.name || 'Unknown Agent'}
                    </h2>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                      selectedRun.status === 'completed' ? 'bg-green-500/20 text-green-300'
                      : selectedRun.status === 'failed' ? 'bg-red-500/20 text-red-300'
                      : 'bg-codex-surface text-codex-text-muted'
                    }`}>
                      {selectedRun.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-codex-text-muted mb-1">
                    Prompt: <span className="text-codex-text-secondary">{selectedRun.input_prompt}</span>
                  </div>
                  <div className="flex gap-4 text-[10px] text-codex-text-muted">
                    <span>{selectedRun.total_tokens.toLocaleString()} tokens</span>
                    {selectedRun.cost > 0 && <span>${selectedRun.cost.toFixed(4)}</span>}
                    {selectedRun.duration_ms && <span>{(selectedRun.duration_ms / 1000).toFixed(1)}s</span>}
                    <span>{formatTimeAgo(selectedRun.created_at)}</span>
                  </div>
                </div>
                {selectedRun.error && (
                  <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
                    {selectedRun.error}
                  </div>
                )}
                <div className="bg-codex-surface/40 border border-codex-border rounded-lg p-4">
                  <pre className="whitespace-pre-wrap text-xs text-codex-text-primary leading-relaxed font-sans">
                    {selectedRun.output_content || '(no output)'}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="text-xs text-codex-text-muted">Select a run to view its output</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (subView === 'manage') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
        <div className="flex-shrink-0 px-6 py-4 border-b border-codex-border bg-codex-surface/50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-codex-text-primary">Agent Manager</h2>
              <p className="text-[10px] text-codex-text-muted mt-0.5">
                {agents.length} agents
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleImport} className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors">Import</button>
              <button onClick={() => setShowBatchExport(true)} className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors">Export</button>
              <button onClick={handleNewAgent} className="px-3 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent-hover rounded transition-colors">+ New Agent</button>
              <button onClick={() => setSubView('list')} className="px-2 py-1 text-xs text-codex-text-muted hover:text-codex-text-primary transition-colors">✕</button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-red-200">✕</button>
          </div>
        )}

        <div className="flex-1 flex min-h-0">
          <div className="w-72 flex-shrink-0 border-r border-codex-border overflow-y-auto p-3 space-y-1">
            {agents.length === 0 ? (
              <div className="text-xs text-codex-text-muted text-center py-8">No agents yet</div>
            ) : agents.map(a => (
              <button
                key={a.id}
                onClick={() => setSelectedAgent(a)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${selectedAgent?.id === a.id ? 'bg-codex-accent/15 border border-codex-accent/30' : 'hover:bg-codex-surface-hover border border-transparent'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{a.icon}</span>
                  <span className="text-xs font-medium text-codex-text-primary truncate">{a.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-codex-text-muted">{a.provider}</span>
                  {a.is_builtin && <span className="text-[10px] px-1 py-0.5 bg-green-500/20 text-green-300 rounded">Built-in</span>}
                </div>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {selectedAgent ? (
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{selectedAgent.icon}</span>
                      <h3 className="text-sm font-semibold text-codex-text-primary">{selectedAgent.name}</h3>
                    </div>
                    <p className="text-[10px] text-codex-text-muted mt-0.5">{selectedAgent.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {selectedAgent.is_builtin && <span className="text-[10px] px-1.5 py-0.5 bg-codex-accent/20 text-codex-accent rounded">Built-in</span>}
                      <span className="text-[10px] text-codex-text-muted">{selectedAgent.provider} / {selectedAgent.model}</span>
                      <span className="text-[10px] text-codex-text-muted">temp: {selectedAgent.temperature}</span>
                    </div>
                  </div>
                </div>

                {getAgentSkills(selectedAgent).length > 0 && (
                  <div>
                    <label className="block text-xs text-codex-text-secondary mb-1">Skills</label>
                    <div className="flex flex-wrap gap-1">
                      {getAgentSkills(selectedAgent).map(s => (
                        <span key={s.id} className="text-[10px] px-2 py-0.5 bg-codex-bg/60 text-codex-text-muted rounded border border-codex-border/30">
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-codex-border">
                  <button onClick={() => handleEditAgent(selectedAgent)} className="px-3 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent-hover rounded transition-colors">Edit</button>
                  <button onClick={() => handleRunAgent(selectedAgent)} className="px-3 py-1.5 text-xs text-codex-accent hover:text-codex-accent/80 bg-codex-surface border border-codex-border rounded transition-colors">Run</button>
                  <button onClick={() => handleDuplicate(selectedAgent)} className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors">Duplicate</button>
                  <button onClick={() => handleExportSingle(selectedAgent)} className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors">Export</button>
                  {!selectedAgent.is_builtin && (
                    <button onClick={() => handleDelete(selectedAgent)} className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 bg-codex-surface border border-red-500/30 rounded transition-colors">Delete</button>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-codex-text-secondary mb-2">System Instructions</label>
                  <div className="bg-codex-surface/40 border border-codex-border rounded p-3 text-xs text-codex-text-muted max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                    {selectedAgent.system_instructions.substring(0, 500)}
                    {selectedAgent.system_instructions.length > 500 && '...'}
                  </div>
                </div>

                <div className="pt-2 border-t border-codex-border">
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-codex-text-muted">
                    <div>Created: {new Date(selectedAgent.created_at * 1000).toLocaleDateString()}</div>
                    <div>Updated: {new Date(selectedAgent.updated_at * 1000).toLocaleDateString()}</div>
                    <div>Used: {selectedAgent.usage_count}x</div>
                    <div>Max tokens: {selectedAgent.max_tokens}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-md px-8">
                  <div className="text-3xl mb-3">🤖</div>
                  <h3 className="text-sm font-semibold text-codex-text-primary mb-1">Select an agent</h3>
                  <p className="text-xs text-codex-text-secondary">Choose an agent from the list to view details or edit</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {showImportPreview && importPreview && (
          <ImportPreviewDialog preview={importPreview} onConfirm={async (action: ConflictAction) => { const result = await marketplaceAPI.confirmImportAgent(importMdContent, action); await loadData(); return result; }} onClose={() => { setShowImportPreview(false); setImportPreview(null); setImportMdContent(''); }} />
        )}
        {showBatchExport && (
          <BatchExportDialog mode="agents" items={agents} onExport={(ids) => marketplaceAPI.exportAgentsBatch(ids)} onSaveFiles={handleBatchExportSave} onClose={() => setShowBatchExport(false)} />
        )}
        {showBatchImport && (
          <BatchImportDialog items={batchImportItems} onConfirm={(mdContent, action) => marketplaceAPI.confirmImportAgent(mdContent, action)} onClose={() => setShowBatchImport(false)} onDone={() => { loadData(); }} />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
      <div style={{ flexShrink: 0 }} className="px-8 pt-8 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-codex-text-primary">Agents</h1>
            <p className="text-sm text-codex-text-secondary mt-1">
              {agents.length} AI agents that compose PM skills
            </p>
            <p className="text-[10px] text-codex-text-muted mt-1">
              Requires a configured API key in Settings (Claude, OpenAI, Google, or Ollama).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleImport}
              className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded-md transition-colors"
            >
              Import
            </button>
            <button
              onClick={() => setShowBatchExport(true)}
              className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded-md transition-colors"
            >
              Export
            </button>
            <button
              onClick={() => setSubView('manage')}
              className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded-md transition-colors"
              title="Manage agents"
            >
              Manage
            </button>
            <button
              onClick={handleViewRunHistory}
              className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded-md transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Run History
              {allRuns.length > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 bg-codex-bg/50 rounded">{allRuns.length}</span>
              )}
            </button>
            <button
              onClick={handleNewAgent}
              className="px-3 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md transition-colors"
            >
              + New Agent
            </button>
          </div>
        </div>

        {runningCount > 0 && (
          <div className="mb-4 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs text-green-300 font-medium">{runningCount} agent{runningCount > 1 ? 's' : ''} running</span>
            </div>
            <div className="mt-1 space-y-1">
              {Array.from(activeRuns.values()).filter(r => r.status === 'running').map(run => (
                <div key={run.agentId} className="flex items-center justify-between">
                  <span className="text-[10px] text-codex-text-secondary">
                    {run.agent.icon} {run.agent.name}: {run.prompt.slice(0, 50)}{run.prompt.length > 50 ? '...' : ''}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setSelectedAgent(run.agent); setSubView('runner'); }}
                      className="text-[10px] text-codex-accent hover:text-codex-accent/80"
                    >
                      View
                    </button>
                    <button
                      onClick={() => cancelRun(run.agentId)}
                      className="text-[10px] text-red-400 hover:text-red-300"
                    >
                      Stop
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="relative max-w-md">
          <input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-codex-text-muted hover:text-codex-text-primary"
            >
              x
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="px-8 pb-8">
        {displayedAgents.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">{searchQuery ? '' : ''}</div>
            <h3 className="text-sm font-semibold text-codex-text-primary mb-1">
              {searchQuery ? 'No agents found' : 'No agents yet'}
            </h3>
            <p className="text-xs text-codex-text-muted mb-4">
              {searchQuery ? 'Try a different search term' : 'Create your first AI agent'}
            </p>
            {!searchQuery && (
              <button
                onClick={handleNewAgent}
                className="px-4 py-2 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md transition-colors"
              >
                Create Agent
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
            {displayedAgents.map(agent => {
              const agentSkills = getAgentSkills(agent);
              const activeRunForAgent = activeRuns.get(agent.id);
              const isAgentRunning = activeRunForAgent?.status === 'running';
              return (
                <div
                  key={agent.id}
                  className={`bg-codex-surface/60 border rounded-lg p-4 hover:bg-codex-surface-hover transition-all duration-200 group ${
                    isAgentRunning ? 'border-green-500/50 ring-1 ring-green-500/20' : 'border-codex-border hover:border-codex-accent/50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 mr-2">
                      <h3 className="text-sm font-semibold text-codex-text-primary group-hover:text-codex-accent transition-colors">
                        {agent.name}
                      </h3>
                      {isAgentRunning && (
                        <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      )}
                    </div>
                    <button
                      onClick={() => handleToggleFavorite(agent)}
                      className={`text-sm flex-shrink-0 ${agent.is_favorite ? 'text-yellow-400' : 'text-codex-text-muted hover:text-yellow-400'}`}
                    >
                      {agent.is_favorite ? '\u2605' : '\u2606'}
                    </button>
                  </div>

                  <p className="text-[10px] text-codex-text-muted leading-relaxed mb-3 line-clamp-2">
                    {agent.description}
                  </p>

                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                      {agent.model}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 bg-codex-surface/30 text-codex-text-secondary rounded">
                      {agent.provider}
                    </span>
                    {agent.is_builtin && (
                      <span className="text-[10px] px-2 py-0.5 bg-green-500/20 text-green-300 rounded">
                        Built-in
                      </span>
                    )}
                  </div>

                  {agentSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {agentSkills.slice(0, 4).map(s => (
                        <span key={s.id} className="text-[9px] px-1.5 py-0.5 bg-codex-bg/60 text-codex-text-muted rounded border border-codex-border/30">
                          {s.name}
                        </span>
                      ))}
                      {agentSkills.length > 4 && (
                        <span className="text-[9px] px-1.5 py-0.5 text-codex-text-muted">
                          +{agentSkills.length - 4} more
                        </span>
                      )}
                    </div>
                  )}

                  {isAgentRunning && (
                    <div className="mb-3 px-2 py-1.5 bg-green-500/5 border border-green-500/20 rounded text-[10px] text-green-300 flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                      Running: {activeRunForAgent.prompt.slice(0, 40)}{activeRunForAgent.prompt.length > 40 ? '...' : ''}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-codex-border/50">
                    <span className="text-[10px] text-codex-text-muted">
                      Used {agent.usage_count}x
                    </span>
                    <div className="flex gap-1">
                      {isAgentRunning ? (
                        <>
                          <button
                            onClick={() => handleRunAgent(agent)}
                            className="text-[10px] px-2 py-1 text-green-300 hover:text-green-200 font-medium"
                          >
                            View
                          </button>
                          <button
                            onClick={() => cancelRun(agent.id)}
                            className="text-[10px] px-2 py-1 text-red-400 hover:text-red-300"
                          >
                            Stop
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleRunAgent(agent)}
                          className="text-[10px] px-2 py-1 text-codex-accent hover:text-codex-accent/80 font-medium"
                        >
                          Run
                        </button>
                      )}
                      <button
                        onClick={() => handleEditAgent(agent)}
                        className="text-[10px] px-2 py-1 text-codex-text-secondary hover:text-codex-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDuplicate(agent)}
                        className="text-[10px] px-2 py-1 text-codex-text-secondary hover:text-codex-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Duplicate
                      </button>
                      {!agent.is_builtin && (
                        <button
                          onClick={() => handleDelete(agent)}
                          className="text-[10px] px-2 py-1 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showImportPreview && importPreview && (
        <ImportPreviewDialog preview={importPreview} onConfirm={async (action: ConflictAction) => { const result = await marketplaceAPI.confirmImportAgent(importMdContent, action); await loadData(); return result; }} onClose={() => { setShowImportPreview(false); setImportPreview(null); setImportMdContent(''); }} />
      )}
      {showBatchExport && (
        <BatchExportDialog mode="agents" items={agents} onExport={(ids) => marketplaceAPI.exportAgentsBatch(ids)} onSaveFiles={handleBatchExportSave} onClose={() => setShowBatchExport(false)} />
      )}
      {showBatchImport && (
        <BatchImportDialog items={batchImportItems} onConfirm={(mdContent, action) => marketplaceAPI.confirmImportAgent(mdContent, action)} onClose={() => setShowBatchImport(false)} onDone={() => { loadData(); }} />
      )}
    </div>
  );
}
