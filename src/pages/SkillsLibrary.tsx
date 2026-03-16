import { useState, useEffect, useCallback, useMemo } from 'react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { Skill, SkillCategory, ImportPreview, ConflictAction, BatchExportResult } from '../lib/types';
import { skillsAPI, skillCategoriesAPI, marketplaceAPI } from '../lib/ipc';
import SkillEditorModal from '../components/SkillEditorModal';
import CategoryManager from '../components/CategoryManager';
import ImportPreviewDialog from '../components/ImportPreviewDialog';
import BatchExportDialog from '../components/BatchExportDialog';
import BatchImportDialog, { BatchImportItem } from '../components/BatchImportDialog';

type SortOption = 'most-used' | 'recent' | 'alpha' | 'favorites';
type ViewMode = 'library' | 'manage';

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
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('library');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
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
      if (selectedSkill?.id === skill.id) setSelectedSkill(null);
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

  const handleExportSingle = async (skill: Skill) => {
    try {
      const content = await marketplaceAPI.exportSkill(skill.id);
      const filePath = await save({
        defaultPath: `${skill.id}.md`,
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
        const preview = await marketplaceAPI.previewImportSkill(content);
        setImportPreview(preview);
        setShowImportPreview(true);
      } else {
        const items: BatchImportItem[] = [];
        for (const path of paths) {
          const filename = (path as string).split('/').pop() || 'unknown.md';
          try {
            const content = await readTextFile(path as string);
            const preview = await marketplaceAPI.previewImportSkill(content);
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

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
        <div className="h-full flex items-center justify-center">
          <div className="text-codex-text-secondary">Loading skills...</div>
        </div>
      </div>
    );
  }

  if (viewMode === 'manage') {
    const manageCategoryId = selectedCategory;
    const manageFiltered = manageCategoryId !== 'all'
      ? skills.filter(s => s.category === manageCategoryId)
      : skills;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
        <div className="flex-shrink-0 px-6 py-4 border-b border-codex-border bg-codex-surface/50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-codex-text-primary">Skill Manager</h2>
              <p className="text-[10px] text-codex-text-muted mt-0.5">
                {skills.length} skills across {categories.length} categories
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleImport} className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors">Import</button>
              <button onClick={() => setShowBatchExport(true)} className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors">Export</button>
              <button onClick={() => setShowCategoryManager(true)} className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors">Categories</button>
              <button onClick={() => { setEditingSkill(null); setShowEditor(true); }} className="px-3 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent-hover rounded transition-colors">+ New Skill</button>
              <button onClick={() => setViewMode('library')} className="px-2 py-1 text-xs text-codex-text-muted hover:text-codex-text-primary transition-colors">✕</button>
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
          <div className="w-48 flex-shrink-0 border-r border-codex-border overflow-y-auto p-3 space-y-1">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${!selectedCategory || selectedCategory === 'all' ? 'bg-codex-accent/15 text-codex-text-primary' : 'text-codex-text-secondary hover:bg-codex-surface-hover'}`}
            >
              All ({skills.length})
            </button>
            {categories.map(cat => {
              const count = categoryStats[cat.name] || 0;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`w-full text-left px-3 py-2 rounded text-xs transition-colors flex items-center gap-2 ${selectedCategory === cat.name ? 'bg-codex-accent/15 text-codex-text-primary' : 'text-codex-text-secondary hover:bg-codex-surface-hover'}`}
                >
                  <span className="flex-1 truncate">{cat.name}</span>
                  <span className="text-[10px] text-codex-text-muted">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="w-72 flex-shrink-0 border-r border-codex-border overflow-y-auto p-3 space-y-1">
            {manageFiltered.length === 0 ? (
              <div className="text-xs text-codex-text-muted text-center py-8">No skills in this category</div>
            ) : manageFiltered.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedSkill(s)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${selectedSkill?.id === s.id ? 'bg-codex-accent/15 border border-codex-accent/30' : 'hover:bg-codex-surface-hover border border-transparent'}`}
              >
                <div className="text-xs font-medium text-codex-text-primary truncate">{s.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  {!s.is_builtin && <span className="text-[10px] px-1 py-0.5 bg-purple-500/20 text-purple-300 rounded">Custom</span>}
                </div>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {selectedSkill ? (
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-codex-text-primary">{selectedSkill.name}</h3>
                    <p className="text-[10px] text-codex-text-muted mt-0.5">{selectedSkill.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {selectedSkill.is_builtin && <span className="text-[10px] px-1.5 py-0.5 bg-codex-accent/20 text-codex-accent rounded">Built-in</span>}
                      <span className="text-[10px] text-codex-text-muted">{selectedSkill.category}</span>
                      <span className="text-[10px] text-codex-text-muted">Model: {selectedSkill.model_tier}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-codex-border">
                  <button onClick={() => { setEditingSkill(selectedSkill); setShowEditor(true); }} className="px-3 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent-hover rounded transition-colors">Edit</button>
                  <button onClick={() => handleDuplicate(selectedSkill)} className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors">Duplicate</button>
                  <button onClick={() => handleExportSingle(selectedSkill)} className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors">Export</button>
                  {!selectedSkill.is_builtin && (
                    <button onClick={() => handleDelete(selectedSkill)} className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 bg-codex-surface border border-red-500/30 rounded transition-colors">Delete</button>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-codex-text-secondary mb-2">System Prompt</label>
                  <div className="bg-codex-surface/40 border border-codex-border rounded p-3 text-xs text-codex-text-muted max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                    {selectedSkill.system_prompt.substring(0, 500)}
                    {selectedSkill.system_prompt.length > 500 && '...'}
                  </div>
                </div>

                <div className="pt-2 border-t border-codex-border">
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-codex-text-muted">
                    <div>Created: {new Date(selectedSkill.created_at * 1000).toLocaleDateString()}</div>
                    <div>Updated: {new Date(selectedSkill.updated_at * 1000).toLocaleDateString()}</div>
                    <div>Used: {selectedSkill.usage_count}x</div>
                    <div>ID: {selectedSkill.id}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-md px-8">
                  <div className="text-3xl mb-3">⚡</div>
                  <h3 className="text-sm font-semibold text-codex-text-primary mb-1">Select a skill</h3>
                  <p className="text-xs text-codex-text-secondary">Choose a skill from the list to view details or edit</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {showEditor && (
          <SkillEditorModal skill={editingSkill} categories={categories} onSave={handleEditorSave} onClose={() => { setShowEditor(false); setEditingSkill(null); }} />
        )}
        {showCategoryManager && (
          <CategoryManager
            onClose={() => setShowCategoryManager(false)}
            onChanged={loadData}
            categoryAPI={skillCategoriesAPI}
            entityAPI={skillsAPI as unknown as { list: () => Promise<{ category: string }[]> }}
            entityLabel="skills"
          />
        )}
        {showImportPreview && importPreview && (
          <ImportPreviewDialog preview={importPreview} onConfirm={async (action: ConflictAction) => { const result = await marketplaceAPI.confirmImportSkill(importMdContent, action); await loadData(); return result; }} onClose={() => { setShowImportPreview(false); setImportPreview(null); setImportMdContent(''); }} />
        )}
        {showBatchExport && (
          <BatchExportDialog mode="skills" items={skills} onExport={(ids) => marketplaceAPI.exportSkillsBatch(ids)} onSaveFiles={handleBatchExportSave} onClose={() => setShowBatchExport(false)} />
        )}
        {showBatchImport && (
          <BatchImportDialog items={batchImportItems} onConfirm={(mdContent, action) => marketplaceAPI.confirmImportSkill(mdContent, action)} onClose={() => setShowBatchImport(false)} onDone={() => { loadData(); }} />
        )}
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
              onClick={() => setShowCategoryManager(true)}
              className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded-md transition-colors"
            >
              Categories
            </button>
            <button
              onClick={() => setViewMode('manage')}
              className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded-md transition-colors"
              title="Manage skills"
            >
              Manage
            </button>
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
              {cat.name}
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
                    <span className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
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
                      <button
                        onClick={() => handleExportSingle(skill)}
                        className="text-[10px] px-2 py-1 text-codex-text-secondary hover:text-codex-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Export
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

      {showCategoryManager && (
        <CategoryManager
          onClose={() => setShowCategoryManager(false)}
          onChanged={loadData}
          categoryAPI={skillCategoriesAPI}
          entityAPI={skillsAPI as unknown as { list: () => Promise<{ category: string }[]> }}
          entityLabel="skills"
        />
      )}

      {showImportPreview && importPreview && (
        <ImportPreviewDialog
          preview={importPreview}
          onConfirm={async (action: ConflictAction) => {
            const result = await marketplaceAPI.confirmImportSkill(importMdContent, action);
            await loadData();
            return result;
          }}
          onClose={() => { setShowImportPreview(false); setImportPreview(null); setImportMdContent(''); }}
        />
      )}

      {showBatchExport && (
        <BatchExportDialog
          mode="skills"
          items={skills}
          onExport={(ids) => marketplaceAPI.exportSkillsBatch(ids)}
          onSaveFiles={handleBatchExportSave}
          onClose={() => setShowBatchExport(false)}
        />
      )}

      {showBatchImport && (
        <BatchImportDialog
          items={batchImportItems}
          onConfirm={(mdContent, action) => marketplaceAPI.confirmImportSkill(mdContent, action)}
          onClose={() => setShowBatchImport(false)}
          onDone={() => { loadData(); }}
        />
      )}

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 z-50">
          <div className="flex items-center gap-2">
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={() => setError(null)} className="text-red-300 hover:text-red-200">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
