import { useState, useEffect } from 'react';
import { Skill, SkillCategory, LLMProvider } from '../lib/types';
import { skillsAPI, settingsAPI } from '../lib/ipc';
import { ProviderIcon, getModelLabel, PROVIDER_LABELS } from './ModelSelector';

interface SkillEditorModalProps {
  skill: Skill | null;
  categories: SkillCategory[];
  onSave: () => void;
  onClose: () => void;
}

export default function SkillEditorModal({ skill, categories, onSave, onClose }: SkillEditorModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>('anthropic');
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-20250514');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [tools, setTools] = useState('[]');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [configuredProviders, setConfiguredProviders] = useState<{ id: string; name: string; models: string[] }[]>([]);
  const [enabledModels, setEnabledModels] = useState<Record<string, string[]>>({});

  useEffect(() => {
    settingsAPI.getAvailableProviders().then(providers => {
      setConfiguredProviders(providers.filter(p => p.configured));
    }).catch(() => {});
    settingsAPI.get().then(s => {
      if (s.enabled_models) {
        try { setEnabledModels(JSON.parse(s.enabled_models)); } catch {}
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (skill) {
      setName(skill.name);
      setDescription(skill.description);
      setCategory(skill.category);
      setSystemPrompt(skill.system_prompt);
      setTools(skill.tools || '[]');
      const modelTier = skill.model_tier;
      if (modelTier.includes(':')) {
        const [p, m] = modelTier.split(':', 2);
        setSelectedProvider(p as LLMProvider);
        setSelectedModel(m);
      } else {
        setSelectedProvider('anthropic');
        setSelectedModel(modelTier);
      }
    } else {
      setName('');
      setDescription('');
      setCategory(categories[0]?.name || '');
      setSelectedProvider('anthropic');
      setSelectedModel('claude-sonnet-4-20250514');
      setSystemPrompt('');
      setTools('[]');
    }
  }, [skill, categories]);

  const getModelsForProvider = (providerId: string): string[] => {
    const enabled = enabledModels[providerId];
    if (enabled && enabled.length > 0) return enabled;
    const p = configuredProviders.find(cp => cp.id === providerId);
    return p?.models || [];
  };

  const handleSave = async () => {
    if (!name.trim() || !systemPrompt.trim()) {
      setError('Name and system prompt are required');
      return;
    }

    setSaving(true);
    setError(null);
    const modelTier = `${selectedProvider}:${selectedModel}`;
    try {
      if (skill) {
        await skillsAPI.update(skill.id, {
          name: name.trim(),
          description: description.trim(),
          category,
          modelTier,
          systemPrompt: systemPrompt.trim(),
          tools,
        });
      } else {
        await skillsAPI.create(
          name.trim(),
          description.trim(),
          category,
          systemPrompt.trim(),
          tools,
          null,
          modelTier,
        );
      }
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save skill');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div className="w-full max-w-2xl max-h-[85vh] rounded-lg border border-codex-border shadow-2xl flex flex-col" style={{ backgroundColor: '#252526' }}>
        <div className="px-5 pt-5 pb-3 border-b border-codex-border/50 flex-shrink-0">
          <h3 className="text-sm font-semibold text-codex-text-primary">
            {skill ? 'Edit Skill' : 'New Skill'}
          </h3>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <label className="block text-xs text-codex-text-secondary mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Writing PRDs"
              className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
            />
          </div>

          <div>
            <label className="block text-xs text-codex-text-secondary mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this skill does"
              className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs text-codex-text-secondary mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 relative">
              <label className="block text-xs text-codex-text-secondary mb-1">Model</label>
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
              >
                <ProviderIcon provider={selectedProvider} size={14} />
                <span className="flex-1 text-left truncate">{getModelLabel(selectedModel)}</span>
                <svg className="w-3 h-3 text-codex-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showModelDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 border border-codex-border rounded-md shadow-lg max-h-60 overflow-y-auto" style={{ backgroundColor: '#252526' }}>
                  {configuredProviders.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-codex-text-muted">No providers configured</div>
                  ) : configuredProviders.map(provider => {
                    const models = getModelsForProvider(provider.id);
                    return (
                      <div key={provider.id}>
                        <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider font-medium text-codex-text-muted border-b border-codex-border/50">
                          <ProviderIcon provider={provider.id as LLMProvider} size={12} />
                          {PROVIDER_LABELS[provider.id as LLMProvider] || provider.name}
                        </div>
                        {models.map(model => (
                          <button
                            key={model}
                            onClick={() => {
                              setSelectedProvider(provider.id as LLMProvider);
                              setSelectedModel(model);
                              setShowModelDropdown(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors hover:bg-codex-surface-hover ${
                              selectedProvider === provider.id && selectedModel === model ? 'bg-codex-accent/15 text-codex-text-primary' : 'text-codex-text-secondary'
                            }`}
                          >
                            <span className="w-3 text-center text-[10px]">
                              {selectedProvider === provider.id && selectedModel === model ? '✓' : ''}
                            </span>
                            {getModelLabel(model)}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-codex-text-secondary mb-1">
              System Prompt
              <span className="text-codex-text-muted ml-1">({systemPrompt.length} chars)</span>
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="The system prompt that defines this skill's behavior, output format, and methodology..."
              rows={12}
              className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent resize-none font-mono leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-xs text-codex-text-secondary mb-1">Tools (JSON array)</label>
            <textarea
              value={tools}
              onChange={(e) => setTools(e.target.value)}
              placeholder='["web_search", "code_execution"]'
              rows={2}
              className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent resize-none font-mono"
            />
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-codex-border/50 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !systemPrompt.trim()}
            className="px-4 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : skill ? 'Update Skill' : 'Create Skill'}
          </button>
        </div>
      </div>
    </div>
  );
}
