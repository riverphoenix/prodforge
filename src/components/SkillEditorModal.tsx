import { useState, useEffect } from 'react';
import { Skill, SkillCategory, ModelTier } from '../lib/types';
import { skillsAPI } from '../lib/ipc';

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
  const [modelTier, setModelTier] = useState<ModelTier>('sonnet');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [tools, setTools] = useState('[]');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (skill) {
      setName(skill.name);
      setDescription(skill.description);
      setCategory(skill.category);
      setModelTier(skill.model_tier);
      setSystemPrompt(skill.system_prompt);
      setTools(skill.tools || '[]');
    } else {
      setName('');
      setDescription('');
      setCategory(categories[0]?.name || '');
      setModelTier('sonnet');
      setSystemPrompt('');
      setTools('[]');
    }
  }, [skill, categories]);

  const handleSave = async () => {
    if (!name.trim() || !systemPrompt.trim()) {
      setError('Name and system prompt are required');
      return;
    }

    setSaving(true);
    setError(null);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
      <div className="w-full max-w-2xl max-h-[85vh] rounded-lg border border-codex-border shadow-2xl flex flex-col bg-codex-bg">
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
                  <option key={cat.id} value={cat.name}>{cat.icon} {cat.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-codex-text-secondary mb-1">Model Tier</label>
              <div className="flex gap-2">
                {(['haiku', 'sonnet', 'opus'] as ModelTier[]).map(tier => (
                  <button
                    key={tier}
                    onClick={() => setModelTier(tier)}
                    className={`flex-1 px-2 py-2 text-xs rounded border transition-colors ${
                      modelTier === tier
                        ? tier === 'opus' ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                        : tier === 'sonnet' ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                        : 'bg-green-500/20 border-green-500/50 text-green-300'
                        : 'bg-codex-surface border-codex-border text-codex-text-secondary hover:text-codex-text-primary'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
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
