import { useState, useEffect } from 'react';
import { frameworkCategoriesAPI, frameworkDefsAPI } from '../lib/ipc';
import { FrameworkCategory } from '../lib/types';
import { invalidateCache } from '../lib/frameworks';

interface CategoryAPI {
  list: () => Promise<Omit<FrameworkCategory, 'frameworks'>[]>;
  create: (name: string, description: string, icon: string) => Promise<unknown>;
  update: (id: string, name: string, description: string, icon: string) => Promise<unknown>;
  delete: (id: string) => Promise<void>;
}

interface EntityAPI {
  list: () => Promise<{ category: string }[]>;
}

interface CategoryManagerProps {
  onClose: () => void;
  onChanged: () => void;
  categoryAPI?: CategoryAPI;
  entityAPI?: EntityAPI;
  entityLabel?: string;
}

const EMOJI_OPTIONS = [
  '📊', '🎯', '🔍', '🛠️', '📈', '⚖️', '💡', '📋', '🗺️', '🚀',
  '📐', '🏗️', '🔧', '📝', '📣', '🤝', '💎', '🧪', '📦', '🎨',
  '⚙️', '🔬', '📉', '🏆', '🔑', '💬', '🎪', '🌟', '🧩', '⏱️',
];

export default function CategoryManager({
  onClose,
  onChanged,
  categoryAPI = frameworkCategoriesAPI,
  entityAPI = frameworkDefsAPI as unknown as EntityAPI,
  entityLabel = 'frameworks',
}: CategoryManagerProps) {
  const [categories, setCategories] = useState<Omit<FrameworkCategory, 'frameworks'>[]>([]);
  const [frameworkCounts, setFrameworkCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cats, allEntities] = await Promise.all([
        categoryAPI.list(),
        entityAPI.list(),
      ]);
      setCategories(cats);
      const counts = new Map<string, number>();
      allEntities.forEach(e => counts.set(e.category, (counts.get(e.category) || 0) + 1));
      setFrameworkCounts(counts);
    } catch (err) {
      console.error('Failed to load categories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const startEdit = (cat: Omit<FrameworkCategory, 'frameworks'>) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditDescription(cat.description);
    setEditIcon(cat.icon);
    setShowIconPicker(false);
    setShowCreate(false);
  };

  const startCreate = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
    setEditIcon('📊');
    setShowCreate(true);
    setShowIconPicker(false);
  };

  const handleSave = async () => {
    if (!editName.trim()) return;
    setError(null);
    try {
      if (showCreate) {
        await categoryAPI.create(editName.trim(), editDescription.trim(), editIcon);
      } else if (editingId) {
        await categoryAPI.update(editingId, editName.trim(), editDescription.trim(), editIcon);
      }
      if (entityLabel === 'frameworks') invalidateCache();
      setEditingId(null);
      setShowCreate(false);
      await loadData();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const handleDelete = async (id: string) => {
    const count = frameworkCounts.get(id) || 0;
    if (count > 0) {
      setError(`Cannot delete: ${count} ${entityLabel} still reference this category`);
      return;
    }
    setError(null);
    try {
      await categoryAPI.delete(id);
      if (entityLabel === 'frameworks') invalidateCache();
      await loadData();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowCreate(false);
    setError(null);
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="border border-codex-border rounded-lg shadow-xl w-[500px] max-h-[600px] overflow-hidden flex flex-col"
        style={{ backgroundColor: '#252526' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-codex-border">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-codex-text-primary">Manage Categories</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={startCreate}
                className="px-3 py-1 text-xs text-codex-accent hover:text-codex-accent-hover transition-colors"
              >
                + New Category
              </button>
              <button onClick={onClose} className="text-xs text-codex-text-muted hover:text-codex-text-primary">
                ✕
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Create Form */}
        {showCreate && (
          <div className="mx-6 mt-4 p-4 bg-codex-surface/60 border border-codex-border rounded-lg space-y-3">
            <div className="text-xs font-medium text-codex-text-secondary">New Category</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowIconPicker(!showIconPicker)}
                className="text-2xl w-10 h-10 flex items-center justify-center bg-codex-bg border border-codex-border rounded hover:border-codex-accent transition-colors"
              >
                {editIcon}
              </button>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Category name"
                autoFocus
                className="flex-1 px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
              />
            </div>
            {showIconPicker && (
              <div className="flex flex-wrap gap-1 p-2 bg-codex-bg border border-codex-border rounded">
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
            <input
              type="text"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Category description"
              className="w-full px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
            />
            <div className="flex justify-end gap-2">
              <button onClick={cancelEdit} className="px-3 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!editName.trim()}
                className="px-3 py-1 text-xs text-white bg-codex-accent hover:bg-codex-accent-hover rounded transition-colors disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        )}

        {/* Category List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {loading ? (
            <div className="text-xs text-codex-text-muted text-center py-8">Loading...</div>
          ) : categories.map(cat => (
            <div key={cat.id} className="bg-codex-surface/60 border border-codex-border rounded-lg p-3">
              {editingId === cat.id ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                      className="flex-1 px-2 py-1.5 bg-codex-bg border border-codex-border rounded text-xs text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
                    />
                  </div>
                  {showIconPicker && (
                    <div className="flex flex-wrap gap-1 p-2 bg-codex-bg border border-codex-border rounded">
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
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-2 py-1.5 bg-codex-bg border border-codex-border rounded text-xs text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={cancelEdit} className="px-3 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary">
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!editName.trim()}
                      className="px-3 py-1 text-xs text-white bg-codex-accent hover:bg-codex-accent-hover rounded transition-colors disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-codex-text-primary">{cat.name}</span>
                        {cat.is_builtin && (
                          <span className="text-[10px] px-1 py-0.5 bg-codex-accent/20 text-codex-accent rounded">
                            Built-in
                          </span>
                        )}
                        <span className="text-[10px] text-codex-text-muted">
                          {frameworkCounts.get(cat.id) || 0} {entityLabel}
                        </span>
                      </div>
                      <p className="text-[10px] text-codex-text-muted mt-0.5">{cat.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(cat)}
                      className="px-2 py-1 text-xs text-codex-text-secondary hover:text-codex-text-primary transition-colors"
                    >
                      Edit
                    </button>
                    {!cat.is_builtin && (
                      <button
                        onClick={() => handleDelete(cat.id)}
                        className="px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
