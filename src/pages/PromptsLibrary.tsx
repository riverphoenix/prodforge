import { useState, useEffect, useCallback, useMemo } from 'react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { SavedPrompt, ImportPreview, ConflictAction, BatchExportResult } from '../lib/types';
import { savedPromptsAPI, marketplaceAPI } from '../lib/ipc';
import PromptEditorModal from '../components/PromptEditorModal';
import PromptCategoryManager, { getAllPromptCategories } from '../components/PromptCategoryManager';
import ImportPreviewDialog from '../components/ImportPreviewDialog';
import BatchExportDialog from '../components/BatchExportDialog';
import BatchImportDialog, { BatchImportItem } from '../components/BatchImportDialog';

type SortOption = 'most-used' | 'recent' | 'alpha' | 'favorites';

interface PromptsLibraryProps {
  projectId: string;
  onUsePrompt?: (promptText: string) => void;
}

export default function PromptsLibrary({ projectId: _projectId, onUsePrompt }: PromptsLibraryProps) {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('most-used');
  const [searchResults, setSearchResults] = useState<SavedPrompt[] | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<SavedPrompt | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [variablePrompt, setVariablePrompt] = useState<SavedPrompt | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [showBatchExport, setShowBatchExport] = useState(false);
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [batchImportItems, setBatchImportItems] = useState<BatchImportItem[]>([]);
  const [importMdContent, setImportMdContent] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [promptCategories, setPromptCategories] = useState(getAllPromptCategories());

  const refreshCategories = () => setPromptCategories(getAllPromptCategories());

  const loadPrompts = useCallback(async () => {
    setLoading(true);
    try {
      const all = await savedPromptsAPI.list();
      setPrompts(all);
    } catch (err) {
      console.error('Failed to load prompts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    savedPromptsAPI.search(searchQuery).then(results => {
      if (!cancelled) setSearchResults(results);
    });
    return () => { cancelled = true; };
  }, [searchQuery]);

  const filteredPrompts = useMemo(() => {
    let list = searchResults ?? prompts;

    if (selectedCategory !== 'all') {
      list = list.filter(p => p.category === selectedCategory);
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
  }, [prompts, searchResults, selectedCategory, sortBy]);

  const handleToggleFavorite = async (prompt: SavedPrompt) => {
    try {
      await savedPromptsAPI.update(prompt.id, { isFavorite: !prompt.is_favorite });
      await loadPrompts();
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handleDuplicate = async (prompt: SavedPrompt) => {
    try {
      await savedPromptsAPI.duplicate(prompt.id, `${prompt.name} (Copy)`);
      await loadPrompts();
    } catch (err) {
      console.error('Failed to duplicate prompt:', err);
    }
  };

  const handleDelete = async (prompt: SavedPrompt) => {
    if (prompt.is_builtin) return;
    try {
      await savedPromptsAPI.delete(prompt.id);
      await loadPrompts();
    } catch (err) {
      console.error('Failed to delete prompt:', err);
    }
  };

  const handleEditorSave = async () => {
    setShowEditor(false);
    setEditingPrompt(null);
    await loadPrompts();
  };

  const handleExportSingle = async (prompt: SavedPrompt) => {
    try {
      const content = await marketplaceAPI.exportPrompt(prompt.id);
      const filePath = await save({
        defaultPath: `${prompt.id}.md`,
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
        const preview = await marketplaceAPI.previewImportPrompt(content);
        setImportPreview(preview);
        setShowImportPreview(true);
      } else {
        const items: BatchImportItem[] = [];
        for (const path of paths) {
          const filename = (path as string).split('/').pop() || 'unknown.md';
          try {
            const content = await readTextFile(path as string);
            const preview = await marketplaceAPI.previewImportPrompt(content);
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

  const categoryStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of prompts) {
      counts[p.category] = (counts[p.category] || 0) + 1;
    }
    return counts;
  }, [prompts]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
        <div className="h-full flex items-center justify-center">
          <div className="text-codex-text-secondary">Loading prompts...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
      <div style={{ flexShrink: 0 }} className="px-8 pt-8 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-codex-text-primary">Prompts Library</h1>
            <p className="text-sm text-codex-text-secondary mt-1">
              {prompts.length} saved prompts across {Object.keys(categoryStats).length} categories
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
              onClick={() => { setEditingPrompt(null); setShowEditor(true); }}
              className="px-3 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md transition-colors"
            >
              + New Prompt
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search prompts..."
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
          {promptCategories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-codex-accent text-white'
                  : 'bg-codex-surface text-codex-text-secondary hover:text-codex-text-primary border border-codex-border'
              }`}
            >
              {cat.label}
              {categoryStats[cat.id] ? ` (${categoryStats[cat.id]})` : ''}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="px-8 pb-8">
        {filteredPrompts.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">{searchQuery ? '🔍' : '📝'}</div>
            <h3 className="text-sm font-semibold text-codex-text-primary mb-1">
              {searchQuery ? 'No prompts found' : 'No prompts yet'}
            </h3>
            <p className="text-xs text-codex-text-muted mb-4">
              {searchQuery ? 'Try a different search term' : 'Create your first reusable prompt template'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => { setEditingPrompt(null); setShowEditor(true); }}
                className="px-4 py-2 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md transition-colors"
              >
                Create Prompt
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
            {filteredPrompts.map(prompt => (
              <div
                key={prompt.id}
                onClick={async () => {
                  if (onUsePrompt) {
                    if (prompt.variables.length > 0) {
                      const vals: Record<string, string> = {};
                      prompt.variables.forEach(v => { vals[v.name] = ''; });
                      setVariableValues(vals);
                      setVariablePrompt(prompt);
                    } else {
                      try { await savedPromptsAPI.incrementUsage(prompt.id); } catch {}
                      onUsePrompt(prompt.prompt_text);
                    }
                  }
                }}
                className="bg-codex-surface/60 border border-codex-border rounded-lg p-4 hover:bg-codex-surface-hover hover:border-codex-accent/50 transition-all duration-200 group cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold text-codex-text-primary group-hover:text-codex-accent transition-colors flex-1 mr-2">
                    {prompt.name}
                  </h3>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggleFavorite(prompt); }}
                    className={`text-sm flex-shrink-0 ${prompt.is_favorite ? 'text-yellow-400' : 'text-codex-text-muted hover:text-yellow-400'}`}
                  >
                    {prompt.is_favorite ? '★' : '☆'}
                  </button>
                </div>

                <p className="text-[10px] text-codex-text-muted leading-relaxed mb-3 line-clamp-2">
                  {prompt.description || prompt.prompt_text}
                </p>

                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] px-2 py-0.5 bg-codex-surface/30 text-codex-text-secondary rounded">
                    {prompt.category}
                  </span>
                  {prompt.variables.length > 0 && (
                    <span className="text-[10px] px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded">
                      {prompt.variables.length} var{prompt.variables.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {prompt.is_builtin && (
                    <span className="text-[10px] px-2 py-0.5 bg-green-500/20 text-green-300 rounded">
                      Built-in
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-codex-border/50">
                  <span className="text-[10px] text-codex-text-muted">
                    Used {prompt.usage_count}x
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingPrompt(prompt); setShowEditor(true); }}
                      className="text-[10px] px-2 py-1 text-codex-text-secondary hover:text-codex-text-primary"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDuplicate(prompt); }}
                      className="text-[10px] px-2 py-1 text-codex-text-secondary hover:text-codex-text-primary"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleExportSingle(prompt); }}
                      className="text-[10px] px-2 py-1 text-codex-text-secondary hover:text-codex-text-primary"
                    >
                      Export
                    </button>
                    {!prompt.is_builtin && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(prompt); }}
                        className="text-[10px] px-2 py-1 text-red-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showEditor && (
        <PromptEditorModal
          prompt={editingPrompt}
          onSave={handleEditorSave}
          onClose={() => { setShowEditor(false); setEditingPrompt(null); }}
        />
      )}

      {showImportPreview && importPreview && (
        <ImportPreviewDialog
          preview={importPreview}
          onConfirm={async (action: ConflictAction) => {
            const result = await marketplaceAPI.confirmImportPrompt(importMdContent, action);
            await loadPrompts();
            return result;
          }}
          onClose={() => {
            setShowImportPreview(false);
            setImportPreview(null);
            setImportMdContent('');
          }}
        />
      )}

      {showBatchExport && (
        <BatchExportDialog
          mode="prompts"
          items={prompts}
          onExport={(ids) => marketplaceAPI.exportPromptsBatch(ids)}
          onSaveFiles={handleBatchExportSave}
          onClose={() => setShowBatchExport(false)}
        />
      )}

      {showBatchImport && (
        <BatchImportDialog
          items={batchImportItems}
          onConfirm={(mdContent, action) => marketplaceAPI.confirmImportPrompt(mdContent, action)}
          onClose={() => setShowBatchImport(false)}
          onDone={() => { loadPrompts(); }}
        />
      )}

      {showCategoryManager && (
        <PromptCategoryManager
          onClose={() => setShowCategoryManager(false)}
          onChanged={() => { refreshCategories(); loadPrompts(); }}
        />
      )}

      {variablePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-lg border border-codex-border shadow-2xl bg-codex-sidebar">
            <div className="px-5 pt-5 pb-3 border-b border-codex-border/50">
              <h3 className="text-sm font-semibold text-codex-text-primary">{variablePrompt.name}</h3>
              <p className="text-[10px] text-codex-text-muted mt-1">Fill in the variables below, then send to chat.</p>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-80 overflow-y-auto">
              {variablePrompt.variables.map(v => (
                <div key={v.name}>
                  <label className="block text-xs text-codex-text-secondary mb-1">
                    {v.label || v.name}
                  </label>
                  {v.type === 'select' && v.options ? (
                    <select
                      value={variableValues[v.name] || ''}
                      onChange={(e) => setVariableValues(prev => ({ ...prev, [v.name]: e.target.value }))}
                      className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
                    >
                      <option value="">Select...</option>
                      {v.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : v.type === 'textarea' ? (
                    <textarea
                      value={variableValues[v.name] || ''}
                      onChange={(e) => setVariableValues(prev => ({ ...prev, [v.name]: e.target.value }))}
                      placeholder={v.placeholder || `Enter ${v.label || v.name}...`}
                      rows={3}
                      className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent resize-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={variableValues[v.name] || ''}
                      onChange={(e) => setVariableValues(prev => ({ ...prev, [v.name]: e.target.value }))}
                      placeholder={v.placeholder || `Enter ${v.label || v.name}...`}
                      className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-codex-border/50">
              <button
                onClick={() => { setVariablePrompt(null); setVariableValues({}); }}
                className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  let text = variablePrompt.prompt_text;
                  for (const [key, val] of Object.entries(variableValues)) {
                    text = text.split(`{${key}}`).join(val || `[${key}]`);
                  }
                  try { await savedPromptsAPI.incrementUsage(variablePrompt.id); } catch {}
                  onUsePrompt?.(text);
                  setVariablePrompt(null);
                  setVariableValues({});
                }}
                className="px-4 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded transition-colors"
              >
                Send to Chat
              </button>
            </div>
          </div>
        </div>
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
