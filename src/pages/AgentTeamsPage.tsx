import { useState, useEffect, useCallback, useMemo } from 'react';
import { AgentTeam, AgentDef, ExecutionMode } from '../lib/types';
import { agentTeamsAPI, agentsAPI } from '../lib/ipc';
import TeamCanvas from '../components/TeamCanvas';
import TeamRunner from '../components/TeamRunner';

type SubView = 'list' | 'editor' | 'runner';

const TEAM_ICONS = ['👥', '🏢', '⚙️', '🔗', '🎯', '🚀', '🧪', '🌐', '📋', '🤝'];
const MODE_LABELS: Record<ExecutionMode, { label: string; color: string }> = {
  sequential: { label: 'Sequential', color: 'bg-blue-500/20 text-blue-300' },
  parallel: { label: 'Parallel', color: 'bg-green-500/20 text-green-300' },
  conductor: { label: 'Conductor', color: 'bg-purple-500/20 text-purple-300' },
};

interface AgentTeamsPageProps {
  projectId: string;
}

export default function AgentTeamsPage({ projectId }: AgentTeamsPageProps) {
  const [teams, setTeams] = useState<AgentTeam[]>([]);
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AgentTeam[] | null>(null);
  const [subView, setSubView] = useState<SubView>('list');
  const [selectedTeam, setSelectedTeam] = useState<AgentTeam | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIcon, setNewIcon] = useState('👥');
  const [newMode, setNewMode] = useState<ExecutionMode>('sequential');
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [allTeams, allAgents] = await Promise.all([
        agentTeamsAPI.list(),
        agentsAPI.list(),
      ]);
      setTeams(allTeams);
      setAgents(allAgents);
    } catch (err) {
      console.error('Failed to load teams:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    let cancelled = false;
    agentTeamsAPI.search(searchQuery).then(results => {
      if (!cancelled) setSearchResults(results);
    });
    return () => { cancelled = true; };
  }, [searchQuery]);

  const displayedTeams = useMemo(() => searchResults ?? teams, [teams, searchResults]);

  const handleToggleFavorite = async (team: AgentTeam) => {
    try {
      await agentTeamsAPI.update(team.id, { isFavorite: !team.is_favorite });
      await loadData();
    } catch {}
  };

  const handleDuplicate = async (team: AgentTeam) => {
    try {
      await agentTeamsAPI.duplicate(team.id, `${team.name} (Copy)`);
      await loadData();
    } catch {}
  };

  const handleDelete = async (team: AgentTeam) => {
    try {
      await agentTeamsAPI.delete(team.id);
      await loadData();
    } catch {}
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const team = await agentTeamsAPI.create({
        name: newName.trim(),
        description: newDescription.trim(),
        icon: newIcon,
        executionMode: newMode,
        maxConcurrent: 3,
      });
      setShowCreateModal(false);
      setNewName('');
      setNewDescription('');
      setNewIcon('👥');
      setNewMode('sequential');
      setSelectedTeam(team);
      setSubView('editor');
      await loadData();
    } catch {} finally {
      setCreating(false);
    }
  };

  const handleEditTeam = (team: AgentTeam) => {
    setSelectedTeam(team);
    setSubView('editor');
  };

  const handleRunTeam = (team: AgentTeam) => {
    setSelectedTeam(team);
    setSubView('runner');
  };

  const handleBack = () => {
    setSubView('list');
    setSelectedTeam(null);
    loadData();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
        <div className="h-full flex items-center justify-center">
          <div className="text-codex-text-secondary">Loading workflows...</div>
        </div>
      </div>
    );
  }

  if (subView === 'editor' && selectedTeam) {
    return (
      <TeamCanvas
        team={selectedTeam}
        agents={agents}
        onBack={handleBack}
        onRun={() => setSubView('runner')}
      />
    );
  }

  if (subView === 'runner' && selectedTeam) {
    return (
      <TeamRunner
        team={selectedTeam}
        agents={agents}
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
            <h1 className="text-2xl font-semibold text-codex-text-primary">Workflows</h1>
            <p className="text-sm text-codex-text-secondary mt-1">
              {teams.length} workflows that orchestrate multiple agents
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md transition-colors"
          >
            + New Workflow
          </button>
        </div>

        <div className="relative max-w-md">
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-codex-text-muted hover:text-codex-text-primary">
              ✕
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="px-8 pb-8">
        {displayedTeams.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">{searchQuery ? '🔍' : '👥'}</div>
            <h3 className="text-sm font-semibold text-codex-text-primary mb-1">
              {searchQuery ? 'No workflows found' : 'No workflows yet'}
            </h3>
            <p className="text-xs text-codex-text-muted mb-4">
              {searchQuery ? 'Try a different search term' : 'Create your first workflow'}
            </p>
            {!searchQuery && (
              <button onClick={() => setShowCreateModal(true)} className="px-4 py-2 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md transition-colors">
                Create Workflow
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
            {displayedTeams.map(team => {
              const modeInfo = MODE_LABELS[team.execution_mode] || MODE_LABELS.sequential;
              return (
                <div
                  key={team.id}
                  className="bg-codex-surface/60 border border-codex-border rounded-lg p-4 hover:bg-codex-surface-hover hover:border-codex-accent/50 transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 mr-2">
                      <span className="text-lg">{team.icon || '👥'}</span>
                      <h3 className="text-sm font-semibold text-codex-text-primary group-hover:text-codex-accent transition-colors">
                        {team.name}
                      </h3>
                    </div>
                    <button
                      onClick={() => handleToggleFavorite(team)}
                      className={`text-sm flex-shrink-0 ${team.is_favorite ? 'text-yellow-400' : 'text-codex-text-muted hover:text-yellow-400'}`}
                    >
                      {team.is_favorite ? '★' : '☆'}
                    </button>
                  </div>

                  <p className="text-[10px] text-codex-text-muted leading-relaxed mb-3 line-clamp-2">
                    {team.description || 'No description'}
                  </p>

                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded ${modeInfo.color}`}>
                      {modeInfo.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-codex-border/50">
                    <span className="text-[10px] text-codex-text-muted">
                      Used {team.usage_count}x
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleRunTeam(team)}
                        className="text-[10px] px-2 py-1 text-codex-accent hover:text-codex-accent/80 font-medium"
                      >
                        Run
                      </button>
                      <button
                        onClick={() => handleEditTeam(team)}
                        className="text-[10px] px-2 py-1 text-codex-text-secondary hover:text-codex-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDuplicate(team)}
                        className="text-[10px] px-2 py-1 text-codex-text-secondary hover:text-codex-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={() => handleDelete(team)}
                        className="text-[10px] px-2 py-1 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
          <div className="bg-codex-bg border border-codex-border rounded-lg p-6 w-[400px] shadow-xl">
            <h2 className="text-sm font-semibold text-codex-text-primary mb-4">Create New Workflow</h2>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div>
                  <label className="block text-[10px] text-codex-text-muted mb-1">Icon</label>
                  <div className="flex flex-wrap gap-1">
                    {TEAM_ICONS.map(i => (
                      <button
                        key={i}
                        onClick={() => setNewIcon(i)}
                        className={`w-7 h-7 text-sm flex items-center justify-center rounded ${newIcon === i ? 'bg-codex-accent/20 ring-1 ring-codex-accent' : 'hover:bg-codex-surface'}`}
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-codex-text-muted mb-1">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Research Team"
                  className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[10px] text-codex-text-muted mb-1">Description</label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="What does this team do?"
                  className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                />
              </div>
              <div>
                <label className="block text-[10px] text-codex-text-muted mb-1">Execution Mode</label>
                <select
                  value={newMode}
                  onChange={(e) => setNewMode(e.target.value as ExecutionMode)}
                  className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
                >
                  <option value="sequential">Sequential — agents chain outputs</option>
                  <option value="parallel">Parallel — agents run concurrently</option>
                  <option value="conductor">Conductor — one agent orchestrates others</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="px-4 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md transition-colors disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Workflow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
