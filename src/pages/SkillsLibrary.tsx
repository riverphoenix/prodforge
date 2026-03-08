import { useState, useEffect, useCallback, useMemo } from 'react';
import { Skill, SkillCategory, ModelTier } from '../lib/types';
import { skillsAPI, skillCategoriesAPI } from '../lib/ipc';
import SkillEditorModal from '../components/SkillEditorModal';

type SortOption = 'most-used' | 'recent' | 'alpha' | 'favorites';

const MODEL_TIER_COLORS: Record<ModelTier, { bg: string; text: string }> = {
  opus: { bg: 'bg-purple-500/20', text: 'text-purple-300' },
  sonnet: { bg: 'bg-blue-500/20', text: 'text-blue-300' },
  haiku: { bg: 'bg-green-500/20', text: 'text-green-300' },
};

interface SkillsLibraryProps {
  projectId: string;
}

export default function SkillsLibrary({ projectId: _projectId }: SkillsLibraryProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('most-used');
  const [searchResults, setSearchResults] = useState<Skill[] | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [allSkills, allCategories] = await Promise.all([
        skillsAPI.list(),
        skillCategoriesAPI.list(),
      ]);
      setSkills(allSkills);
      setCategories(allCategories);
    } catch (err) {
      console.error('Failed to load skills:', err);
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
    skillsAPI.search(searchQuery).then(results => {
      if (!cancelled) setSearchResults(results);
    });
    return () => { cancelled = true; };
  }, [searchQuery]);

  const filteredSkills = useMemo(() => {
    let list = searchResults ?? skills;

    if (selectedCategory !== 'all') {
      list = list.filter(s => s.category === selectedCategory);
    }

    switch (sortBy) {
      case 'most-used':
        return [...list].sort((a, b) => b.usage_count - a.usage_count);
      case 'recent':
        return [...list].sort((a, b) => b.created_at - a.created_at);
      case 'alpha':
        return [...list].sort((a, b) => a.name.localeCompare(b.name));
      case 'favorites':
        return [...list].sort((a, b) => (b.is_favorite ? 1 : 0) - (a.is_favorite ? 1 : 0) || b.usage_count - a.usage_count);
      default:
        return list;
    }
  }, [skills, searchResults, selectedCategory, sortBy]);

  const categoryStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of skills) {
      counts[s.category] = (counts[s.category] || 0) + 1;
    }
    return counts;
  }, [skills]);

  const handleToggleFavorite = async (skill: Skill) => {
    try {
      await skillsAPI.update(skill.id, { isFavorite: !skill.is_favorite });
      await loadData();
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handleDuplicate = async (skill: Skill) => {
    try {
      await skillsAPI.duplicate(skill.id, `${skill.name} (Copy)`);
      await loadData();
    } catch (err) {
      console.error('Failed to duplicate skill:', err);
    }
  };

  const handleDelete = async (skill: Skill) => {
    if (skill.is_builtin) return;
    try {
      await skillsAPI.delete(skill.id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete skill:', err);
    }
  };

  const handleEditorSave = async () => {
    setShowEditor(false);
    setEditingSkill(null);
    await loadData();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
        <div className="h-full flex items-center justify-center">
          <div className="text-codex-text-secondary">Loading skills...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
      <div style={{ flexShrink: 0 }} className="px-8 pt-8 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-codex-text-primary">Skills Library</h1>
            <p className="text-sm text-codex-text-secondary mt-1">
              {skills.length} PM skills across {categories.length} categories
            </p>
            <p className="text-[10px] text-codex-text-muted mt-1">
              Requires a configured Claude API key (Settings) to run skills via Agents.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditingSkill(null); setShowEditor(true); }}
              className="px-3 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md transition-colors"
            >
              + New Skill
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search skills..."
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
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-2 py-2 bg-codex-surface border border-codex-border rounded-md text-codex-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-codex-accent"
          >
            <option value="most-used">Most Used</option>
            <option value="recent">Recently Created</option>
            <option value="alpha">Alphabetical</option>
            <option value="favorites">Favorites First</option>
          </select>
        </div>

        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              selectedCategory === 'all'
                ? 'bg-codex-accent text-white'
                : 'bg-codex-surface text-codex-text-secondary hover:text-codex-text-primary border border-codex-border'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.name)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                selectedCategory === cat.name
                  ? 'bg-codex-accent text-white'
                  : 'bg-codex-surface text-codex-text-secondary hover:text-codex-text-primary border border-codex-border'
              }`}
            >
              {cat.icon} {cat.name}
              {categoryStats[cat.name] ? ` (${categoryStats[cat.name]})` : ''}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="px-8 pb-8">
        {filteredSkills.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">{searchQuery ? '🔍' : '⚡'}</div>
            <h3 className="text-sm font-semibold text-codex-text-primary mb-1">
              {searchQuery ? 'No skills found' : 'No skills yet'}
            </h3>
            <p className="text-xs text-codex-text-muted mb-4">
              {searchQuery ? 'Try a different search term' : 'Create your first PM skill'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => { setEditingSkill(null); setShowEditor(true); }}
                className="px-4 py-2 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md transition-colors"
              >
                Create Skill
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
            {filteredSkills.map(skill => {
              const tierColor = MODEL_TIER_COLORS[skill.model_tier];
              const isExpanded = expandedSkillId === skill.id;
              return (
                <div
                  key={skill.id}
                  className="bg-codex-surface/60 border border-codex-border rounded-lg p-4 hover:bg-codex-surface-hover hover:border-codex-accent/50 transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3
                      className="text-sm font-semibold text-codex-text-primary group-hover:text-codex-accent transition-colors flex-1 mr-2 cursor-pointer"
                      onClick={() => setExpandedSkillId(isExpanded ? null : skill.id)}
                    >
                      {skill.name}
                    </h3>
                    <button
                      onClick={() => handleToggleFavorite(skill)}
                      className={`text-sm flex-shrink-0 ${skill.is_favorite ? 'text-yellow-400' : 'text-codex-text-muted hover:text-yellow-400'}`}
                    >
                      {skill.is_favorite ? '★' : '☆'}
                    </button>
                  </div>

                  <p className="text-[10px] text-codex-text-muted leading-relaxed mb-3 line-clamp-2">
                    {skill.description}
                  </p>

                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 bg-codex-surface/30 text-codex-text-secondary rounded">
                      {skill.category}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 ${tierColor.bg} ${tierColor.text} rounded`}>
                      {skill.model_tier}
                    </span>
                    {skill.is_builtin && (
                      <span className="text-[10px] px-2 py-0.5 bg-green-500/20 text-green-300 rounded">
                        Built-in
                      </span>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mb-3 p-2 bg-codex-bg/50 rounded border border-codex-border/30 max-h-40 overflow-y-auto">
                      <p className="text-[10px] text-codex-text-muted whitespace-pre-wrap leading-relaxed">
                        {skill.system_prompt.slice(0, 500)}{skill.system_prompt.length > 500 ? '...' : ''}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-codex-border/50">
                    <span className="text-[10px] text-codex-text-muted">
                      Used {skill.usage_count}x
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditingSkill(skill); setShowEditor(true); }}
                        className="text-[10px] px-2 py-1 text-codex-text-secondary hover:text-codex-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDuplicate(skill)}
                        className="text-[10px] px-2 py-1 text-codex-text-secondary hover:text-codex-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Duplicate
                      </button>
                      {!skill.is_builtin && (
                        <button
                          onClick={() => handleDelete(skill)}
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

      {showEditor && (
        <SkillEditorModal
          skill={editingSkill}
          categories={categories}
          onSave={handleEditorSave}
          onClose={() => { setShowEditor(false); setEditingSkill(null); }}
        />
      )}
    </div>
  );
}
