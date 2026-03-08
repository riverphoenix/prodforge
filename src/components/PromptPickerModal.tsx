import { useState, useEffect, useMemo } from 'react';
import { SavedPrompt, PromptVariable } from '../lib/types';
import { savedPromptsAPI } from '../lib/ipc';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'prd', label: 'PRD' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'stories', label: 'Stories' },
  { id: 'communication', label: 'Communication' },
  { id: 'data', label: 'Data' },
  { id: 'prioritization', label: 'Prioritization' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'general', label: 'General' },
];

interface PromptPickerModalProps {
  onSelect: (resolvedPrompt: string, promptId: string) => void;
  onClose: () => void;
}

export default function PromptPickerModal({ onSelect, onClose }: PromptPickerModalProps) {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPrompt, setSelectedPrompt] = useState<SavedPrompt | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const all = await savedPromptsAPI.list();
        setPrompts(all);
      } catch (err) {
        console.error('Failed to load prompts:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedPrompt) {
      const defaults: Record<string, string> = {};
      for (const v of selectedPrompt.variables) {
        defaults[v.name] = v.default_value || '';
      }
      setVariableValues(defaults);
    }
  }, [selectedPrompt]);

  const filteredPrompts = useMemo(() => {
    let list = prompts;
    if (selectedCategory !== 'all') {
      list = list.filter(p => p.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => b.usage_count - a.usage_count);
  }, [prompts, selectedCategory, searchQuery]);

  const resolvedText = useMemo(() => {
    if (!selectedPrompt) return '';
    let text = selectedPrompt.prompt_text;
    for (const v of selectedPrompt.variables) {
      const value = variableValues[v.name] || '';
      text = text.split(`{${v.name}}`).join(value || `{${v.name}}`);
    }
    return text;
  }, [selectedPrompt, variableValues]);

  const canUse = useMemo(() => {
    if (!selectedPrompt) return false;
    for (const v of selectedPrompt.variables) {
      if (v.required && !variableValues[v.name]?.trim()) return false;
    }
    return true;
  }, [selectedPrompt, variableValues]);

  const handleUse = () => {
    if (!selectedPrompt || !canUse) return;
    onSelect(resolvedText, selectedPrompt.id);
  };

  const renderVariableInput = (v: PromptVariable) => {
    const value = variableValues[v.name] || '';
    const onChange = (val: string) => setVariableValues(prev => ({ ...prev, [v.name]: val }));

    switch (v.type) {
      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
          >
            <option value="">Select...</option>
            {(v.options || []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={v.placeholder}
            rows={3}
            className="w-full px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent resize-none"
          />
        );
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={v.placeholder}
            className="w-full px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
          />
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-codex-bg border border-codex-border rounded-lg shadow-xl w-[700px] max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-codex-border">
          <h2 className="text-sm font-semibold text-codex-text-primary">Use Saved Prompt</h2>
          <button onClick={onClose} className="text-codex-text-muted hover:text-codex-text-primary">✕</button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-[280px] border-r border-codex-border flex flex-col">
            <div className="p-3 border-b border-codex-border">
              <input
                type="text"
                placeholder="Search prompts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
              />
              <div className="flex gap-1 mt-2 flex-wrap">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
                      selectedCategory === cat.id
                        ? 'bg-codex-accent text-white'
                        : 'bg-codex-surface text-codex-text-muted hover:text-codex-text-secondary'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-xs text-codex-text-muted text-center">Loading...</div>
              ) : filteredPrompts.length === 0 ? (
                <div className="p-4 text-xs text-codex-text-muted text-center">No prompts found</div>
              ) : (
                filteredPrompts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPrompt(p)}
                    className={`w-full text-left px-3 py-2.5 border-b border-codex-border/50 transition-colors ${
                      selectedPrompt?.id === p.id
                        ? 'bg-codex-accent/10 border-l-2 border-l-codex-accent'
                        : 'hover:bg-codex-surface/50'
                    }`}
                  >
                    <div className="text-xs font-medium text-codex-text-primary truncate">{p.name}</div>
                    <div className="text-[10px] text-codex-text-muted mt-0.5 truncate">
                      {p.description || p.prompt_text.slice(0, 60)}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-codex-text-muted">{p.category}</span>
                      {p.variables.length > 0 && (
                        <span className="text-[10px] text-indigo-400">{p.variables.length} vars</span>
                      )}
                      <span className="text-[10px] text-codex-text-muted ml-auto">{p.usage_count}x</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            {selectedPrompt ? (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-codex-text-primary mb-1">{selectedPrompt.name}</h3>
                    {selectedPrompt.description && (
                      <p className="text-xs text-codex-text-muted">{selectedPrompt.description}</p>
                    )}
                  </div>

                  {selectedPrompt.variables.length > 0 && (
                    <div className="space-y-3">
                      <label className="block text-xs font-medium text-codex-text-secondary">Fill in variables</label>
                      {selectedPrompt.variables.map(v => (
                        <div key={v.name}>
                          <label className="block text-[10px] text-codex-text-muted mb-1">
                            {v.label || v.name}
                            {v.required && <span className="text-red-400 ml-0.5">*</span>}
                          </label>
                          {renderVariableInput(v)}
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-codex-text-secondary mb-1">Preview</label>
                    <div className="p-3 bg-codex-surface/40 border border-codex-border rounded text-xs text-codex-text-secondary whitespace-pre-wrap max-h-40 overflow-y-auto">
                      {resolvedText}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-codex-border">
                  <button
                    onClick={onClose}
                    className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUse}
                    disabled={!canUse}
                    className="px-4 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Use Prompt
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-3xl mb-2">📝</div>
                  <p className="text-xs text-codex-text-muted">Select a prompt from the list</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
