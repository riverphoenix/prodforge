import { useState, useEffect } from 'react';
import { SavedPrompt } from '../lib/types';
import { savedPromptsAPI } from '../lib/ipc';

interface PromptCategoryManagerProps {
  onClose: () => void;
  onChanged: () => void;
}

const DEFAULT_CATEGORIES = [
  'prd', 'analysis', 'stories', 'communication', 'data', 'prioritization', 'strategy', 'general',
];

const STORAGE_KEY = 'prodforge_prompt_categories';

function getCustomCategories(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveCustomCategories(cats: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cats));
}

export function getAllPromptCategories(): { id: string; label: string }[] {
  const custom = getCustomCategories();
  const all = [...DEFAULT_CATEGORIES, ...custom];
  const unique = [...new Set(all)];
  return unique.map(id => ({
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
  }));
}

export default function PromptCategoryManager({ onClose, onChanged }: PromptCategoryManagerProps) {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const all = await savedPromptsAPI.list();
      setPrompts(all);
    } catch (err) {
      console.error('Failed to load prompts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const allCategories = (() => {
    const custom = getCustomCategories();
    const fromPrompts = [...new Set(prompts.map(p => p.category))];
    const merged = [...new Set([...DEFAULT_CATEGORIES, ...custom, ...fromPrompts])];
    return merged;
  })();

  const counts = (() => {
    const map: Record<string, number> = {};
    prompts.forEach(p => { map[p.category] = (map[p.category] || 0) + 1; });
    return map;
  })();

  const handleCreate = () => {
    const name = newName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!name) return;
    if (allCategories.includes(name)) {
      setError('Category already exists');
      return;
    }
    const custom = getCustomCategories();
    saveCustomCategories([...custom, name]);
    setNewName('');
    setShowCreate(false);
    setError(null);
    onChanged();
    loadData();
  };

  const handleRename = async (oldId: string) => {
    const name = editName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!name || name === oldId) {
      setEditingId(null);
      return;
    }
    if (allCategories.includes(name)) {
      setError('Category already exists');
      return;
    }
    setError(null);
    try {
      const toUpdate = prompts.filter(p => p.category === oldId);
      for (const p of toUpdate) {
        await savedPromptsAPI.update(p.id, { category: name });
      }
      const custom = getCustomCategories();
      const updated = custom.filter(c => c !== oldId);
      if (!DEFAULT_CATEGORIES.includes(name)) {
        updated.push(name);
      }
      saveCustomCategories(updated);
      setEditingId(null);
      onChanged();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename');
    }
  };

  const handleDelete = (id: string) => {
    const count = counts[id] || 0;
    if (count > 0) {
      setError(`Cannot delete: ${count} prompt(s) still use this category`);
      return;
    }
    const custom = getCustomCategories();
    saveCustomCategories(custom.filter(c => c !== id));
    setError(null);
    onChanged();
    loadData();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="border border-codex-border rounded-lg shadow-xl w-[450px] max-h-[500px] overflow-hidden flex flex-col"
        style={{ backgroundColor: '#252526' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-codex-border">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-codex-text-primary">Manage Prompt Categories</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowCreate(true); setEditingId(null); }}
                className="px-3 py-1 text-xs text-codex-accent hover:text-codex-accent-hover transition-colors"
              >
                + New
              </button>
              <button onClick={onClose} className="text-xs text-codex-text-muted hover:text-codex-text-primary">✕</button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-red-200">✕</button>
          </div>
        )}

        {showCreate && (
          <div className="mx-6 mt-4 p-3 bg-codex-surface/60 border border-codex-border rounded-lg space-y-2">
            <div className="text-xs font-medium text-codex-text-secondary">New Category</div>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="Category name"
              autoFocus
              className="w-full px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowCreate(false); setNewName(''); }} className="px-3 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary">Cancel</button>
              <button onClick={handleCreate} disabled={!newName.trim()} className="px-3 py-1 text-xs text-white bg-codex-accent hover:bg-codex-accent-hover rounded transition-colors disabled:opacity-50">Create</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {loading ? (
            <div className="text-xs text-codex-text-muted text-center py-8">Loading...</div>
          ) : allCategories.map(catId => {
            const count = counts[catId] || 0;
            const isDefault = DEFAULT_CATEGORIES.includes(catId);
            const label = catId.charAt(0).toUpperCase() + catId.slice(1);
            return (
              <div key={catId} className="bg-codex-surface/60 border border-codex-border rounded-lg p-3">
                {editingId === catId ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(catId); }}
                      autoFocus
                      className="w-full px-2 py-1.5 bg-codex-bg border border-codex-border rounded text-xs text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingId(null)} className="px-3 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary">Cancel</button>
                      <button onClick={() => handleRename(catId)} disabled={!editName.trim()} className="px-3 py-1 text-xs text-white bg-codex-accent hover:bg-codex-accent-hover rounded transition-colors disabled:opacity-50">Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-codex-text-primary">{label}</span>
                          {isDefault && (
                            <span className="text-[10px] px-1 py-0.5 bg-codex-accent/20 text-codex-accent rounded">Default</span>
                          )}
                          <span className="text-[10px] text-codex-text-muted">{count} prompts</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingId(catId); setEditName(catId); setShowCreate(false); }}
                        className="px-2 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary transition-colors"
                      >
                        Edit
                      </button>
                      {!isDefault && (
                        <button
                          onClick={() => handleDelete(catId)}
                          className="px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
