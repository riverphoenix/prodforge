import { useState, useEffect, useCallback } from 'react';
import { ask, save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { FrameworkDefinition, FrameworkCategory, ImportPreview, ConflictAction, BatchExportResult } from '../lib/types';
import { frameworkCategoriesAPI, frameworkDefsAPI, marketplaceAPI } from '../lib/ipc';
import { invalidateCache } from '../lib/frameworks';
import FrameworkCustomizer from './FrameworkCustomizer';
import CategoryManager from './CategoryManager';
import PromptEditor from './PromptEditor';
import ImportPreviewDialog from './ImportPreviewDialog';
import BatchExportDialog from './BatchExportDialog';
import BatchImportDialog, { BatchImportItem } from './BatchImportDialog';

interface FrameworkManagerProps {
  onClose: () => void;
}

export default function FrameworkManager({ onClose }: FrameworkManagerProps) {
  const [categories, setCategories] = useState<Omit<FrameworkCategory, 'frameworks'>[]>([]);
  const [frameworks, setFrameworks] = useState<FrameworkDefinition[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedFramework, setSelectedFramework] = useState<FrameworkDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [showBatchExport, setShowBatchExport] = useState(false);
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [batchImportItems, setBatchImportItems] = useState<BatchImportItem[]>([]);
  const [importMdContent, setImportMdContent] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);

  const EMOJI_OPTIONS = [
    '📊', '🎯', '🔍', '🛠️', '📈', '⚖️', '💡', '📋', '🗺️', '🚀',
    '📐', '🏗️', '🔧', '📝', '📣', '🤝', '💎', '🧪', '📦', '🎨',
    '⚙️', '🔬', '📉', '🏆', '🔑', '💬', '🎪', '🌟', '🧩', '⏱️',
  ];

  const startEditMeta = (fw: FrameworkDefinition) => {
    setEditName(fw.name);
    setEditCategory(fw.category);
    setEditIcon(fw.icon);
    setEditingMeta(true);
    setShowIconPicker(false);
  };

  const cancelEditMeta = () => {
    setEditingMeta(false);
    setShowIconPicker(false);
  };

  const handleSaveMeta = async () => {
    if (!selectedFramework || !editName.trim()) return;
    const trimmed = editName.trim();
    const isDuplicate = frameworks.some(
      f => f.id !== selectedFramework.id && f.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      setError('A framework with this name already exists');
      return;
    }
    setError(null);
    try {
      const updated = await frameworkDefsAPI.update(selectedFramework.id, {
        name: trimmed,
        category: editCategory,
        icon: editIcon,
      });
      invalidateCache();
      setSelectedFramework(updated);
      setEditingMeta(false);
      setShowIconPicker(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  // Create form state
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIcon, setNewIcon] = useState('📊');
  const [newCategory, setNewCategory] = useState('');
  const [newSystemPrompt, setNewSystemPrompt] = useState('');
  const [newGuidingQuestions, setNewGuidingQuestions] = useState<string[]>(['']);
  const [newSupportsVisuals, setNewSupportsVisuals] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, fws] = await Promise.all([
        frameworkCategoriesAPI.list(),
        frameworkDefsAPI.list(),
      ]);
      setCategories(cats);
      setFrameworks(fws);
      if (!selectedCategoryId && cats.length > 0) {
        setSelectedCategoryId(cats[0].id);
      }
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCategoryId]);

  useEffect(() => {
    loadData();
  }, []);

  const filteredFrameworks = selectedCategoryId
    ? frameworks.filter(f => f.category === selectedCategoryId)
    : frameworks;

  const handleDelete = async (fw: FrameworkDefinition) => {
    if (fw.is_builtin) return;
    const confirmed = await ask(`Delete "${fw.name}"? This action cannot be undone.`, {
      title: 'Delete Framework',
      kind: 'warning',
    });
    if (!confirmed) return;

    try {
      await frameworkDefsAPI.delete(fw.id);
      invalidateCache();
      if (selectedFramework?.id === fw.id) setSelectedFramework(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleDuplicate = async (fw: FrameworkDefinition) => {
    try {
      const dup = await frameworkDefsAPI.duplicate(fw.id, `${fw.name} (Copy)`);
      invalidateCache();
      await loadData();
      setSelectedFramework(dup);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate');
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newCategory) return;
    setError(null);
    try {
      const created = await frameworkDefsAPI.create({
        category: newCategory,
        name: newName.trim(),
        description: newDescription.trim(),
        icon: newIcon,
        systemPrompt: newSystemPrompt,
        guidingQuestions: newGuidingQuestions.filter(q => q.trim()),
        exampleOutput: '',
        supportsVisuals: newSupportsVisuals,
      });
      invalidateCache();
      setShowCreateForm(false);
      resetCreateForm();
      await loadData();
      setSelectedFramework(created);
      setSelectedCategoryId(created.category);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    }
  };

  const resetCreateForm = () => {
    setNewName('');
    setNewDescription('');
    setNewIcon('📊');
    setNewCategory('');
    setNewSystemPrompt('');
    setNewGuidingQuestions(['']);
    setNewSupportsVisuals(false);
  };

  const handleExportSingle = async (fw: FrameworkDefinition) => {
    try {
      const content = await marketplaceAPI.exportFramework(fw.id);
      const filePath = await save({
        defaultPath: `${fw.id}.md`,
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
        const preview = await marketplaceAPI.previewImportFramework(content);
        setImportPreview(preview);
        setShowImportPreview(true);
      } else {
        const items: BatchImportItem[] = [];
        for (const path of paths) {
          const filename = (path as string).split('/').pop() || 'unknown.md';
          try {
            const content = await readTextFile(path as string);
            const preview = await marketplaceAPI.previewImportFramework(content);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-codex-border bg-codex-surface/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-codex-text-primary">Framework Manager</h2>
            <p className="text-[10px] text-codex-text-muted mt-0.5">
              {frameworks.length} frameworks across {categories.length} categories
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleImport}
              className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors"
            >
              Import
            </button>
            <button
              onClick={() => setShowBatchExport(true)}
              className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors"
            >
              Export
            </button>
            <button
              onClick={() => setShowCategoryManager(true)}
              className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors"
            >
              Categories
            </button>
            <button
              onClick={() => { setShowCreateForm(true); setSelectedFramework(null); }}
              className="px-3 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent-hover rounded transition-colors"
            >
              + New Framework
            </button>
            <button
              onClick={onClose}
              className="px-2 py-1 text-xs text-codex-text-muted hover:text-codex-text-primary transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-red-200">✕</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex min-h-0">
        {/* Category Sidebar */}
        <div className="w-48 flex-shrink-0 border-r border-codex-border overflow-y-auto p-3 space-y-1">
          <button
            onClick={() => setSelectedCategoryId(null)}
            className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
              !selectedCategoryId ? 'bg-codex-accent/15 text-codex-text-primary' : 'text-codex-text-secondary hover:bg-codex-surface-hover'
            }`}
          >
            All ({frameworks.length})
          </button>
          {categories.map(cat => {
            const count = frameworks.filter(f => f.category === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`w-full text-left px-3 py-2 rounded text-xs transition-colors flex items-center gap-2 ${
                  selectedCategoryId === cat.id ? 'bg-codex-accent/15 text-codex-text-primary' : 'text-codex-text-secondary hover:bg-codex-surface-hover'
                }`}
              >
                <span>{cat.icon}</span>
                <span className="flex-1 truncate">{cat.name}</span>
                <span className="text-[10px] text-codex-text-muted">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Framework List */}
        <div className="w-72 flex-shrink-0 border-r border-codex-border overflow-y-auto p-3 space-y-1">
          {loading ? (
            <div className="text-xs text-codex-text-muted text-center py-8">Loading...</div>
          ) : filteredFrameworks.length === 0 ? (
            <div className="text-xs text-codex-text-muted text-center py-8">No frameworks in this category</div>
          ) : filteredFrameworks.map(fw => (
            <button
              key={fw.id}
              onClick={() => { setSelectedFramework(fw); setShowCreateForm(false); }}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                selectedFramework?.id === fw.id
                  ? 'bg-codex-accent/15 border border-codex-accent/30'
                  : 'hover:bg-codex-surface-hover border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{fw.icon}</span>
                <span className="text-xs font-medium text-codex-text-primary truncate">{fw.name}</span>
              </div>
              <div className="flex items-center gap-2 pl-7">
                {!fw.is_builtin && (
                  <span className="text-[10px] px-1 py-0.5 bg-purple-500/20 text-purple-300 rounded">Custom</span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Detail Panel */}
        <div className="flex-1 overflow-y-auto">
          {showCreateForm ? (
            <div className="p-6 space-y-4">
              <h3 className="text-sm font-semibold text-codex-text-primary">Create New Framework</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-codex-text-secondary mb-1">Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Framework name"
                    className="w-full px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-codex-text-secondary mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  >
                    <option value="">Select category...</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-codex-text-secondary mb-1">Description</label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Brief description of what this framework does"
                  className="w-full px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                />
              </div>

              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-xs text-codex-text-secondary mb-1">Icon</label>
                  <input
                    type="text"
                    value={newIcon}
                    onChange={(e) => setNewIcon(e.target.value)}
                    className="w-16 px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-center text-lg focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  />
                </div>
                <label className="flex items-center gap-2 mt-4">
                  <input
                    type="checkbox"
                    checked={newSupportsVisuals}
                    onChange={(e) => setNewSupportsVisuals(e.target.checked)}
                  />
                  <span className="text-xs text-codex-text-secondary">Supports visual generation</span>
                </label>
              </div>

              <div>
                <label className="block text-xs text-codex-text-secondary mb-1">System Prompt</label>
                <PromptEditor
                  value={newSystemPrompt}
                  onChange={setNewSystemPrompt}
                  height="200px"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-codex-text-secondary">Guiding Questions</label>
                  <button
                    onClick={() => setNewGuidingQuestions([...newGuidingQuestions, ''])}
                    className="text-[10px] text-codex-accent"
                  >
                    + Add
                  </button>
                </div>
                <div className="space-y-1">
                  {newGuidingQuestions.map((q, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={q}
                        onChange={(e) => {
                          const updated = [...newGuidingQuestions];
                          updated[i] = e.target.value;
                          setNewGuidingQuestions(updated);
                        }}
                        placeholder="Enter a guiding question..."
                        className="flex-1 px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
                      />
                      <button
                        onClick={() => setNewGuidingQuestions(newGuidingQuestions.filter((_, idx) => idx !== i))}
                        className="text-xs text-codex-text-muted hover:text-red-400"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setShowCreateForm(false); resetCreateForm(); }}
                  className="px-4 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || !newCategory}
                  className="px-4 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent-hover rounded transition-colors disabled:opacity-50"
                >
                  Create Framework
                </button>
              </div>
            </div>
          ) : selectedFramework ? (
            <div className="p-6 space-y-4">
              {editingMeta ? (
                <div className="space-y-3 p-3 bg-codex-surface/40 border border-codex-border rounded-lg">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowIconPicker(!showIconPicker)}
                      className="text-2xl w-10 h-10 flex items-center justify-center bg-codex-surface border border-codex-border rounded hover:border-codex-accent transition-colors"
                    >
                      {editIcon}
                    </button>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Framework name"
                      autoFocus
                      className="flex-1 px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-sm font-semibold text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
                    />
                  </div>
                  {showIconPicker && (
                    <div className="flex flex-wrap gap-1 p-2 bg-codex-surface border border-codex-border rounded">
                      {EMOJI_OPTIONS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => { setEditIcon(emoji); setShowIconPicker(false); }}
                          className={`w-8 h-8 flex items-center justify-center rounded hover:bg-codex-surface-hover transition-colors ${editIcon === emoji ? 'bg-codex-accent/20 ring-1 ring-codex-accent' : ''}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] text-codex-text-muted mb-1">Category</label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={cancelEditMeta} className="px-3 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary">
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveMeta}
                      disabled={!editName.trim()}
                      className="px-3 py-1 text-xs text-white bg-codex-accent hover:bg-codex-accent-hover rounded transition-colors disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{selectedFramework.icon}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-codex-text-primary">{selectedFramework.name}</h3>
                      <p className="text-[10px] text-codex-text-muted mt-0.5">{selectedFramework.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {selectedFramework.is_builtin && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-codex-accent/20 text-codex-accent rounded">Built-in</span>
                        )}
                        <span className="text-[10px] text-codex-text-muted">
                          {categories.find(c => c.id === selectedFramework.category)?.name || selectedFramework.category}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => startEditMeta(selectedFramework)}
                    className="px-2 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary transition-colors"
                    title="Edit name, category, icon"
                  >
                    ✎
                  </button>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-codex-border">
                <button
                  onClick={() => setShowCustomizer(true)}
                  className="px-3 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent-hover rounded transition-colors"
                >
                  Edit Prompt
                </button>
                <button
                  onClick={() => handleDuplicate(selectedFramework)}
                  className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors"
                >
                  Duplicate
                </button>
                <button
                  onClick={() => handleExportSingle(selectedFramework)}
                  className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors"
                >
                  Export
                </button>
                {!selectedFramework.is_builtin && (
                  <button
                    onClick={() => handleDelete(selectedFramework)}
                    className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 bg-codex-surface border border-red-500/30 rounded transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>

              {/* System Prompt Preview */}
              <div>
                <label className="block text-xs text-codex-text-secondary mb-2">System Prompt</label>
                <div className="bg-codex-surface/40 border border-codex-border rounded p-3 text-xs text-codex-text-muted max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                  {selectedFramework.system_prompt.substring(0, 500)}
                  {selectedFramework.system_prompt.length > 500 && '...'}
                </div>
              </div>

              {/* Guiding Questions */}
              {selectedFramework.guiding_questions.length > 0 && (
                <div>
                  <label className="block text-xs text-codex-text-secondary mb-2">
                    Guiding Questions ({selectedFramework.guiding_questions.length})
                  </label>
                  <div className="space-y-1">
                    {selectedFramework.guiding_questions.map((q, i) => (
                      <div key={i} className="text-xs text-codex-text-muted">
                        {i + 1}. {q}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="pt-2 border-t border-codex-border">
                <div className="grid grid-cols-2 gap-2 text-[10px] text-codex-text-muted">
                  <div>Created: {new Date(selectedFramework.created_at * 1000).toLocaleDateString()}</div>
                  <div>Updated: {new Date(selectedFramework.updated_at * 1000).toLocaleDateString()}</div>
                  <div>Visuals: {selectedFramework.supports_visuals ? 'Yes' : 'No'}</div>
                  <div>ID: {selectedFramework.id}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md px-8">
                <div className="text-3xl mb-3">📋</div>
                <h3 className="text-sm font-semibold text-codex-text-primary mb-1">Select a framework</h3>
                <p className="text-xs text-codex-text-secondary">
                  Choose a framework from the list to view details, edit prompts, or create a new one
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Customizer Slide-over */}
      {showCustomizer && selectedFramework && (
        <FrameworkCustomizer
          framework={selectedFramework}
          onClose={() => setShowCustomizer(false)}
          onSaved={(updated) => {
            setSelectedFramework(updated);
            setShowCustomizer(false);
            loadData();
          }}
        />
      )}

      {/* Category Manager Modal */}
      {showCategoryManager && (
        <CategoryManager
          onClose={() => setShowCategoryManager(false)}
          onChanged={loadData}
        />
      )}

      {/* Import Preview Dialog */}
      {showImportPreview && importPreview && (
        <ImportPreviewDialog
          preview={importPreview}
          onConfirm={async (action: ConflictAction) => {
            const result = await marketplaceAPI.confirmImportFramework(importMdContent, action);
            invalidateCache();
            await loadData();
            return result;
          }}
          onClose={() => {
            setShowImportPreview(false);
            setImportPreview(null);
            setImportMdContent('');
          }}
        />
      )}

      {/* Batch Export Dialog */}
      {showBatchExport && (
        <BatchExportDialog
          mode="frameworks"
          items={frameworks}
          onExport={(ids) => marketplaceAPI.exportFrameworksBatch(ids)}
          onSaveFiles={handleBatchExportSave}
          onClose={() => setShowBatchExport(false)}
        />
      )}

      {showBatchImport && (
        <BatchImportDialog
          items={batchImportItems}
          onConfirm={async (mdContent, action) => {
            const result = await marketplaceAPI.confirmImportFramework(mdContent, action);
            invalidateCache();
            return result;
          }}
          onClose={() => setShowBatchImport(false)}
          onDone={() => { loadData(); }}
        />
      )}
    </div>
  );
}
