import { useState, useEffect, useCallback, useMemo } from 'react';
import { AgentDef, Skill, SkillCategory, AgentUsageStats } from '../lib/types';
import { agentsAPI, skillsAPI, skillCategoriesAPI } from '../lib/ipc';
import AgentEditor from '../components/AgentEditor';
import AgentRunner from '../components/AgentRunner';

type SubView = 'list' | 'editor' | 'runner';

interface AgentsPageProps {
  projectId: string;
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
  const [_usageStats, _setUsageStats] = useState<Record<string, AgentUsageStats>>({});

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

  useEffect(() => {
    loadData();
  }, [loadData]);

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
  };

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
      <div style={{ flexShrink: 0 }} className="px-8 pt-8 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-codex-text-primary">Agents</h1>
            <p className="text-sm text-codex-text-secondary mt-1">
              {agents.length} AI agents that compose PM skills
            </p>
          </div>
          <button
            onClick={handleNewAgent}
            className="px-3 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md transition-colors"
          >
            + New Agent
          </button>
        </div>

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
              ✕
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="px-8 pb-8">
        {displayedAgents.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">{searchQuery ? '🔍' : '✨'}</div>
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
              return (
                <div
                  key={agent.id}
                  className="bg-codex-surface/60 border border-codex-border rounded-lg p-4 hover:bg-codex-surface-hover hover:border-codex-accent/50 transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 mr-2">
                      <span className="text-lg">{agent.icon}</span>
                      <h3 className="text-sm font-semibold text-codex-text-primary group-hover:text-codex-accent transition-colors">
                        {agent.name}
                      </h3>
                    </div>
                    <button
                      onClick={() => handleToggleFavorite(agent)}
                      className={`text-sm flex-shrink-0 ${agent.is_favorite ? 'text-yellow-400' : 'text-codex-text-muted hover:text-yellow-400'}`}
                    >
                      {agent.is_favorite ? '★' : '☆'}
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

                  <div className="flex items-center justify-between pt-2 border-t border-codex-border/50">
                    <span className="text-[10px] text-codex-text-muted">
                      Used {agent.usage_count}x
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleRunAgent(agent)}
                        className="text-[10px] px-2 py-1 text-codex-accent hover:text-codex-accent/80 font-medium"
                      >
                        Run
                      </button>
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
    </div>
  );
}
