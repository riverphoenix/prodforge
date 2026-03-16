import { useState, useEffect, useMemo } from 'react';
import { SavedPrompt, PromptVariable } from '../lib/types';
import { savedPromptsAPI } from '../lib/ipc';
import PromptEditor from './PromptEditor';
import { getAllPromptCategories } from './PromptCategoryManager';

interface PromptEditorModalProps {
  prompt: SavedPrompt | null;
  onSave: () => void;
  onClose: () => void;
}

function extractVariables(text: string): string[] {
  const matches = text.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(1, -1)))];
}

export default function PromptEditorModal({ prompt, onSave, onClose }: PromptEditorModalProps) {
  const [name, setName] = useState(prompt?.name || '');
  const [description, setDescription] = useState(prompt?.description || '');
  const [category, setCategory] = useState(prompt?.category || 'general');
  const [promptText, setPromptText] = useState(prompt?.prompt_text || '');
  const [variables, setVariables] = useState<PromptVariable[]>(prompt?.variables || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [manualVarNames, setManualVarNames] = useState<Set<string>>(
    () => new Set((prompt?.variables || []).map(v => v.name))
  );
  const [newVarName, setNewVarName] = useState('');

  const detectedVarNames = useMemo(() => extractVariables(promptText), [promptText]);

  const allVarNames = useMemo(() => {
    const combined = new Set([...detectedVarNames, ...manualVarNames]);
    return [...combined];
  }, [detectedVarNames, manualVarNames]);

  useEffect(() => {
    const existingMap = new Map(variables.map(v => [v.name, v]));
    const updated: PromptVariable[] = allVarNames.map(name => {
      if (existingMap.has(name)) return existingMap.get(name)!;
      return {
        name,
        type: 'text' as const,
        label: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        required: true,
      };
    });
    setVariables(updated);
  }, [allVarNames]);

  const addVariable = () => {
    const varName = newVarName.trim().replace(/\s+/g, '_').toLowerCase();
    if (!varName || allVarNames.includes(varName)) return;
    setManualVarNames(prev => new Set([...prev, varName]));
    setNewVarName('');
  };

  const removeVariable = (varName: string) => {
    setManualVarNames(prev => {
      const next = new Set(prev);
      next.delete(varName);
      return next;
    });
    setVariables(prev => prev.filter(v => v.name !== varName));
  };

  const previewText = useMemo(() => {
    let text = promptText;
    for (const v of variables) {
      const sample = v.default_value || v.placeholder || `[${v.label || v.name}]`;
      text = text.split(`{${v.name}}`).join(sample);
    }
    return text;
  }, [promptText, variables]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!promptText.trim()) {
      setError('Prompt text is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (prompt) {
        await savedPromptsAPI.update(prompt.id, {
          name: name.trim(),
          description: description.trim(),
          category,
          promptText: promptText,
          variables,
        });
      } else {
        await savedPromptsAPI.create({
          name: name.trim(),
          description: description.trim(),
          category,
          promptText: promptText,
          variables,
        });
      }
      onSave();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const updateVariable = (index: number, updates: Partial<PromptVariable>) => {
    setVariables(prev => prev.map((v, i) => i === index ? { ...v, ...updates } : v));
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-[640px] border-l border-codex-border flex flex-col overflow-hidden animate-slide-in-right" style={{ backgroundColor: '#252526' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-codex-border">
          <h2 className="text-sm font-semibold text-codex-text-primary">
            {prompt ? 'Edit Prompt' : 'New Prompt'}
          </h2>
          <button onClick={onClose} className="text-codex-text-muted hover:text-codex-text-primary">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-codex-text-secondary mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., PRD from JTBD"
              className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-codex-text-secondary mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-codex-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-codex-accent"
              >
                {getAllPromptCategories().map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-codex-text-secondary mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description..."
                className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-codex-text-primary text-sm placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-codex-text-secondary mb-1">
              Prompt Template
              <span className="text-codex-text-muted font-normal ml-2">
                Use {'{variable_name}'} for dynamic fields
              </span>
            </label>
            <PromptEditor
              value={promptText}
              onChange={setPromptText}
              height="200px"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-codex-text-secondary">
                Variables ({variables.length})
              </label>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                value={newVarName}
                onChange={(e) => setNewVarName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVariable(); } }}
                placeholder="variable_name"
                className="flex-1 px-2 py-1.5 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted font-mono focus:outline-none focus:ring-1 focus:ring-codex-accent"
              />
              <button
                onClick={addVariable}
                disabled={!newVarName.trim()}
                className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded transition-colors disabled:opacity-40"
              >
                + Add
              </button>
            </div>
            <p className="text-[10px] text-codex-text-muted mb-3">
              Variables from {'{braces}'} in the template are auto-detected. Add extras manually above.
            </p>

            {variables.length > 0 && (
              <div className="space-y-3">
                {variables.map((v, i) => {
                  const isDetected = detectedVarNames.includes(v.name);
                  return (
                    <div key={v.name} className="p-3 bg-codex-surface/60 border border-codex-border rounded">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-mono text-indigo-400">{`{${v.name}}`}</span>
                        {isDetected && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded">auto</span>
                        )}
                        <select
                          value={v.type}
                          onChange={(e) => updateVariable(i, { type: e.target.value as PromptVariable['type'] })}
                          className="px-2 py-1 bg-codex-bg border border-codex-border rounded text-xs text-codex-text-primary"
                        >
                          <option value="text">Text</option>
                          <option value="textarea">Textarea</option>
                          <option value="select">Select</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs text-codex-text-secondary ml-auto">
                          <input
                            type="checkbox"
                            checked={v.required}
                            onChange={(e) => updateVariable(i, { required: e.target.checked })}
                          />
                          Required
                        </label>
                        <button
                          onClick={() => removeVariable(v.name)}
                          className="p-1 text-[10px] text-codex-text-muted hover:text-red-400 transition-colors"
                          title={isDetected ? 'Remove (still referenced in template)' : 'Remove variable'}
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={v.label || ''}
                          onChange={(e) => updateVariable(i, { label: e.target.value })}
                          placeholder="Label"
                          className="flex-1 px-2 py-1 bg-codex-bg border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted"
                        />
                        <input
                          type="text"
                          value={v.placeholder || ''}
                          onChange={(e) => updateVariable(i, { placeholder: e.target.value })}
                          placeholder="Placeholder"
                          className="flex-1 px-2 py-1 bg-codex-bg border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted"
                        />
                      </div>
                      {v.type === 'select' && (
                        <div className="mt-2">
                          <input
                            type="text"
                            value={(v.options || []).join(', ')}
                            onChange={(e) => updateVariable(i, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                            placeholder="Options (comma-separated)"
                            className="w-full px-2 py-1 bg-codex-bg border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {promptText && (
            <div>
              <label className="block text-xs font-medium text-codex-text-secondary mb-1">Preview</label>
              <div className="p-3 bg-codex-surface/40 border border-codex-border rounded text-xs text-codex-text-secondary whitespace-pre-wrap">
                {previewText}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-codex-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-codex-text-secondary hover:text-codex-text-primary bg-codex-surface border border-codex-border rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !promptText.trim()}
            className="px-4 py-2 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : (prompt ? 'Save Changes' : 'Create Prompt')}
          </button>
        </div>
      </div>
    </div>
  );
}
