import { useState, useEffect, useMemo } from 'react';
import { AgentDef, Skill, SkillCategory, LLMProvider } from '../lib/types';
import { agentsAPI } from '../lib/ipc';

const AGENT_ICONS = ['🤖', '🧠', '⚡', '🎯', '📊', '🔬', '🚀', '💡', '📋', '🔍', '🛡️', '🌟', '📈', '🎨', '🔧'];

const PROVIDERS: { id: LLMProvider; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google' },
  { id: 'ollama', label: 'Ollama' },
];

interface AgentEditorProps {
  agent: AgentDef | null;
  skills: Skill[];
  categories: SkillCategory[];
  onSave: () => void;
  onCancel: () => void;
}

export default function AgentEditor({ agent, skills, categories: _categories, onSave, onCancel }: AgentEditorProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🤖');
  const [systemInstructions, setSystemInstructions] = useState('');
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [provider, setProvider] = useState<LLMProvider>('anthropic');
  const [maxTokens, setMaxTokens] = useState(4096);
  const [temperature, setTemperature] = useState(0.7);
  const [contextStrategy, setContextStrategy] = useState<'auto' | 'manual' | 'rag'>('auto');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setDescription(agent.description);
      setIcon(agent.icon);
      setSystemInstructions(agent.system_instructions);
      try {
        setSelectedSkillIds(JSON.parse(agent.skill_ids || '[]'));
      } catch {
        setSelectedSkillIds([]);
      }
      setModel(agent.model);
      setProvider(agent.provider);
      setMaxTokens(agent.max_tokens);
      setTemperature(agent.temperature);
      setContextStrategy(agent.context_strategy);
    }
  }, [agent]);

  const filteredSkills = useMemo(() => {
    if (!skillSearch.trim()) return skills;
    const q = skillSearch.toLowerCase();
    return skills.filter(s => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
  }, [skills, skillSearch]);

  const skillsByCategory = useMemo(() => {
    const grouped: Record<string, Skill[]> = {};
    for (const s of filteredSkills) {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(s);
    }
    return grouped;
  }, [filteredSkills]);

  const toggleSkill = (id: string) => {
    setSelectedSkillIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const data = {
        name: name.trim(),
        description: description.trim(),
        icon,
        systemInstructions: systemInstructions.trim(),
        skillIds: JSON.stringify(selectedSkillIds),
        model,
        provider,
        maxTokens,
        temperature,
        toolsConfig: '{}',
        contextStrategy,
      };

      if (agent) {
        await agentsAPI.update(agent.id, data);
      } else {
        await agentsAPI.create(data);
      }
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save agent');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} className="bg-codex-bg">
      <div className="flex items-center justify-between px-8 pt-6 pb-4 flex-shrink-0 border-b border-codex-border">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="text-codex-text-muted hover:text-codex-text-primary transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-codex-text-primary">
            {agent ? 'Edit Agent' : 'New Agent'}
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-codex-text-secondary hover:text-codex-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-1.5 text-xs text-white bg-codex-accent hover:bg-codex-accent/80 rounded-md transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : agent ? 'Update Agent' : 'Create Agent'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="px-8 py-6">
        <div className="max-w-3xl space-y-6">
          <div className="flex gap-4">
            <div className="relative">
              <label className="block text-xs text-codex-text-secondary mb-1">Icon</label>
              <button
                onClick={() => setShowIconPicker(!showIconPicker)}
                className="w-12 h-12 flex items-center justify-center text-2xl bg-codex-surface border border-codex-border rounded-lg hover:border-codex-accent/50 transition-colors"
              >
                {icon}
              </button>
              {showIconPicker && (
                <div className="absolute top-full left-0 mt-1 p-2 bg-codex-surface border border-codex-border rounded-lg shadow-xl z-10 grid grid-cols-5 gap-1">
                  {AGENT_ICONS.map(i => (
                    <button
                      key={i}
                      onClick={() => { setIcon(i); setShowIconPicker(false); }}
                      className="w-8 h-8 flex items-center justify-center text-lg hover:bg-codex-accent/20 rounded transition-colors"
                    >
                      {i}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1">
              <label className="block text-xs text-codex-text-secondary mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. PRD Writer"
                className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-codex-text-secondary mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do?"
              className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs text-codex-text-secondary mb-1">Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as LLMProvider)}
                className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
              >
                {PROVIDERS.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-codex-text-secondary mb-1">Model</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="claude-sonnet-4-20250514"
                className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs text-codex-text-secondary mb-1">Max Tokens</label>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
                min={256}
                max={200000}
                className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-codex-text-secondary mb-1">Temperature ({temperature})</label>
              <input
                type="range"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                min={0}
                max={2}
                step={0.1}
                className="w-full mt-2"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-codex-text-secondary mb-1">Context Strategy</label>
              <select
                value={contextStrategy}
                onChange={(e) => setContextStrategy(e.target.value as 'auto' | 'manual' | 'rag')}
                className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary focus:outline-none focus:ring-1 focus:ring-codex-accent"
              >
                <option value="auto">Auto</option>
                <option value="manual">Manual</option>
                <option value="rag">RAG</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-codex-text-secondary mb-1">
              System Instructions
              <span className="text-codex-text-muted ml-1">({systemInstructions.length} chars)</span>
            </label>
            <textarea
              value={systemInstructions}
              onChange={(e) => setSystemInstructions(e.target.value)}
              placeholder="Instructions that define this agent's behavior and expertise..."
              rows={6}
              className="w-full px-3 py-2 bg-codex-surface border border-codex-border rounded text-xs text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent resize-none font-mono leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-xs text-codex-text-secondary mb-2">
              Skills ({selectedSkillIds.length} selected)
            </label>
            <input
              type="text"
              placeholder="Search skills..."
              value={skillSearch}
              onChange={(e) => setSkillSearch(e.target.value)}
              className="w-full px-3 py-2 mb-3 bg-codex-surface border border-codex-border rounded text-sm text-codex-text-primary placeholder-codex-text-muted focus:outline-none focus:ring-1 focus:ring-codex-accent"
            />
            <div className="max-h-60 overflow-y-auto border border-codex-border rounded-lg bg-codex-surface/30">
              {Object.entries(skillsByCategory).map(([cat, catSkills]) => (
                <div key={cat}>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-codex-text-muted uppercase tracking-wider bg-codex-bg/50 sticky top-0">
                    {cat}
                  </div>
                  {catSkills.map(s => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-codex-surface-hover cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSkillIds.includes(s.id)}
                        onChange={() => toggleSkill(s.id)}
                        className="rounded border-codex-border"
                      />
                      <span className="text-xs text-codex-text-primary flex-1">{s.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                        s.model_tier === 'opus' ? 'bg-purple-500/20 text-purple-300'
                        : s.model_tier === 'sonnet' ? 'bg-blue-500/20 text-blue-300'
                        : 'bg-green-500/20 text-green-300'
                      }`}>
                        {s.model_tier}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
